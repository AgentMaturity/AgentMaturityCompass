/** Experimental text heuristics. Binary media, clinical semantics, and complete detection are outside this detector set. */
import type { EncodableRequest } from "../llm/request/requestSpec.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { findPIISpans, getPIIDetectorMetadata, KEYWORD_BOUND, PII_SPAN_SCAN_REVISION, type PiiSpan } from "../vault/dlp.js";
import { SECRET_PATTERNS } from "../shield/redaction/secretPatterns.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { TOKEN_PATTERN_SOURCE } from "./tokenizer.js";

export interface ProtectedDataDetection {
  readonly classes: readonly ProtectedDataClass[];
  readonly counts: Readonly<Partial<Record<ProtectedDataClass, number>>>;
  readonly detectorSetDigest: string;
}
export interface ProtectedDataSpan {
  readonly start: number;
  readonly end: number;
  readonly dataClass: ProtectedDataClass;
  readonly detector: string;
}
/**
 * Whether a token-shaped string is a token this workspace issued (`openTokenLookup`). Detection skips only such tokens;
 * the default, for callers that hold no vault, knows none, so every token-shaped string is scanned as text.
 */
export type IssuedToken = (token: string) => boolean;
const NONE_ISSUED: IssuedToken = () => false;

const CLASSES: readonly ProtectedDataClass[] = ["phi", "pii", "card_number", "bank_account", "credential"];
const CLASS_BY_TYPE: Readonly<Record<string, ProtectedDataClass>> = Object.freeze({
  email: "pii", phone: "pii", ssn: "pii", credit_card: "card_number", iban: "bank_account", ip_address: "pii",
  eu_vat: "pii", eu_national_id: "pii", passport_number: "pii", health_record_id: "phi",
  api_key_openai: "credential", api_key_github: "credential", api_key_stripe: "credential", api_key_aws: "credential",
  password_json: "credential", anthropic_key: "credential", slack_token: "credential", google_api_key: "credential",
  bearer_token: "credential", jwt: "credential", private_key: "credential", password_in_url: "credential",
  generic_api_key: "credential", secret_json: "credential", secret_field: "credential", secret_env: "credential"
});
// ponytail: a bare 10-digit run not preceded by "+" is dropped as noise, so a phone number written that way is not
// detected; E.164 (+14155552671) and 11-digit (14155552671) runs still are. Add a context-keyed phone rule (e.g. "tel:",
// "phone") if that recall matters. scanForPII still reports them.
const NOISE_FILTERS: Readonly<Record<string, RegExp>> = Object.freeze({
  ip_address: /^\d{1,2}(?::\d{2}){1,2}(?:\.\d+)?$/, // HH:MM[:SS] clock times that IPV6_SOURCE also matches
  // Bare 10-digit runs (Unix-seconds timestamps, counters, 2147483647), and an area code starting with 0 or 1, which no
  // North American number has: DOI suffixes and dotted versions ("10.1673/031.010.6301").
  phone: /^\d{10}$|^\(?[01]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
  // Bare 13-digit runs starting with 1: Unix-millisecond timestamps (2001-2033), about 10% Luhn-valid. No card network
  // issues a 13-digit number starting with 1 (13-digit cards are legacy Visa, starting with 4).
  credit_card: /^1\d{12}$/,
  bearer_token: /^Bearer\s+[A-Za-z._-]+$/i // "Bearer authentication": a real bearer value has a digit
});
// The phone pattern's leading \b cannot sit before "+", so an E.164 span starts after it; keep such a span. A clock-shaped
// ip_address span right after "::" is the tail of a compressed IPv6 address (2001:db8::10:20:30, fe80::1:23:45); keep it.
const isNoise = (text: string, span: PiiSpan) =>
  Object.hasOwn(NOISE_FILTERS, span.type) && NOISE_FILTERS[span.type]!.test(text.slice(span.start, span.end))
  && !(span.type === "phone" && text.charAt(span.start - 1) === "+")
  && !(span.type === "ip_address" && span.start >= 2 && text.startsWith("::", span.start - 2));
// Nesting and per-leaf bounds, plus a request-wide scan budget far above any provider context window (about 2x a 2M-token
// one). Hostile text scans in linear time but at up to ~0.55 s per MiB, so the budget caps one prepare at about 10 s.
const MAX_DEPTH = 32;
export const MAX_PROTECTED_TEXT_CHARS = 1_048_576;
export const MAX_REQUEST_SCAN_CHARS = 16_777_216;
const JSON_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" });
// JSON string escapes (\n, \uXXXX, \" ...) decoded in one linear pass, so escaped text in malformed arguments still matches.
export const decodeJsonEscapes = (text: string) => text.replace(/\\(?:u([0-9a-fA-F]{4})|([\s\S]))/g,
  (_match, hex: string | undefined, char: string) => hex !== undefined ? String.fromCharCode(Number.parseInt(hex, 16))
    : Object.hasOwn(JSON_ESCAPES, char) ? JSON_ESCAPES[char]! : char);
const NAMED_REFERENCES: Readonly<Record<string, string>> = Object.freeze({ amp: "&", commat: "@", period: ".", plus: "+",
  num: "#", colon: ":", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " });
const WEB_ESCAPE = /(?:%[0-9A-Fa-f]{2})+|(?<=[A-Za-z0-9])\+(?=[A-Za-z0-9])|&(?:#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z]{2,6}));/g;
/**
 * Percent-encoding (a form's `+` between letters or digits as a space) and HTML character references, decoded in one
 * linear pass, as a server or browser reads a URL, a form post or a page: `alice%40example.com`, `4111+1111+1111+1111`,
 * `alice&#64;example.com`. A %-run that is not UTF-8 decodes byte by byte; an unknown reference stays as it is.
 */
const decodeWebEscapes = (text: string) => text.replace(WEB_ESCAPE,
  (match: string, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (match === "+") return " ";
    if (match.startsWith("%")) {
      try { return decodeURIComponent(match); } catch { return match.replace(/%([0-9A-Fa-f]{2})/g, (_byte, code: string) => String.fromCharCode(Number.parseInt(code, 16))); }
    }
    if (name !== undefined) return Object.hasOwn(NAMED_REFERENCES, name.toLowerCase()) ? NAMED_REFERENCES[name.toLowerCase()]! : match;
    const code = decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex!, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
const BASE64_RUN = /[A-Za-z0-9+/_-]{24,}={0,2}/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });
/**
 * Each run of 24 or more base64 or base64url characters replaced by what it decodes to, where that is UTF-8 text with at
 * most one control character in ten (an encoded mail body, a text resource blob, a Secret's `data`); other runs (hashes,
 * random tokens, binary) stay as they are.
 */
const decodeBase64Runs = (text: string) => text.replace(BASE64_RUN, (run) => {
  const body = run.replace(/=+$/, "");
  if (body.length % 4 === 1) return run;
  let decoded: string;
  try { decoded = STRICT_UTF8.decode(Buffer.from(body, "base64")); } catch { return run; }
  return decoded.length > 0 && (decoded.match(CONTROL_CHARS)?.length ?? 0) * 10 <= decoded.length ? decoded : run;
});
// ponytail: JSON inside a JSON string escapes again at each level, and web or base64 encoding can wrap either, so decoded
// views are searched breadth first, up to this many in all (each is a full scan of its text), then one decoder at a time
// in a fixed order, up to MAX_DECODE_PASSES rounds; text still changing after them counts as a finding (replaced or
// tokenized whole). Raise them if deeper encodings are real.
const MAX_DECODE_PASSES = 8;
const MAX_DECODED_VIEWS = 3 * (MAX_DECODE_PASSES + 1);
const decodeJsonView = (text: string) => text.includes("\\") ? decodeJsonEscapes(text) : text;
// Inside a decoded view the quotes and separators are the decoder's, not the text's: an escaped backslash before a closing
// quote decodes to an escaped quote, and a member's value then runs on to the next quote. So the member and field rules
// (CREDENTIAL_RULES marked `member`) are not applied there. ponytail: a module-level depth, because every caller's `found`
// reaches detectProtectedText through its own redactor; the scan is synchronous, so nothing interleaves with it.
let decodedViewDepth = 0;
const inDecodedView = (found: (decoded: string) => boolean, decoded: string): boolean => {
  decodedViewDepth += 1;
  try { return found(decoded); } finally { decodedViewDepth -= 1; }
};
/**
 * Whether `found` holds for a decoded view of `text`: its JSON escapes decoded (`decodeJsonEscapes`), its web escapes
 * decoded (`decodeWebEscapes`) or its base64 text runs decoded (`decodeBase64Runs`), and so on for each new view, breadth
 * first, so a value encoded twice in any order (`%2540`, `&amp;#64;`, JSON percent-encoded in a form field) is found.
 * Escaped, a value right after \n or \t has no word boundary, in JSON at any depth, after a log prefix, or in JSON that does
 * not parse; percent-encoded, an email has no "@" and a card's groups are joined by "+" or "%20". Callers scan the text as
 * it is first: decoded, an escaped quote ends a password value early and a backslash no longer separates words, so decoded
 * text is only searched, never stored. Past MAX_DECODED_VIEWS (decoders that do not commute make a view per order, even on
 * an ordinary page), `decodedChainFinds` decides.
 */
export function decodedFinds(text: string, found: (decoded: string) => boolean): boolean {
  const seen = new Set([text]);
  const queue = [text];
  for (let views = 0; queue.length > 0;) {
    const current = queue.shift()!;
    for (const next of [decodeWebEscapes(current), decodeJsonView(current), decodeBase64Runs(current)]) {
      if (seen.has(next)) continue;
      if (++views > MAX_DECODED_VIEWS) return decodedChainFinds(text, found);
      if (inDecodedView(found, next)) return true;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}
/**
 * One pass of each decoder in turn, round after round, so each layer of any mix of encodings is peeled in order. Base64
 * goes before web escapes, which turn a "+" between letters into a space. Text still changing after MAX_DECODE_PASSES
 * rounds counts as a finding.
 */
function decodedChainFinds(text: string, found: (decoded: string) => boolean): boolean {
  let current = text;
  for (let round = 0; round < MAX_DECODE_PASSES; round += 1) {
    const start = current;
    for (const decode of [decodeJsonView, decodeBase64Runs, decodeWebEscapes]) {
      const next = decode(current);
      if (next !== current && inDecodedView(found, next)) return true;
      current = next;
    }
    if (current === start) return false;
  }
  return true;
}
const sharedSecret = (type: string): RegExp => {
  const entry = SECRET_PATTERNS.find(candidate => candidate.type === type);
  if (entry === undefined) throw new Error(`Shared secret pattern ${type} is missing`);
  return entry.pattern;
};
// Members whose whole non-empty value is a credential. A bare "token" is left out: usage counters and AMC's own fields use it.
const SECRET_MEMBER_NAMES = ["password", "passwd", "pwd", "secret", "client_secret", "api_key", "apikey", "access_token",
  "refresh_token", "private_key", "aws_secret_access_key"];
/** A member whose whole non-empty value is a credential (`secretMember`). */
const SECRET_MEMBER = new RegExp(`^(?:${SECRET_MEMBER_NAMES.join("|")})$`, "i");
/** A member name, as `memberWords` spells it, whose value of eight characters or more is a credential (`secretMember`). */
const SECRET_MEMBER_NAME = /(?:^|_)(?:passwd|password|passphrase|pwd|secret|secret_key|private_key|access_key|authorization)$|._token$|api_?(?:key|secret)s?$|apikey$/;
/** A `_token` name that is a cursor through results, not a credential: `nextPageToken`, `NextToken`, `continuation_token`. */
const PAGE_TOKEN_NAME = /(?:^|_)(?:page|next|prev|previous|continuation|cursor|sync|resume|start|marker|pagination)_token$/;
/** A member name lowercased in words joined by "_": `dbPassword`, `DB-PASSWORD` and `db.password` are all `db_password`. */
const memberWords = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
/**
 * Whether `value`, under member, field or header `key`, is a credential by its name alone: any non-empty value of an exact
 * SECRET_MEMBER name (`password`, `client_secret`, `api_key` ...), or a value of eight characters or more under a name that
 * ends in a secret word or an API-key word (`DB_PASSWORD`, `dbPassword`, `GITHUB_TOKEN`, `x-api-key`, `openaiApiKey`; a
 * bare `token`, a page cursor such as `nextPageToken` and `api_key_name` are not). Issued tokens in the value do not count.
 */
export function secretMember(key: string | undefined, value: string, issued: IssuedToken = NONE_ISSUED): boolean {
  if (key === undefined) return false;
  const rest = withoutTokens(value, issued);
  if (SECRET_MEMBER.test(key)) return rest.length > 0;
  const words = memberWords(key);
  return rest.length >= 8 && SECRET_MEMBER_NAME.test(words) && !PAGE_TOKEN_NAME.test(words);
}
// A keyword-bound detection starts in the member name and reaches the value within a few dozen characters (`keyedSpan`).
const KEYED_CONTEXT_CHARS = 256;
// Member names, as keyedSpan spells them (lowercase words joined by spaces), that can start a detection reaching past
// `<words>: `: dlp's keyword-bound IDs, and secret_env's and generic_api_key's keyword ending a one-word name.
const KEYED_NAME = new RegExp(`${KEYWORD_BOUND.source}|^[a-z0-9]*(?:password|passwd|secret|token)$|apikey$`, "i");
const MEMBER_KEY = String.raw`(?<k>[A-Za-z0-9_.-]{1,64})`;
/**
 * Credential shapes beside dlp's provider keys: the shared secret table's (src/shield/redaction/secretPatterns.ts), a PEM
 * private key block whole, a URL's password, an env/YAML line that names a secret, and a quoted member (JSON, a Python or
 * JS literal, a string or a number, its quotes escaped once too: JSON in a JSON string), a form, query or command-line
 * field or a multipart form part whose key `secretMember` accepts. A member, field or part whose key `secretMember`
 * rejects is still a detection where the key beside the value completes a keyword-bound one (`keyedSpan`:
 * `"mrn": "A1234567"`, `passport_no=X9876543`), under that detector. Where a rule has a group, only the value it captures
 * (the `v` group, else the first) is replaced, so `"secret": "<token>"` stays JSON. None backtracks quadratically.
 */
const CREDENTIAL_RULES: readonly { readonly type: string; readonly re: RegExp; readonly member?: true }[] = Object.freeze([
  ...["anthropic_key", "slack_token", "google_api_key", "bearer_token", "jwt"].map(type => ({ type, re: sharedSecret(type) })),
  { type: "private_key", re: /-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----[^-]*(?:-----END [A-Z ]{0,20}PRIVATE KEY-----)?/ },
  { type: "password_in_url", re: /\/\/[^:\s/@"]{1,256}:([^@\s/"]{1,256})@/ },
  { type: "generic_api_key", re: /(?:api[_-]?key|apikey|api_secret)["\s:=]+["']?([A-Za-z0-9_-]{16,})/i },
  { type: "secret_json", re: new RegExp(String.raw`(?<q>\\?["'])${MEMBER_KEY}\k<q>\s*:\s*(?<r>\\?["'])(?<v>(?:(?!\k<r>)(?:[^\\]|\\[\s\S]))*)\k<r>`), member: true },
  { type: "secret_json", re: new RegExp(String.raw`(?<q>\\?["'])${MEMBER_KEY}\k<q>\s*:\s*(?<v>-?\d[\d.eE+-]*)`), member: true },
  { type: "secret_field", re: new RegExp(String.raw`(?:^|[?&;\s])${MEMBER_KEY}=(?<v>[^&;\s#]*)`), member: true },
  { type: "secret_field", re: new RegExp(String.raw`name="${MEMBER_KEY}"[^\r\n]{0,256}\r?\n(?:[^\r\n]{1,256}\r?\n){0,8}\r?\n(?<v>[^\r\n]*)`), member: true },
  { type: "secret_env", re: /^[ \t]*[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|SECRET_KEY|SECRET_ACCESS_KEY|PRIVATE_KEY|API_KEY|TOKEN)[ \t]*[=:][ \t]*(\S{8,})/im }
]);
// Each rule compiled for scanning once (per leaf, compiling them again cost more than the scan); `re` stays non-global.
const CREDENTIAL_SCANS: readonly RegExp[] = CREDENTIAL_RULES.map(rule => new RegExp(rule.re.source, `${rule.re.flags}gd`));
/** Binds the patterns, mappings, filters, token format and limits below; receipts and admission rows carry it. */
export const DETECTOR_SET_DIGEST = sha256Hex(canonicalize({
  schema: "amc.protected-detectors/v1", support: "experimental", patterns: getPIIDetectorMetadata(), spanScanRevision: PII_SPAN_SCAN_REVISION,
  classMapping: CLASS_BY_TYPE,
  noiseFilters: Object.fromEntries(Object.entries(NOISE_FILTERS).map(([type, re]) => [type, re.source])),
  credentialRules: CREDENTIAL_RULES.map(rule => ({ type: rule.type, source: rule.re.source, flags: rule.re.flags })),
  secretMembers: SECRET_MEMBER.source, secretMemberNames: SECRET_MEMBER_NAME.source, pageTokenNames: PAGE_TOKEN_NAME.source,
  keyedNames: KEYED_NAME.source, webEscapes: { source: WEB_ESCAPE.source, named: NAMED_REFERENCES },
  base64Runs: { source: BASE64_RUN.source, controls: CONTROL_CHARS.source }, tokenFormat: TOKEN_PATTERN_SOURCE,
  traversalRevision: "request-json-leaves-plus-raw-decoded-args-password-context-malformed-args-as-escape-decoded-text-non-finite-args-as-null-parse-overflow-refused-per-leaf-and-request-limits-noise-rejected-in-scan-plus-and-double-colon-kept-ms-timestamps-not-cards-spans-inside-issued-token-hex-skipped-token-crossing-spans-rechecked-without-issued-tokens-password-json-escaped-value-span-tool-results-also-escape-decoded-evidence-leaves-hold-json-one-level-escapes-decoded-level-by-level-up-to-8-what-only-decoding-shows-replaces-the-text-password-member-key-in-evidence-percent-plus-and-html-references-decoded-with-each-escape-level-credential-rules-secret-member-names-keyed-context-member-words-numbers-and-array-items-keyed-member-field-and-multipart-rules-same-region-once-decoded-views-breadth-first-with-base64-text-runs-member-rules-not-in-decoded-views-keyed-members-number-members-and-escaped-quote-members-page-tokens-not-secret-chain-past-view-cap-v16",
  limits: { maxDepth: MAX_DEPTH, maxLeafChars: MAX_PROTECTED_TEXT_CHARS, maxRequestScanChars: MAX_REQUEST_SCAN_CHARS,
    maxDecodedViews: MAX_DECODED_VIEWS, keyedContextChars: KEYED_CONTEXT_CHARS }
}));
function refused(): never { throw new Error("Protected request detection refused unsupported or excessive traversal"); }
const dataClass = (type: string): ProtectedDataClass => Object.hasOwn(CLASS_BY_TYPE, type) ? CLASS_BY_TYPE[type]! : refused();

const TOKEN_HEX_CHARS = 16;
const tokenPattern = () => new RegExp(TOKEN_PATTERN_SOURCE, "g");
/** [start, end) of each issued token in text order; tokens never overlap. */
const tokenRanges = (text: string, issued: IssuedToken): readonly (readonly [number, number])[] => text.includes("[[amc:")
  ? Array.from(text.matchAll(tokenPattern()), match => [match.index, match.index + match[0].length] as const)
    .filter(([start, end]) => issued(text.slice(start, end))) : [];
const withoutTokens = (text: string, issued: IssuedToken) => text.replace(tokenPattern(), token => issued(token) ? "" : token);
/**
 * A span inside an issued token's hex is the token, not a value. A span that crosses token text (a JSON password value
 * holding a token) stays a detection only if it still is one with the issued tokens removed, so raw text beside a token
 * is never hidden by it. Token-shaped text the workspace did not issue is plain text (a raw card number in token
 * brackets is detected). The last token starting before the span's end is the only one the span can lie inside.
 */
function shieldedByToken(text: string, tokens: readonly (readonly [number, number])[], span: PiiSpan, issued: IssuedToken,
  stillFound = (slice: string) => findPIISpans(slice).some(other => other.type === span.type)): boolean {
  let low = 0, high = tokens.length - 1, last = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (tokens[mid]![0] < span.end) { last = mid; low = mid + 1; } else high = mid - 1;
  }
  if (last < 0 || tokens[last]![1] <= span.start) return false;
  const hexEnd = tokens[last]![1] - 2;
  if (span.start >= hexEnd - TOKEN_HEX_CHARS && span.end <= hexEnd) return true;
  return !stillFound(withoutTokens(text.slice(span.start, span.end), issued));
}

/** CREDENTIAL_RULES spans: noise and issued tokens are checked on the whole match, then a rule's group narrows it to the value. */
function credentialSpans(text: string, tokens: readonly (readonly [number, number])[], issued: IssuedToken): PiiSpan[] {
  const spans: PiiSpan[] = [];
  // Every rule but the URL password needs a letter (a member's name too), so a number leaf is not scanned 13 more times.
  if (!/[A-Za-z]/.test(text) && !text.includes("//")) return spans;
  for (const [index, { type: ruleType, re, member }] of CREDENTIAL_RULES.entries()) {
    if (member && decodedViewDepth > 0) continue;
    const scan = CREDENTIAL_SCANS[index]!;
    scan.lastIndex = 0;
    for (let match = scan.exec(text); match !== null; match = scan.exec(text)) {
      let type = ruleType;
      if (member && !secretMember(match.groups!.k, match.groups!.v!, issued)) {
        // keyedSpan scans with these same regexes, so where this scan stands is put back after it.
        const resume = scan.lastIndex;
        const keyed = keyedSpan(match.groups!.k, match.groups!.v!, issued);
        // Neither: the value can hold members of its own (JSON in a JSON string), so the search goes on inside it.
        scan.lastIndex = keyed === undefined ? match.indices!.groups!.v![0] : resume;
        if (keyed === undefined) continue;
        type = keyed.detector;
      }
      const whole: PiiSpan = { type, start: match.index, end: match.index + match[0].length };
      if (isNoise(text, whole) || shieldedByToken(text, tokens, whole, issued, slice => re.test(slice))) continue;
      const [start, end] = match.indices!.groups?.v ?? match.indices![1] ?? match.indices![0]!;
      spans.push({ type, start, end });
    }
  }
  return spans;
}

// A JSON password span covers the key, the colon and the quoted value; only the value is the credential. Narrowed to it,
// a replacement keeps `"password": "<token>"`, so redacted JSON stays JSON. The value can hold escaped quotes, so its
// start is found from the head of the span, not by searching back for a quote.
const PASSWORD_HEAD = /^"password"\s*:\s*"/i;
const valueOnly = (text: string, span: PiiSpan): PiiSpan => span.type !== "password_json" ? span
  : { ...span, start: span.start + PASSWORD_HEAD.exec(text.slice(span.start, span.end))![0].length, end: span.end - 1 };

/** Offsets refer to the original text. No matched values are returned or logged. */
export function detectProtectedText(text: string, issued: IssuedToken = NONE_ISSUED): readonly ProtectedDataSpan[] {
  if (typeof text !== "string" || text.length > MAX_PROTECTED_TEXT_CHARS) return refused();
  // Noise and token hex are rejected inside the scan, so a dropped span cannot hide an overlapping match
  // ("12:34:56.78.90.12").
  const tokens = tokenRanges(text, issued);
  const spans = [...findPIISpans(text, span => isNoise(text, span) || shieldedByToken(text, tokens, span, issued)),
    ...credentialSpans(text, tokens, issued)].sort((a, b) => a.start - b.start || a.end - b.end);
  // A value two rules find (dlp's password_json and the quoted member rule) is one detection.
  const seen = new Set<string>();
  return Object.freeze(spans.map(found => valueOnly(text, found)).flatMap(span => {
    const region = `${span.start}:${span.end}:${dataClass(span.type)}`;
    if (seen.has(region)) return [];
    seen.add(region);
    return [Object.freeze({ start: span.start, end: span.end, dataClass: dataClass(span.type), detector: span.type })];
  }));
}

/**
 * Replaces each detected region with `replace(region, value)`. Overlapping detections merge into one region that keeps
 * the class of the earliest (then longest) span; `spans` lists every detection. Over-long text throws, like
 * detectProtectedText: a caller must refuse or replace it whole, never pass it through.
 */
export function redactProtectedText(text: string, replace: (region: ProtectedDataSpan, value: string) => string,
  issued: IssuedToken = NONE_ISSUED): { readonly text: string; readonly spans: readonly ProtectedDataSpan[] } {
  const spans = detectProtectedText(text, issued);
  const ordered = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "", cursor = 0;
  for (let index = 0; index < ordered.length;) {
    const first = ordered[index]!;
    let end = first.end;
    for (index += 1; index < ordered.length && ordered[index]!.start < end; index += 1) end = Math.max(end, ordered[index]!.end);
    out += text.slice(cursor, first.start) + replace({ ...first, end }, text.slice(first.start, end));
    cursor = end;
  }
  return Object.freeze({ text: spans.length === 0 ? text : out + text.slice(cursor), spans });
}

/** A number a parse kept as its source literal (`JSON.rawJSON`, Node 21 and later). */
export const isRawJson = (value: unknown): value is { readonly rawJSON: string } =>
  (JSON as unknown as { isRawJSON?: (value: unknown) => boolean }).isRawJSON?.(value) === true;

/**
 * Applies `redact` to every key and string leaf of a parsed JSON value, and to each number leaf as text, its source literal
 * where the parse kept one (a number with a detection becomes the redacted string), so the result still serializes as
 * JSON. A string or number leaf's call also gets the member name it sits under (`key`, set by the recursion; an array's
 * items keep their member's), for `secretMember` and `keyedSpan`. Stored gateway, ToolHub and bridge evidence and the
 * session redactor use it.
 * An integer beyond 2^53 with at most 20 digits lost digits when it was parsed (a 17-19 digit card number sent as a JSON
 * number keeps only its leading ones), so its text cannot be checked: with `opaque` it becomes `opaque()` instead.
 */
export function redactJsonLeaves(value: unknown, redact: (text: string, key?: string) => string, opaque?: () => string,
  key?: string): unknown {
  if (typeof value === "string") return redact(value, key);
  if (typeof value === "number") {
    if (opaque !== undefined && Number.isInteger(value) && !Number.isSafeInteger(value) && Math.abs(value) < 1e20) return opaque();
    const text = String(value);
    const redacted = redact(text, key);
    return redacted === text ? value : redacted;
  }
  if (isRawJson(value)) { const redacted = redact(value.rawJSON, key); return redacted === value.rawJSON ? value : redacted; }
  if (Array.isArray(value)) return value.map(item => redactJsonLeaves(item, redact, opaque, key));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [redact(name), redactJsonLeaves(item, redact, opaque, name)]));
}

/**
 * The detection that `value` shows only beside its member, field or header name `key`: the keyword-bound detectors (an
 * MRN, a passport, national ID or VAT number, env secret lines) need the keyword next to the value, and a leaf scanned
 * alone never has it. The name is read as words (`medicalRecordNumber` is `medical record number`) and scanned as
 * `<words>: <value>`, both cut to KEYED_CONTEXT_CHARS; a detection that ends past the name is the value's, and callers
 * replace or tokenize the whole value under its class and detector. Callers pass the value already redacted, so what a
 * plain scan finds is not found again. `charge` gets the length scanned. Only a keyword-bound rule can reach across the
 * `: ` into the value, so a name with no keyword one starts with (`KEYED_NAME`) is not scanned at all.
 */
export function keyedSpan(key: string | undefined, value: string, issued: IssuedToken = NONE_ISSUED,
  charge: (length: number) => void = () => undefined): Pick<ProtectedDataSpan, "dataClass" | "detector"> | undefined {
  const words = key === undefined ? "" : memberWords(key).replace(/_+/g, " ").trim().slice(-KEYED_CONTEXT_CHARS);
  if (words === "" || value === "" || !KEYED_NAME.test(words)) return undefined;
  const prefix = `${words}: `;
  const context = prefix + value.slice(0, KEYED_CONTEXT_CHARS);
  charge(context.length);
  const span = detectProtectedText(context, issued).find(found => found.end > prefix.length);
  return span === undefined ? undefined : { dataClass: span.dataClass, detector: span.detector };
}

const JSON_TEXT = /^\s*[[{]/;
/**
 * `redact` for `redactJsonLeaves` over stored evidence (gateway, ToolHub, bridge); `key` is the member a leaf sits under,
 * for `secretMember` and `keyedSpan`. Text that holds a JSON object or array (an MCP result's text) is walked like the
 * outer value, one level deep, and re-stringified when an inner key or leaf changed. Each text is `redact`ed as it is, so
 * an escaped quote stays inside a password value and a backslash still separates words, and then searched decoded
 * (`decodedFinds`): anything only decoding shows replaces the text whole (`opaque()`).
 */
export function nestedJsonRedactor(redact: (text: string, key?: string) => string, opaque: () => string):
  (text: string, key?: string) => string {
  const scan = (text: string, key?: string) => {
    const scanned = redact(text, key);
    return decodedFinds(scanned, decoded => redact(decoded) !== decoded) ? opaque() : scanned;
  };
  return (text, key) => {
    if (text.length > MAX_PROTECTED_TEXT_CHARS || !JSON_TEXT.test(text)) return scan(text, key);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch (error) { if (!(error instanceof SyntaxError)) throw error; return scan(text, key); }
    let changed = false;
    const inner = redactJsonLeaves(parsed, (leaf, name) => { const out = scan(leaf, name); changed ||= out !== leaf; return out; },
      () => { changed = true; return opaque(); });
    return scan(changed ? JSON.stringify(inner) : text, key);
  };
}

/**
 * Read-only inspection, once per text leaf. Counts are heuristic findings, not distinct people or verified data classes.
 * An over-long leaf or request, excessive nesting or an unsupported shape throws; it is never skipped.
 */
export function detectProtectedRequest(request: EncodableRequest, issued: IssuedToken = NONE_ISSUED): ProtectedDataDetection {
  try {
    const counts: Partial<Record<ProtectedDataClass, number>> = {};
    const active = new Set<object>();
    const add = (kind: ProtectedDataClass) => { counts[kind] = (counts[kind] ?? 0) + 1; };
    let scanned = 0;
    const charge = (length: number) => { scanned += length; if (scanned > MAX_REQUEST_SCAN_CHARS) refused(); };
    const scan = (text: string, key?: string) => {
      if (typeof text !== "string") refused();
      charge(text.length);
      const spans = detectProtectedText(text, issued);
      for (const span of spans) add(span.dataClass);
      // What the member name shows (`secretMember`, `keyedSpan`), counted only for a class the leaf did not show.
      if (key === undefined) return;
      const keyed = secretMember(key, text, issued) ? "credential" : keyedSpan(key, text, issued, charge)?.dataClass;
      if (keyed !== undefined && !spans.some(span => span.dataClass === keyed)) add(keyed);
    };
    const visit = (value: unknown, depth: number, key?: string): void => {
      if (depth > MAX_DEPTH) refused();
      if (typeof value === "string") { scan(value, key); return; }
      if (typeof value === "number") { if (!Number.isFinite(value)) refused(); scan(String(value), key); return; }
      if (value === null || typeof value === "boolean") return;
      if (typeof value !== "object") return refused();
      if (Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return;
      if (active.has(value) || Object.getOwnPropertySymbols(value).length) refused();
      const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
      if (!array && prototype !== Object.prototype && prototype !== null) refused();
      const keys = Object.keys(value);
      if (Array.isArray(value) && (keys.length !== value.length || keys.some((field, index) => field !== String(index)))) refused();
      active.add(value);
      for (const field of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, field);
        if (!descriptor || !("value" in descriptor)) refused();
        if (!array) scan(field);
        visit(descriptor.value, depth + 1, array ? key : field);
      }
      active.delete(value);
    };
    // Empty or malformed tool-call arguments are committed by design; they are scanned as escape-decoded text, never
    // refused. A number that overflows to Infinity (1e999) carries no text and becomes null, since visit() refuses it.
    // Valid arguments are also scanned as raw decoded text, because the provider receives these bytes whatever a parser
    // keeps: a duplicate key hides its earlier value from the parsed leaves. That pass only adds classes not yet counted.
    const decoded = (text: string) => {
      const raw = decodeJsonEscapes(text);
      charge(raw.length);
      for (const span of detectProtectedText(raw, issued)) if (!(counts[span.dataClass] ?? 0)) add(span.dataClass);
    };
    const json = (text: string) => {
      if (typeof text !== "string") refused();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text, (_key, value: unknown) => typeof value === "number" && !Number.isFinite(value) ? null : value);
      } catch (error) {
        // Only a syntax error falls back to text. Anything else (a stack overflow on very deep nesting) refuses, like depth > 32.
        if (!(error instanceof SyntaxError)) refused();
        scan(decodeJsonEscapes(text));
        return;
      }
      visit(parsed, 0);
      decoded(text);
    };

    scan(request.model);
    if (request.system !== null) scan(request.system);
    visit(request.params, 0);
    visit(request.tools, 0);
    if (!Array.isArray(request.messages)) refused();
    for (const message of request.messages) {
      if (!Array.isArray(message.parts)) refused();
      for (const part of message.parts) {
        switch (part.kind) {
          case "text": case "thinking": scan(part.text); break;
          // Escaped, a value right after \n or \t in a JSON result (every MCP result) has no word boundary, so the result is
          // also scanned decoded. It is not parsed, so its nesting depth never refuses the request.
          case "tool_result": scan(part.text); decoded(part.text); break;
          case "tool_use": scan(part.toolName); json(part.argumentsJson); break;
          case "image": case "audio": break;
          default: refused();
        }
      }
    }
    return Object.freeze({ classes: Object.freeze(CLASSES.filter(kind => (counts[kind] ?? 0) > 0)), counts: Object.freeze(counts), detectorSetDigest: DETECTOR_SET_DIGEST });
  } catch { return refused(); }
}

/** Experimental text heuristics. Binary media, clinical semantics, and complete detection are outside this detector set. */
import type { EncodableRequest } from "../llm/request/requestSpec.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { findPIISpans, getPIIDetectorMetadata, KEYWORD_BOUND, PII_SPAN_SCAN_REVISION, type PiiSpan } from "../vault/dlp.js";
import { SECRET_PATTERNS } from "../shield/redaction/secretPatterns.js";
import { assertNoDuplicateJsonKeys, canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { RedactionRefused, TOKEN_PATTERN_SOURCE } from "./tokenizer.js";

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
  generic_api_key: "credential", secret_json: "credential", secret_field: "credential"
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
// Nesting and per-unit bounds, plus a request-wide scan budget far above any provider context window (about 2x a 2M-token
// one). Hostile text scans in linear time but at up to ~0.55 s per MiB, so the budget caps one prepare at about 10 s.
// Depth counts JSON nesting, JSON documents inside strings, base64 children and JSON found in decoded views together.
const MAX_DEPTH = 64;
export const MAX_PROTECTED_TEXT_CHARS = 1_048_576;
export const MAX_REQUEST_SCAN_CHARS = 16_777_216;
/** What each unit (a string, key or number the walk reads) costs beside its length, so leaf count is bounded too. */
const UNIT_CHARGE = 16;
const JSON_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" });
// JSON string escapes (\n, \uXXXX, \" ...) decoded in one linear pass, so escaped text in malformed arguments still matches.
const decodeJsonEscapes = (text: string) => !text.includes("\\") ? text : text.replace(/\\(?:u([0-9a-fA-F]{4})|([\s\S]))/g,
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
 * What a run of 24 or more base64 or base64url characters decodes to, where that is UTF-8 text with at most one control
 * character in ten (an encoded mail body, a text resource blob, a Secret's `data`); undefined for other runs (hashes,
 * random tokens, binary). The text is always shorter than the run.
 */
const decodeBase64Run = (run: string): string | undefined => {
  const body = run.replace(/=+$/, "");
  if (body.length % 4 === 1) return undefined;
  let decoded: string;
  try { decoded = STRICT_UTF8.decode(Buffer.from(body, "base64")); } catch { return undefined; }
  return decoded.length > 0 && (decoded.match(CONTROL_CHARS)?.length ?? 0) * 10 <= decoded.length ? decoded : undefined;
};
// ponytail: JSON inside a JSON string escapes again at each level, and web or base64 encoding can wrap either, so each raw
// line is decoded by one chain, a JSON-escape pass then a web pass per round, up to this many rounds; a line still changing
// after them is unreadable (`unsettled`). Raise it if deeper encodings are real.
const MAX_DECODE_PASSES = 8;
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
/** An environment-style name (`DB_PASSWORD`, `MYTOKEN`, `token`) whose value of eight characters or more is a credential. */
const ENV_SECRET = /^[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|SECRET_KEY|SECRET_ACCESS_KEY|PRIVATE_KEY|API_KEY|TOKEN)$/i;
/** A `_token` name that is a cursor through results, not a credential: `nextPageToken`, `NextToken`, `continuation_token`. */
const PAGE_TOKEN_NAME = /(?:^|_)(?:page|next|prev|previous|continuation|cursor|sync|resume|start|marker|pagination)_token$/;
/** A member name lowercased in words joined by "_": `dbPassword`, `DB-PASSWORD` and `db.password` are all `db_password`. */
const memberWords = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
/**
 * Whether `rest` (a value with the issued tokens removed), under member, field or header `key` (`words` as memberWords
 * spells it), is a credential by its name alone: any non-empty value of an exact SECRET_MEMBER name (`password`,
 * `client_secret`, `api_key` ...), or a value of eight characters or more under a name that ends in a secret word or an
 * API-key word (`DB_PASSWORD`, `dbPassword`, `GITHUB_TOKEN`, `x-api-key`, `openaiApiKey`) or is an environment-style secret
 * name (`MYTOKEN`, `token`); a page cursor such as `nextPageToken` and `api_key_name` are not.
 */
function secretMember(key: string, words: string, rest: string): boolean {
  if (SECRET_MEMBER.test(key)) return rest.length > 0;
  return rest.length >= 8 && (SECRET_MEMBER_NAME.test(words) || ENV_SECRET.test(key)) && !PAGE_TOKEN_NAME.test(words);
}
// A keyword-bound detection starts in the member name and reaches the value within a few dozen characters (`keyedSpan`).
const KEYED_CONTEXT_CHARS = 256;
/**
 * The detection that `value` shows only beside its member, field or header name: the keyword-bound detectors (an MRN, a
 * passport, national ID or VAT number) need the keyword next to the value, and a value read alone never has it. The name
 * is read as words (`medicalRecordNumber` is `medical record number`) and scanned as `<words>: <value>`, both cut to
 * KEYED_CONTEXT_CHARS; only a detection that starts in the name and ends in the value is the name's, so what the value
 * shows alone is left to the plain scan. `charge` gets the length scanned. A name with no keyword (KEYWORD_BOUND) is not
 * scanned at all.
 */
function keyedSpan(words: string, value: string, issued: IssuedToken, charge: (length: number) => void): Finding | undefined {
  const spaced = words.replace(/_+/g, " ").trim().slice(-KEYED_CONTEXT_CHARS);
  if (spaced === "" || !KEYWORD_BOUND.test(spaced)) return undefined;
  const prefix = `${spaced}: `;
  const context = prefix + value.slice(0, KEYED_CONTEXT_CHARS);
  charge(context.length);
  const span = detectProtectedText(context, issued).find(found => found.start < prefix.length && found.end > prefix.length);
  return span === undefined ? undefined : { dataClass: span.dataClass, detector: span.detector };
}
/**
 * The detection `value` is under its member, field, header or flag name `key`: a credential by the name alone
 * (`secretMember`; `secretDetector` names it: `secret_json` for a member of parsed JSON, else the rule's), else what the
 * name beside the value completes (`keyedSpan`). Callers replace or tokenize the whole value.
 */
function memberFinding(key: string | undefined, value: string, issued: IssuedToken, charge: (length: number) => void,
  secretDetector: string): Finding | undefined {
  if (key === undefined || value === "") return undefined;
  const words = memberWords(key);
  const rest = value.includes("[[amc:") ? withoutTokens(value, issued) : value;
  if (secretMember(key, words, rest)) return { dataClass: "credential", detector: secretDetector };
  return keyedSpan(words, value, issued, charge);
}
/**
 * Credential shapes beside dlp's provider keys: the shared secret table's (src/shield/redaction/secretPatterns.ts), a PEM
 * private key block whole, a URL's password and an `api_key`/`apikey`/`api_secret` assignment anywhere in a line. Where a
 * rule has a group, only the value it captures is replaced. None backtracks quadratically.
 */
const CREDENTIAL_RULES: readonly { readonly type: string; readonly re: RegExp }[] = Object.freeze([
  ...["anthropic_key", "slack_token", "google_api_key", "bearer_token", "jwt"].map(type => ({ type, re: sharedSecret(type) })),
  { type: "private_key", re: /-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----[^-]*(?:-----END [A-Z ]{0,20}PRIVATE KEY-----)?/ },
  { type: "password_in_url", re: /\/\/[^:\s/@"]{1,256}:([^@\s/"]{1,256})@/ },
  { type: "generic_api_key", re: /(?:api[_-]?key|apikey|api_secret)["\s:=]+["']?([A-Za-z0-9_-]{16,})/i }
]);
// Each rule compiled for scanning once (per unit, compiling them again cost more than the scan); `re` stays non-global.
const CREDENTIAL_SCANS: readonly RegExp[] = CREDENTIAL_RULES.map(rule => new RegExp(rule.re.source, `${rule.re.flags}gd`));
const MEMBER_KEY = String.raw`(?<k>[A-Za-z0-9_.-]{1,64})`;
/**
 * Name and value pairs in exact text: a quoted member (JSON, a Python or JS literal, a string or a number, its quotes
 * escaped once too: JSON in a JSON string), a form, query or command-line field, a multipart form part, and an env or YAML
 * line. Each value is checked with its name (`memberFinding`); only the value is replaced. A decoded view runs only the
 * rules that do not depend on where quotes fall (`exactOnly: false`): decoding an escaped backslash before a closing quote
 * leaves an escaped quote, so a quoted member's value would run on to the next quote.
 */
const PAIR_RULES: readonly { readonly type: "secret_json" | "secret_field"; readonly re: RegExp; readonly exactOnly: boolean }[] = Object.freeze([
  { type: "secret_json", exactOnly: true, re: new RegExp(String.raw`(?<q>\\?["'])${MEMBER_KEY}\k<q>\s*:\s*(?<r>\\?["'])(?<v>(?:(?!\k<r>)(?:[^\\]|\\[\s\S]))*)\k<r>`) },
  { type: "secret_json", exactOnly: true, re: new RegExp(String.raw`(?<q>\\?["'])${MEMBER_KEY}\k<q>\s*:\s*(?<v>-?\d[\d.eE+-]*)`) },
  { type: "secret_field", exactOnly: false, re: new RegExp(String.raw`(?:^|[?&;\s])${MEMBER_KEY}=(?<v>[^&;\s#]*)`) },
  { type: "secret_field", exactOnly: true, re: new RegExp(String.raw`name="${MEMBER_KEY}"[^\r\n]{0,256}\r?\n(?:[^\r\n]{1,256}\r?\n){0,8}\r?\n(?<v>[^\r\n]*)`) },
  { type: "secret_field", exactOnly: false, re: /^[ \t]*(?<k>[A-Za-z0-9_.-]{1,64})[ \t]*[:=][ \t]*(?<v>\S+)/m }
]);
const PAIR_SCANS: readonly RegExp[] = PAIR_RULES.map(rule => new RegExp(rule.re.source, `${rule.re.flags}gd`));
/** Binds the patterns, mappings, filters, walk, token format and limits below; receipts and admission rows carry it. */
export const DETECTOR_SET_DIGEST = sha256Hex(canonicalize({
  schema: "amc.protected-detectors/v2", support: "experimental", patterns: getPIIDetectorMetadata(), spanScanRevision: PII_SPAN_SCAN_REVISION,
  classMapping: CLASS_BY_TYPE,
  noiseFilters: Object.fromEntries(Object.entries(NOISE_FILTERS).map(([type, re]) => [type, re.source])),
  credentialRules: CREDENTIAL_RULES.map(rule => ({ type: rule.type, source: rule.re.source, flags: rule.re.flags })),
  pairRules: PAIR_RULES.map(rule => ({ type: rule.type, source: rule.re.source, flags: rule.re.flags, exactOnly: rule.exactOnly })),
  envSecret: { source: ENV_SECRET.source, flags: ENV_SECRET.flags },
  secretMembers: SECRET_MEMBER.source, secretMemberNames: SECRET_MEMBER_NAME.source, pageTokenNames: PAGE_TOKEN_NAME.source,
  keyedNames: KEYWORD_BOUND.source, webEscapes: { source: WEB_ESCAPE.source, named: NAMED_REFERENCES },
  base64Runs: { source: BASE64_RUN.source, controls: CONTROL_CHARS.source }, tokenFormat: TOKEN_PATTERN_SOURCE,
  walk: { revision: "protected-walk-v1", order: "json>base64>web", maxDecodePasses: MAX_DECODE_PASSES, viewRules: "dlp+shape+assign+line" },
  limits: { maxDepth: MAX_DEPTH, maxLeafChars: MAX_PROTECTED_TEXT_CHARS, maxRequestScanChars: MAX_REQUEST_SCAN_CHARS,
    unitCharge: UNIT_CHARGE, keyedContextChars: KEYED_CONTEXT_CHARS }
}));
function refused(): never { throw new Error("Protected request detection refused unsupported or excessive traversal"); }
const dataClass = (type: string): ProtectedDataClass => Object.hasOwn(CLASS_BY_TYPE, type) ? CLASS_BY_TYPE[type]! : refused();

const TOKEN_HEX_CHARS = 16;
const tokenPattern = () => new RegExp(TOKEN_PATTERN_SOURCE, "g");
const WHOLE_TOKEN = new RegExp(`^${TOKEN_PATTERN_SOURCE}$`);
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
  // Every rule but the URL password needs a letter, so a number is not scanned 8 more times.
  if (!/[A-Za-z]/.test(text) && !text.includes("//")) return spans;
  for (const [index, { type, re }] of CREDENTIAL_RULES.entries()) {
    const scan = CREDENTIAL_SCANS[index]!;
    scan.lastIndex = 0;
    for (let match = scan.exec(text); match !== null; match = scan.exec(text)) {
      const whole: PiiSpan = { type, start: match.index, end: match.index + match[0].length };
      if (isNoise(text, whole) || shieldedByToken(text, tokens, whole, issued, slice => re.test(slice))) continue;
      const [start, end] = match.indices![1] ?? match.indices![0]!;
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

/** dlp's patterns and the credential shapes over `text`. Offsets refer to the original text. No matched values are returned or logged. */
export function detectProtectedText(text: string, issued: IssuedToken = NONE_ISSUED): readonly ProtectedDataSpan[] {
  if (typeof text !== "string" || text.length > MAX_PROTECTED_TEXT_CHARS) return refused();
  // Noise and token hex are rejected inside the scan, so a dropped span cannot hide an overlapping match
  // ("12:34:56.78.90.12").
  const tokens = tokenRanges(text, issued);
  const spans = [...findPIISpans(text, span => isNoise(text, span) || shieldedByToken(text, tokens, span, issued)),
    ...credentialSpans(text, tokens, issued)].sort((a, b) => a.start - b.start || a.end - b.end);
  return Object.freeze(distinct(spans.map(found => valueOnly(text, found))
    .map(span => Object.freeze({ start: span.start, end: span.end, dataClass: dataClass(span.type), detector: span.type }))));
}
/** A value two rules find (dlp's password_json and the quoted member rule) is one detection. */
function distinct(spans: readonly ProtectedDataSpan[]): ProtectedDataSpan[] {
  const seen = new Set<string>();
  return spans.filter(span => !seen.has(`${span.start}:${span.end}:${span.dataClass}`) && seen.add(`${span.start}:${span.end}:${span.dataClass}`).size > 0);
}

/** A number a parse kept as its source literal (`JSON.rawJSON`, Node 21 and later). */
const isRawJson = (value: unknown): value is { readonly rawJSON: string } =>
  (JSON as unknown as { isRawJSON?: (value: unknown) => boolean }).isRawJSON?.(value) === true;
export const rawJSON = (JSON as unknown as { rawJSON?: (text: string) => unknown }).rawJSON;
export const NOT_JSON = Symbol("not JSON");

/**
 * Parses JSON text so that re-serializing it reproduces every number's source text (`JSON.rawJSON`, Node 21 and later;
 * a caller refuses without it); `NOT_JSON` when the text is not JSON. A duplicate key keeps its last value, as the parse
 * does. Anything else that stops the parse (nesting too deep) refuses. The session redactor and the detokenization gate
 * use it.
 */
export function parseExact(text: string): unknown {
  try {
    return JSON.parse(text, (_key, value: unknown, context?: { readonly source?: unknown }) => {
      if (typeof value !== "number") return value;
      if (rawJSON === undefined || typeof context?.source !== "string") throw new RedactionRefused("runtime_unsupported");
      return rawJSON(context.source);
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NOT_JSON;
    throw error instanceof RedactionRefused ? error : new RedactionRefused("detector_invalid");
  }
}

/**
 * Applies `redact` to every key and string leaf of a parsed JSON value, and to each number leaf as text, its source literal
 * where the parse kept one (a number `redact` changes becomes that string), so the result still serializes as JSON. A
 * string or number leaf's call also gets the member name it sits under (`key`, set by the recursion; an array's items keep
 * their member's). Bridge evidence (the secret table after the walk) and the detokenization gate use it.
 */
export function redactJsonLeaves(value: unknown, redact: (text: string, key?: string) => string, key?: string): unknown {
  if (typeof value === "string") return redact(value, key);
  if (typeof value === "number") { const redacted = redact(String(value), key); return redacted === String(value) ? value : redacted; }
  if (isRawJson(value)) { const redacted = redact(value.rawJSON, key); return redacted === value.rawJSON ? value : redacted; }
  if (Array.isArray(value)) return value.map(item => redactJsonLeaves(item, redact, key));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [redact(name), redactJsonLeaves(item, redact, name)]));
}

/** Whether JSON text the parse accepted repeats a key: the parse kept the last value, and the earlier one was never read. */
function hasDuplicateKey(source: string): boolean {
  try { assertNoDuplicateJsonKeys(source); return false; } catch { return true; }
}

const NUMBER_LITERAL = /(?<=^|[:[,\s])-?\d[\d.eE+-]*(?=[,\]}\s]|$)/g;
/**
 * A lookup for the class of a value a declared path covered (`values`) that `text` holds whole: the text itself, a JSON
 * string or key (`"Jane Roe"`) inside it, or a JSON number literal between delimiters, where the walk does not parse the
 * text (truncated JSON, a log line). The index is built once, so each lookup is linear in `text`: a string is read from each
 * unescaped quote to the next.
 */
function declaredRepeats(values: ReadonlyMap<string, ProtectedDataClass>): (text: string) => ProtectedDataClass | undefined {
  const quoted = new Map<string, ProtectedDataClass>(), numeric = new Map<string, ProtectedDataClass>();
  for (const [value, dataClass] of values) {
    quoted.set(JSON.stringify(value), dataClass);
    if (/^-?\d/.test(value)) numeric.set(value, dataClass);
  }
  const string = /"(?:[^"\\]|\\[\s\S])*"/y;
  return (text) => {
    const whole = values.get(text);
    if (whole !== undefined || values.size === 0) return whole;
    for (let at = text.indexOf("\""); at >= 0; at = text.indexOf("\"", at + 1)) {
      let slashes = 0;
      while (text.charCodeAt(at - 1 - slashes) === 92) slashes += 1;
      if (slashes % 2 === 1) continue;
      string.lastIndex = at;
      const found = quoted.get(string.exec(text)?.[0] ?? "");
      if (found !== undefined) return found;
    }
    if (numeric.size === 0) return undefined;
    for (const match of text.matchAll(NUMBER_LITERAL)) {
      const found = numeric.get(match[0]);
      if (found !== undefined) return found;
    }
    return undefined;
  };
}

/**
 * Replaces each region of `text` with `render(region, value)`, `value` being the raw text it covers. Overlapping regions
 * merge into one, rendered as the earliest (then longest) of them.
 */
function replaceRegions<R extends { readonly start: number; readonly end: number }>(text: string, regions: readonly R[],
  render: (region: R, value: string) => string): string {
  if (regions.length === 0) return text;
  const ordered = [...regions].sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "", cursor = 0;
  for (let index = 0; index < ordered.length;) {
    const first = ordered[index]!;
    let end = first.end;
    for (index += 1; index < ordered.length && ordered[index]!.start < end; index += 1) end = Math.max(end, ordered[index]!.end);
    out += text.slice(cursor, first.start) + render(first, text.slice(first.start, end));
    cursor = end;
  }
  return out + text.slice(cursor);
}

// PAIR_RULES spans in `text` (in a decoded `view`, only the rules that do not depend on quotes) whose value `memberFinding`
// flags under its name, narrowed to the value. Each search resumes at the value's start, so members nested inside a value
// (JSON in a JSON string) are found too.
function pairSpans(text: string, view: boolean, issued: IssuedToken, charge: (length: number) => void): ProtectedDataSpan[] {
  const spans: ProtectedDataSpan[] = [];
  if (!/[:=]/.test(text)) return spans;
  for (const [index, rule] of PAIR_RULES.entries()) {
    if (view && rule.exactOnly) continue;
    const scan = PAIR_SCANS[index]!;
    scan.lastIndex = 0;
    for (let match = scan.exec(text); match !== null; match = scan.exec(text)) {
      const [start, end] = match.indices!.groups!.v!;
      scan.lastIndex = start;
      const found = memberFinding(match.groups!.k, match.groups!.v!, issued, charge, rule.type);
      if (found !== undefined) spans.push(Object.freeze({ start, end, ...found }));
    }
  }
  return spans;
}

interface Segment { readonly start: number; readonly end: number; readonly parsed: unknown }
interface BracketPair { readonly start: number; readonly end: number; readonly children: readonly BracketPair[] }
// The bracket pairs of `text` as a forest in text order. Quotes count only inside a bracket; a raw line break inside a
// string, or a closer that does not match, ends every open bracket, and the pairs closed inside them so far are kept.
function bracketPairs(text: string): readonly BracketPair[] {
  const roots: BracketPair[] = [];
  let open: { readonly close: number; readonly start: number; readonly children: BracketPair[] }[] = [];
  let quoted = false;
  const reset = () => { for (const entry of open) for (const child of entry.children) roots.push(child); open = []; quoted = false; };
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (quoted) {
      if (code === 34) quoted = false;
      else if (code === 10 || code === 13) reset();
      else if (code === 92) { if (/[\r\n]/.test(text.charAt(index + 1))) reset(); else index += 1; }
    } else if (code === 123 || code === 91) open.push({ close: code + 2, start: index, children: [] });
    else if (open.length > 0 && code === 34) quoted = true;
    else if (open.length > 0 && (code === 125 || code === 93)) {
      const top = open.at(-1)!;
      if (top.close !== code) { reset(); continue; }
      open.pop();
      (open.at(-1)?.children ?? roots).push({ start: top.start, end: index + 1, children: top.children });
    }
  }
  reset();
  return roots;
}
/** Whether the first token after the bracket at `at` can start that JSON container, so a parse is worth trying. */
function startsJson(text: string, at: number): boolean {
  let index = at + 1;
  for (let code = text.charCodeAt(index); code === 32 || code === 9 || code === 10 || code === 13; code = text.charCodeAt(index)) index += 1;
  const next = text.charAt(index);
  return next !== "" && (text.charAt(at) === "{" ? next === "\"" || next === "}" : "\"{[]-0123456789tfn".includes(next));
}
/** The JSON value of `source` (numbers kept as their literals where the runtime can), NOT_JSON, or too_deep for the parser's stack. */
function parseSegment(source: string): unknown {
  const raw = rawJSON;
  try {
    return raw === undefined ? JSON.parse(source) as unknown : JSON.parse(source, (_key, value: unknown,
      context?: { readonly source?: unknown }) => typeof value === "number" && typeof context?.source === "string" ? raw(context.source) : value) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return NOT_JSON;
    throw new WalkRefused("too_deep");
  }
}
// The JSON objects and arrays in `text`, none overlapping: the whole trimmed text when it parses, else each outermost
// bracket pair that parses, trying the pairs inside one that does not. Each parse is charged.
function jsonSegments(text: string, charge: (length: number) => void): readonly Segment[] {
  const first = text.search(/\S/);
  if (first < 0 || !/[[{]/.test(text)) return [];
  const last = text.trimEnd().length;
  const whole = text[first] === "{" || text[first] === "[";
  if (whole) {
    charge(last - first);
    const parsed = parseSegment(text.slice(first, last));
    if (parsed !== NOT_JSON) return [{ start: first, end: last, parsed }];
  }
  const segments: Segment[] = [];
  const attempt = (pair: BracketPair, depth: number): void => {
    // Deeper pairs stay in the gaps, which are scanned as text.
    if (depth > MAX_DEPTH) return;
    if (!(whole && pair.start === first && pair.end === last) && startsJson(text, pair.start)) {
      charge(pair.end - pair.start);
      const parsed = parseSegment(text.slice(pair.start, pair.end));
      if (parsed !== NOT_JSON) { segments.push({ start: pair.start, end: pair.end, parsed }); return; }
    }
    for (const child of pair.children) attempt(child, depth + 1);
  };
  for (const pair of bracketPairs(text)) attempt(pair, 0);
  return segments;
}

/** Each raw line of `text` (a maximal run without \r or \n), with what `spans` cover masked so its decoded search does not find it again. */
function eachLine(text: string, spans: readonly ProtectedDataSpan[], visit: (start: number, end: number, masked: string) => void): void {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  let next = 0, open: ProtectedDataSpan[] = [];
  for (const match of text.matchAll(/[^\r\n]+/g)) {
    const start = match.index, end = start + match[0].length;
    open = open.filter(span => span.end > start);
    for (; next < ordered.length && ordered[next]!.start < end; next += 1) if (ordered[next]!.end > start) open.push(ordered[next]!);
    visit(start, end, open.length === 0 ? match[0] : replaceRegions(match[0], open.map(span =>
      ({ start: Math.max(span.start, start) - start, end: Math.min(span.end, end) - start })), () => "[REDACTED]"));
  }
}

export type DeclaredFields = Readonly<Record<string, ProtectedDataClass>>;
/** Why a walk refused. The first five concern one unit or line (`opaque` replaces it); `budget` and `unsupported_shape` the call. */
type WalkFailure = "too_long" | "too_deep" | "not_text" | "inexact_number" | "unsettled" | "budget" | "unsupported_shape";
const CALL_FAILURES: ReadonlySet<WalkFailure> = new Set<WalkFailure>(["budget", "unsupported_shape"]);
const walkRefused = (reason: WalkFailure): never => { throw new WalkRefused(reason); };
const unsupported = () => walkRefused("unsupported_shape");
/** A walk's refusal: a static reason, never input text. It does not cross a caller's boundary; each maps it to its own. */
export class WalkRefused extends Error {
  readonly code = "PROTECTED_WALK_REFUSED";
  constructor(readonly reason: WalkFailure) { super(`Protected data walk refused: ${reason}`); this.name = "WalkRefused"; }
}
interface Finding { readonly dataClass: ProtectedDataClass; readonly detector: string }
export interface WalkOptions {
  /** Characters one walk may charge in all: each unit's length plus UNIT_CHARGE, parses, scans, decoded views and contexts. */
  readonly budget: number;
  readonly issued?: IssuedToken;
  /** Declared paths (`patient.name: phi`) and the member path they apply under (`at`, default the root). */
  readonly declared?: { readonly fields: DeclaredFields; readonly at?: readonly string[] };
  /** What replaces a finding's raw text. Absent, the walk only counts (`findings`) and returns its input. */
  readonly replace?: (finding: Finding, value: string) => string;
  /** What replaces a unit or line the walk cannot read. Absent, the walk throws; `budget` and `unsupported_shape` always do. */
  readonly opaque?: (reason: WalkFailure) => string;
}
export interface ProtectedWalk {
  /** `text` (a header, flag or field value under `key`), redacted; the input itself when nothing changed. */
  text(text: string, key?: string): string;
  /** A parsed JSON value, redacted; the input itself when nothing changed. */
  value(value: unknown): unknown;
  /** Every finding, in walk order. */
  readonly findings: readonly Finding[];
  /** The declared paths that covered something, sorted. */
  readonly declaredMatched: readonly string[];
}
interface WalkContext {
  readonly key: string | undefined;
  readonly path: readonly string[];
  /** Where each JSON document entered so far starts in `path`: every declared path also applies from there. */
  readonly roots: readonly number[];
  readonly depth: number;
  readonly secret: "secret_json" | "secret_field";
}
interface Region { readonly start: number; readonly end: number; readonly finding?: Finding; readonly opaque?: WalkFailure }
const distinctFindings = (found: readonly Finding[]): Finding[] =>
  [...new Map(found.map(finding => [`${finding.dataClass}\0${finding.detector}`, finding])).values()];

/**
 * One parse-first walk over protected-data text and parsed JSON (P2-02), for every opted-in path. Every character is read
 * one of two ways. In JSON (the whole text, or each JSON object or array inside it that parses), as a JSON reader sees it:
 * each key, string and number literal is a unit, read with its member name (`memberFinding`; an array's items keep their
 * member's), and JSON inside a string is walked the same way. Everything else is a gap, scanned as it is (dlp, the
 * credential shapes, the pair rules, declared repeats), and then each of its lines, with what the scan found masked, is
 * decoded by one chain (JSON escapes, then web escapes, per round, base64 runs taken before web decoding turns `+` into a
 * space): a JSON value a view shows is walked again exactly; the rest of a view gets the shape rules and the quote-free
 * pairs. Anything only decoding shows replaces its raw line. Declared paths are recorded by a first pass and covered by the
 * second, with their values replaced wherever else they repeat. No member rule runs where decoding has moved the quotes.
 * Output depends only on the input, the options and the issued set; there is no memo, and no partial output.
 */
export function protectedWalk(options: WalkOptions): ProtectedWalk {
  const { budget, replace, opaque } = options;
  const issued = options.issued ?? NONE_ISSUED;
  const at = options.declared?.at ?? [];
  const paths = Object.entries(options.declared?.fields ?? {}).map(([name, covers]) => ({ name, parts: name.split("."), covers }));
  const declaredValues = new Map<string, ProtectedDataClass>();
  const matched = new Set<string>();
  const findings: Finding[] = [];
  const probes: Finding[][] = [];
  const active = new Set<object>();
  let repeats: ((text: string) => ProtectedDataClass | undefined) | undefined;
  let declaring = false, scanned = 0;
  const charge = (length: number) => { scanned += length; if (scanned > budget) walkRefused("budget"); };
  const record = (finding: Finding) => { (probes.at(-1) ?? findings).push(finding); };
  const swap = (finding: Finding, value: string) => replace !== undefined && probes.length === 0 ? replace(finding, value) : value;
  const hit = (finding: Finding, value: string) => { record(finding); return swap(finding, value); };
  /** A unit or line the walk cannot read: skipped by the declare pass, `opaque` where given, else (and in a probe) refused. */
  const local = (reason: WalkFailure, text: string): string =>
    declaring ? text : opaque !== undefined && probes.length === 0 ? opaque(reason) : walkRefused(reason);
  const settle = (error: unknown, text: string): string => {
    if (!(error instanceof WalkRefused) || CALL_FAILURES.has(error.reason)) throw error;
    return local(error.reason, text);
  };
  const underAt = (path: readonly string[]) => at.every((part, index) => path[index] === part);
  const covering = (ctx: WalkContext) => paths.length === 0 || !underAt(ctx.path) ? undefined
    : paths.find(({ parts }) => ctx.roots.some(root => root + parts.length <= ctx.path.length
      && parts.every((part, index) => ctx.path[root + index] === part)));
  // ponytail: a short declared value (7, "x") also replaces every equal unit elsewhere under `at`; add a minimum length
  // here if that over-redaction matters.
  const declaredHit = (entry: { readonly name: string; readonly covers: ProtectedDataClass }, text: string, keep: boolean): string => {
    if (!declaring) return hit({ dataClass: entry.covers, detector: "declared_field" }, text);
    matched.add(entry.name);
    if (keep) declaredValues.set(text, entry.covers);
    return text;
  };
  const repeated = (ctx: WalkContext, text: string) => underAt(ctx.path) ? declaredValues.get(text) : undefined;
  function value(input: unknown, ctx: WalkContext): unknown {
    if (typeof input === "string") return unit(input, ctx, false);
    if (typeof input === "number" || isRawJson(input)) return numberUnit(input, ctx);
    charge(UNIT_CHARGE);
    if (typeof input === "boolean") {
      const entry = covering(ctx);
      const out = entry === undefined ? String(input) : declaredHit(entry, String(input), false);
      return out === String(input) ? input : out;
    }
    if (input === null) return input;
    if (typeof input !== "object") return unsupported();
    // Binary carries no text the detectors read: counting, it is skipped; replacing, the caller replaces the whole value.
    if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return replace === undefined ? input : unsupported();
    if (ctx.depth > MAX_DEPTH) return local("too_deep", "");
    const array = Array.isArray(input), prototype: unknown = Object.getPrototypeOf(input), keys = Object.keys(input);
    if (active.has(input) || Object.getOwnPropertySymbols(input).length > 0 || (!array && prototype !== Object.prototype && prototype !== null)
      || (array && (keys.length !== input.length || keys.some((key, index) => key !== String(index))))) return unsupported();
    active.add(input);
    try {
      let changed = false;
      const items = keys.map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor === undefined || !("value" in descriptor)) return unsupported();
        const name = array ? key : unit(key, ctx, true);
        const item = value(descriptor.value as unknown, array ? { ...ctx, depth: ctx.depth + 1 }
          : { key, path: [...ctx.path, key], roots: ctx.roots, depth: ctx.depth + 1, secret: "secret_json" });
        changed ||= name !== key || item !== descriptor.value;
        return [name, item] as const;
      });
      if (!changed) return input;
      return array ? items.map(([, item]) => item) : Object.fromEntries(items);
    } finally { active.delete(input); }
  }
  /** A number, as its source literal where the parse kept one; replaced, it becomes the replacement string. */
  function numberUnit(input: number | { readonly rawJSON: string }, ctx: WalkContext): unknown {
    const source = typeof input === "number" ? undefined : input.rawJSON;
    const text = source ?? String(input);
    charge(UNIT_CHARGE + text.length);
    // An integer beyond 2^53 with at most 20 digits lost digits when it was parsed (a 17-19 digit card number sent as a JSON
    // number keeps only its leading ones), so its text cannot be checked.
    if (typeof input === "number" && Number.isInteger(input) && !Number.isSafeInteger(input) && Math.abs(input) < 1e20) return local("inexact_number", text);
    const entry = covering(ctx);
    const out = entry !== undefined ? declaredHit(entry, text, true) : declaring ? text : numberFinding(text, ctx);
    return out === text ? input : out;
  }
  function numberFinding(text: string, ctx: WalkContext): string {
    const repeat = repeated(ctx, text);
    if (repeat !== undefined) return hit({ dataClass: repeat, detector: "declared_field" }, text);
    const member = memberFinding(ctx.key, text, issued, charge, ctx.secret);
    if (member !== undefined) return hit(member, text);
    // Only a phone or card number needs ten digits or more; a shorter number shows nothing alone.
    if (text.replace(/\D+/g, "").length < 10) return text;
    const spans = detectProtectedText(text, issued);
    spans.forEach(record);
    return spans.length === 0 ? text : swap(spans[0]!, text);
  }
  /** A string or key: covered, repeated or flagged by its member name, it is replaced whole; else read as JSON and gaps. */
  function unit(text: string, ctx: WalkContext, isKey: boolean): string {
    charge(UNIT_CHARGE + text.length);
    if (text.length > MAX_PROTECTED_TEXT_CHARS) return local("too_long", text);
    if (ctx.depth > MAX_DEPTH) return local("too_deep", text);
    if (text.includes("\u0000")) return local("not_text", text);
    if (WHOLE_TOKEN.test(text) && issued(text)) return text;
    const entry = covering(ctx);
    if (entry !== undefined) return declaredHit(entry, text, true);
    if (!declaring) {
      const repeat = repeated(ctx, text);
      if (repeat !== undefined) return hit({ dataClass: repeat, detector: "declared_field" }, text);
      const member = isKey ? undefined : memberFinding(ctx.key, text, issued, charge, ctx.secret);
      if (member !== undefined) return hit(member, text);
    }
    try { return pieces(text, ctx); } catch (error) { return settle(error, text); }
  }
  function pieces(text: string, ctx: WalkContext): string {
    const segments = jsonSegments(text, charge);
    if (segments.length === 0) return gap(text, ctx);
    const inner: WalkContext = { ...ctx, roots: [...ctx.roots, ctx.path.length], depth: ctx.depth + 1 };
    let out = "", cursor = 0;
    for (const segment of segments) {
      out += gap(text.slice(cursor, segment.start), ctx) + doc(text.slice(segment.start, segment.end), segment.parsed, inner);
      cursor = segment.end;
    }
    return out + gap(text.slice(cursor), ctx);
  }
  // A JSON document in text: its original bytes when nothing in it changed, else its compact re-serialization. A repeated
  // key's earlier value was never read: replacing, the document is re-serialized without it; counting, it is also scanned.
  function doc(raw: string, parsed: unknown, ctx: WalkContext): string {
    const out = value(parsed, ctx);
    if (declaring) return raw;
    if (out !== parsed) return JSON.stringify(out);
    charge(raw.length);
    if (!hasDuplicateKey(raw)) return raw;
    if (replace !== undefined && probes.length === 0) return JSON.stringify(out);
    gap(raw, ctx);
    return raw;
  }
  /** Text that did not parse, scanned as it is, then each line decoded (`search`); a line only decoding flags is replaced whole. */
  function gap(text: string, ctx: WalkContext): string {
    if (declaring || text === "") return text;
    charge(text.length);
    const spans = distinct([...detectProtectedText(text, issued), ...pairSpans(text, false, issued, charge)]);
    spans.forEach(record);
    const regions: Region[] = spans.map(span => ({ start: span.start, end: span.end, finding: span }));
    const lineRepeats = repeats !== undefined && underAt(ctx.path) ? repeats : undefined;
    eachLine(text, spans, (start, end, masked) => {
      let found: readonly Finding[];
      try {
        if (lineRepeats !== undefined) charge(end - start);
        const repeat = lineRepeats?.(text.slice(start, end));
        found = repeat !== undefined ? [{ dataClass: repeat, detector: "declared_field" }] : search(masked, ctx);
      } catch (error) {
        if (!(error instanceof WalkRefused) || CALL_FAILURES.has(error.reason) || opaque === undefined || probes.length > 0) throw error;
        regions.push({ start, end, opaque: error.reason });
        return;
      }
      found.forEach(record);
      if (found.length > 0) regions.push({ start, end, finding: found[0]! });
    });
    return replaceRegions(text, regions, (region, raw) => region.opaque !== undefined ? opaque!(region.opaque) : swap(region.finding!, raw));
  }
  /** What one masked line shows decoded: findings only, never output. A line still changing after the rounds is unreadable. */
  function search(masked: string, ctx: WalkContext): readonly Finding[] {
    const found: Finding[] = [];
    const child: WalkContext = { ...ctx, key: undefined, depth: ctx.depth + 1 };
    probes.push(found);
    try {
      base64Children(masked, child);
      for (let view = masked, round = 0; round < MAX_DECODE_PASSES; round += 1) {
        const json = decodeJsonEscapes(view);
        if (json !== view) { base64Children(json, child); probe(json, child); }
        const web = decodeWebEscapes(json);
        if (web !== json) { base64Children(web, child); probe(web, child); }
        if (web === view) return distinctFindings(found);
        view = web;
      }
    } finally { probes.pop(); }
    throw new WalkRefused("unsettled");
  }
  /** Each base64 run in `text` that decodes to text, walked as exact text of its own. */
  function base64Children(text: string, ctx: WalkContext): void {
    for (const run of text.match(BASE64_RUN) ?? []) {
      const decoded = decodeBase64Run(run);
      if (decoded !== undefined) unit(decoded, ctx, false);
    }
  }
  /** One decoded view: its JSON walked exactly, the rest scanned flat (`flat`), with no decoding chain of its own. */
  function probe(view: string, ctx: WalkContext): void {
    if (view.length > MAX_PROTECTED_TEXT_CHARS) throw new WalkRefused("too_long");
    charge(view.length);
    const inner: WalkContext = { ...ctx, roots: [...ctx.roots, ctx.path.length] };
    let cursor = 0;
    for (const segment of jsonSegments(view, charge)) {
      flat(view.slice(cursor, segment.start), ctx);
      value(segment.parsed, inner);
      const raw = view.slice(segment.start, segment.end);
      charge(raw.length);
      if (hasDuplicateKey(raw)) flat(raw, ctx);
      cursor = segment.end;
    }
    flat(view.slice(cursor), ctx);
  }
  /** A view's text outside its JSON: dlp, the credential shapes, the quote-free pairs and declared repeats. */
  function flat(text: string, ctx: WalkContext): void {
    if (text === "") return;
    for (const span of detectProtectedText(text, issued)) record(span);
    for (const span of pairSpans(text, true, issued, charge)) record(span);
    const repeat = repeats !== undefined && underAt(ctx.path) ? repeats(text) : undefined;
    if (repeat !== undefined) record({ dataClass: repeat, detector: "declared_field" });
  }

  const root = (key?: string): WalkContext => ({ key, path: [], roots: [at.length], depth: 0, secret: "secret_field" });
  const run = <T>(walk: () => T): T => {
    if (paths.length > 0) {
      declaring = true;
      try { walk(); } finally { declaring = false; }
      repeats = declaredValues.size === 0 ? undefined : declaredRepeats(declaredValues);
    }
    return walk();
  };
  return Object.freeze({
    text: (text: string, key?: string) => typeof text === "string" ? run(() => unit(text, root(key), false)) : unsupported(),
    value: (input: unknown) => run(() => value(input, root())),
    findings,
    get declaredMatched() { return Object.freeze([...matched].sort()); }
  });
}

/**
 * Read-only inspection, one counting walk over the request. Counts are heuristic findings, not distinct people or verified
 * data classes. Over-long text, excessive nesting, decoding that does not settle or an unsupported shape throws, never skips.
 */
export function detectProtectedRequest(request: EncodableRequest, issued: IssuedToken = NONE_ISSUED): ProtectedDataDetection {
  try {
    const walk = protectedWalk({ budget: MAX_REQUEST_SCAN_CHARS, issued });
    const text = (value: string) => { if (typeof value !== "string") refused(); walk.text(value); };
    text(request.model);
    if (request.system !== null) text(request.system);
    walk.value(request.params);
    walk.value(request.tools);
    if (!Array.isArray(request.messages)) refused();
    for (const message of request.messages) {
      if (!Array.isArray(message.parts)) refused();
      for (const part of message.parts) {
        switch (part.kind) {
          case "text": case "thinking": case "tool_result": text(part.text); break;
          // Malformed tool-call arguments are committed by design; they are text with JSON inside, never refused.
          case "tool_use": text(part.toolName); text(part.argumentsJson); break;
          case "image": case "audio": break;
          default: refused();
        }
      }
    }
    const counts: Partial<Record<ProtectedDataClass, number>> = {};
    for (const finding of walk.findings) counts[finding.dataClass] = (counts[finding.dataClass] ?? 0) + 1;
    return Object.freeze({ classes: Object.freeze(CLASSES.filter(kind => (counts[kind] ?? 0) > 0)), counts: Object.freeze(counts), detectorSetDigest: DETECTOR_SET_DIGEST });
  } catch { return refused(); }
}

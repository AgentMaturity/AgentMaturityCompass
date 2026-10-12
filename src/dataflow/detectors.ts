/** Experimental text heuristics. Binary media, clinical semantics, and complete detection are outside this detector set. */
import type { EncodableRequest } from "../llm/request/requestSpec.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { findPIISpans, getPIIDetectorMetadata, PII_SPAN_SCAN_REVISION, type PiiSpan } from "../vault/dlp.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { isShieldingToken, TOKEN_PATTERN_SOURCE } from "./tokenizer.js";

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

const CLASSES: readonly ProtectedDataClass[] = ["phi", "pii", "card_number", "bank_account", "credential"];
const CLASS_BY_TYPE: Readonly<Record<string, ProtectedDataClass>> = Object.freeze({
  email: "pii", phone: "pii", ssn: "pii", credit_card: "card_number", iban: "bank_account", ip_address: "pii",
  eu_vat: "pii", eu_national_id: "pii", passport_number: "pii", health_record_id: "phi",
  api_key_openai: "credential", api_key_github: "credential", api_key_aws: "credential", password_json: "credential"
});
// ponytail: a bare 10-digit run not preceded by "+" is dropped as noise, so a phone number written that way is not
// detected; E.164 (+14155552671) and 11-digit (14155552671) runs still are. Add a context-keyed phone rule (e.g. "tel:",
// "phone") if that recall matters. scanForPII still reports them.
const NOISE_FILTERS: Readonly<Record<string, RegExp>> = Object.freeze({
  ip_address: /^\d{1,2}(?::\d{2}){1,2}(?:\.\d+)?$/, // HH:MM[:SS] clock times that IPV6_SOURCE also matches
  phone: /^\d{10}$/, // bare 10-digit runs: Unix-seconds timestamps, counters, 2147483647
  // Bare 13-digit runs starting with 1: Unix-millisecond timestamps (2001-2033), about 10% Luhn-valid. No card network
  // issues a 13-digit number starting with 1 (13-digit cards are legacy Visa, starting with 4).
  credit_card: /^1\d{12}$/
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
const MAX_REQUEST_SCAN_CHARS = 16_777_216;
const JSON_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" });
// JSON string escapes (\n, \uXXXX, \" ...) decoded in one linear pass, so escaped text in malformed arguments still matches.
const decodeJsonEscapes = (text: string) => text.replace(/\\(?:u([0-9a-fA-F]{4})|([\s\S]))/g,
  (_match, hex: string | undefined, char: string) => hex !== undefined ? String.fromCharCode(Number.parseInt(hex, 16))
    : Object.hasOwn(JSON_ESCAPES, char) ? JSON_ESCAPES[char]! : char);
/** Binds the patterns, mappings, filters, token format and limits below; receipts and admission rows carry it. */
export const DETECTOR_SET_DIGEST = sha256Hex(canonicalize({
  schema: "amc.protected-detectors/v1", support: "experimental", patterns: getPIIDetectorMetadata(), spanScanRevision: PII_SPAN_SCAN_REVISION,
  classMapping: CLASS_BY_TYPE,
  noiseFilters: Object.fromEntries(Object.entries(NOISE_FILTERS).map(([type, re]) => [type, re.source])),
  tokenFormat: TOKEN_PATTERN_SOURCE,
  traversalRevision: "request-json-leaves-plus-raw-decoded-args-password-context-malformed-args-as-escape-decoded-text-non-finite-args-as-null-parse-overflow-refused-per-leaf-and-request-limits-noise-rejected-in-scan-plus-and-double-colon-kept-ms-timestamps-not-cards-spans-inside-letter-hex-token-skipped-token-crossing-spans-rechecked-without-tokens-v9",
  limits: { maxDepth: MAX_DEPTH, maxLeafChars: MAX_PROTECTED_TEXT_CHARS, maxRequestScanChars: MAX_REQUEST_SCAN_CHARS }
}));
function refused(): never { throw new Error("Protected request detection refused unsupported or excessive traversal"); }
const dataClass = (type: string): ProtectedDataClass => Object.hasOwn(CLASS_BY_TYPE, type) ? CLASS_BY_TYPE[type]! : refused();

const TOKEN_HEX_CHARS = 16;
const tokenPattern = () => new RegExp(TOKEN_PATTERN_SOURCE, "g");
/** [start, end) of each shielding AMC token (see isShieldingToken) in text order; tokens never overlap. */
const tokenRanges = (text: string): readonly (readonly [number, number])[] => text.includes("[[amc:")
  ? Array.from(text.matchAll(tokenPattern()), match => [match.index, match.index + match[0].length] as const)
    .filter(([start, end]) => isShieldingToken(text.slice(start, end))) : [];
const withoutTokens = (text: string) => text.replace(tokenPattern(), token => isShieldingToken(token) ? "" : token);
/**
 * A span inside a shielding token's hex is the token, not a value. A span that crosses token text (a JSON password value
 * holding a token) stays a detection only if it still is one with the tokens removed, so raw text beside a token is
 * never hidden by it. The last token starting before the span's end is the only one the span can lie inside.
 */
function shieldedByToken(text: string, tokens: readonly (readonly [number, number])[], span: PiiSpan): boolean {
  let low = 0, high = tokens.length - 1, last = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (tokens[mid]![0] < span.end) { last = mid; low = mid + 1; } else high = mid - 1;
  }
  if (last < 0 || tokens[last]![1] <= span.start) return false;
  const hexEnd = tokens[last]![1] - 2;
  if (span.start >= hexEnd - TOKEN_HEX_CHARS && span.end <= hexEnd) return true;
  return !findPIISpans(withoutTokens(text.slice(span.start, span.end))).some(other => other.type === span.type);
}

/** Offsets refer to the original text. No matched values are returned or logged. */
export function detectProtectedText(text: string): readonly ProtectedDataSpan[] {
  if (typeof text !== "string" || text.length > MAX_PROTECTED_TEXT_CHARS) return refused();
  // Noise and token hex are rejected inside the scan, so a dropped span cannot hide an overlapping match
  // ("12:34:56.78.90.12").
  const tokens = tokenRanges(text);
  const spans = findPIISpans(text, span => isNoise(text, span) || shieldedByToken(text, tokens, span));
  return Object.freeze(spans.map(span => Object.freeze({
    start: span.start, end: span.end, dataClass: dataClass(span.type), detector: span.type
  })));
}

/**
 * Replaces each detected region with `replace(region, value)`. Overlapping detections merge into one region that keeps
 * the class of the earliest (then longest) span; `spans` lists every detection. Over-long text throws, like
 * detectProtectedText: a caller must refuse or replace it whole, never pass it through.
 */
export function redactProtectedText(text: string, replace: (region: ProtectedDataSpan, value: string) => string):
  { readonly text: string; readonly spans: readonly ProtectedDataSpan[] } {
  const spans = detectProtectedText(text);
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

/**
 * Read-only inspection, once per text leaf. Counts are heuristic findings, not distinct people or verified data classes.
 * An over-long leaf or request, excessive nesting or an unsupported shape throws; it is never skipped.
 */
export function detectProtectedRequest(request: EncodableRequest): ProtectedDataDetection {
  try {
    const counts: Partial<Record<ProtectedDataClass, number>> = {};
    const active = new Set<object>();
    const add = (kind: ProtectedDataClass) => { counts[kind] = (counts[kind] ?? 0) + 1; };
    let scanned = 0;
    const charge = (length: number) => { scanned += length; if (scanned > MAX_REQUEST_SCAN_CHARS) refused(); };
    const scan = (text: string, key?: string) => {
      if (typeof text !== "string") refused();
      charge(text.length);
      const spans = detectProtectedText(text);
      for (const span of spans) add(span.dataClass);
      // Keep the existing JSON-password heuristic without rescanning every object or double-counting its credential value.
      if (key?.toLowerCase() === "password" && !spans.some(span => span.dataClass === "credential")) {
        const context = JSON.stringify({ [key]: text });
        if (context.length > MAX_PROTECTED_TEXT_CHARS) refused();
        charge(context.length);
        if (detectProtectedText(context).some(span => span.detector === "password_json")) add("credential");
      }
    };
    const visit = (value: unknown, depth: number, key?: string): void => {
      if (depth > MAX_DEPTH) refused();
      if (typeof value === "string") { scan(value, key); return; }
      if (typeof value === "number") { if (!Number.isFinite(value)) refused(); scan(String(value)); return; }
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
        visit(descriptor.value, depth + 1, array ? undefined : field);
      }
      active.delete(value);
    };
    // Empty or malformed tool-call arguments are committed by design; they are scanned as escape-decoded text, never
    // refused. A number that overflows to Infinity (1e999) carries no text and becomes null, since visit() refuses it.
    // Valid arguments are also scanned as raw decoded text, because the provider receives these bytes whatever a parser
    // keeps: a duplicate key hides its earlier value from the parsed leaves. That pass only adds classes not yet counted.
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
      const raw = decodeJsonEscapes(text);
      charge(raw.length);
      for (const span of detectProtectedText(raw)) if (!(counts[span.dataClass] ?? 0)) add(span.dataClass);
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
          case "text": case "thinking": case "tool_result": scan(part.text); break;
          case "tool_use": scan(part.toolName); json(part.argumentsJson); break;
          case "image": case "audio": break;
          default: refused();
        }
      }
    }
    return Object.freeze({ classes: Object.freeze(CLASSES.filter(kind => (counts[kind] ?? 0) > 0)), counts: Object.freeze(counts), detectorSetDigest: DETECTOR_SET_DIGEST });
  } catch { return refused(); }
}

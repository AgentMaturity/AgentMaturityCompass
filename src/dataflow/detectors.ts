/** Experimental text heuristics. Binary media, clinical semantics, and complete detection are outside this detector set. */
import type { EncodableRequest } from "../llm/request/requestSpec.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { findPIISpans, getPIIDetectorMetadata, PII_SPAN_SCAN_REVISION, type PiiSpan } from "../vault/dlp.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

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
  phone: /^\d{10}$/ // bare 10-digit runs: Unix-seconds timestamps, counters, 2147483647
});
// The phone pattern's leading \b cannot sit before "+", so an E.164 span starts after it; keep such a span.
const isNoise = (text: string, span: PiiSpan) =>
  Object.hasOwn(NOISE_FILTERS, span.type) && NOISE_FILTERS[span.type]!.test(text.slice(span.start, span.end))
  && !(span.type === "phone" && text.charAt(span.start - 1) === "+");
// Per-leaf and nesting bounds only. Request-wide totals refused every long session, so they are gone.
const MAX_DEPTH = 32;
const MAX_TEXT_CHARS = 1_048_576;
const DETECTOR_SET_DIGEST = sha256Hex(canonicalize({
  schema: "amc.protected-detectors/v1", support: "experimental", patterns: getPIIDetectorMetadata(), spanScanRevision: PII_SPAN_SCAN_REVISION,
  classMapping: CLASS_BY_TYPE,
  noiseFilters: Object.fromEntries(Object.entries(NOISE_FILTERS).map(([type, re]) => [type, re.source])),
  traversalRevision: "request-json-leaves-password-context-malformed-or-non-finite-args-as-text-per-leaf-limits-noise-filtered-plus-kept-v5",
  limits: { maxDepth: MAX_DEPTH, maxLeafChars: MAX_TEXT_CHARS }
}));
function refused(): never { throw new Error("Protected request detection refused unsupported or excessive traversal"); }
const dataClass = (type: string): ProtectedDataClass => Object.hasOwn(CLASS_BY_TYPE, type) ? CLASS_BY_TYPE[type]! : refused();

/** Offsets refer to the original text. No matched values are returned or logged. */
export function detectProtectedText(text: string): readonly ProtectedDataSpan[] {
  if (typeof text !== "string" || text.length > MAX_TEXT_CHARS) return refused();
  const spans = findPIISpans(text).filter(span => !isNoise(text, span));
  return Object.freeze(spans.map(span => Object.freeze({
    start: span.start, end: span.end, dataClass: dataClass(span.type), detector: span.type
  })));
}

/**
 * Read-only inspection, once per text leaf. Counts are heuristic findings, not distinct people or verified data classes.
 * An over-long leaf, excessive nesting or an unsupported shape throws; it is never skipped.
 */
export function detectProtectedRequest(request: EncodableRequest): ProtectedDataDetection {
  try {
    const counts: Partial<Record<ProtectedDataClass, number>> = {};
    const active = new Set<object>();
    const add = (kind: ProtectedDataClass) => { counts[kind] = (counts[kind] ?? 0) + 1; };
    const scan = (text: string, key?: string) => {
      if (typeof text !== "string") refused();
      const spans = detectProtectedText(text);
      for (const span of spans) add(span.dataClass);
      // Keep the existing JSON-password heuristic without rescanning every object or double-counting its credential value.
      if (key?.toLowerCase() === "password" && !spans.some(span => span.dataClass === "credential")) {
        const context = JSON.stringify({ [key]: text });
        if (context.length > MAX_TEXT_CHARS) refused();
        if (findPIISpans(context).some(span => span.type === "password_json")) add("credential");
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
    // Empty or malformed tool-call arguments are committed by design; they are scanned as text, never refused. So are
    // arguments with a number that overflows to Infinity (1e999), which visit() would refuse on every later prepare.
    const json = (text: string) => {
      if (typeof text !== "string") refused();
      let parsed: unknown, nonFinite = false;
      try {
        parsed = JSON.parse(text, (_key, value: unknown) => {
          if (typeof value === "number" && !Number.isFinite(value)) nonFinite = true;
          return value;
        });
      } catch { scan(text); return; }
      if (nonFinite) { scan(text); return; }
      visit(parsed, 0);
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

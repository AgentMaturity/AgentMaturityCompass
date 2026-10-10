/** Experimental text heuristics. Binary media, clinical semantics, and complete detection are outside this detector set. */
import type { EncodableRequest } from "../llm/request/requestSpec.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { findPIISpans, getPIIDetectorMetadata } from "../vault/dlp.js";
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
const MAX_DEPTH = 32;
const MAX_NODES = 10_000;
const MAX_TEXT_CHARS = 1_048_576;
const DETECTOR_SET_DIGEST = sha256Hex(canonicalize({
  schema: "amc.protected-detectors/v1", support: "experimental", patterns: getPIIDetectorMetadata(), classMapping: CLASS_BY_TYPE,
  traversalRevision: "request-json-leaves-password-context-v1",
  limits: { maxDepth: MAX_DEPTH, maxNodes: MAX_NODES, maxTextChars: MAX_TEXT_CHARS, maxJsonChars: MAX_TEXT_CHARS }
}));
function refused(): never { throw new Error("Protected request detection refused unsupported or excessive traversal"); }
const dataClass = (type: string): ProtectedDataClass => Object.hasOwn(CLASS_BY_TYPE, type) ? CLASS_BY_TYPE[type]! : refused();

/** Offsets refer to the original text. No matched values are returned. */
export function detectProtectedText(text: string): readonly ProtectedDataSpan[] {
  if (typeof text !== "string" || text.length > MAX_TEXT_CHARS) return refused();
  return Object.freeze(findPIISpans(text).map(span => Object.freeze({
    start: span.start, end: span.end, dataClass: dataClass(span.type), detector: span.type
  })));
}

/** Read-only inspection, once per text leaf. Counts are heuristic findings, not distinct people or verified data classes. */
export function detectProtectedRequest(request: EncodableRequest): ProtectedDataDetection {
  try {
    const counts: Partial<Record<ProtectedDataClass, number>> = {};
    const active = new Set<object>();
    let nodes = 0, chars = 0, jsonChars = 0;
    const touch = () => { if (++nodes > MAX_NODES) refused(); };
    const add = (kind: ProtectedDataClass) => { counts[kind] = (counts[kind] ?? 0) + 1; };
    const scan = (text: string, key?: string) => {
      if (typeof text !== "string" || (chars += text.length) > MAX_TEXT_CHARS) refused();
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
      touch();
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
      if (keys.length > MAX_NODES - nodes || (Array.isArray(value) && (keys.length !== value.length || keys.some((field, index) => field !== String(index))))) refused();
      active.add(value);
      for (const field of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, field);
        if (!descriptor || !("value" in descriptor)) refused();
        if (!array) { touch(); scan(field); }
        visit(descriptor.value, depth + 1, array ? undefined : field);
      }
      active.delete(value);
    };
    const json = (text: string) => {
      if (typeof text !== "string" || (jsonChars += text.length) > MAX_TEXT_CHARS) refused();
      visit(JSON.parse(text) as unknown, 0);
    };

    touch(); scan(request.model);
    if (request.system !== null) { touch(); scan(request.system); }
    visit(request.params, 0);
    visit(request.tools, 0);
    if (!Array.isArray(request.messages) || request.messages.length > MAX_NODES - nodes) refused();
    for (const message of request.messages) {
      touch();
      if (!Array.isArray(message.parts) || message.parts.length > MAX_NODES - nodes) refused();
      for (const part of message.parts) {
        touch();
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

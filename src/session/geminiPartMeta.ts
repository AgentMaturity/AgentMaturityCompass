import { sha256Hex } from "../utils/hash.js";
import { parseGeminiJson, type GeminiJsonNode } from "../llm/providers/geminiJson.js";

/** Raw provider part, not a Google-signed AMC assertion. AMC signs this metadata
 * with its row. Opaque thoughtSignature bytes are retained, never fabricated or
 * cryptographically verified by AMC. partIndex is its original stream position.
 */
export interface GeminiPartMeta {
  readonly version: 1;
  readonly responseId: string;
  readonly partIndex: number;
  readonly partJson: string;
}
export interface RecordedGeminiPart extends GeminiPartMeta { readonly headerEventId: string }
function fail(): never { throw new Error("Gemini part provenance is malformed, unsupported, or inconsistent with its signed payload"); }
function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value)
    && Buffer.from(value, "utf8").toString("utf8") === value;
}
/** Provider IDs remain exact. Missing IDs get a labelled, response-scoped local
 * join key; it is NEVER sent back as a provider-issued functionCall.id. */
export function geminiCallKey(meta: GeminiPartMeta, call: GeminiJsonNode): string {
  const id = call.fields?.get("id")?.value;
  if (id !== undefined) { if (!string(id)) return fail(); return id; }
  return `amc-gemini-local-${sha256Hex(meta.responseId)}-${meta.partIndex}`;
}
export function readGeminiPart(meta: GeminiPartMeta): GeminiJsonNode {
  if (meta === null || typeof meta !== "object" || meta.version !== 1 || !string(meta.responseId)
      || !Number.isSafeInteger(meta.partIndex) || meta.partIndex < 0 || meta.partIndex >= 4096
      || typeof meta.partJson !== "string" || Buffer.byteLength(meta.partJson, "utf8") > 1024 * 1024
      || Object.keys(meta).some(key => !["version", "responseId", "partIndex", "partJson", "headerEventId"].includes(key))) return fail();
  const part = parseGeminiJson(meta.partJson), fields = part.fields;
  if (!fields || [...fields.keys()].some(key => !["text", "thought", "thoughtSignature", "functionCall"].includes(key))) return fail();
  const thought = fields.get("thought")?.value;
  if (thought !== undefined && typeof thought !== "boolean") return fail();
  const signature = fields.get("thoughtSignature")?.value;
  if (signature !== undefined && (typeof signature !== "string" || !signature || signature.length > 256 * 1024
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signature)
      || Buffer.from(signature, "base64").toString("base64") !== signature)) return fail();
  const text = fields.get("text"), call = fields.get("functionCall");
  if (text && typeof text.value !== "string") return fail();
  if (text && call) return fail();
  if (!text && !call && signature === undefined) return fail();
  if (call) {
    if (!call.fields || [...call.fields.keys()].some(key => !["name", "args", "id"].includes(key))) return fail();
    const name = call.fields.get("name")?.value;
    if (typeof name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(name)) return fail();
    const args = call.fields.get("args");
    if (args !== undefined && !args.fields) return fail();
    geminiCallKey(meta, call);
  }
  return part;
}
export function snapshotRecordedGeminiPart(value: RecordedGeminiPart, kind: string, payload: string | Buffer,
  call?: { readonly id: string; readonly wireName: string }): RecordedGeminiPart {
  if (!string(value?.headerEventId)) return fail();
  const part = readGeminiPart(value), fn = part.fields!.get("functionCall");
  const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
  if (typeof text !== "string" || Buffer.from(text, "utf8").toString("utf8") !== text
      || (Buffer.isBuffer(payload) && !Buffer.from(text, "utf8").equals(payload))) return fail();
  if (kind === "tool_use") {
    if (!fn || !call || geminiCallKey(value, fn) !== call.id || fn.fields!.get("name")?.value !== call.wireName
        || (fn.fields!.get("args")?.raw ?? "{}") !== text) return fail();
  } else {
    const expectedKind = part.fields!.get("thought")?.value === true || !part.fields!.has("text") ? "thinking" : "text";
    if (fn || kind !== expectedKind || (part.fields!.get("text")?.value ?? "") !== text) return fail();
  }
  return Object.freeze({ version: 1, responseId: value.responseId, partIndex: value.partIndex,
    partJson: value.partJson, headerEventId: value.headerEventId });
}

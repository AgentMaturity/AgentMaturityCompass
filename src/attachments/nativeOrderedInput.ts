import { canonicalize } from "../utils/json.js";
import { materializeNativeImages, MAX_NATIVE_IMAGE_INPUT_BYTES, NativeImageInputError,
  snapshotNativeImages, type NativeImageInput, type QueuedNativeImage } from "./nativeImageInput.js";

/** Additive image-bearing sequence. The historical prefix/images codec is unchanged. */
export const NATIVE_ORDERED_INPUT_FORMAT = "amc-image-input@2";
export const MAX_NATIVE_INPUT_PARTS = 256;
export type NativeInputPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly image: NativeImageInput };
export type QueuedNativeInputPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly image: QueuedNativeImage };

function assertParts(parts: unknown): asserts parts is readonly Record<string, unknown>[] {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_NATIVE_INPUT_PARTS) {
    throw new NativeImageInputError(`Ordered image input requires one through ${MAX_NATIVE_INPUT_PARTS} parts.`);
  }
  for (let index = 0; index < parts.length; index++) {
    const part: unknown = parts[index];
    if (!Object.hasOwn(parts, index) || !part || typeof part !== "object" || Array.isArray(part)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(part))) {
      throw new NativeImageInputError("Ordered input requires a dense list of plain text/image parts.");
    }
    const value = part as Record<string, unknown>;
    const field = value.type === "text" ? "text" : value.type === "image" ? "image" : null;
    if (field === null || Reflect.ownKeys(value).length !== 2 || !Object.hasOwn(value, "type") || !Object.hasOwn(value, field)) {
      throw new NativeImageInputError("Unsupported ordered input part or field; content is never discarded.");
    }
  }
}

/** Snapshot before any asynchronous queue or hook: no mutable Buffer is authority. */
export function snapshotNativeInputParts(parts: readonly NativeInputPart[]): readonly QueuedNativeInputPart[] {
  assertParts(parts);
  const images: NativeImageInput[] = [];
  let textBytes = 0;
  const layout = parts.map(part => {
    if (part.type === "image") { images.push(part.image); return { type: "image" as const, index: images.length - 1 }; }
    const text = part.text;
    if (typeof text !== "string" || Buffer.from(text, "utf8").toString("utf8") !== text) {
      throw new NativeImageInputError("Ordered text must be a losslessly representable UTF-8 string.");
    }
    textBytes += Buffer.byteLength(text, "utf8");
    if (textBytes > 2 * MAX_NATIVE_IMAGE_INPUT_BYTES) throw new NativeImageInputError("Ordered input text exceeds the native payload bound.");
    return { type: "text" as const, text };
  });
  if (images.length === 0) throw new NativeImageInputError("Ordered image input requires an image; use the legacy text prompt API for text-only input.");
  const snapshots = snapshotNativeImages(images);
  const result: readonly QueuedNativeInputPart[] = Object.freeze(layout.map(part => part.type === "text"
    ? Object.freeze({ type: "text" as const, text: part.text })
    : Object.freeze({ type: "image" as const, image: snapshots[part.index]! })));
  if (Buffer.byteLength(canonicalize({ format: NATIVE_ORDERED_INPUT_FORMAT, parts: result }), "utf8") > 2 * MAX_NATIVE_IMAGE_INPUT_BYTES) {
    throw new NativeImageInputError("Ordered input exceeds the native encoded payload bound.");
  }
  return result;
}

export function materializeNativeInputParts(parts: readonly QueuedNativeInputPart[]): readonly NativeInputPart[] {
  assertParts(parts);
  const images = materializeNativeImages(parts.flatMap(part => part.type === "image" ? [part.image] : []));
  let index = 0;
  const result: NativeInputPart[] = parts.map(part => part.type === "text"
    ? { type: "text", text: part.text }
    : { type: "image", image: images[index++]! });
  const normalized = snapshotNativeInputParts(result);
  if (canonicalize(normalized) !== canonicalize(parts)) throw new NativeImageInputError("Ordered input is not the exact supported part shape.");
  return result;
}

export function encodeNativeOrderedInput(parts: readonly QueuedNativeInputPart[]): string {
  materializeNativeInputParts(parts);
  return canonicalize({ format: NATIVE_ORDERED_INPUT_FORMAT, parts });
}

export function decodeNativeOrderedInput(payload: Buffer): readonly QueuedNativeInputPart[] {
  if (!Buffer.isBuffer(payload) || payload.length > 2 * MAX_NATIVE_IMAGE_INPUT_BYTES) throw new NativeImageInputError("Ordered input exceeds the native payload bound.");
  if (!Buffer.from(payload.toString("utf8"), "utf8").equals(payload)) throw new NativeImageInputError("Ordered input payload is not lossless UTF-8.");
  let parsed: unknown;
  try { parsed = JSON.parse(payload.toString("utf8")); } catch { throw new NativeImageInputError("Ordered input payload is not JSON."); }
  const value = parsed as { format?: unknown; parts?: unknown } | null;
  if (!value || value.format !== NATIVE_ORDERED_INPUT_FORMAT || !Array.isArray(value.parts)) throw new NativeImageInputError("Unsupported ordered input format.");
  const parts = snapshotNativeInputParts(materializeNativeInputParts(value.parts as QueuedNativeInputPart[]));
  if (encodeNativeOrderedInput(parts) !== payload.toString("utf8")) throw new NativeImageInputError("Ordered input payload is not the exact canonical sequence.");
  return parts;
}

import { extname } from "node:path";
import { detonateAttachment } from "../shield/attachmentDetonation.js";
import { canonicalize } from "../utils/json.js";

/** Local admission limits, not a claim about a remote model's capabilities. */
export const MAX_NATIVE_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_NATIVE_IMAGE_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_NATIVE_IMAGES = 8;
export const NATIVE_IMAGE_INPUT_FORMAT = "amc-image-input@1";
export type NativeImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
export interface NativeImageInput {
  readonly filename: string;
  readonly mediaType: NativeImageMediaType;
  readonly bytes: Buffer;
}
/** Base64 is immutable and exists in the blob-backed inbox payload, never metadata. */
export interface QueuedNativeImage {
  readonly filename: string;
  readonly mediaType: NativeImageMediaType;
  readonly data: string;
}
export class NativeImageInputError extends Error {
  constructor(message: string) { super(message); this.name = "NativeImageInputError"; }
}
const TYPES: Readonly<Record<string, NativeImageMediaType>> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"
};
export function imageTypeForFilename(filename: string): NativeImageMediaType | null {
  return TYPES[extname(filename).toLowerCase()] ?? null;
}
/** Header/container checks only; no decoder, malware or prompt-injection verdict. */
export function nativeImageMediaType(bytes: Buffer): NativeImageMediaType | null {
  if (!Buffer.isBuffer(bytes)) return null;
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR"
      && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0) return "image/png";
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
      && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return "image/jpeg";
  if (bytes.length >= 14 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
      && bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0 && bytes[bytes.length - 1] === 0x3b) return "image/gif";
  if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF"
      && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length
      && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) return "image/webp";
  return null;
}
export function assertNativeImageBytes(bytes: Buffer, mediaType: unknown): asserts mediaType is NativeImageMediaType {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_NATIVE_IMAGE_BYTES) {
    throw new NativeImageInputError(`An image requires original nonempty bytes, at most ${MAX_NATIVE_IMAGE_BYTES} bytes; URLs and file IDs are not image bytes.`);
  }
  const detected = nativeImageMediaType(bytes);
  if (detected === null || detected !== mediaType) throw new NativeImageInputError("Image bytes and declared supported media type disagree, or the image header/container is malformed.");
}
export function snapshotNativeImages(images: readonly NativeImageInput[] = []): readonly QueuedNativeImage[] {
  if (!Array.isArray(images) || images.length > MAX_NATIVE_IMAGES) throw new NativeImageInputError(`At most ${MAX_NATIVE_IMAGES} native images may be queued in one input.`);
  let total = 0;
  return Object.freeze(images.map(image => {
    if (!image || typeof image.filename !== "string" || !image.filename || image.filename.length > 255
        || /[\\/\u0000-\u001f\u007f]/.test(image.filename)) throw new NativeImageInputError("An image filename must be a bounded plain filename, not a path or URL.");
    assertNativeImageBytes(image.bytes, image.mediaType);
    if (imageTypeForFilename(image.filename) !== image.mediaType) throw new NativeImageInputError("Image filename, media type and original bytes must agree.");
    total += image.bytes.length;
    if (total > MAX_NATIVE_IMAGE_INPUT_BYTES) throw new NativeImageInputError("Native image input exceeds the aggregate byte limit; no input was queued.");
    const verdict = detonateAttachment(image.filename, image.bytes.toString("utf8"));
    if (!verdict.safe) throw new NativeImageInputError(`Image attachment refused: ${verdict.threats.join("; ")}`);
    return Object.freeze({ filename: image.filename, mediaType: image.mediaType, data: image.bytes.toString("base64") });
  }));
}
export function materializeNativeImages(images: readonly QueuedNativeImage[]): readonly NativeImageInput[] {
  if (!Array.isArray(images) || images.length > MAX_NATIVE_IMAGES) throw new NativeImageInputError("Malformed queued native image list.");
  const materialized = images.map(image => {
    if (!image || typeof image.data !== "string" || image.data.length > 4 * Math.ceil(MAX_NATIVE_IMAGE_BYTES / 3)
        || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
      throw new NativeImageInputError("Queued image requires bounded canonical base64, not a URL or permissively decoded text.");
    }
    const bytes = Buffer.from(image.data, "base64");
    if (bytes.toString("base64") !== image.data) throw new NativeImageInputError("Queued image base64 is not canonical.");
    return { filename: image.filename, mediaType: image.mediaType, bytes };
  });
  snapshotNativeImages(materialized);
  return materialized;
}
export function encodeNativeImageInput(text: string, images: readonly QueuedNativeImage[]): string {
  if (typeof text !== "string" || images.length === 0) throw new NativeImageInputError("A native image input requires text and at least one image.");
  materializeNativeImages(images);
  const payload = canonicalize({ format: NATIVE_IMAGE_INPUT_FORMAT, text, images });
  if (Buffer.byteLength(payload, "utf8") > 2 * MAX_NATIVE_IMAGE_INPUT_BYTES) throw new NativeImageInputError("Queued image payload exceeds the local input bound.");
  return payload;
}
export function decodeNativeImageInput(payload: Buffer): { readonly text: string; readonly images: readonly QueuedNativeImage[] } {
  if (payload.length > 2 * MAX_NATIVE_IMAGE_INPUT_BYTES) throw new NativeImageInputError("Queued image payload exceeds the local input bound.");
  let parsed: unknown;
  try { parsed = JSON.parse(payload.toString("utf8")); } catch { throw new NativeImageInputError("Queued image payload is not JSON."); }
  const value = parsed as { format?: unknown; text?: unknown; images?: unknown } | null;
  if (!value || value.format !== NATIVE_IMAGE_INPUT_FORMAT || typeof value.text !== "string" || !Array.isArray(value.images)) {
    throw new NativeImageInputError("Queued image payload has an unsupported format.");
  }
  const images = snapshotNativeImages(materializeNativeImages(value.images as QueuedNativeImage[]));
  if (encodeNativeImageInput(value.text, images) !== payload.toString("utf8")) throw new NativeImageInputError("Queued image payload is not the exact canonical input shape.");
  return { text: value.text, images };
}

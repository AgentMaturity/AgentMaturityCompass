import { extname } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { materializeNativeImages, snapshotNativeImages, type NativeImageInput, type QueuedNativeImage } from "./nativeImageInput.js";

/** Additive, audio-bearing sequence. Historical amc-image-input@1/@2 are unchanged. */
export const NATIVE_AUDIO_INPUT_FORMAT = "amc-audio-input@1";
export const MAX_NATIVE_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_NATIVE_AUDIO_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_NATIVE_AUDIO_PARTS = 256;
export const MAX_NATIVE_AUDIOS = 8;
export type NativeAudioMediaType = "audio/wav";
export interface NativeAudioInput {
  readonly filename: string;
  readonly mediaType: NativeAudioMediaType;
  readonly bytes: Buffer;
}
export interface QueuedNativeAudio {
  readonly filename: string;
  readonly mediaType: NativeAudioMediaType;
  readonly data: string;
  readonly byteLength: number;
  readonly sha256: string;
}
export type NativeAudioPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly image: NativeImageInput }
  | { readonly type: "audio"; readonly audio: NativeAudioInput };
export type QueuedNativeAudioPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly image: QueuedNativeImage }
  | { readonly type: "audio"; readonly audio: QueuedNativeAudio };

export class NativeAudioInputError extends Error {
  constructor(message: string) { super(message); this.name = "NativeAudioInputError"; }
}
function fail(message: string): never { throw new NativeAudioInputError(message); }
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      || Reflect.ownKeys(value).length !== keys.length
      || keys.some(key => !Object.hasOwn(value, key) || !("value" in Object.getOwnPropertyDescriptor(value, key)!))) {
    fail("Native audio input requires exact plain data fields; unsupported content is never discarded.");
  }
}
function filename(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(value)
      || /^[a-z][a-z0-9+.-]*:/i.test(value)
      || extname(value).toLowerCase() !== ".wav" || Buffer.from(value, "utf8").toString("utf8") !== value) {
    fail("Native audio requires a bounded plain .wav filename, not a path or URL.");
  }
}

/** Bounded RIFF/PCM16 header and length admission, NOT a decoder, security scan,
 * speech/content verdict or claim that any particular remote model accepts it.
 * This version accepts exactly fmt(16) then data: no RF64, float, compressed WAV,
 * optional metadata chunks or trailing bytes. Original samples are never changed.
 */
export function assertNativeAudioBytes(bytes: Buffer, mediaType: unknown): asserts mediaType is NativeAudioMediaType {
  if (!Buffer.isBuffer(bytes) || bytes.length < 46 || bytes.length > MAX_NATIVE_AUDIO_BYTES || mediaType !== "audio/wav") {
    fail("Native audio requires original bounded audio/wav bytes (at most 4 MiB); other media, URLs and file IDs are unsupported.");
  }
  if (bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.readUInt32LE(4) + 8 !== bytes.length
      || bytes.toString("latin1", 8, 12) !== "WAVE" || bytes.toString("latin1", 12, 16) !== "fmt "
      || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1
      || bytes.toString("latin1", 36, 40) !== "data" || bytes.readUInt32LE(40) !== bytes.length - 44) {
    fail("Audio MIME and original WAV header/length disagree, or the WAV layout is unsupported.");
  }
  const channels = bytes.readUInt16LE(22), rate = bytes.readUInt32LE(24), align = bytes.readUInt16LE(32);
  if (![1, 2].includes(channels) || rate < 8000 || rate > 192000 || bytes.readUInt16LE(34) !== 16
      || align !== channels * 2 || bytes.readUInt32LE(28) !== rate * align || (bytes.length - 44) % align !== 0) {
    fail("Native WAV input requires consistent mono/stereo PCM16 sample framing and an 8–192 kHz rate.");
  }
}

export function snapshotNativeAudio(audio: NativeAudioInput): QueuedNativeAudio {
  exact(audio, ["filename", "mediaType", "bytes"]);
  filename(audio.filename);
  assertNativeAudioBytes(audio.bytes, audio.mediaType);
  // Copy before deriving any commitment, so the original Buffer is never authority.
  const bytes = Buffer.from(audio.bytes);
  assertNativeAudioBytes(bytes, audio.mediaType);
  return Object.freeze({ filename: audio.filename, mediaType: audio.mediaType,
    data: bytes.toString("base64"), byteLength: bytes.length, sha256: sha256Hex(bytes) });
}

function materializeNativeAudio(audio: QueuedNativeAudio): NativeAudioInput {
  exact(audio, ["filename", "mediaType", "data", "byteLength", "sha256"]);
  filename(audio.filename);
  if (typeof audio.data !== "string" || !audio.data || audio.data.length > 4 * Math.ceil(MAX_NATIVE_AUDIO_BYTES / 3)
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio.data)) {
    fail("Native audio requires bounded canonical base64, never a remote reference.");
  }
  const bytes = Buffer.from(audio.data, "base64");
  if (bytes.toString("base64") !== audio.data || audio.byteLength !== bytes.length || audio.sha256 !== sha256Hex(bytes)) {
    fail("Queued audio bytes contradict their original length/digest commitment.");
  }
  assertNativeAudioBytes(bytes, audio.mediaType);
  return { filename: audio.filename, mediaType: audio.mediaType, bytes };
}

function layout(parts: unknown): asserts parts is readonly Record<string, unknown>[] {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_NATIVE_AUDIO_PARTS) fail("Audio input requires one through 256 ordered parts.");
  if (Object.getPrototypeOf(parts) !== Array.prototype) fail("Audio input requires an ordinary data array, not overridden array behavior.");
  if (Reflect.ownKeys(parts).length !== parts.length + 1) fail("Audio part arrays cannot carry hidden, extra or sparse fields.");
  for (let index = 0; index < parts.length; index++) {
    const item = Object.getOwnPropertyDescriptor(parts, String(index));
    if (!item || !("value" in item)) fail("Audio input cannot contain sparse or accessor-backed parts.");
    const part = item.value as Record<string, unknown> | null;
    if (!part || typeof part !== "object") fail("Invalid audio input part.");
    // Read no accessor before validating the part's own data descriptors.
    const type = Object.getOwnPropertyDescriptor(part, "type");
    if (!type || !("value" in type) || !["text", "image", "audio"].includes(type.value)) fail("Unsupported audio input part; no conversion or discard is available.");
    exact(part, ["type", type.value]);
  }
}

export function snapshotNativeAudioParts(parts: readonly NativeAudioPart[]): readonly QueuedNativeAudioPart[] {
  layout(parts);
  const images = snapshotNativeImages(parts.flatMap(part => {
    if (part.type !== "image") return [];
    exact(part.image, ["filename", "mediaType", "bytes"]);
    if (!["image/png", "image/jpeg", "image/webp"].includes(part.image.mediaType)) fail("Audio input supports original PNG/JPEG/WebP images only; no MIME conversion is available.");
    return [part.image];
  }));
  let imageIndex = 0, audioCount = 0, mediaBytes = images.reduce((sum, image) => sum + Buffer.from(image.data, "base64").length, 0), textBytes = 0;
  const result: readonly QueuedNativeAudioPart[] = Object.freeze(parts.map(part => {
    if (part.type === "text") {
      if (typeof part.text !== "string" || Buffer.from(part.text, "utf8").toString("utf8") !== part.text) fail("Audio sequence text must be lossless UTF-8.");
      textBytes += Buffer.byteLength(part.text, "utf8");
      if (textBytes > 2 * MAX_NATIVE_AUDIO_INPUT_BYTES) fail("Audio sequence text exceeds its byte bound.");
      return Object.freeze({ type: "text" as const, text: part.text });
    }
    if (part.type === "image") return Object.freeze({ type: "image" as const, image: images[imageIndex++]! });
    const audio = snapshotNativeAudio(part.audio);
    if (++audioCount > MAX_NATIVE_AUDIOS) fail("Submit at most eight original native audio files.");
    mediaBytes += audio.byteLength;
    if (mediaBytes > MAX_NATIVE_AUDIO_INPUT_BYTES) fail("Combined original audio/image input exceeds the 8 MiB bound.");
    return Object.freeze({ type: "audio" as const, audio });
  }));
  if (audioCount === 0) fail("amc-audio-input@1 requires audio; legacy text/image APIs remain separate.");
  if (Buffer.byteLength(canonicalize({ format: NATIVE_AUDIO_INPUT_FORMAT, parts: result }), "utf8") > 2 * MAX_NATIVE_AUDIO_INPUT_BYTES) fail("Encoded audio input exceeds its local payload bound.");
  return result;
}

export function materializeNativeAudioParts(parts: readonly QueuedNativeAudioPart[]): readonly NativeAudioPart[] {
  layout(parts);
  const images = materializeNativeImages(parts.flatMap(part => {
    if (part.type !== "image") return [];
    exact(part.image, ["filename", "mediaType", "data"]);
    if (!["image/png", "image/jpeg", "image/webp"].includes(part.image.mediaType)) fail("Queued audio input contains an unsupported image MIME.");
    return [part.image];
  }));
  let imageIndex = 0;
  const result: NativeAudioPart[] = parts.map(part => part.type === "text" ? { type: "text", text: part.text }
    : part.type === "image" ? { type: "image", image: images[imageIndex++]! }
      : { type: "audio", audio: materializeNativeAudio(part.audio) });
  if (canonicalize(snapshotNativeAudioParts(result)) !== canonicalize(parts)) fail("Audio sequence is not the exact supported immutable shape.");
  return result;
}
export function encodeNativeAudioInput(parts: readonly QueuedNativeAudioPart[]): string {
  materializeNativeAudioParts(parts);
  return canonicalize({ format: NATIVE_AUDIO_INPUT_FORMAT, parts });
}
export function decodeNativeAudioInput(payload: Buffer): readonly QueuedNativeAudioPart[] {
  if (!Buffer.isBuffer(payload) || payload.length > 2 * MAX_NATIVE_AUDIO_INPUT_BYTES
      || !Buffer.from(payload.toString("utf8"), "utf8").equals(payload)) fail("Audio inbox payload is oversized or not lossless UTF-8.");
  let value: unknown;
  try { value = JSON.parse(payload.toString("utf8")); } catch { return fail("Audio inbox payload is not JSON."); }
  exact(value, ["format", "parts"]);
  if (value.format !== NATIVE_AUDIO_INPUT_FORMAT) fail("Unsupported signed audio input version.");
  const parts = snapshotNativeAudioParts(materializeNativeAudioParts(value.parts as readonly QueuedNativeAudioPart[]));
  if (encodeNativeAudioInput(parts) !== payload.toString("utf8")) fail("Audio inbox payload is not the exact canonical original sequence.");
  return parts;
}

import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { canonicalize } from "../utils/json.js";
import { loadNativeImageFiles } from "./nativeImageFiles.js";
import { materializeNativeAudioParts, snapshotNativeAudioParts, MAX_NATIVE_AUDIO_BYTES,
  NativeAudioInputError, type NativeAudioPart } from "./nativeAudioInput.js";

export const NATIVE_AUDIO_FILE_MANIFEST_FORMAT = "amc-audio-files@1";
function localPath(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 4096 || value.includes("\0")
      || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    throw new NativeAudioInputError("Audio files require explicit local paths, never URLs, data URIs or provider file IDs.");
  }
}
function regularBytes(path: string, limit: number): Buffer {
  localPath(path);
  if (typeof constants.O_NOFOLLOW !== "number") throw new NativeAudioInputError("This platform cannot enforce no-follow audio file admission.");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > limit) throw new NativeAudioInputError("Audio input requires a nonempty bounded regular file.");
    const bytes = Buffer.alloc(before.size + 1); let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    const after = fstatSync(fd);
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new NativeAudioInputError("Audio input file changed while reading; no input was queued.");
    }
    return Buffer.from(bytes.subarray(0, length));
  } finally { closeSync(fd); }
}
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new NativeAudioInputError("Audio manifest has unsupported or missing fields; no content may be discarded.");
  }
}
/** Explicit operator manifest; canonical JSON prevents duplicate-key ambiguity.
 * Paths are relative to this manifest, not to a remote resource or current model.
 * All shape/path fields are admitted before any referenced media is opened.
 * NOFOLLOW applies to the opened file; parent directories are operator-selected.
 */
export function loadNativeAudioManifest(path: string): readonly NativeAudioPart[] {
  localPath(path);
  const manifest = regularBytes(path, 256 * 1024), text = manifest.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(manifest)) throw new NativeAudioInputError("Audio manifest must be lossless UTF-8.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new NativeAudioInputError("Audio manifest must be canonical JSON."); }
  exact(value, ["format", "parts"]);
  if (value.format !== NATIVE_AUDIO_FILE_MANIFEST_FORMAT || !Array.isArray(value.parts) || value.parts.length < 1 || value.parts.length > 256
      || canonicalize(value) !== text.trim()) throw new NativeAudioInputError("Audio manifest requires canonical amc-audio-files@1 JSON with one through 256 ordered parts.");
  const layout: Record<string, unknown>[] = value.parts;
  let audioCount = 0, imageCount = 0;
  for (const part of layout) {
    if (part?.type === "text") { exact(part, ["type", "text"]); if (typeof part.text !== "string") throw new NativeAudioInputError("Audio manifest text must be a string."); }
    else {
      exact(part, ["type", "path", "mimeType"]); localPath(part.path);
      if (part.type === "audio" && part.mimeType === "audio/wav") audioCount++;
      else if (part.type === "image" && ["image/png", "image/jpeg", "image/webp"].includes(String(part.mimeType))) imageCount++;
      else throw new NativeAudioInputError("The audio manifest supports original audio/wav and PNG/JPEG/WebP only; no conversion or upload is available.");
    }
  }
  if (audioCount < 1 || audioCount > 8 || imageCount > 8) throw new NativeAudioInputError("Audio manifest requires one through eight audio files and at most eight images.");
  const root = dirname(resolve(path)); let mediaBytes = 0;
  const parts: NativeAudioPart[] = layout.map(part => {
    if (part.type === "text") return { type: "text", text: part.text as string };
    const file = resolve(root, part.path as string);
    if (part.type === "image") {
      const image = loadNativeImageFiles([file])[0]!;
      if (image.mediaType !== part.mimeType) throw new NativeAudioInputError("Image filename/original MIME contradicts its explicit audio manifest MIME.");
      mediaBytes += image.bytes.length;
      if (mediaBytes > 8 * 1024 * 1024) throw new NativeAudioInputError("Combined audio/image files exceed 8 MiB.");
      return { type: "image", image };
    }
    const bytes = regularBytes(file, MAX_NATIVE_AUDIO_BYTES);
    mediaBytes += bytes.length;
    if (mediaBytes > 8 * 1024 * 1024) throw new NativeAudioInputError("Combined audio/image files exceed 8 MiB.");
    return { type: "audio", audio: { filename: basename(file), mediaType: "audio/wav", bytes } };
  });
  return materializeNativeAudioParts(snapshotNativeAudioParts(parts));
}

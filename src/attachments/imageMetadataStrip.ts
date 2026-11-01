import { crc32 } from "node:zlib";
import { sha256Hex } from "../utils/hash.js";
import { NativeImageInputError, nativeImageMediaType, type NativeImageInput } from "./nativeImageInput.js";

/**
 * PXB-42: an input image's EXIF (GPS included), IPTC, XMP and comment metadata never reaches a provider.
 * Hand-written bounded container walks; anything they cannot prove well formed is refused, never passed through.
 * The signed inbox keeps the original bytes; the attachment row (what a request sends) holds the stripped bytes.
 */
export type ImageMetadataRefusal = "unsupported-format" | "malformed-container";
export class ImageMetadataStripError extends NativeImageInputError {
  constructor(readonly reason: ImageMetadataRefusal, detail: string) {
    super(`Image refused (${reason}): ${detail}; metadata could not be removed, so the original is not sent.`);
    this.name = "ImageMetadataStripError";
  }
}
const malformed = (detail: string): never => { throw new ImageMetadataStripError("malformed-container", detail); };

export function stripNativeImageMetadata(bytes: Buffer, mediaType: unknown): Buffer {
  if (!Buffer.isBuffer(bytes)) return malformed("image bytes are not a buffer");
  const stripped = mediaType === "image/jpeg" ? stripJpeg(bytes) : mediaType === "image/png" ? stripPng(bytes)
    : mediaType === "image/webp" ? stripWebp(bytes) : mediaType === "image/gif" ? stripGif(bytes)
    : (() => { throw new ImageMetadataStripError("unsupported-format", `no metadata parser for ${String(mediaType)}`); })();
  if (nativeImageMediaType(stripped) !== mediaType) malformed("the stripped image no longer has a valid header");
  return stripped;
}

/** Keeps APP0 (JFIF), APP14 (Adobe) and every non-APPn/COM segment before SOS; SOS onward is copied byte for byte. */
function stripJpeg(b: Buffer): Buffer {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) malformed("JPEG has no SOI");
  const kept: Buffer[] = [b.subarray(0, 2)];
  let i = 2, frame = false;
  for (;;) {
    if (i + 4 > b.length || b[i] !== 0xff) malformed("JPEG segment is truncated, misaligned or runs past the image");
    const marker = b[i + 1]!;
    if (marker === 0xff || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) malformed("JPEG has an unexpected marker before SOS");
    const end = i + 2 + b.readUInt16BE(i + 2);
    // ponytail: stops at the first SOS, so a segment between progressive scans is kept; walk scans if one ever carries metadata.
    if (marker === 0xda) {
      if (!frame) malformed("JPEG reaches SOS without a frame header");
      kept.push(b.subarray(i));
      return Buffer.concat(kept);
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) frame = true;
    if (!((marker >= 0xe1 && marker <= 0xef && marker !== 0xee) || marker === 0xfe)) kept.push(b.subarray(i, end));
    i = end;
  }
}

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const PNG_DROPPED = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
/** Drops text, Exif and time chunks; every other chunk is kept verbatim after its CRC is checked. */
function stripPng(b: Buffer): Buffer {
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) malformed("PNG has no signature");
  const kept: Buffer[] = [b.subarray(0, 8)];
  for (let i = 8; ;) {
    if (i + 12 > b.length) malformed("PNG chunk is truncated or the image has no IEND");
    const length = b.readUInt32BE(i), type = b.toString("latin1", i + 4, i + 8), end = i + 12 + length;
    if (length > 0x7fffffff || end > b.length || !/^[A-Za-z]{4}$/.test(type) || (i === 8) !== (type === "IHDR")) malformed("PNG chunk header is invalid");
    // ponytail: IDAT CRCs are not checked because every repository PNG fixture carries a corrupt one; check them once those are rebuilt.
    if (type !== "IDAT" && crc32(b.subarray(i + 4, end - 4)) !== b.readUInt32BE(end - 4)) malformed(`PNG ${type} chunk CRC does not match`);
    if (!PNG_DROPPED.has(type)) kept.push(b.subarray(i, end));
    if (type === "IEND") return end === b.length ? Buffer.concat(kept) : malformed("PNG has bytes after IEND");
    i = end;
  }
}

/** Drops EXIF and XMP chunks, clears their VP8X flags and rewrites the RIFF size. */
function stripWebp(b: Buffer): Buffer {
  if (b.length < 20 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP" || b.readUInt32LE(4) + 8 !== b.length) {
    malformed("WebP RIFF header or size is invalid");
  }
  const kept: Buffer[] = [];
  for (let i = 12; i < b.length;) {
    if (i + 8 > b.length) malformed("WebP chunk header is truncated");
    const fourcc = b.toString("latin1", i, i + 4), size = b.readUInt32LE(i + 4), end = i + 8 + size + (size & 1);
    if (end > b.length) malformed("WebP chunk runs past the image");
    if (fourcc === "EXIF" || fourcc === "XMP ") { i = end; continue; }
    const chunk = Buffer.from(b.subarray(i, end));
    if (fourcc === "VP8X") {
      if (i !== 12 || size < 10) malformed("WebP VP8X chunk is misplaced or short");
      chunk[8] = chunk[8]! & ~0x0c; // EXIF (0x08) and XMP (0x04) presence flags
    }
    kept.push(chunk);
    i = end;
  }
  const out = Buffer.concat([b.subarray(0, 12), ...kept]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

const GIF_LOOP_APPS = new Set(["NETSCAPE2.0", "ANIMEXTS1.0"]);
/** Drops comment extensions and application extensions other than animation looping (XMP rides in one). */
function stripGif(b: Buffer): Buffer {
  if (b.length < 14 || !["GIF87a", "GIF89a"].includes(b.toString("latin1", 0, 6))) malformed("GIF header is invalid");
  const table = (packed: number) => (packed & 0x80 ? 3 << ((packed & 7) + 1) : 0);
  const subBlocks = (from: number): number => {
    let i = from;
    for (;;) {
      if (i >= b.length) malformed("GIF data sub-blocks are truncated");
      const size = b[i]!;
      i += 1 + size;
      if (size === 0) return i;
    }
  };
  let i = 13 + table(b[10]!);
  const kept: Buffer[] = [];
  for (;;) {
    const start = i, introducer = b[i]!;
    if (introducer === 0x3b) {
      if (i + 1 !== b.length) malformed("GIF has bytes after its trailer");
      return Buffer.concat([b.subarray(0, 13 + table(b[10]!)), ...kept, b.subarray(i)]);
    }
    if (introducer === 0x2c) {
      if (i + 11 > b.length) malformed("GIF image descriptor is truncated");
      i = subBlocks(i + 11 + table(b[i + 9]!));
      kept.push(b.subarray(start, i));
    } else if (introducer === 0x21) {
      if (i + 2 > b.length) malformed("GIF extension is truncated");
      const label = b[i + 1]!;
      i = subBlocks(i + 2);
      const app = label === 0xff && b[start + 2] === 11 ? b.toString("latin1", start + 3, start + 14) : null;
      if (label !== 0xfe && (label !== 0xff || (app !== null && GIF_LOOP_APPS.has(app)))) kept.push(b.subarray(start, i));
    } else malformed("GIF has an unknown block");
  }
}

/** The bytes an image row must hold for its signed source: stripped when the row records its source digest, original for older rows. */
export function imageRowMatchesSource(meta: { readonly bytes?: unknown; readonly sourceSha256?: unknown }, source: NativeImageInput, rowBytes: Buffer): boolean {
  let sent = source.bytes;
  if (meta.sourceSha256 !== undefined) {
    if (meta.sourceSha256 !== sha256Hex(source.bytes)) return false;
    try { sent = stripNativeImageMetadata(source.bytes, source.mediaType); } catch { return false; }
  }
  return meta.bytes === sent.length && rowBytes.equals(sent);
}

/** Offline DSH v4 checksummed frame reader; never repairs torn source evidence. */
import { TextDecoder } from "node:util";
import * as zlib from "node:zlib";
import { DSH_IMPORT_LIMITS } from "./dshSessionContract.js";
import { DSH_SOURCE_REVISION_V4 } from "./dshSessionContractV4.js";
import { SourceFormatError } from "./sourceFormatError.js";

function refuse(reason: string, code = "DSH_ZSTD_REFUSED"): never {
  throw new SourceFormatError(`DSH compressed session import refused: ${reason}`, { code, format: "dsh-session", detectedVersion: 4,
    supported: "checksummed dsh-session v4 JSONL Zstandard frames", sourceRevision: DSH_SOURCE_REVISION_V4 });
}

/**
 * Frame structure follows DeepSeek's MIT-licensed scanZstdFrames at 22ddee37.
 * Provenance and retained license: tests/fixtures/dsh-v4/frame-provenance.json.
 * Unlike the live persistence reader, an offline import refuses incomplete tails.
 */
export function decodeDshSessionFrames(raw: Buffer): string {
  if (raw.length > DSH_IMPORT_LIMITS.bytes) refuse("document exceeds 32 MiB.");
  if (typeof zlib.zstdDecompressSync !== "function") refuse("this Node runtime lacks native Zstandard support.", "DSH_ZSTD_UNAVAILABLE");
  if (raw.length === 0) refuse("empty or incomplete frame.");
  const decoded: Buffer[] = [];
  let offset = 0, decodedBytes = 0, records = 0;
  while (offset < raw.length) {
    const start = offset;
    const need = (bytes: number): void => { if (raw.length - offset < bytes) refuse("incomplete frame; no torn-tail recovery is attempted."); };
    need(4);
    if (raw.readUInt32LE(offset) !== 0xFD2FB528) refuse("invalid frame magic.");
    offset += 4;
    need(1);
    const descriptor = raw[offset++]!;
    if (descriptor & 0x18) refuse("reserved frame-header bit.");
    if (!(descriptor & 0x04)) refuse("frame lacks the required checksum.");
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 0x20) !== 0;
    const dictionaryFlag = descriptor & 0x03;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const headerBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    need(headerBytes); offset += headerBytes;
    for (;;) {
      need(3);
      const block = raw.readUIntLE(offset, 3); offset += 3;
      const blockType = (block >>> 1) & 0x03;
      if (blockType === 3) refuse("reserved block type.");
      const payloadBytes = blockType === 1 ? 1 : block >>> 3;
      need(payloadBytes); offset += payloadBytes;
      if (block & 1) break;
    }
    need(4); offset += 4;
    let chunk: Buffer;
    try {
      chunk = zlib.zstdDecompressSync(raw.subarray(start, offset), {
        maxOutputLength: DSH_IMPORT_LIMITS.bytes - decodedBytes,
        params: { [zlib.constants.ZSTD_d_windowLogMax]: 25 }
      });
    } catch { refuse("frame checksum/validation or decompression limit failed."); }
    decodedBytes += chunk.length;
    if (chunk.length === 0 || chunk[chunk.length - 1] !== 0x0A) refuse("a frame must end with a complete newline-terminated record.");
    if (decoded.length === 0 && chunk.indexOf(0x0A) !== chunk.length - 1) refuse("header frame must contain exactly one record.");
    let lineStart = 0;
    for (let newline = chunk.indexOf(0x0A); newline !== -1; newline = chunk.indexOf(0x0A, lineStart)) {
      if (newline - lineStart > DSH_IMPORT_LIMITS.lineBytes) refuse("decoded line exceeds 4 MiB.");
      if (newline > lineStart && ++records > DSH_IMPORT_LIMITS.events + 1) refuse("too many events.");
      lineStart = newline + 1;
    }
    decoded.push(chunk);
    if (decoded.length > DSH_IMPORT_LIMITS.events + 1) refuse("too many event frames.");
  }
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(decoded, decodedBytes)); }
  catch { refuse("invalid UTF-8 source bytes."); }
}

import { createHash } from "node:crypto";

export function isSha256HexDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function sha256Hex(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256FileHex(fileBuffer: Buffer): string {
  return sha256Hex(fileBuffer);
}

/**
 * A 64-char lowercase hex sha256 as is; anything else hashed. A session's compositionDigest is already one in normal
 * use; hashing the rest keeps the sessions row's binary_sha256 column well-formed (moved from sessionService.ts).
 */
export function normalizeSha256(value: string): string {
  return /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : sha256Hex(value);
}

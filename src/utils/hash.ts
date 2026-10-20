import { createHash } from "node:crypto";

export function isSha256HexDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256FileHex(fileBuffer: Buffer): string {
  return sha256Hex(fileBuffer);
}

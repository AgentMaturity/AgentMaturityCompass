import { crc32 } from "node:zlib";

/**
 * A well-formed PNG of exactly `size` bytes: `base` (ending in IEND) with one extra IDAT chunk before IEND.
 * Metadata stripping (PXB-42) refuses bytes after IEND and drops unknown ancillary chunks, so oversize fixtures pad in IDAT, which it keeps.
 */
export function paddedPng(base: Buffer, size: number, fill: (index: number) => number = () => 0): Buffer {
  const length = size - base.length - 12;
  if (length < 0) throw new Error(`paddedPng: ${size} bytes is smaller than the base image plus one chunk`);
  const body = Buffer.alloc(4 + length);
  body.write("IDAT", 0, "latin1");
  for (let i = 0; i < length; i++) body[4 + i] = fill(i) & 0xff;
  const head = Buffer.alloc(4), crc = Buffer.alloc(4);
  head.writeUInt32BE(length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([base.subarray(0, base.length - 12), head, body, crc, base.subarray(base.length - 12)]);
}

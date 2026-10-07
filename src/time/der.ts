/**
 * The DER subset RFC 3161 needs (P1-25), on Node's Buffer alone: no ASN.1 dependency was approved, so this reads and
 * writes only definite-length, minimally encoded, single-byte-tag TLVs and refuses everything else. Every read is
 * bounds-checked against its parent, so a truncated or oversized length throws instead of reading past the input.
 */
export interface Der {
  /** The identifier octet, e.g. 0x30 SEQUENCE, 0xa0 [0] constructed. */
  tag: number;
  /** The whole TLV, as encoded. */
  bytes: Buffer;
  /** The contents octets. */
  value: Buffer;
}

export class DerError extends Error {}

function readOne(buf: Buffer, offset: number): Der {
  if (offset + 2 > buf.length) throw new DerError("truncated DER header");
  const tag = buf[offset]!;
  if ((tag & 0x1f) === 0x1f) throw new DerError("multi-byte DER tags are not supported");
  let length = buf[offset + 1]!;
  let header = 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0) throw new DerError("indefinite length is not DER");
    if (count > 4 || offset + 2 + count > buf.length) throw new DerError("DER length too long or truncated");
    length = buf.readUIntBE(offset + 2, count);
    if (buf[offset + 2] === 0 || length < 0x80) throw new DerError("non-minimal DER length");
    header += count;
  }
  const end = offset + header + length;
  if (end > buf.length) throw new DerError("truncated DER value");
  return { tag, bytes: buf.subarray(offset, end), value: buf.subarray(offset + header, end) };
}

/** Exactly one TLV filling `buf`; trailing bytes are refused. */
export function parseDer(buf: Buffer): Der {
  const node = readOne(buf, 0);
  if (node.bytes.length !== buf.length) throw new DerError("trailing bytes after DER value");
  return node;
}

/** The elements of a constructed value (SEQUENCE, SET, [n] constructed). */
export function children(node: Der): Der[] {
  if (!(node.tag & 0x20)) throw new DerError(`tag 0x${node.tag.toString(16)} is not constructed`);
  const out: Der[] = [];
  for (let offset = 0; offset < node.value.length; offset += out[out.length - 1]!.bytes.length) out.push(readOne(node.value, offset));
  return out;
}

export function expectTag(node: Der | undefined, tag: number, what: string): Der {
  if (!node || node.tag !== tag) throw new DerError(`${what}: expected tag 0x${tag.toString(16)}`);
  return node;
}

export function oid(node: Der | undefined, what = "OID"): string {
  const { value } = expectTag(node, 0x06, what);
  if (value.length === 0 || value[value.length - 1]! & 0x80) throw new DerError(`${what}: malformed OID`);
  const arcs: number[] = [];
  let current = 0;
  for (const byte of value) {
    if (current === 0 && byte === 0x80) throw new DerError(`${what}: non-minimal OID arc`);
    current = current * 128 + (byte & 0x7f);
    if (current > Number.MAX_SAFE_INTEGER) throw new DerError(`${what}: OID arc too large`);
    if (!(byte & 0x80)) { arcs.push(current); current = 0; }
  }
  const first = arcs.shift()!;
  const top = first < 80 ? Math.floor(first / 40) : 2;
  return [top, first - top * 40, ...arcs].join(".");
}

/** A non-negative INTEGER as lowercase hex without leading zeros ("0" for zero). Negative values are refused. */
export function uintHex(node: Der | undefined, what = "INTEGER"): string {
  const { value } = expectTag(node, 0x02, what);
  if (value.length === 0 || value[0]! & 0x80) throw new DerError(`${what}: empty or negative INTEGER`);
  if (value.length > 1 && value[0] === 0 && !(value[1]! & 0x80)) throw new DerError(`${what}: non-minimal INTEGER`);
  return BigInt(`0x${value.toString("hex")}`).toString(16);
}

/** UTCTime (0x17) or GeneralizedTime (0x18) with seconds and Z, fractional seconds kept to the millisecond. */
export function derTime(node: Der | undefined, what = "time"): Date {
  if (!node || (node.tag !== 0x17 && node.tag !== 0x18)) throw new DerError(`${what}: expected UTCTime or GeneralizedTime`);
  const text = node.value.toString("latin1");
  const match = node.tag === 0x17
    ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text)
    : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d*[1-9]))?Z$/.exec(text);
  if (!match) throw new DerError(`${what}: malformed time "${text}"`);
  const [, y, mo, d, h, mi, s, fraction] = match;
  const year = node.tag === 0x17 ? (Number(y) >= 50 ? 1900 : 2000) + Number(y) : Number(y);
  const date = new Date(Date.UTC(year, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s),
    Number((fraction ?? "").padEnd(3, "0").slice(0, 3))));
  // Date.UTC rolls 30 February or 24:00 over silently; a value that does not round-trip is not a valid time.
  if (date.getUTCFullYear() !== year || date.toISOString().slice(5, 19) !== `${mo}-${d}T${h}:${mi}:${s}`) {
    throw new DerError(`${what}: invalid date "${text}"`);
  }
  return date;
}

export function encode(tag: number, ...contents: Buffer[]): Buffer {
  const value = Buffer.concat(contents);
  const length: number[] = [];
  for (let n = value.length; n > 0; n = Math.floor(n / 256)) length.unshift(n & 0xff);
  const header = value.length < 0x80 ? [value.length] : [0x80 | length.length, ...length];
  return Buffer.concat([Buffer.from([tag, ...header]), value]);
}

export function encodeOid(dotted: string): Buffer {
  const [a = 0, b = 0, ...rest] = dotted.split(".").map(Number);
  const arcs = [a * 40 + b, ...rest].map(arc => {
    const bytes = [arc & 0x7f];
    for (let v = Math.floor(arc / 128); v > 0; v = Math.floor(v / 128)) bytes.unshift((v & 0x7f) | 0x80);
    return Buffer.from(bytes);
  });
  return encode(0x06, ...arcs);
}

/** A non-negative INTEGER from big-endian magnitude bytes. */
export function encodeUint(magnitude: Buffer): Buffer {
  let start = 0;
  while (start < magnitude.length - 1 && magnitude[start] === 0) start += 1;
  const trimmed = magnitude.subarray(start);
  return encode(0x02, trimmed[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed);
}

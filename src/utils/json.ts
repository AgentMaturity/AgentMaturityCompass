export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sortedKeys = Object.keys(input).sort();
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of sortedKeys) {
      out[key] = sortDeep(input[key]);
    }
    return out;
  }
  return value;
}

/**
 * Parses bytes that must be exactly `canonicalize` of their own content: valid UTF-8, sorted keys, no whitespace, and no
 * duplicate key, re-spelled number or escaped string (each re-encodes differently). Two different byte strings can then
 * never parse to the same value, so a signature or digest over the content names exactly one encoding.
 */
export function parseCanonicalJson(bytes: Buffer): unknown {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("not valid UTF-8");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("not valid JSON");
  }
  if (canonicalize(value) !== text) throw new Error("bytes are not the canonical encoding of their content");
  return value;
}

/** An Ed25519 signature in its one canonical base64 spelling: 64 bytes, padded, zero trailing bits. */
export function isCanonicalSignatureBase64(text: string): boolean {
  return /^[A-Za-z0-9+/]{86}==$/.test(text) && Buffer.from(text, "base64").toString("base64") === text;
}

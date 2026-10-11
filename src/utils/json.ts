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

/**
 * Refuses text whose objects repeat a key (compared after unescaping). Call it on text JSON.parse already accepted:
 * JSON.parse silently keeps the last of two equal keys, and another parser of the same signed file may keep the first.
 */
export function assertNoDuplicateJsonKeys(text: string): void {
  const open: Array<Set<string> | null> = [];
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === "{") open.push(new Set());
    else if (char === "[") open.push(null);
    else if (char === "}" || char === "]") open.pop();
    else if (char === '"') {
      let end = at + 1;
      while (text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      let next = end + 1;
      while (text[next] === " " || text[next] === "\t" || text[next] === "\n" || text[next] === "\r") next += 1;
      const keys = open[open.length - 1];
      if (text[next] === ":" && keys) {
        const key = JSON.parse(text.slice(at, end + 1)) as string;
        if (keys.has(key)) throw new Error(`duplicate key ${JSON.stringify(key)}`);
        keys.add(key);
      }
      at = end;
    }
  }
}

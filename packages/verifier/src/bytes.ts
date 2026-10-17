/** Canonical bytes, strict JSON, digests, constant-time compares and Ed25519 keys. Node built-ins only. */
import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Constant-time equality of two strings (digests, key ids). Unequal lengths compare unequal. */
export function same(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * AMC's canonical form (spec/ACCEPTANCE_RULES.md "Canonical form"): JSON.stringify over a copy whose object keys were
 * re-inserted in Array.prototype.sort() order, recursively. JavaScript then emits integer-like keys first; this is not
 * RFC 8785.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) out[key] = sortDeep((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/** The external-evidence profile's canonical form: keys sorted by UTF-16 code units, integer-like keys included. */
export function profileCanonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("canonicalization requires JSON values");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(profileCanonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${profileCanonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

/**
 * Strict JSON: valid UTF-8, no `__proto__` key and no repeated key in any object (JSON.parse keeps the last of two
 * equal keys, another parser may keep the first). Throws with the reason.
 */
export function parseJson(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("not valid UTF-8");
  }
  let value: unknown;
  try {
    value = JSON.parse(text, (key, item: unknown) => {
      if (key === "__proto__") throw new Error("a __proto__ key is refused");
      return item;
    }) as unknown;
  } catch (error) {
    throw new Error(`not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  assertNoDuplicateKeys(text);
  return value;
}

function assertNoDuplicateKeys(text: string): void {
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
        if (keys.has(key)) throw new Error(`repeated key ${JSON.stringify(key)}`);
        keys.add(key);
      }
      at = end;
    }
  }
}

/** True when `bytes` are exactly canonicalize(value): the one encoding P1-08 records accept. */
export function isCanonicalEncoding(bytes: Uint8Array, value: unknown): boolean {
  return Buffer.from(canonicalize(value), "utf8").equals(Buffer.from(bytes));
}

/** An Ed25519 signature in its one canonical base64 spelling: 64 bytes, padded, zero trailing bits. */
export function isCanonicalSignatureBase64(text: string): boolean {
  return /^[A-Za-z0-9+/]{86}==$/.test(text) && Buffer.from(text, "base64").toString("base64") === text;
}

/** Decodes unpadded base64url, or null when the text is not its canonical spelling. */
export function base64UrlDecode(text: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const bytes = Buffer.from(text, "base64url");
  return bytes.toString("base64url") === text ? bytes : null;
}

/** The canonical SPKI PEM (Node's export, LF) of an Ed25519 public key; null for anything else. */
export function canonicalEd25519Pem(publicKeyPem: string): string | null {
  if (!publicKeyPem.trimStart().startsWith("-----BEGIN PUBLIC KEY-----")) return null;
  try {
    const key = createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === "ed25519" ? key.export({ format: "pem", type: "spki" }).toString() : null;
  } catch {
    return null;
  }
}

/** AMC key id: sha256 of the canonical PEM text. Null when the PEM is not an Ed25519 public key. */
export function ed25519KeyId(publicKeyPem: string): string | null {
  const canonical = canonicalEd25519Pem(publicKeyPem);
  return canonical === null ? null : sha256Hex(Buffer.from(canonical, "utf8"));
}

/** Ed25519 verification that never throws. */
export function verifyEd25519(message: Uint8Array, publicKeyPem: string, signature: Uint8Array): boolean {
  try {
    return verify(null, message, publicKeyPem, signature);
  } catch {
    return false;
  }
}

/** Domain-separated bytes: an ASCII tag, one 0x00 byte, then UTF-8 text. */
export function tagged(tag: string, text: string): Buffer {
  return Buffer.concat([Buffer.from(tag, "ascii"), Buffer.from([0]), Buffer.from(text, "utf8")]);
}

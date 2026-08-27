import { sha256Hex } from "../utils/hash.js";

/**
 * Turning one record's bytes into a value it is safe to act on (plan P7.1a).
 *
 * THE PROPERTY THIS FILE EXISTS FOR: the bytes AMC digests and the value AMC
 * acts on must not be able to disagree. `JSON.parse` breaks that on its own.
 * Given
 *
 *     {"agentId":"auditor","agentId":"attacker"}
 *
 * the bytes contain both names and the parsed value contains only the last. A
 * digest over those bytes is a signed statement about a record whose meaning
 * nothing can recover, and anything that inspected the record before AMC did --
 * a proxy, a log, a reviewer -- may have read the first. That is request
 * smuggling, and in a product whose output is signed evidence it is worse than
 * an ordinary parsing bug: the forgery ends up inside something attested.
 *
 * So duplicate keys are REFUSED rather than resolved. There is no correct
 * winner to pick; the record is ambiguous and an ambiguous record is not a
 * request. Only then is the digest taken, over the exact bytes, so a caller
 * holding the digest and the value knows they describe each other.
 *
 * ON `__proto__`. Refused, but with a smaller claim than is usually made for it:
 * `JSON.parse` places it as an OWN property and does NOT reach the global
 * prototype (verified: `({}).polluted` stays false). The hazard is deferred --
 * it appears when such an object is later spread or merged into another, which
 * is ordinary handling code far from here. Refusing at the door is cheap; the
 * accurate reason is "this key has no legitimate use in a request", not "this
 * would otherwise pollute a prototype".
 *
 * WHAT IS DELIBERATELY NOT CHECKED HERE: anything about JSON-RPC. This file
 * knows about bytes, encodings and keys. A record can pass every rule here and
 * still be a meaningless request.
 */

export type WireJsonCode =
  | "not-utf8"
  | "not-json"
  | "not-an-object"
  | "duplicate-key"
  | "unsafe-key";

export type ParsedWireObject =
  | {
      readonly ok: true;
      readonly value: Record<string, unknown>;
      /** Digest of the exact bytes that produced `value`. */
      readonly sha256: string;
    }
  | {
      readonly ok: false;
      readonly code: WireJsonCode;
      /** Cites the ordinal and the fault. Never the record's content. */
      readonly reason: string;
      readonly ordinal: number;
    };

/** Keys with no legitimate use in a request, refused rather than sanitised. */
const UNSAFE_KEYS = new Set(["__proto__"]);

export function parseWireObject(bytes: Buffer, ordinal: number): ParsedWireObject {
  // Decode, then prove the decoding was lossless. `toString("utf8")` substitutes
  // U+FFFD for invalid bytes without complaint, so a record can arrive as one
  // sequence of bytes and be acted on as a different string -- and the digest
  // below would then commit to bytes nothing ever read.
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    return { ok: false, code: "not-utf8", reason: `record ${ordinal} is not valid UTF-8`, ordinal };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // The thrown message is discarded on purpose: V8 embeds a slice of the
    // offending input in it, so forwarding or logging it re-emits peer-chosen
    // bytes into somewhere they were never meant to reach.
    return { ok: false, code: "not-json", reason: `record ${ordinal} is not valid JSON`, ordinal };
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "not-an-object", reason: `record ${ordinal} is not a JSON object`, ordinal };
  }

  // Scanned over the ORIGINAL TEXT, because the parsed value cannot show this:
  // by the time it exists the duplicate has already been discarded.
  const duplicate = findDuplicateKey(text);
  if (duplicate !== null) {
    return {
      ok: false,
      code: "duplicate-key",
      // The key name is named because a duplicate key is a fault in the
      // request's structure, and an operator cannot act on "somewhere".
      reason: `record ${ordinal} sets the same key twice: ${JSON.stringify(duplicate)}`,
      ordinal
    };
  }

  const unsafe = findUnsafeKey(value);
  if (unsafe !== null) {
    return { ok: false, code: "unsafe-key", reason: `record ${ordinal} uses reserved key ${unsafe}`, ordinal };
  }

  return { ok: true, value: value as Record<string, unknown>, sha256: sha256Hex(bytes) };
}

/**
 * The first key set twice within any one object, or null.
 *
 * Runs only over text `JSON.parse` has already accepted, so it may assume
 * well-formedness and needs no error handling of its own. Keys are compared
 * DECODED: `{"a":1,"a":2}` is the same key written two ways, and comparing
 * raw spans would miss it.
 */
function findDuplicateKey(text: string): string | null {
  const stack: Array<Set<string> | null> = [];
  let pendingKey: string | null = null;
  let at = 0;

  while (at < text.length) {
    const ch = text[at];

    if (ch === '"') {
      const end = endOfString(text, at);
      pendingKey = JSON.parse(text.slice(at, end)) as string;
      at = end;
      continue;
    }
    if (ch === "{") { stack.push(new Set()); pendingKey = null; at += 1; continue; }
    if (ch === "[") { stack.push(null); pendingKey = null; at += 1; continue; }
    if (ch === "}" || ch === "]") { stack.pop(); pendingKey = null; at += 1; continue; }
    if (ch === ":") {
      const scope = stack[stack.length - 1];
      if (scope instanceof Set && pendingKey !== null) {
        if (scope.has(pendingKey)) return pendingKey;
        scope.add(pendingKey);
      }
      pendingKey = null;
      at += 1;
      continue;
    }
    if (ch === ",") { pendingKey = null; at += 1; continue; }
    at += 1;
  }
  return null;
}

/** Index just past the closing quote of the string starting at `start`. */
function endOfString(text: string, start: number): number {
  let at = start + 1;
  while (at < text.length) {
    const ch = text[at];
    if (ch === "\\") { at += 2; continue; }
    if (ch === '"') return at + 1;
    at += 1;
  }
  return text.length;
}

/** The first reserved key anywhere in the value, or null. */
function findUnsafeKey(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUnsafeKey(item);
      if (found !== null) return found;
    }
    return null;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (UNSAFE_KEYS.has(key)) return key;
    const found = findUnsafeKey((value as Record<string, unknown>)[key]);
    if (found !== null) return found;
  }
  return null;
}

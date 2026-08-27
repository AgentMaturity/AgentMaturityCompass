import { sha256Hex } from "../utils/hash.js";

/**
 * Turning one record's bytes into a value it is safe to act on (plan P7.1a).
 *
 * THE PROPERTY THIS FILE EXISTS FOR: the bytes AMC digests and the value AMC
 * acts on must not be able to disagree ABOUT STRUCTURE -- no key silently
 * dropped, overwritten, or added. `JSON.parse` breaks that on its own. Given
 *
 *     {"agentId":"auditor","agentId":"attacker"}
 *
 * the bytes hold both names and the parsed value holds only the last. A digest
 * over those bytes is a signed statement about a record whose meaning nothing
 * can recover, and anything that read it first -- a proxy, a log, a reviewer --
 * may have seen the other name. That is request smuggling landing inside
 * attested output, so an ambiguous record is REFUSED rather than resolved.
 *
 * EVERY STRUCTURAL RULE IS DECIDED BEFORE `JSON.parse` RUNS, from the raw text.
 * That ordering is load-bearing, not tidiness. Parsing a duplicate-key object
 * corrupts a V8 key cache for the life of the process, after which later parses
 * of a matching shape SILENTLY DROP A KEY -- so merely handing a record to
 * `JSON.parse` in order to reject it poisons the records that follow. Verified
 * with no AMC code involved: a four-key object parsed before and after one
 * duplicate-key record loses a key from its parse, and the subtree under that
 * key vanishes from the value while remaining in the bytes a digest commits to.
 *
 * A refused record must not be able to change what a later record means. The
 * scan therefore runs first, and `JSON.parse` is reached only by records already
 * known to be well-shaped.
 *
 * WHAT THIS DOES NOT PROMISE. Not that bytes and value agree about NUMBERS in
 * general: `1.0` and `1` are one value, and IEEE-754 rounding is a property of
 * JSON everywhere. The two cases where the text states a quantity the value
 * cannot hold -- a non-finite result, and an integer past the safe range -- are
 * refused, because those are the ones where a reader of the bytes and a reader
 * of the value disagree about the amount rather than about its spelling.
 *
 * ON `__proto__` AND `constructor`. Refused, with a smaller claim than is usual:
 * `JSON.parse` places them as OWN properties and does NOT reach the global
 * prototype, and spreading such an object is provably safe too (both verified).
 * The hazard is deferred and conditional -- it needs a later merge that assigns
 * through the key. The honest reason to refuse is that neither has a legitimate
 * use in a request, so refusing costs nothing and removes a gadget.
 *
 * WHAT IS DELIBERATELY NOT CHECKED HERE: anything about JSON-RPC. A record can
 * pass every rule in this file and still be a meaningless request.
 */

export type WireJsonCode =
  | "not-utf8"
  | "not-json"
  | "not-an-object"
  | "duplicate-key"
  | "unsafe-key"
  | "unsafe-number"
  | "too-deep";

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

/**
 * How deeply a record may nest.
 *
 * Requests on this wire are shallow; 64 is far past anything a real one needs.
 * The limit exists because depth is the one dimension in which a small record
 * can be expensive, and because a counter is cheaper to reason about than the
 * recursion it replaces.
 */
export const MAX_WIRE_DEPTH = 64;

/** Keys with no legitimate use in a request, refused rather than sanitised. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

interface ScanFault {
  readonly code: WireJsonCode;
  readonly detail: string;
}

export function parseWireObject(bytes: Buffer, ordinal: number): ParsedWireObject {
  // Decode, then prove the decoding was lossless. `toString("utf8")` substitutes
  // U+FFFD for invalid bytes without complaint, so a record could arrive as one
  // sequence of bytes and be acted on as a different string -- and the digest
  // below would then commit to bytes nothing ever read.
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    return refuse("not-utf8", "is not valid UTF-8", ordinal);
  }

  const fault = scanWireText(text);
  if (fault) return refuse(fault.code, fault.detail, ordinal);

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // The thrown message is discarded on purpose. For at least one error family
    // V8 embeds a slice of the offending input in it, so forwarding or logging
    // it re-emits peer-chosen bytes somewhere they were never meant to reach.
    // Telling the families apart is not worth the risk of getting it wrong.
    return refuse("not-json", "is not valid JSON", ordinal);
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return refuse("not-an-object", "is not a JSON object", ordinal);
  }

  return { ok: true, value: value as Record<string, unknown>, sha256: sha256Hex(bytes) };
}

function refuse(code: WireJsonCode, detail: string, ordinal: number): ParsedWireObject {
  return { ok: false, code, reason: `record ${ordinal} ${detail}`, ordinal };
}

/**
 * One pass over the raw text, deciding every structural rule.
 *
 * Iterative on purpose. The previous version walked the PARSED value recursively
 * to find reserved keys, so a 20 KB record of nested arrays threw `RangeError`
 * out of a function whose return type promised a result union -- turning a guard
 * against a pollution gadget into a way to crash the reader. Depth is a counter
 * here, and `JSON.parse` itself is iterative in V8 (verified at depth 10000), so
 * this scan was the only stack consumer.
 *
 * Runs on text that has NOT yet been proved to be JSON. It therefore never
 * throws and never assumes well-formedness. A record that is both malformed and
 * ambiguous is reported by whichever rule notices first, which is enough: both
 * answers are a refusal.
 */
function scanWireText(text: string): ScanFault | null {
  const scopes: Array<Set<string> | null> = [];
  let pendingKey: string | null = null;
  let at = 0;

  while (at < text.length) {
    const ch = text[at];

    if (ch === '"') {
      const end = endOfString(text, at);
      const decoded = decodeStringSpan(text.slice(at, end));
      if (decoded === null) return { code: "not-json", detail: "contains an unreadable string" };
      pendingKey = decoded;
      at = end;
      continue;
    }

    if (ch === "{" || ch === "[") {
      scopes.push(ch === "{" ? new Set<string>() : null);
      if (scopes.length > MAX_WIRE_DEPTH) {
        return { code: "too-deep", detail: `nests deeper than ${MAX_WIRE_DEPTH}` };
      }
      pendingKey = null;
      at += 1;
      continue;
    }

    if (ch === "}" || ch === "]") {
      scopes.pop();
      pendingKey = null;
      at += 1;
      continue;
    }

    if (ch === ":") {
      const scope = scopes[scopes.length - 1];
      if (scope instanceof Set && pendingKey !== null) {
        if (UNSAFE_KEYS.has(pendingKey)) {
          return { code: "unsafe-key", detail: `uses reserved key ${JSON.stringify(pendingKey)}` };
        }
        if (scope.has(pendingKey)) {
          // The key is named: a duplicate is a fault in the request's structure,
          // and an operator cannot act on "somewhere".
          return {
            code: "duplicate-key",
            detail: `sets the same key twice: ${JSON.stringify(pendingKey)}`
          };
        }
        scope.add(pendingKey);
      }
      pendingKey = null;
      at += 1;
      continue;
    }

    if (ch === ",") {
      pendingKey = null;
      at += 1;
      continue;
    }

    if (ch === "-" || (ch !== undefined && ch >= "0" && ch <= "9")) {
      const end = endOfNumber(text, at);
      const fault = checkNumber(text.slice(at, end));
      if (fault) return fault;
      at = end;
      continue;
    }

    at += 1;
  }
  return null;
}

/**
 * Refuse a literal whose value cannot hold what the text says.
 *
 * Two cases only. `1e999` parses to Infinity, and `12345678901234567890` parses
 * to `...567000`: in both, a reader of the bytes and a reader of the value
 * disagree about the amount. Ordinary rounding of fractions is NOT refused --
 * that is JSON's arithmetic everywhere, and refusing it would reject `0.1`.
 */
function checkNumber(token: string): ScanFault | null {
  const value = Number(token);
  if (!Number.isFinite(value)) {
    return { code: "unsafe-number", detail: "states a number too large to represent" };
  }
  if (/^-?\d+$/.test(token) && !Number.isSafeInteger(value)) {
    return { code: "unsafe-number", detail: "states an integer beyond exact precision" };
  }
  return null;
}

/** Index just past the closing quote of the string starting at `start`. */
function endOfString(text: string, start: number): number {
  let at = start + 1;
  while (at < text.length) {
    const ch = text[at];
    if (ch === "\\") {
      at += 2;
      continue;
    }
    if (ch === '"') return at + 1;
    at += 1;
  }
  return text.length;
}

/** Index just past the numeric literal starting at `start`. */
function endOfNumber(text: string, start: number): number {
  let at = start;
  while (at < text.length) {
    const ch = text[at]!;
    const numeric = (ch >= "0" && ch <= "9")
      || ch === "-" || ch === "+" || ch === "." || ch === "e" || ch === "E";
    if (!numeric) break;
    at += 1;
  }
  return at;
}

/**
 * The value of a quoted span, or null if it is not a readable JSON string.
 *
 * Keys are compared DECODED, so `{"a":1,"a":2}` is caught as the one key
 * written two ways that it is. `JSON.parse` is used for the decoding because a
 * string literal cannot trigger the object-shape corruption described above --
 * verified: parsing string literals leaves a later object's key set intact.
 */
function decodeStringSpan(span: string): string | null {
  try {
    const value: unknown = JSON.parse(span);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

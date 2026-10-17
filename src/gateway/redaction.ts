import { decodedFinds, isPasswordMember, MAX_PROTECTED_TEXT_CHARS, MAX_REQUEST_SCAN_CHARS, nestedJsonRedactor,
  redactJsonLeaves, redactProtectedText } from "../dataflow/detectors.js";
import { sha256Hex } from "../utils/hash.js";
import type { GatewayConfig } from "./config.js";

export interface RedactionResult {
  redactedBytes: Buffer;
  wasRedacted: boolean;
  redactionReasons: string[];
  originalPayloadSha256: string | null;
  originalHashOmitted: boolean;
}

function buildRegex(pattern: string): RegExp {
  const trimmed = pattern.trim();
  if (trimmed.startsWith("(?i)")) {
    return new RegExp(trimmed.slice(4), "gi");
  }
  return new RegExp(trimmed, "g");
}

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
  denylist: string[]
): { headers: Record<string, string>; wasRedacted: boolean } {
  const deny = new Set(denylist.map((key) => key.toLowerCase()));
  const out = Object.create(null) as Record<string, string>;
  let redacted = false;

  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    const normalized = Array.isArray(value) ? value.join(",") : value ?? "";
    if (deny.has(key)) {
      out[rawKey] = "[REDACTED]";
      redacted = true;
      continue;
    }
    out[rawKey] = normalized;
  }

  return { headers: out, wasRedacted: redacted };
}

function applyJsonPathRedaction(obj: unknown, jsonPaths: string[]): { changed: boolean; value: unknown } {
  if (!obj || typeof obj !== "object") {
    return { changed: false, value: obj };
  }

  let changed = false;
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;

  for (const path of jsonPaths) {
    const parts = path.replace(/^\$\./, "").split(".").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let cursor: unknown = clone;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!cursor || typeof cursor !== "object") {
        cursor = null;
        break;
      }
      const part = parts[i];
      if (!part) {
        cursor = null;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }

    if (cursor && typeof cursor === "object") {
      const key = parts[parts.length - 1];
      if (!key) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(cursor, key)) {
        (cursor as Record<string, unknown>)[key] = "[REDACTED]";
        changed = true;
      }
    }
  }

  return { changed, value: clone };
}

function applyTextRegexRedaction(text: string, patterns: string[]): { changed: boolean; value: string; reasons: string[] } {
  let current = text;
  let changed = false;
  const reasons: string[] = [];

  for (const pattern of patterns) {
    const re = buildRegex(pattern);
    const before = current;
    current = current.replace(re, "[REDACTED]");
    if (current !== before) {
      changed = true;
      reasons.push(`textRegex:${pattern}`);
    }
  }

  return { changed, value: current, reasons };
}

class ScanBudgetExceeded extends Error {}

/**
 * The protected-data detectors (P2-02), as the native session uses them, over stored gateway evidence, in a workspace that
 * opted in (a processor registry or its `.sig` exists). A detected value becomes `[REDACTED]` (no key or token here, so
 * nothing is restorable). A text over the detectors' per-leaf limit is replaced whole, and once one body's scanned keys and
 * leaves pass the request-wide scan budget the whole body is: never stored unscanned. So is a JSON integer that parsing
 * rounded (a 17-19 digit card number sent as a number), whose digits can no longer be checked. A `password` member's value
 * (`key`) is checked with its key beside it, as the JSON password heuristic needs, and replaced whole when it matches.
 * ponytail: the budget is the native path's (16 MiB), so hostile text (IBAN-shaped words) can still hold the event loop
 * for about 10 s per body before the whole body is replaced; a smaller gateway budget trades that for whole-body
 * replacement of large ordinary bodies.
 */
function protectedRedactor(reasons: Set<string>): (text: string, key?: string) => string {
  let scanned = 0;
  const charge = (length: number) => { scanned += length; if (scanned > MAX_REQUEST_SCAN_CHARS) throw new ScanBudgetExceeded(); };
  return (text, key) => {
    if (text.length > MAX_PROTECTED_TEXT_CHARS) { reasons.add("protectedData:unscanned"); return "[REDACTED]"; }
    charge(text.length);
    if (isPasswordMember(key, text, undefined, charge)) { reasons.add("protectedData:credential"); return "[REDACTED]"; }
    return redactProtectedText(text, (region) => { reasons.add(`protectedData:${region.dataClass}`); return "[REDACTED]"; }).text;
  };
}

/** The whole stored body replaced, as a JSON string so a JSON body still parses. */
function unscannedJsonBody(): RedactionResult {
  return { redactedBytes: Buffer.from(JSON.stringify("[REDACTED]"), "utf8"), wasRedacted: true,
    redactionReasons: ["protectedData:unscanned"], originalPayloadSha256: null, originalHashOmitted: true };
}

export function redactBody(
  body: Buffer,
  contentType: string | undefined,
  redaction: GatewayConfig["redaction"],
  options: { readonly protectedData: boolean }
): RedactionResult {
  const originalSha = sha256Hex(body);

  if (body.length === 0) {
    return {
      redactedBytes: body,
      wasRedacted: false,
      redactionReasons: [],
      originalPayloadSha256: originalSha,
      originalHashOmitted: false
    };
  }

  const ct = (contentType ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(body.toString("utf8")) as unknown;
      const pathResult = applyJsonPathRedaction(parsed, redaction.jsonPathsDenylist);
      const protectedReasons = new Set<string>();
      let leaves = pathResult.value;
      if (options.protectedData) {
        const opaque = () => { protectedReasons.add("protectedData:unscanned"); return "[REDACTED]"; };
        leaves = redactJsonLeaves(pathResult.value, nestedJsonRedactor(protectedRedactor(protectedReasons), opaque), opaque);
      }
      let text = JSON.stringify(leaves);
      const regexResult = applyTextRegexRedaction(text, redaction.textRegexDenylist);
      text = regexResult.value;

      const wasRedacted = pathResult.changed || regexResult.changed || protectedReasons.size > 0;
      const redactedBytes = Buffer.from(text, "utf8");
      return {
        redactedBytes,
        wasRedacted,
        redactionReasons: [
          ...(pathResult.changed ? ["jsonPath"] : []),
          ...[...protectedReasons].sort(),
          ...regexResult.reasons
        ],
        originalPayloadSha256: wasRedacted ? null : originalSha,
        originalHashOmitted: wasRedacted
      };
    } catch {
      // Where the workspace opted in, a JSON body that does not parse, or whose walk fails (nesting too deep for it, the
      // scan budget), is replaced whole rather than stored as text: escaped, a value right after \n or \t has no word
      // boundary, so the text detectors would miss it.
      if (options.protectedData) return unscannedJsonBody();
      // fall through to text mode
    }
  }

  const protectedReasons = new Set<string>();
  const bodyText = body.toString("utf8");
  let stored = bodyText;
  if (options.protectedData) {
    const redact = protectedRedactor(protectedReasons);
    stored = redact(bodyText);
    // Text can carry JSON escapes too (an event stream of JSON chunks, JSON inside them): anything the detectors still find
    // in the stored text with its escapes decoded, level by level, replaces the whole body.
    if (decodedFinds(stored, decoded => redact(decoded) !== decoded)) return unscannedJsonBody();
  }
  const textResult = applyTextRegexRedaction(stored, redaction.textRegexDenylist);
  const wasRedacted = textResult.changed || protectedReasons.size > 0;
  return {
    redactedBytes: Buffer.from(textResult.value, "utf8"),
    wasRedacted,
    redactionReasons: [...[...protectedReasons].sort(), ...textResult.reasons],
    originalPayloadSha256: wasRedacted ? null : originalSha,
    originalHashOmitted: wasRedacted
  };
}

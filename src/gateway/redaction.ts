import { MAX_PROTECTED_TEXT_CHARS, redactProtectedText } from "../dataflow/detectors.js";
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

/**
 * The protected-data detectors (P2-02), as the native session uses them, over stored gateway evidence. Every workspace,
 * no opt-in: a detected value becomes `[REDACTED]` (no key or token here, so nothing is restorable), and text over the
 * detectors' per-leaf limit is replaced whole rather than stored unscanned.
 */
function redactProtectedString(text: string, reasons: Set<string>): string {
  if (text.length > MAX_PROTECTED_TEXT_CHARS) { reasons.add("protectedData:unscanned"); return "[REDACTED]"; }
  return redactProtectedText(text, (region) => { reasons.add(`protectedData:${region.dataClass}`); return "[REDACTED]"; }).text;
}

/** Keys and string leaves; a number leaf with a detection becomes the marker string, so the body stays valid JSON. */
function redactProtectedLeaves(value: unknown, reasons: Set<string>): unknown {
  if (typeof value === "string") return redactProtectedString(value, reasons);
  if (typeof value === "number") {
    const text = String(value);
    const redacted = redactProtectedString(text, reasons);
    return redacted === text ? value : redacted;
  }
  if (Array.isArray(value)) return value.map((item) => redactProtectedLeaves(item, reasons));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [redactProtectedString(key, reasons), redactProtectedLeaves(item, reasons)]));
}

export function redactBody(
  body: Buffer,
  contentType: string | undefined,
  redaction: GatewayConfig["redaction"]
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
      let text = JSON.stringify(redactProtectedLeaves(pathResult.value, protectedReasons));
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
      // fall through to text mode
    }
  }

  const protectedReasons = new Set<string>();
  const textResult = applyTextRegexRedaction(redactProtectedString(body.toString("utf8"), protectedReasons), redaction.textRegexDenylist);
  const wasRedacted = textResult.changed || protectedReasons.size > 0;
  return {
    redactedBytes: Buffer.from(textResult.value, "utf8"),
    wasRedacted,
    redactionReasons: [...[...protectedReasons].sort(), ...textResult.reasons],
    originalPayloadSha256: wasRedacted ? null : originalSha,
    originalHashOmitted: wasRedacted
  };
}

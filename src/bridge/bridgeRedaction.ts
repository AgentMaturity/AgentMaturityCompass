import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { createHash } from "node:crypto";
import { MAX_PROTECTED_TEXT_CHARS, redactProtectedText } from "../dataflow/detectors.js";
import { canonicalize } from "../utils/json.js";


function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}…`;
}

/**
 * Redact secrets from text bound for a durable bridge row.
 *
 * Delegates to the shared table (P5.3). This module used to carry its own 13
 * patterns, one of which — the PEM private-key header — matched only one of the
 * five real forms, so RSA, EC, OPENSSH and DSA keys crossed the bridge
 * unredacted. The shared table uses `secretBlind`'s correct spelling.
 *
 * The anonymous placeholder is deliberate here: a bridge row is durable and
 * signed, and naming the KIND of secret that was present is itself a small
 * disclosure. `blindSecrets` makes the opposite choice for its own reasons.
 *
 * The protected-data detectors (P2-02: card numbers, IBANs, SSNs, emails and the
 * rest of the native session's set) then replace what they find with the same
 * anonymous marker, in every workspace. Text over their per-leaf limit is
 * replaced whole rather than stored unscanned.
 */
export function redactBridgeText(input: string): string {
  const secretsRedacted = redactBridgeSecrets(input);
  if (secretsRedacted.length > MAX_PROTECTED_TEXT_CHARS) return "<AMC_REDACTED>";
  return redactProtectedText(secretsRedacted, () => "<AMC_REDACTED>").text;
}

/** Secrets only, for a wrapped agent's own terminal output; what the bridge stores still goes through redactBridgeText. */
export function redactBridgeSecrets(input: string): string {
  return redactSecrets(input, () => "<AMC_REDACTED>").redacted;
}

export function bridgeSha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function summarizeBridgeBody(params: {
  payload: unknown;
  maxChars: number;
  redactPromptText: boolean;
}): string {
  const serialized = canonicalize(params.payload ?? {});
  if (!params.redactPromptText) {
    return clip(redactBridgeText(serialized), params.maxChars);
  }
  return clip(redactBridgeText(serialized).replace(/"content":"[^"]*"/g, "\"content\":\"<REDACTED>\""), params.maxChars);
}

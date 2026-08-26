import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { createHash } from "node:crypto";
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
 */
export function redactBridgeText(input: string): string {
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

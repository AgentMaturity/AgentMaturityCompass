import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { createHash } from "node:crypto";
import { MAX_PROTECTED_TEXT_CHARS, redactJsonLeaves, redactProtectedText } from "../dataflow/detectors.js";
import { protectedDataOptedIn } from "../dataflow/processorRegistry.js";
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

const MARKER = "<AMC_REDACTED>";

/**
 * Redaction for what the bridge STORES as evidence: telemetry text, telemetry object payloads and `POST /bridge/evidence`
 * payloads. Secrets always, as `redactBridgeText` (every key and leaf of a JSON payload). In a workspace that opted in to
 * protected-data redaction (P2-02, read once per call) the protected-data detectors too, with the same anonymous marker:
 * text over their per-leaf limit is replaced whole, and an integer JSON.parse rounded (a card number sent as a number) is
 * replaced. Text the bridge hands back to an agent (control responses, deny reasons, `amc wrap`'s terminal output) keeps
 * secrets-only `redactBridgeText`, so an opted-in workspace's detectors never alter what an agent is told.
 */
export function bridgeEvidenceRedactor(workspace: string): { readonly text: (input: string) => string; readonly json: (value: unknown) => unknown } {
  const protectedData = protectedDataOptedIn(workspace);
  const text = (input: string): string => {
    const secretsRedacted = redactBridgeText(input);
    if (!protectedData) return secretsRedacted;
    if (secretsRedacted.length > MAX_PROTECTED_TEXT_CHARS) return MARKER;
    return redactProtectedText(secretsRedacted, () => MARKER).text;
  };
  return Object.freeze({ text, json: (value: unknown) => redactJsonLeaves(value, text, protectedData ? () => MARKER : undefined) });
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

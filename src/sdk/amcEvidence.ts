import { createHash } from "node:crypto";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";

/**
 * Redact secrets from text the SDK is about to persist.
 *
 * This module carried its own five patterns — a strict subset of the bridge's,
 * including the SAME broken PEM header pattern that matched one of the five real
 * private-key forms. It was the fourth copy of that bug in the tree (P5.3).
 *
 * Same anonymous placeholder as the bridge, and now the same table, so an SDK
 * row and a bridge row redact identically instead of by half-measures.
 */
export function redactSdkText(value: string): string {
  return redactSecrets(value, () => "<AMC_REDACTED>").redacted;
}

export function hashSdkValue(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

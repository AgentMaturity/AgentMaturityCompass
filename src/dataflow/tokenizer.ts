/**
 * Keyed tokens for protected values (P2-02). A token is `[[amc:<class>:<16 hex>]]`, where the hex is the first 64 bits
 * of HMAC-SHA256(workspace token key, class ‖ 0x00 ‖ value). The same value gives the same token within one workspace, so
 * a model can refer to one record consistently; another workspace's key gives a different token.
 *
 * Tokenization reduces the identifiers that reach model context and logs. It is not de-identification or anonymization
 * under any standard: the surrounding text may still identify a person, and equal tokens reveal equal values.
 */
import { createHmac } from "node:crypto";
import type { ProtectedDataClass } from "../vault/dataClassification.js";

/** Matches one token. The class list is closed and fixed-length hex follows, so the pattern cannot backtrack. */
export const TOKEN_PATTERN_SOURCE = String.raw`\[\[amc:(?:phi|pii|card_number|bank_account|credential):[0-9a-f]{16}\]\]`;

/**
 * Whether a whole token-shaped string counts as a token, shielding its text from detection and re-tokenization: only
 * when its 16 hex characters include a letter. All-decimal hex could be a raw card or account number written in token
 * brackets, so it stays text. A real token's hex is all-decimal and Luhn-valid about 5e-5 of the time; it is then
 * tokenized again, which over-redacts and is safe.
 */
export const isShieldingToken = (token: string): boolean => /[a-f]/.test(token.slice(-18, -2));

const refusalReasons = ["vault_unavailable", "vault_integrity", "token_collision", "detector_invalid", "content_not_text",
  "attachment_not_redactable", "declared_fields_unparseable", "declared_fields_unverifiable", "receipt_failed",
  "redaction_failed"] as const;
export type RedactionRefusal = typeof refusalReasons[number];

/** Static diagnostics only: no value, span, path, filename or key material enters this exception. */
export class RedactionRefused extends Error {
  readonly code = "REDACTION_REFUSED";
  readonly reason: RedactionRefusal;
  constructor(reason: RedactionRefusal) {
    const safeReason = refusalReasons.find(value => value === reason) ?? "redaction_failed";
    super(`Protected data redaction refused: ${safeReason}`);
    this.name = "RedactionRefused";
    this.reason = safeReason;
  }
}

/** The token for `value` under the workspace HMAC key. Never logs or returns the value. */
export function tokenFor(hmacKey: Buffer, dataClass: ProtectedDataClass, value: string): string {
  const mac = createHmac("sha256", hmacKey).update(dataClass, "utf8").update("\0", "utf8").update(value, "utf8").digest("hex");
  return `[[amc:${dataClass}:${mac.slice(0, 16)}]]`;
}

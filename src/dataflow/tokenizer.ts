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

/**
 * Matches one token-shaped string. The class list is closed and fixed-length hex follows, so the pattern cannot
 * backtrack. Matching the shape proves nothing: anyone can write raw digits in token brackets. Only a token this
 * workspace issued (its row is in the token vault, `openTokenLookup`) is treated as a token; any other is scanned as text.
 */
export const TOKEN_PATTERN_SOURCE = String.raw`\[\[amc:(?:phi|pii|card_number|bank_account|credential):[0-9a-f]{16}\]\]`;

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

/**
 * The token for `value` under the workspace HMAC key. Never logs or returns the value. Its hex can look like data (all
 * decimal and Luhn-valid about 5e-5 of the time); the redactor and admission know it as issued, so they skip it, while
 * gateway, bridge and privacy-rule scans, which hold no vault, may redact it again (over-redaction).
 */
export function tokenFor(hmacKey: Buffer, dataClass: ProtectedDataClass, value: string): string {
  const mac = createHmac("sha256", hmacKey).update(dataClass, "utf8").update("\0", "utf8").update(value, "utf8").digest("hex");
  return `[[amc:${dataClass}:${mac.slice(0, 16)}]]`;
}

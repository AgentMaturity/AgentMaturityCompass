import { KeyProviderError, KEY_PROVIDER_ERRORS } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";

const vaultLockedMessages = new Set([
  "🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.",
  "🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup."
]);

/** Narrow actual report-producer catches only; callers retain headersSent, auth, and unknown-error handling. */
export function respondReportSigningError(error: unknown, reply: (status: number, body: { error: string; code: string }) => void): boolean {
  if (error instanceof KeyProviderError && Object.hasOwn(KEY_PROVIDER_ERRORS, error.code)) {
    reply(KEY_PROVIDER_ERRORS[error.code], { error: `${error.code}: report signing refused`, code: error.code }); return true;
  }
  if (error instanceof KeyRevokedError) {
    reply(409, { error: "KEY_REVOKED: report signing key was revoked", code: "KEY_REVOKED" }); return true;
  }
  // The compatibility vault API currently throws Error rather than a dedicated lock class.
  if (error instanceof Error && vaultLockedMessages.has(error.message)) {
    reply(423, { error: "VAULT_LOCKED: unlock the vault to sign reports", code: "VAULT_LOCKED" }); return true;
  }
  return false;
}

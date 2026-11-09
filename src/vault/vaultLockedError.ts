/**
 * The "Vault locked" signing refusal, written once (follow-up 5). It names paths that work without a terminal, since
 * `amc vault unlock` refuses without one. Readers map it to 423 VAULT_LOCKED by its fixed prefix (isVaultLockedError):
 * src/auth/authApi.ts, src/studio/reportSigningError.ts and src/api/complianceRouter.ts; src/studio/consoleSnapshot.ts
 * tells it apart from other signing failures the same way.
 */
export const VAULT_LOCKED_PREFIX = "🔐 Vault locked.";
/** The ways to unlock: two that work without a terminal, and the one that needs one. */
export const VAULT_UNLOCK_PATHS = "Export AMC_VAULT_PASSPHRASE, or set AMC_VAULT_PASSPHRASE_FILE, or run `amc vault unlock` from a terminal";
export const VAULT_LOCKED_MESSAGE = `${VAULT_LOCKED_PREFIX} ${VAULT_UNLOCK_PATHS} (\`amc setup\` for first-time setup).`;
export const VAULT_LOCKED_NO_SIGN_MESSAGE = `${VAULT_LOCKED_MESSAGE} Use --no-sign to skip signing where supported.`;

export function isVaultLockedError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith(VAULT_LOCKED_PREFIX);
}

/**
 * The "Vault locked" signing refusal, written once (follow-up 5). It names the paths that work for the command being run.
 * CLI-02: `amc vault unlock` unlocks only its own process, so it is not one of them. Readers map it to 423 VAULT_LOCKED by
 * its fixed prefix (isVaultLockedError): src/auth/authApi.ts, src/studio/reportSigningError.ts and
 * src/api/complianceRouter.ts; src/studio/consoleSnapshot.ts tells it apart from other signing failures the same way.
 */
export const VAULT_LOCKED_PREFIX = "🔐 Vault locked.";
/** The ways to unlock that reach the command being run; both work without a terminal. */
export const VAULT_UNLOCK_PATHS = "Export AMC_VAULT_PASSPHRASE, or set AMC_VAULT_PASSPHRASE_FILE, in the shell that runs the command";
export const VAULT_LOCKED_MESSAGE = `${VAULT_LOCKED_PREFIX} ${VAULT_UNLOCK_PATHS}, then retry.`;
export const VAULT_LOCKED_NO_SIGN_MESSAGE = `${VAULT_LOCKED_MESSAGE} Use --no-sign to skip signing where supported.`;

export function isVaultLockedError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith(VAULT_LOCKED_PREFIX);
}

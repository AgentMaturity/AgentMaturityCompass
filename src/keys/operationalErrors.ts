/** Public verifier diagnostics contain only this relative scope and a bounded classification, never native messages. */
export function operationalDelegationReadProblem(error: unknown): string {
  const codes = ["ENOENT", "EACCES", "EPERM", "ELOOP", "ENOTDIR", "EISDIR", "ROLLBACK_DETECTED", "FORK_DETECTED", "KEY_REVOKED",
    "KEY_PROVIDER_UNAVAILABLE", "KEY_PROVIDER_AUTH_FAILED", "KEY_PROVIDER_KEY_REFUSED", "KEY_PROVIDER_NOT_INSTALLED", "KEY_PROVIDER_HELD", "KEY_DELEGATION_INVALID"];
  const names = ["SyntaxError", "ZodError", "AntiRollbackError", "KeysetIncompleteError"];
  const code = error !== null && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const name = error instanceof Error ? error.name : undefined;
  const kind = typeof code === "string" && codes.includes(code) ? code
    : typeof name === "string" && names.includes(name) ? name : "unreadable or unauthenticated state";
  return `Operational ledger delegation invalid: .amc/keys (${kind})`;
}

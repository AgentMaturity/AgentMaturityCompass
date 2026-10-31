/**
 * A `SANDBOX_EXECUTION_ENABLED` row a reader may count (security review 2026-10-31): written by a real confinement
 * backend, naming that backend and the sha256 of the confinement receipt it recorded for the run. A row without them
 * is a self-declared mode (an unconfined `--mode sandbox` assurance run once wrote one) and reads as absent, so it can
 * neither lift a trust summary to OBSERVED_HARDENED, satisfy `requireSandboxForExecute`, nor lift the high-risk L5 cap.
 */
export function isSandboxAttestation(meta: Readonly<Record<string, unknown>>): boolean {
  return meta.auditType === "SANDBOX_EXECUTION_ENABLED"
    && typeof meta.sandboxBackend === "string" && meta.sandboxBackend !== "" && meta.sandboxBackend !== "none"
    && typeof meta.confinementReceiptSha256 === "string" && /^[0-9a-f]{64}$/.test(meta.confinementReceiptSha256);
}

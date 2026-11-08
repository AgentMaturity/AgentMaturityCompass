/**
 * B1: the one wording the CLI verdicts (`amc verify`, `amc session verify`, `amc verify all`, `amc evidence verify`) use
 * for payloads a verifier could not open here (VerifyResult.payloadsNotEvaluated). They are not verified, and nothing says
 * they were altered, so the verdict is neither PASS nor a tampering failure. On a deployment the usual cause is a locked
 * vault: cron, `docker exec`, `kubectl exec` and agent shells have no terminal for the remembered passphrase.
 */
export function describePayloadsNotEvaluated(rows: readonly string[]): string {
  const [noun, them] = rows.length === 1 ? ["payload", "it"] : ["payloads", "them"];
  return `${rows.length} ${noun} not evaluated: the key that opens ${them} is out of reach in this process (vault locked: export `
    + "AMC_VAULT_PASSPHRASE or set AMC_VAULT_PASSPHRASE_FILE, or run from your terminal; or the key provider is unreachable). "
    + `The hash chain, signatures and seals were checked; the ${noun} not, so verification is incomplete. Nothing here says ${them === "it" ? "it was" : "they were"} altered.`;
}

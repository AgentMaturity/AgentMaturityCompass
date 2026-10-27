import type { Ledger } from "../ledger/ledger.js";
import { getSigningKey } from "./signingKeys.js";
import { verifyDelegation } from "./delegation.js";
import { KeyProviderError } from "./provider.js";
import { DELEGATION_META, type DelegationStream } from "./delegationScope.js";
import { readOperationalDelegationState } from "./operationalDelegationState.js";
import { readOperationalLedgerContext } from "./operationalLedgerReader.js";
import { withDelegationUse, withDelegationUseLock } from "./delegationUsage.js";

/** The caller's JSONL append stays inside the callback through fsync. SQL callers already own a write transaction. */
export function withOperationalLedgerRow<T>(workspace: string, stream: DelegationStream, metadata: Record<string, unknown>, ts: number,
  append: (metadata: Record<string, unknown>) => T, ledger?: Ledger): T {
  if (DELEGATION_META in metadata) throw new Error(`${DELEGATION_META} is reserved for AMC ledger delegation`);
  if (process.env.AMC_NO_SIGN === "1") return append(metadata);
  const state = readOperationalDelegationState(workspace);
  if (state === null) {
    if (stream !== "jsonl-evidence") return append(metadata); // SQL already excludes binding's BEGIN IMMEDIATE
    return withDelegationUseLock(workspace, () => {
      if (readOperationalDelegationState(workspace) !== null) throw new Error("the ledger provider binding changed; retry append");
      return append(metadata); // vault-only bytes and metadata order stay unchanged
    });
  }
  if (!Number.isFinite(ts)) throw new Error("a delegated row needs a finite signing timestamp");
  if (stream !== "jsonl-evidence" && !ledger?.db.inTransaction) throw new Error("delegated SQL rows require the existing write transaction");
  const sha256 = state.current.sha256;
  return withDelegationUse(workspace, { sha256, maxEvents: state.current.statement.maxEvents, provider: state.provider }, () => {
      if (readOperationalDelegationState(workspace)?.current.sha256 !== sha256) {
        throw new KeyProviderError("KEY_DELEGATION_INVALID", state.provider, "the delegation changed; retry append");
      }
      const verdict = verifyDelegation(state.current.bytes, { issuerPublicKeyPems: [state.current.issuerPublicKeyPem], at: new Date(ts) });
      if (!verdict.valid) throw new KeyProviderError("KEY_DELEGATION_INVALID", state.provider, verdict.reason);
      // Current-clock gate stays separate from the row's recorded timestamp. No quota is reserved until both pass.
      getSigningKey(workspace, "ledger-row");
      return readOperationalLedgerContext(workspace, { ledger }).usageFloor(sha256);
    }, useSequence => append({ ...metadata, [DELEGATION_META]: { sha256, useSequence } }));
}

/** buildEvidenceInsert and the two receipt/outcome builders already execute under BEGIN IMMEDIATE/savepoint. */
export function operationalSqlMetadata(ledger: Ledger, stream: "sqlite-evidence" | "sqlite-outcome", metadata: Record<string, unknown>, ts: number): Record<string, unknown> {
  return withOperationalLedgerRow(ledger.workspace, stream, metadata, ts, result => result, ledger);
}

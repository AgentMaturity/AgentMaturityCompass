import Database from "better-sqlite3";
import { join } from "node:path";
import { readCheckpointChain, readLegacyCheckpointPrefixForKeyMigration } from "../time/checkpoint.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { workspaceSelfTrust } from "../trust/trustContext.js";
import { assertKeysetComplete, boundProviderKey } from "./keyset.js";
import type { OperationalGrant } from "./operationalDelegation.js";
import type { DelegationScope } from "./delegationScope.js";
import { withDelegationUseLock } from "./delegationUsage.js";
import { readOperationalLedgerContext } from "./operationalLedgerReader.js";

/** Capture heads from the very prefix whose row preimages/signatures were verified, never a later unchecked reread. */
export function captureDelegationScope(workspace: string, previous: OperationalGrant | null, capturedVaultDelegate?: string): DelegationScope {
    const verified = readOperationalLedgerContext(workspace, { allowLegacyProvider: true });
    if (verified.errors.length) throw new Error(`the delegation's ledger prefix does not verify: ${verified.errors.slice(0, 3).join("; ")}`);
    const evidence = verified.rows["sqlite-evidence"];
    const outcomes = verified.rows["sqlite-outcome"];
    const jsonl = verified.rows["jsonl-evidence"];
    const bound = boundProviderKey(workspace, "ledger-row");
    const migration = bound !== null && bound.binding.delegationSha256 === undefined;
    if (migration && capturedVaultDelegate === undefined) throw new Error("v1 provider migration needs the owner's captured vault ledger key");
    const checkpoint = (migration ? readLegacyCheckpointPrefixForKeyMigration(workspace, capturedVaultDelegate!)
      : readCheckpointChain(workspace, workspaceSelfTrust(workspace))).at(-1);
    return {
      workspaceId: workspaceIdFromDirectory(workspace), sequence: (previous?.statement.scope.sequence ?? 0) + 1,
      previousDelegationSha256: previous?.sha256 ?? null,
      starts: {
        "sqlite-evidence": { count: evidence.length, head: evidence.at(-1)?.hash ?? "GENESIS" },
        "jsonl-evidence": { count: jsonl.length, head: jsonl.at(-1)?.hash ?? "GENESIS" },
        "sqlite-outcome": { count: outcomes.length, head: outcomes.at(-1)?.hash ?? "GENESIS_OUTCOME" }
      },
      checkpoints: { sequence: checkpoint?.checkpoint.sequence ?? 0, sha256: checkpoint?.sha256 ?? null }
    };
}

/**
 * Recheck a remotely signed preparation before publishing it. A pre-existing outer SQLite transaction must commit
 * first: timeout 0 refuses immediately, releasing the use lock instead of deadlocking a writer waiting for that lock.
 * No migrations, vault bootstrap, network call or asynchronous callback occurs in this critical section.
 */
export function publishDelegationBoundary<T>(workspace: string, expectedGeneration: number, prepared: DelegationScope,
  previous: OperationalGrant | null, publish: () => T, capturedVaultDelegate?: string): T {
  return withDelegationUseLock(workspace, () => {
    const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { fileMustExist: true, timeout: 0 });
    try {
      db.exec("BEGIN IMMEDIATE");
      if (assertKeysetComplete(workspace)?.generation !== expectedGeneration) throw new Error("the key set changed while the delegation was prepared; retry binding");
      const actual = captureDelegationScope(workspace, previous, capturedVaultDelegate);
      if (canonicalize(actual) !== canonicalize(prepared)) throw new Error("a ledger or checkpoint head changed while the delegation was prepared; retry binding");
      const result = publish();
      db.exec("COMMIT");
      return result;
    } finally {
      if (db.inTransaction) db.exec("ROLLBACK");
      db.close();
    }
  });
}

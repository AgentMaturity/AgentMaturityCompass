import { dirname } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { checkHighWater, highWaterKey, highWaterPath, readHighWater, recordHighWater, workspaceScope, type HighWaterOptions } from "./highWater.js";
import { KeyProviderError, type KeyProviderId } from "./provider.js";

export const delegationUsageKey = (workspace: string, sha256: string) => highWaterKey("delegation-use", `${workspaceScope(workspace)}:${sha256}`);
export const delegationUsageDigest = (sha256: string, useSequence: number) => sha256Hex(canonicalize({ delegationSha256: sha256, useSequence }));

/** Also used by publication of a prepared boundary; never put a remote call in this synchronous critical section. */
export function withDelegationUseLock<T>(workspace: string, operation: () => T, opts: HighWaterOptions = {}): T {
  return withControlFileLock({ root: dirname(highWaterPath(opts)), name: `ledger-delegation-${workspaceScope(workspace)}`, operation });
}

/**
 * One shared quota across SQLite evidence/outcomes and JSONL evidence. `durableFloor` verifies the complete global
 * prefixes on every use. A failed callback burns its reservation; an outer SQL rollback does too.
 */
export function withDelegationUse<T>(workspace: string, grant: { sha256: string; maxEvents: number; provider: KeyProviderId }, durableFloor: () => number,
  operation: (useSequence: number) => T, opts: HighWaterOptions = {}): T {
  const { sha256, maxEvents, provider } = grant;
  if (!/^[0-9a-f]{64}$/.test(sha256) || !Number.isSafeInteger(maxEvents) || maxEvents <= 0) throw new Error("invalid delegation quota");
  return withDelegationUseLock(workspace, () => {
    const key = delegationUsageKey(workspace, sha256);
    const mark = readHighWater(key, opts);
    if (mark !== null) checkHighWater(key, mark.sequence, delegationUsageDigest(sha256, mark.sequence), opts);
    const floor = durableFloor();
    if (!Number.isSafeInteger(floor) || floor < 0) throw new Error("delegation use floor must be a nonnegative safe integer");
    const previous = Math.max(mark?.sequence ?? 0, floor);
    if (previous >= maxEvents) throw new KeyProviderError("KEY_DELEGATION_INVALID", provider, `maxEvents (${maxEvents}) exhausted; renew the ledger-row delegation`);
    const next = previous + 1;
    if (!recordHighWater(key, next, delegationUsageDigest(sha256, next), opts)) {
      throw new KeyProviderError("KEY_DELEGATION_INVALID", provider, "the delegated row quota could not be recorded in AMC home");
    }
    return operation(next);
  }, opts);
}

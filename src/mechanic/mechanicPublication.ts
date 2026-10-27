/** Internal mechanic run authority and actual staged effects; no general purpose/callback API. */
import { OrgPairsPublicationError, captureOrgPairsAuthority } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAsync, type TransparencyAppendInput } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
export function captureMechanicRun(workspace: string, beforePublish: () => void) {
  const actor = beforePublish, enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
  beforePublish = () => { enabled(); actor(); enabled(); };
  beforePublish(); const fixed = captureOrgPairsAuthority(workspace);
  return { beforePublish, fixed, assertCurrent() { beforePublish(); fixed(); } };
}

export interface MechanicProgress { completed: string[]; phase: string; entryHash: string | null; pendingRecorded: boolean | null }
export function mechanicProgress(): MechanicProgress { return { completed: [], phase: "prepare", entryHash: null, pendingRecorded: null }; }
export class MechanicPublicationError extends Error {
  readonly code = "MECHANIC_PARTIAL";
  constructor(readonly completed: readonly string[], readonly phase: string, readonly entryHash: string | null,
    readonly pendingRecorded: boolean | null, cause: unknown) {
    super("mechanic publication is incomplete; earlier effects remain committed", { cause }); this.name = "MechanicPublicationError";
  }
}
export function mechanicFailed(state: MechanicProgress, cause: unknown): never {
  const members = cause instanceof OrgPairsPublicationError ? [...cause.publishedPaths] : [];
  if (state.completed.length === 0 && members.length === 0 && !(cause instanceof TransparencyMerkleLagError)) throw cause;
  throw new MechanicPublicationError(Object.freeze([...state.completed, ...members]), state.phase,
    cause instanceof TransparencyMerkleLagError ? cause.entryHash : state.entryHash,
    cause instanceof TransparencyMerkleLagError ? cause.pendingRecorded : state.pendingRecorded, cause);
}
export async function appendMechanicEntry(workspace: string, item: Omit<TransparencyAppendInput, "workspace">,
  run: ReturnType<typeof captureMechanicRun>, assertPublished: () => void, state: MechanicProgress) {
  state.phase = item.type; state.entryHash = null; state.pendingRecorded = null;
  const entry = await appendTransparencyEntryAsync({ workspace, ...item }, { beforeCommit() { run.beforePublish(); assertPublished(); run.fixed(); } });
  state.entryHash = entry.hash; state.completed.push(`log:${item.type}:${entry.hash}`); return entry.hash;
}

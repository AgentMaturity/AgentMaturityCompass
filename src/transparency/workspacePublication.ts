import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleFrontierPath, merkleLeavesPath,
  merkleMigrationPath, merkleMigrationSigPath, merklePendingPath, merkleRootsPath } from "./merklePaths.js";

type StateValue = Buffer | null | { readonly directory: true; readonly device: number; readonly inode: number };
/** Internal exact predecessor. Directory sentinels retain legacy post-line write-failure diagnostics. */
export type TransparencyState = ReadonlyMap<string, StateValue>;
export const workspaceTransparencyDir = (workspace: string): string => join(workspace, ".amc", "transparency");
export const workspaceLogPath = (workspace: string): string => join(workspaceTransparencyDir(workspace), "log.jsonl");
export const workspaceSealPath = (workspace: string): string => join(workspaceTransparencyDir(workspace), "log.seal.json");
export const workspaceSealSigPath = (workspace: string): string => join(workspaceTransparencyDir(workspace), "log.seal.sig");

function readStateValue(path: string): StateValue {
  try {
    const stat = lstatSync(path);
    if (stat.isDirectory()) return { directory: true, device: stat.dev, inode: stat.ino };
    return readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function transparencyStatePaths(workspace: string, full: boolean): string[] {
  const paths = [workspaceLogPath(workspace), workspaceSealPath(workspace), workspaceSealSigPath(workspace),
    merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleFrontierPath(workspace),
    merklePendingPath(workspace), merkleMigrationPath(workspace), merkleMigrationSigPath(workspace)];
  if (full) paths.push(merkleLeavesPath(workspace), merkleRootsPath(workspace));
  return paths;
}
/** Sync writers retain append-only large caches; async preparation additionally pins every cache byte. */
export function captureTransparencyState(workspace: string, full = false): TransparencyState {
  return new Map(transparencyStatePaths(workspace, full).map(path => [path, readStateValue(path)]));
}

export function stateBytes(state: TransparencyState, path: string): Buffer | null {
  const value = state.get(path);
  if (value === undefined || (value !== null && !Buffer.isBuffer(value))) throw new Error("transparency predecessor is not a regular file");
  return value;
}

export function assertTransparencyStateCurrent(state: TransparencyState): void {
  for (const [path, expected] of state) {
    const current = readStateValue(path);
    const matches = expected === null ? current === null : Buffer.isBuffer(expected)
      ? Buffer.isBuffer(current) && expected.equals(current)
      : current !== null && !Buffer.isBuffer(current) && expected.device === current.device && expected.inode === current.inode;
    if (!matches) throw new Error("transparency state changed while signing was prepared; retry the operation");
  }
}

/** The operation contains only local gates and prepared writes. Never pass signing or an await into this lock. */
export function publishTransparencyState<T>(workspace: string, state: TransparencyState, operation: () => T): T {
  return withTransparencyPublicationLock(workspace, () => {
    assertTransparencyStateCurrent(state);
    return operation();
  });
}

export function withTransparencyPublicationLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: workspaceTransparencyDir(workspace), name: "workspace-transparency", operation });
}


/** Internal fixed-family publication evidence. A null file attempt says nothing about lock/directory setup. */
export interface TransparencyAppendProgress {
  readonly phase: string;
  readonly lockSetupAttempted: boolean;
  readonly lockEntered: boolean;
  readonly directoryAttempts: readonly string[];
  readonly directoryReturns: readonly string[];
  readonly returnedMembers: readonly { readonly path: string; readonly operation: "append" | "replace" | "remove" }[];
  readonly attemptedPath: string | null;
  readonly lineWriteReturned: boolean;
  readonly lineAcknowledged: boolean;
  readonly rootCovered: boolean;
}
type AppendMember = null | { readonly kind: "directory"; readonly mode: number; readonly identity: string }
  | { readonly kind: "file"; readonly bytes: Buffer; readonly mode: number; readonly identity: string };
function readAppendMember(path: string): AppendMember {
  try {
    const first = lstatSync(path), mode = first.mode & 0o777, identity = `${first.dev}:${first.ino}`;
    if (first.isDirectory()) {
      const last = lstatSync(path);
      if (!last.isDirectory() || last.mode !== first.mode || last.dev !== first.dev || last.ino !== first.ino)
        throw new Error("transparency directory sentinel changed while being read");
      return { kind: "directory", mode, identity };
    }
    if (!first.isFile()) throw new Error("transparency append member must be a regular file or legacy directory sentinel");
    const bytes = readFileSync(path), last = lstatSync(path);
    if (!last.isFile() || first.mode !== last.mode || first.dev !== last.dev || first.ino !== last.ino
      || first.size !== last.size || first.mtimeMs !== last.mtimeMs)
      throw new Error("transparency append member changed while being read");
    return { kind: "file", bytes, mode, identity };
  } catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null; throw cause; }
}
function sameAppendMember(old: AppendMember, next: AppendMember): boolean {
  if (old === null || next === null) return old === next;
  return old.kind === next.kind && old.mode === next.mode && old.identity === next.identity
    && (old.kind !== "file" || (next.kind === "file" && old.bytes.equals(next.bytes)));
}
/** Capture before the first signing wait. Only the fixed log-family paths can be acknowledged. */
export function captureTransparencyAppendPublication(workspace: string) {
  const expected = new Map<string, AppendMember>(transparencyStatePaths(workspace, true).map(path => [path, readAppendMember(path)]));
  const state: TransparencyState = new Map<string, StateValue>([...expected].map(([path, row]) => [path, row === null ? null : row.kind === "file"
    ? Buffer.from(row.bytes) : { directory: true as const, device: Number(row.identity.split(":")[0]), inode: Number(row.identity.split(":")[1]) }]));
  const selected = (path: string): AppendMember => { if (!expected.has(path)) throw new Error("transparency append member was not captured"); return expected.get(path) as AppendMember; };
  const assertCurrent = () => {
    for (const [path, old] of expected) if (!sameAppendMember(old, readAppendMember(path)))
      throw new Error("transparency append inputs or owned destinations changed; retry the operation");
  };
  return { state, assertCurrent,
    present(path: string) { return selected(path) !== null; },
    mode(path: string) { return selected(path)?.mode ?? null; },
    // A legacy directory destination must reach the actual native append and retain its native diagnostic.
    appendBytes(path: string) { const row = selected(path); return row?.kind === "file" ? Buffer.from(row.bytes) : null; },
    acknowledge(path: string, bytes: Buffer, mode: number, operation: "append" | "replace") {
      const old = selected(path), own = readAppendMember(path);
      if (own === null || own.kind !== "file" || own.mode !== mode || !own.bytes.equals(bytes)
        || (operation === "append" && old?.kind === "file" && own.identity !== old.identity))
        throw new Error("transparency returned member differs from its exact expected bytes, mode or append identity");
      expected.set(path, own); // Identity is admitted only after exact postimage acknowledgment under publication lock.
    },
    acknowledgeAbsent(path: string) {
      selected(path); if (readAppendMember(path) !== null) throw new Error("transparency pending marker was not cleared"); expected.set(path, null);
    }
  };
}

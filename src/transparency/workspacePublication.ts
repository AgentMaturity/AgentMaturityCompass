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

/** Sync writers retain append-only large caches; async preparation additionally pins every cache byte. */
export function captureTransparencyState(workspace: string, full = false): TransparencyState {
  const paths = [workspaceLogPath(workspace), workspaceSealPath(workspace), workspaceSealSigPath(workspace),
    merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleFrontierPath(workspace),
    merklePendingPath(workspace), merkleMigrationPath(workspace), merkleMigrationSigPath(workspace)];
  if (full) paths.push(merkleLeavesPath(workspace), merkleRootsPath(workspace));
  return new Map(paths.map(path => [path, readStateValue(path)]));
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

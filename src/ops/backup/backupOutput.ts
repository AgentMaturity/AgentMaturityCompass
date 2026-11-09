import { lstatSync } from "node:fs";
import { join } from "node:path";
import { captureOrgFiles } from "../../org/preparedOrgPairs.js";
import { assertKeysetComplete, keysetPaths, keysetFileRel } from "../../keys/keyset.js";
import { CONFIG_REL } from "../../keys/keysConfig.js";
import { highWaterPath } from "../../keys/highWater.js";
import { trustConfigPath, trustConfigSigPath } from "../../trust/trustConfig.js";
import { physicalPathWithMissingSuffix } from "../../utils/pathSafety.js";
import { workspaceLogPath, workspaceSealPath, workspaceSealSigPath, workspaceTransparencyDir } from "../../transparency/workspacePublication.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleLeavesPath, merkleRootsPath, merkleFrontierPath,
  merklePendingPath, merkleMigrationPath, merkleMigrationSigPath, transparencyMerkleDir } from "../../transparency/merklePaths.js";

type BackupFileState = { bytes: Buffer; mode: number; identity: string } | null;
export function backupFileState(path: string): BackupFileState {
  const row = captureOrgFiles([path]).members[0]!;
  return row.bytes === null ? null : { bytes: row.bytes, mode: row.mode!, identity: row.identity! };
}
export function sameBackupFile(a: BackupFileState, b: BackupFileState): boolean {
  return a === null ? b === null : b !== null && a.mode === b.mode && a.identity === b.identity && a.bytes.equals(b.bytes);
}

/** Exact source/suffix aliases only; this is not a workspace/host output authorization rule. */
export function captureBackupOutput(workspace: string, outFile: string) {
  const before = backupFileState(outFile), physical = physicalPathWithMissingSuffix(outFile), keyset = assertKeysetComplete(workspace), keys = keysetPaths(workspace);
  const sources = [keys.keyset, keys.pending, highWaterPath(),
    ...Object.keys(keyset?.files ?? {}).map(rel => join(workspace, keysetFileRel(rel))),
    join(workspace, CONFIG_REL), join(workspace, `${CONFIG_REL}.sig`), trustConfigPath(workspace), trustConfigSigPath(workspace), join(workspace, ".amc", "mode.json"),
    ...["evidence.sqlite", "evidence.sqlite-wal", "evidence.sqlite-shm", "blobs", "targets", "runs"].map(name => join(workspace, ".amc", name)),
    workspaceTransparencyDir(workspace), workspaceLogPath(workspace), workspaceSealPath(workspace), workspaceSealSigPath(workspace),
    join(workspaceTransparencyDir(workspace), ".workspace-transparency.lock"), join(workspaceTransparencyDir(workspace), ".workspace-transparency-locks"),
    transparencyMerkleDir(workspace), merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleLeavesPath(workspace), merkleRootsPath(workspace),
    merkleFrontierPath(workspace), merklePendingPath(workspace), merkleMigrationPath(workspace), merkleMigrationSigPath(workspace)];
  const assertPathCurrent = () => {
    if (physicalPathWithMissingSuffix(outFile) !== physical) throw new Error("backup output physical selection changed while preparing");
  };
  const assertNoAlias = (selectedSources: readonly string[] = []) => {
    assertPathCurrent();
    for (const path of new Set([...selectedSources, ...sources])) {
      if (physicalPathWithMissingSuffix(path) === physical) throw new Error("backup output aliases an actual source or audit/log authority destination");
      if (before !== null) {
        try { const stat = lstatSync(path); if (`${stat.dev}:${stat.ino}` === before.identity) throw new Error("backup output hardlinks an actual source or audit/log authority destination"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    }
  };
  const assertOriginal = () => { assertPathCurrent(); if (!sameBackupFile(before, backupFileState(outFile))) throw new Error("backup output changed while preparing"); };
  assertNoAlias(); return Object.freeze({ before, assertPathCurrent, assertNoAlias, assertOriginal });
}

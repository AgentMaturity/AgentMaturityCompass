import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathExists } from "../../utils/fs.js";
import { withDeletionGate, DeletionDenied } from "../../residency/deletionGate.js";

function pruneFilesOlderThan(workspace: string, dir: string, olderThanMs: number, extensions?: string[]): string[] {
  if (!pathExists(dir)) {
    return [];
  }
  const removed: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removed.push(...pruneFilesOlderThan(workspace, join(dir, entry.name), olderThanMs, extensions));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (extensions && extensions.length > 0 && !extensions.some((ext) => entry.name.endsWith(ext))) {
      continue;
    }
    const full = join(dir, entry.name);
    const stat = statSync(full);
    if (stat.mtimeMs < olderThanMs) {
      try {
        withDeletionGate({ workspace, executor: "maintenance.cache-unlink",
          target: { kind: "caches", before: new Date(olderThanMs).toISOString() } }, () => unlinkSync(full));
        removed.push(full);
      } catch (error) {
        if (!(error instanceof DeletionDenied)) throw error;
      }
    }
  }
  return removed;
}

export function pruneOpsCaches(params: {
  workspace: string;
  pruneConsoleSnapshotsDays: number;
  pruneTransformSnapshotsDays: number;
}): {
  removedConsoleSnapshots: string[];
  removedTransformSnapshots: string[];
  removedGenericCacheFiles: string[];
} {
  const workspace = resolve(params.workspace);
  const now = Date.now();
  const consoleCutoff = now - Math.max(1, params.pruneConsoleSnapshotsDays) * 24 * 60 * 60 * 1000;
  const transformCutoff = now - Math.max(1, params.pruneTransformSnapshotsDays) * 24 * 60 * 60 * 1000;

  const studioDir = join(workspace, ".amc", "studio");
  const removedConsoleSnapshots: string[] = [];
  for (const name of ["console-snapshot.json", "console-snapshot.json.sig"]) {
    const full = join(studioDir, name);
    if (!pathExists(full)) continue;
    const stat = statSync(full);
    if (!stat.isFile() || !(stat.mtimeMs < consoleCutoff)) continue;
    try {
      withDeletionGate({ workspace, executor: "maintenance.cache-unlink",
        target: { kind: "caches", before: new Date(consoleCutoff).toISOString() } }, () => unlinkSync(full));
      removedConsoleSnapshots.push(full);
    } catch (error) {
      if (!(error instanceof DeletionDenied)) throw error;
    }
  }

  const agentsDir = join(workspace, ".amc", "agents");
  const removedTransformSnapshots: string[] = [];
  if (pathExists(agentsDir)) {
    for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const snapshotsDir = join(agentsDir, entry.name, "transform", "snapshots");
      removedTransformSnapshots.push(...pruneFilesOlderThan(workspace, snapshotsDir, transformCutoff, [".json", ".sig"]));
    }
  }

  const genericCacheDir = join(workspace, ".amc", "cache");
  const removedGenericCacheFiles = pruneFilesOlderThan(workspace, genericCacheDir, consoleCutoff);
  return {
    removedConsoleSnapshots,
    removedTransformSnapshots,
    removedGenericCacheFiles
  };
}

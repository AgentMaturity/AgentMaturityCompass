import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Vitest globalSetup: fails the run when any test created, changed or deleted a
// file under the repository's own .amc/ directory. Tests must use temp workspaces.
// Never restore files here: that would hide the write instead of preventing it.

export const REPO_AMC_DIR = fileURLToPath(new URL("../../.amc", import.meta.url));
const FULL_HASH_LIMIT_BYTES = 1024 * 1024;

export type DirectorySnapshot = Record<string, string>;

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * "content" (global guard): sha256 of every file up to 1 MB, size and mtime above,
 * and every directory. "stat" (per-file guard): size and mtime only, no reads, plus
 * directory mtimes including the root, so a file created and deleted again within
 * one test file still shows as a changed directory.
 */
export type SnapshotMode = "content" | "stat";

export function snapshotDirectory(root: string, mode: SnapshotMode = "content"): DirectorySnapshot {
  const snapshot: DirectorySnapshot = {};
  let entries: string[];
  try {
    entries = readdirSync(root, { recursive: true, encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return snapshot;
    throw error;
  }
  if (mode === "stat") snapshot["."] = `dir,mtime:${statSync(root).mtimeMs}`;
  for (const entry of entries) {
    const full = join(root, entry);
    const stat = statSync(full, { throwIfNoEntry: false });
    const rel = toPosixPath(relative(root, full));
    if (stat?.isDirectory()) snapshot[`${rel}/`] = mode === "stat" ? `dir,mtime:${stat.mtimeMs}` : "dir";
    else if (stat?.isFile())
      snapshot[rel] =
        mode === "content" && stat.size <= FULL_HASH_LIMIT_BYTES
          ? `sha256:${createHash("sha256").update(readFileSync(full)).digest("hex")}`
          : `size:${stat.size},mtime:${stat.mtimeMs}`;
  }
  return snapshot;
}

/** Sorted "<path> (created|changed|deleted)" entries; empty when nothing changed. */
export function diffSnapshots(before: DirectorySnapshot, after: DirectorySnapshot): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: string[] = [];
  for (const path of [...paths].sort()) {
    if (!(path in before)) changes.push(`${path} (created)`);
    else if (!(path in after)) changes.push(`${path} (deleted)`);
    else if (before[path] !== after[path]) changes.push(`${path} (changed)`);
  }
  return changes;
}

export function describeChanges(changes: string[]): string {
  return changes.map((change) => (change.startsWith(". ") ? `.amc/${change.slice(1)}` : `.amc/${change}`)).join(", ");
}

export default function setup(): () => void {
  const dir = mkdtempSync(join(tmpdir(), "amc-repo-snapshot-"));
  const snapshotPath = join(dir, "snapshot.json");
  writeFileSync(snapshotPath, JSON.stringify(snapshotDirectory(REPO_AMC_DIR)));
  process.env.AMC_TEST_REPO_SNAPSHOT = snapshotPath;
  return () => {
    const before = JSON.parse(readFileSync(snapshotPath, "utf8")) as DirectorySnapshot;
    rmSync(dir, { recursive: true, force: true });
    const changes = diffSnapshots(before, snapshotDirectory(REPO_AMC_DIR));
    if (changes.length === 0) return;
    // Vitest only logs a teardown error, so set the exit code for the run to fail.
    process.exitCode = 1;
    throw new Error(`Tests modified the repository workspace: ${describeChanges(changes)}`);
  };
}

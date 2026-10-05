import { relative } from "node:path";
import { afterAll } from "vitest";
import { describeChanges, diffSnapshots, REPO_AMC_DIR, snapshotDirectory } from "./repoWorkspaceGuard.global.js";

// Per-file attribution for the global repository-workspace guard. Parallel files
// share the repository, so confirm a flagged file by running it alone.
const before = snapshotDirectory(REPO_AMC_DIR);

afterAll(({}, suite) => {
  const changes = diffSnapshots(before, snapshotDirectory(REPO_AMC_DIR));
  if (changes.length === 0) return;
  const testFile = "filepath" in suite ? relative(process.cwd(), suite.filepath) : suite.name;
  throw new Error(
    `Tracked workspace changed during ${testFile}: ${describeChanges(changes)}. Use a temp workspace (mkdtempSync) instead of the repository root.`
  );
});

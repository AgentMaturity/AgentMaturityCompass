import { relative } from "node:path";
import { afterAll } from "vitest";
import { describeChanges, diffSnapshots, REPO_AMC_DIR, snapshotDirectory } from "./repoWorkspaceGuard.global.js";

// Per-file attribution for the global repository-workspace guard. Its afterAll runs
// after the test file's own afterAll (stack order), so a file that deletes what it
// wrote is caught through the changed directory mtime ("stat" mode), not by content.
// Parallel files share the repository and can be blamed for each other's writes:
// confirm a flagged file by running it alone. Stat-only keeps this cheap for a large
// local .amc; the global guard compares content.
const before = snapshotDirectory(REPO_AMC_DIR, "stat");

afterAll(({}, suite) => {
  const changes = diffSnapshots(before, snapshotDirectory(REPO_AMC_DIR, "stat"));
  if (changes.length === 0) return;
  const testFile = "filepath" in suite ? relative(process.cwd(), suite.filepath) : suite.name;
  throw new Error(
    `Tracked workspace changed during ${testFile}: ${describeChanges(changes)}. Use a temp workspace (mkdtempSync) instead of the repository root.`
  );
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Decision D-15 (snapshot on edit). When a plan issue edits a file that a restoration parity test
 * freezes, scripts/snapshot-plan-edit.mjs archives the file's bytes from before that edit and
 * registers them here. Freeze comparisons read those landed bytes; behaviour checks keep loading
 * live code. Unregistered paths read the live file, so an empty manifest changes nothing.
 */
export type PlanEdit = { path: string; issue: string; baseCommit: string; archivePath: string; sha256: string };

export const PLAN_EDITS_MANIFEST = "unused-code/plan-edits/manifest.json";
const ISSUE_KEY = /^P[0-3]-[0-9]{2}$/;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function validatePlanEdits(value: unknown): readonly PlanEdit[] {
  const manifest = value as { schemaVersion?: unknown; decision?: unknown; files?: unknown } | null;
  if (manifest?.schemaVersion !== 1 || manifest.decision !== "D-15" || !Array.isArray(manifest.files)) {
    throw new Error("Invalid plan-edits manifest header: expected schemaVersion 1, decision D-15 and a files list");
  }
  const files = manifest.files as PlanEdit[];
  files.forEach((row, index) => {
    const fail = (reason: string) => { throw new Error(`Invalid plan-edits entry ${index} (${String(row?.path)}): ${reason}`); };
    if (typeof row?.path !== "string" || row.path.includes("\\")
      || row.path.split("/").some(part => part === "" || part === "." || part === "..")) fail("path must be repo-relative POSIX");
    if (row.path === "package.json") fail("package.json is pinned by entries in tests/helpers/packageEntries.ts, not by snapshot");
    if (!ISSUE_KEY.test(row.issue)) fail("issue must match " + ISSUE_KEY);
    if (!/^[0-9a-f]{40}$/.test(row.baseCommit)) fail("baseCommit must be 40 hex");
    if (row.archivePath !== `unused-code/plan-edits/${row.issue}/${row.path}.landed`) fail("archivePath must be unused-code/plan-edits/<issue>/<path>.landed");
    if (!/^[0-9a-f]{64}$/.test(row.sha256)) fail("sha256 must be 64 lowercase hex");
    if (index > 0 && !(files[index - 1].path < row.path)) fail("files must be sorted by path with unique paths");
  });
  return files;
}

/** The helper for one repository root; tests use it with a temporary root. */
export function landedSourceAt(root: string) {
  let edits: readonly PlanEdit[] | undefined;
  const planEdits = (): readonly PlanEdit[] =>
    edits ??= validatePlanEdits(JSON.parse(readFileSync(resolve(root, PLAN_EDITS_MANIFEST), "utf8")));
  const repoPath = (path: string) => relative(root, resolve(root, path.replaceAll("\\", "/"))).split(sep).join("/");
  function landedBytes(path: string): Buffer {
    const key = repoPath(path);
    const edit = planEdits().find(row => row.path === key);
    if (!edit) return readFileSync(resolve(root, key));
    const bytes = readFileSync(resolve(root, edit.archivePath));
    if (sha256(bytes) !== edit.sha256) throw new Error("Plan-edit snapshot changed: " + edit.archivePath);
    return bytes;
  }
  return { planEdits, landedBytes, landedText: (path: string): string => landedBytes(path).toString("utf8") };
}

export const { planEdits, landedBytes, landedText } = landedSourceAt(fileURLToPath(new URL("../..", import.meta.url)));

import { lstatSync, opendirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { comparisonSha256, readComparisonFile } from "./harnessComparisonArtifacts.js";

const VERSION = "comparison-campaign-workspace/1" as const;
const MAX_FILES = 256;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 1024;
const MAX_DEPTH = 64;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.string().max(4096).refine(value => value.trim().length > 0);
const workspacePath = z.string().max(4096).refine(value =>
  !/^[A-Za-z]:/.test(value) && !/[\\\x00-\x1f\x7f]/.test(value) &&
  value.split("/").every(part => part !== "" && part !== "." && part !== "..") && !value.startsWith(".git/"),
"Workspace paths must be canonical relative file paths outside root .git metadata.");
const workspaceFileSchema = z.object({ path: workspacePath, sha256: hash, bytes: z.number().int().nonnegative() }).strict();
const snapshotShape = z.object({
  version: z.literal(VERSION), files: z.array(workspaceFileSchema).max(MAX_FILES), snapshotSha256: hash
}).strict();
function snapshotDigest(snapshot: Pick<z.infer<typeof snapshotShape>, "version" | "files">): string {
  return comparisonSha256(JSON.stringify({ version: snapshot.version,
    files: snapshot.files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })) }));
}

/** A self-consistent content inventory, not a signature or authenticated execution receipt. */
const campaignWorkspaceSnapshotSchema = snapshotShape.superRefine((snapshot, context) => {
  const reject = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (snapshot.files.reduce((sum, file) => sum + file.bytes, 0) > MAX_BYTES) reject("Workspace snapshot exceeds its byte budget.");
  if (snapshot.files.some((file, index) => index > 0 && snapshot.files[index - 1]!.path >= file.path)) {
    reject("Workspace snapshot paths must be unique and sorted.");
  }
  const paths = new Set(snapshot.files.map(file => file.path));
  for (const file of snapshot.files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index++) {
      if (paths.has(parts.slice(0, index).join("/"))) reject("Workspace files cannot also be parent directories.");
    }
  }
  if (snapshot.snapshotSha256 !== snapshotDigest(snapshot)) reject("Workspace snapshot digest did not match.");
});
export type CampaignWorkspaceSnapshot = z.infer<typeof campaignWorkspaceSnapshotSchema>;
export interface CampaignWorkspaceChange { path: string; beforeSha256: string | null; afterSha256: string | null }

function assertDirectoryWithoutAliases(path: string): void {
  for (let current = path;; current = dirname(current)) {
    const info = lstatSync(current);
    if (info.isSymbolicLink()) throw new Error("Campaign workspace refuses root or parent symlink aliases.");
    if (!info.isDirectory()) throw new Error("Campaign workspace root and parents must be directories.");
    if (dirname(current) === current) break;
  }
  if (realpathSync(path) !== path) throw new Error("Campaign workspace refuses noncanonical directory aliases.");
}

/**
 * Capture AFTER harness installation and BEFORE invoking the solver. Capture again
 * after execution, then diff the two inventories to measure only later changes.
 * Writers must be stopped during capture: this inventory is not an atomic or
 * race-resistant filesystem boundary and cannot authorize execution or promotion.
 * Only the root .git directory is omitted as VCS metadata. A regular .git file,
 * nested .git directories, instructions, skills and tools are all measured.
 * Symlinks and special files are refused, even when named .git. Traversal is
 * bounded to 256 files, 4 MiB, 1,024 entries and 64 directory levels.
 */
export function captureCampaignWorkspace(root: string): CampaignWorkspaceSnapshot {
  if (typeof root !== "string" || !root.trim() || root.includes("\0") || root.split(/[\\/]/).includes("..")) {
    throw new Error("Campaign workspace needs a nonempty root without parent traversal aliases.");
  }
  const absoluteRoot = resolve(root);
  const pending = [{ absolute: absoluteRoot, relative: "", depth: 0 }];
  const files: CampaignWorkspaceSnapshot["files"] = [];
  let bytes = 0, entries = 0;
  while (pending.length) {
    const current = pending.pop()!;
    assertDirectoryWithoutAliases(current.absolute);
    const directory = opendirSync(current.absolute);
    try {
      for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
        if (++entries > MAX_ENTRIES) throw new Error("Campaign workspace exceeds its 1,024 entry budget.");
        const path = join(current.absolute, entry.name);
        const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
        const info = lstatSync(path);
        if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
          throw new Error("Campaign workspace accepts regular files and directories, never symlink aliases or special files.");
        }
        if (info.isDirectory()) {
          if (!current.relative && entry.name === ".git") continue;
          if (current.depth >= MAX_DEPTH) throw new Error("Campaign workspace exceeds its 64 directory level budget.");
          pending.push({ absolute: path, relative, depth: current.depth + 1 });
        } else {
          if (files.length >= MAX_FILES) throw new Error("Campaign workspace exceeds its 256 file budget.");
          const content = readComparisonFile(path, MAX_BYTES - bytes);
          bytes += content.length;
          files.push({ path: relative, sha256: comparisonSha256(content), bytes: content.length });
        }
      }
    } finally { directory.closeSync(); }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const body = { version: VERSION, files };
  return campaignWorkspaceSnapshotSchema.parse({ ...body, snapshotSha256: snapshotDigest(body) });
}

/** Both inventories must validate; absent snapshots cannot become an empty diff. */
export function diffCampaignWorkspace(baseline: CampaignWorkspaceSnapshot, after: CampaignWorkspaceSnapshot): CampaignWorkspaceChange[] {
  const beforeFiles = new Map(campaignWorkspaceSnapshotSchema.parse(baseline).files.map(file => [file.path, file]));
  const afterFiles = new Map(campaignWorkspaceSnapshotSchema.parse(after).files.map(file => [file.path, file]));
  const changes: CampaignWorkspaceChange[] = [];
  for (const path of [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].sort()) {
    const before = beforeFiles.get(path), next = afterFiles.get(path);
    const beforeSha256 = before?.sha256 ?? null, afterSha256 = next?.sha256 ?? null;
    if (before && next && beforeSha256 === afterSha256 && before.bytes !== next.bytes) {
      throw new Error("Workspace snapshots disagree about bytes for the same file digest.");
    }
    if (beforeSha256 !== afterSha256) changes.push({ path, beforeSha256, afterSha256 });
  }
  return changes;
}

/**
 * Adapter-attributed observations only: this sidecar does not authenticate model
 * identity, prove component execution, or authorize evidence promotion. null use
 * means unknown; [] means the adapter explicitly observed no components used.
 */
export const campaignTrialEvidenceSchema = z.object({
  schemaVersion: z.literal("comparison-campaign-evidence/1"), trialId: reference,
  manifestSha256: hash, comparisonStartedAt: z.string().datetime(),
  source: z.literal("adapter-observation"), evidenceRef: reference,
  componentsUsed: z.array(z.object({ id: reference, kind: z.enum(["instruction", "skill", "tool"]), evidenceRef: reference }).strict()).max(256).nullable(),
  workspace: z.object({ baseline: campaignWorkspaceSnapshotSchema, after: campaignWorkspaceSnapshotSchema }).strict().nullable()
}).strict().superRefine((evidence, context) => {
  if (evidence.componentsUsed && new Set(evidence.componentsUsed.map(component => JSON.stringify([component.kind, component.id]))).size !== evidence.componentsUsed.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate campaign component observations." });
  }
});

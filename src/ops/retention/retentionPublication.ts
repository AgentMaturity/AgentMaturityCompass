/** Internal retention byte plans. No signer, provider, ledger or owner import belongs in this module. */
import { lstatSync, readFileSync, readdirSync, type Stats } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import { canonicalize } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";
import { writeFileAtomic } from "../../utils/fs.js";
import { containedExists, readContainedOrNull } from "../../utils/containedFs.js";
import { withControlFileLock } from "../../lifecycle/controlFileLock.js";
import { blobPrunedRowSchema, retentionSegmentManifestSchema } from "./retentionSchema.js";

export interface RetentionFile { readonly path: string; readonly bytes: Buffer | null; readonly identity: string | null }
const absent = (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
const stamp = (stat: Stats) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}:${stat.nlink}`;
export function captureRetentionFile(path: string): RetentionFile {
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error("retention target is not an ordinary owned file");
    const bytes = readFileSync(path), after = lstatSync(path);
    if (stamp(before) !== stamp(after)) throw new Error("retention file changed while captured; retry");
    return { path, bytes, identity: stamp(after) };
  } catch (error) { if (absent(error)) return { path, bytes: null, identity: null }; throw error; }
}
/** Internal managed-blob locator only; validate its literal spelling before any path normalization. */
export function captureRetentionBlob(workspace: string, blobId: string): RetentionFile & { readonly relativePath: string } {
  const relativePath = `.amc/blobs/${blobId}.blob`;
  const exists = containedExists(workspace, relativePath);
  const path = join(workspace, ...relativePath.split("/")), missing = { path, relativePath, bytes: null, identity: null };
  if (!exists) return missing;
  try {
    const before = lstatSync(path);
    const bytes = readContainedOrNull(workspace, relativePath, before.size);
    if (bytes === null || !containedExists(workspace, relativePath)) return missing;
    const after = lstatSync(path);
    if (stamp(before) !== stamp(after) || bytes.length !== before.size) throw new Error("retention managed blob changed while captured; retry");
    return { path, relativePath, bytes, identity: stamp(after) };
  } catch (error) {
    if (absent(error) && !containedExists(workspace, relativePath)) return missing;
    throw error;
  }
}
export function assertRetentionFilesCurrent(files: readonly RetentionFile[]): void {
  for (const file of files) {
    const current = captureRetentionFile(file.path);
    if (file.identity !== current.identity || (file.bytes === null ? current.bytes !== null : current.bytes === null || !file.bytes.equals(current.bytes)))
      throw new Error("retention selected bytes or target changed while signing; retry");
  }
}
export function withRetentionPublication<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc"), name: "retention-publication", operation });
}
export function retentionHead(workspace: string): { name: string | null; files: readonly RetentionFile[]; lastHash: string | null } {
  const dir = join(workspace, ".amc", "archive", "ledger"); let names: string[];
  try { names = readdirSync(dir).filter(name => name.endsWith(".jsonl.gz")).sort((a, b) => a.localeCompare(b)); }
  catch (error) { if (absent(error)) names = []; else throw error; }
  const name = names.at(-1) ?? null;
  if (name === null) return { name, files: [], lastHash: null };
  const path = join(dir, name), files = [path, `${path}.manifest.json`, `${path}.manifest.sig`].map(captureRetentionFile);
  const raw = files[1]!.bytes;
  if (files.some(file => file.bytes === null) || raw === null) throw new Error("retention predecessor is incomplete");
  const manifest = retentionSegmentManifestSchema.parse(JSON.parse(raw.toString("utf8")) as unknown);
  return { name, files, lastHash: manifest.lastEventHash };
}
export function assertRetentionHeadCurrent(workspace: string, head: ReturnType<typeof retentionHead>): void {
  if (retentionHead(workspace).name !== head.name) throw new Error("retention selected predecessor changed while signing; retry");
  assertRetentionFilesCurrent(head.files);
}
interface SegmentInput {
  workspace: string; segmentId: string; startTs: number; endTs: number; eventLines: string[];
  firstEventHash: string; lastEventHash: string; prevSegmentLastEventHash: string | null;
  prunePolicy: { prunePayloadsAfterDays: number; archivePayloadsAfterDays: number };
}
export function prepareRetentionSegment(input: SegmentInput) {
  const segmentPath = join(input.workspace, ".amc", "archive", "ledger", `segment_${input.startTs}_${input.endTs}_${input.segmentId}.jsonl.gz`);
  const manifestPath = `${segmentPath}.manifest.json`, sigPath = `${segmentPath}.manifest.sig`;
  const targets = [segmentPath, manifestPath, sigPath].map(captureRetentionFile);
  const compressed = gzipSync(Buffer.from(`${input.eventLines.join("\n")}${input.eventLines.length > 0 ? "\n" : ""}`, "utf8"));
  const manifest = retentionSegmentManifestSchema.parse({ v: 1, segmentId: input.segmentId, createdTs: Date.now(),
    startTs: input.startTs, endTs: input.endTs, eventCount: input.eventLines.length, firstEventHash: input.firstEventHash,
    lastEventHash: input.lastEventHash, prevSegmentLastEventHash: input.prevSegmentLastEventHash,
    segmentFileSha256: sha256Hex(compressed), prunePolicy: { ...input.prunePolicy } });
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  return { segmentPath, manifestPath, sigPath, targets, compressed, manifestBytes, manifest, digest: sha256Hex(manifestBytes) };
}
export function assertRetentionSuccessor(plan: ReturnType<typeof prepareRetentionSegment>, head: ReturnType<typeof retentionHead>): void {
  if (head.name !== null && basename(plan.segmentPath).localeCompare(head.name) <= 0)
    throw new Error("retention segment is not a supported lexical successor; a separate archive migration is required");
}
export function publishRetentionSegment(plan: ReturnType<typeof prepareRetentionSegment>, signatureBytes: string, published: string[], attempted: string[] = []): void {
  assertRetentionFilesCurrent(plan.targets);
  attempted.push(plan.segmentPath);
  writeFileAtomic(plan.segmentPath, plan.compressed, 0o644); published.push(plan.segmentPath);
  attempted.push(plan.manifestPath);
  writeFileAtomic(plan.manifestPath, plan.manifestBytes, 0o644); published.push(plan.manifestPath);
  attempted.push(plan.sigPath);
  writeFileAtomic(plan.sigPath, signatureBytes, 0o644); published.push(plan.sigPath);
}
export function preparePrunedPrefix(workspace: string, blobId: string, sha256: string, previous: readonly RetentionFile[]) {
  const log = previous[0]!, raw = log.bytes?.toString("utf8") ?? "";
  const rows = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => blobPrunedRowSchema.parse(JSON.parse(line) as unknown));
  const prev = rows.at(-1)?.hash ?? "", ts = Date.now();
  const row = blobPrunedRowSchema.parse({ v: 1, ts, blobId, sha256, prev, hash: sha256Hex(canonicalize({ v: 1, ts, blobId, sha256, prev })) });
  const bytes = Buffer.from(`${raw}${JSON.stringify(row)}\n`);
  // Preserve legacy concatenation; refuse a missing separator rather than silently repairing the stream.
  bytes.toString("utf8").split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(line => blobPrunedRowSchema.parse(JSON.parse(line) as unknown));
  return { workspace, previous, row, bytes, digest: sha256Hex(bytes), sealTs: Date.now() };
}
export function prunedFiles(workspace: string): readonly RetentionFile[] {
  return [join(workspace, ".amc", "blobs", "pruned.jsonl"), join(workspace, ".amc", "blobs", "pruned.jsonl.sig")].map(captureRetentionFile);
}
export function publishPrunedPrefix(plan: ReturnType<typeof preparePrunedPrefix>, sealBytes: string, published: string[], attempted: string[] = []): void {
  assertRetentionFilesCurrent(plan.previous);
  attempted.push(plan.previous[0]!.path);
  writeFileAtomic(plan.previous[0]!.path, plan.bytes, 0o644); published.push(plan.previous[0]!.path);
  attempted.push(plan.previous[1]!.path);
  writeFileAtomic(plan.previous[1]!.path, sealBytes, 0o644); published.push(plan.previous[1]!.path);
}

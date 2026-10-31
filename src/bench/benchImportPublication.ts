import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { withBenchImportLock } from "./benchImportLock.js";
import { physicalPathWithMissingSuffix, isWithin } from "../utils/pathSafety.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import type { BenchArtifact } from "./benchSchema.js";
import { buildImportedBenchMeta, importedBenchPath } from "./benchRegistryStore.js";
interface Member { workspace: string; path: string; physicalPath: string; bytes: Buffer | null; mode: number | null; identity: string | null }
function read(workspace: string, path: string): Member {
  const root = physicalPathWithMissingSuffix(resolve(workspace)), imports = physicalPathWithMissingSuffix(join(workspace, ".amc", "bench", "imports"));
  const physicalPath = physicalPathWithMissingSuffix(path);
  if (!isWithin(root, imports) || !isWithin(imports, physicalPath)) throw new Error("bench import destination escapes the managed imports directory");
  try { const first = lstatSync(path); if (!first.isFile()) throw new Error("bench import member must be a regular file");
    const bytes = readFileSync(path), last = lstatSync(path);
    if (first.dev !== last.dev || first.ino !== last.ino || first.mode !== last.mode || first.size !== last.size || first.mtimeMs !== last.mtimeMs)
      throw new Error("bench import member changed while being read");
    return { workspace, path, physicalPath, bytes, mode: last.mode & 0o777, identity: `${last.dev}:${last.ino}` };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { workspace, path, physicalPath, bytes: null, mode: null, identity: null }; throw error; }
}
export function captureBenchImportFiles(workspace: string, paths: readonly string[]) { return [...new Set(paths)].map(path => read(workspace, path)); }
function assertBenchImportFiles(before: readonly Member[], identical?: ReadonlyMap<string, Buffer>): void {
  for (const old of before) { const now = read(old.workspace, old.path), sameBytes = (left: Buffer | null, right: Buffer | null) => left === null ? right === null : right !== null && left.equals(right);
    if (old.physicalPath !== now.physicalPath) throw new Error("selected bench import location changed; retry");
    if (old.mode === now.mode && old.identity === now.identity && sameBytes(old.bytes, now.bytes)) continue;
    const allowed = identical?.get(old.path);
    if (allowed !== undefined && now.mode === 0o644 && now.bytes !== null && allowed.equals(now.bytes)) continue;
    throw new Error("selected bench import inputs or destinations changed; retry");
  }
}
export class BenchImportPublicationError extends Error {
  readonly code = "BENCH_IMPORT_INCOMPLETE";
  constructor(readonly phase: string, readonly completedPaths: readonly string[], readonly attemptedPath: string | null, cause: unknown, readonly completedLogHashes: readonly string[] = []) {
    super("bench import did not complete; successful file or log effects are retained", { cause }); this.name = "BenchImportPublicationError";
  }
}
export function publishVerifiedBenchImport(input: {
  workspace: string; registryId: string; registryFingerprint: string; signerFingerprint: string; sourceUrl: string; version: string;
  bytes: Buffer; bench: BenchArtifact; cache: readonly { path: string; bytes: Buffer }[];
  cacheBefore: readonly Member[]; targetBefore: readonly Member[]; current: () => void;
}) {
  const bytes = Buffer.from(input.bytes), bench = structuredClone(input.bench), target = importedBenchPath(input.workspace, bench.benchId, input.version);
  const writes = [...input.cache.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) })),
    { path: target.artifactPath, bytes }, { path: target.shaPath, bytes: Buffer.from(`${sha256Hex(bytes)}\n`) },
    { path: target.benchJsonPath, bytes: Buffer.from(JSON.stringify(bench, null, 2)) }];
  return withBenchImportLock(input.workspace, () => {
    input.current();
    // Two independent imports may publish the exact same authenticated index. Other cache changes still refuse.
    assertBenchImportFiles(input.cacheBefore, new Map(input.cache.map(row => [row.path, row.bytes])));
    assertBenchImportFiles(input.targetBefore);
    const completed: string[] = []; let attempted: string | null = null;
    try {
      for (const row of writes) { attempted = relative(input.workspace, row.path); ensureDir(dirname(row.path)); writeFileAtomic(row.path, row.bytes, 0o644); completed.push(attempted); }
      // Preserve the old metadata timestamp phase: after artifact/checksum/extracted JSON, immediately before meta.json.
      const meta = buildImportedBenchMeta(input, bench, sha256Hex(bytes)), metaBytes = Buffer.from(`${canonicalize(meta)}\n`);
      attempted = relative(input.workspace, target.metaPath); writeFileAtomic(target.metaPath, metaBytes, 0o644); completed.push(attempted);
      const expected = [...writes, { path: target.metaPath, bytes: metaBytes }], published = captureBenchImportFiles(input.workspace, expected.map(row => row.path));
      for (const row of expected) { const actual = published.find(member => member.path === row.path)!;
        if (actual.mode !== 0o644 || actual.bytes === null || !actual.bytes.equals(row.bytes)) throw new Error("published bench import members changed"); }
      return { meta, artifactPath: target.artifactPath, metaPath: target.metaPath, completedPaths: Object.freeze([...completed]),
        assertPublished() { input.current(); assertBenchImportFiles(published); } };
    } catch (cause) { throw new BenchImportPublicationError("files", Object.freeze([...completed]), attempted, cause); }
  });
}

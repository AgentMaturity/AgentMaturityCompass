import { lstatSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
export interface BenchRegistryOptions { beforePublish?: () => void }
interface Member { path: string; physicalPath: string; bytes: Buffer | null; mode: number | null; identity: string | null }
function read(path: string): Member {
  const physicalPath = physicalPathWithMissingSuffix(path);
  try { const first = lstatSync(path); if (!first.isFile()) throw new Error("selected registry member must be a regular file");
    const bytes = readFileSync(path), last = lstatSync(path);
    if (first.dev !== last.dev || first.ino !== last.ino || first.mode !== last.mode || first.size !== last.size || first.mtimeMs !== last.mtimeMs) throw new Error("selected registry member changed while read");
    return { path, physicalPath, bytes, mode: last.mode & 0o777, identity: `${last.dev}:${last.ino}` };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, physicalPath, bytes: null, mode: null, identity: null }; throw error; }
}
export function captureRegistryFiles(paths: readonly string[]) { return [...new Set(paths)].map(read); }
export function registryFileBytes(before: readonly Member[], path: string): Buffer | null {
  const member = before.find(row => row.path === path); if (member === undefined) throw new Error("registry file was not captured");
  return member.bytes === null ? null : Buffer.from(member.bytes);
}
export function assertRegistryFiles(before: readonly Member[]): void {
  for (const old of before) { const now = read(old.path);
    if (old.physicalPath !== now.physicalPath || old.mode !== now.mode || old.identity !== now.identity || (old.bytes === null ? now.bytes !== null : now.bytes === null || !old.bytes.equals(now.bytes)))
      throw new Error("selected registry inputs or destinations changed; retry");
  }
}
export function withBenchRegistryLock<T>(dir: string, operation: () => T): T { return withControlFileLock({ root: dir, name: "bench-registry-publication", operation }); }
export class BenchRegistryPublicationError extends Error {
  readonly code = "BENCH_REGISTRY_PARTIAL";
  constructor(readonly completedPaths: readonly string[], readonly attemptedPath: string | null, cause: unknown) {
    super("bench registry publication did not complete; successful replacements are retained", { cause }); this.name = "BenchRegistryPublicationError";
  }
}
/** Caller holds the fixed registry lock and has completed all authority/input gates. No signing or await here. */
export function writeRegistryMembers(dir: string, writes: readonly { path: string; bytes: Buffer; mode: number }[]) {
  const completed: string[] = []; let attempted: string | null = null;
  try { for (const row of writes) { attempted = relative(dir, row.path); ensureDir(dirname(row.path)); writeFileAtomic(row.path, row.bytes, row.mode); completed.push(attempted); }
    const published = captureRegistryFiles(writes.map(row => row.path));
    for (const row of writes) { const actual = published.find(member => member.path === row.path)!;
      if (actual.mode !== row.mode || actual.bytes === null || !actual.bytes.equals(row.bytes)) throw new Error("published registry member changed"); }
    return { completedPaths: Object.freeze([...completed]), assertPublishedFiles() { assertRegistryFiles(published); } };
  } catch (cause) { throw new BenchRegistryPublicationError(Object.freeze([...completed]), attempted, cause); }
}

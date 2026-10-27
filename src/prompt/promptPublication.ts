import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";

interface PromptFile { readonly path: string; readonly bytes: Buffer | null; readonly mode: number | null; readonly identity: string | null }
export type PromptFiles = readonly PromptFile[];
function read(path: string): PromptFile {
  try { const first = lstatSync(path); if (!first.isFile()) throw new Error("prompt publication member must be a regular file");
    const bytes = readFileSync(path), last = lstatSync(path);
    if (first.dev !== last.dev || first.ino !== last.ino || first.mode !== last.mode || first.size !== last.size || first.mtimeMs !== last.mtimeMs)
      throw new Error("prompt publication member changed while being read");
    return { path, bytes, mode: last.mode & 0o777, identity: `${last.dev}:${last.ino}` };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, bytes: null, mode: null, identity: null }; throw error; }
}
export function capturePromptFiles(paths: readonly string[]): PromptFiles { return [...new Set(paths.map(path => resolve(path)))].map(read); }
export function assertPromptFilesCurrent(before: PromptFiles): void {
  for (const old of before) { const now = read(old.path);
    if (old.mode !== now.mode || old.identity !== now.identity || (old.bytes === null ? now.bytes !== null : now.bytes === null || !old.bytes.equals(now.bytes)))
      throw new Error("selected prompt inputs or destinations changed while signing; retry"); }
}
function withPromptPublication<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc"), name: "prompt-pack-publication", operation });
}
export class PromptPublicationError extends Error {
  readonly code = "PROMPT_PUBLICATION_INCOMPLETE";
  constructor(readonly completedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("prompt publication did not complete; returned writes are retained", { cause }); this.name = "PromptPublicationError";
  }
}
/** Internal fixed-family publisher; no remote operation or await occurs under the common prompt lock. */
export function publishPromptFiles(workspace: string, before: PromptFiles, rows: readonly { path: string; bytes: Uint8Array }[], assertCurrent: () => void = () => {}) {
  const writes = new Map<string, Buffer>();
  for (const row of rows) { const path = resolve(row.path), bytes = Buffer.from(row.bytes), previous = writes.get(path);
    if (previous !== undefined && !previous.equals(bytes)) throw new Error("prompt outputs have conflicting destinations");
    if (!before.some(old => old.path === path)) throw new Error("prompt destination was not captured"); writes.set(path, bytes); }
  return withPromptPublication(workspace, () => {
    assertCurrent(); assertPromptFilesCurrent(before);
    const completed: string[] = []; let attempted = "";
    try { for (const [path, bytes] of writes) { attempted = relative(workspace, path); ensureDir(dirname(path));
      writeFileAtomic(path, bytes, before.find(old => old.path === path)!.mode ?? 0o644); completed.push(attempted); }
      return capturePromptFiles([...writes.keys()]);
    } catch (cause) { throw new PromptPublicationError(Object.freeze([...completed]), attempted, cause); }
  });
}

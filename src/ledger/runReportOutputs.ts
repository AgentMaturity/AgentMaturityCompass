import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeFileAtomic } from "../utils/fs.js";
import { OrgPairsPublicationError } from "../org/preparedOrgPairs.js";

/** Actual raw diagnostic/assurance outputs; no signature sidecar exists for these report files. */
function read(path: string) {
  try {
    const first = lstatSync(path);
    if (!first.isFile()) throw new Error("run report destination must be a regular file");
    const bytes = readFileSync(path), last = lstatSync(path);
    if (first.dev !== last.dev || first.ino !== last.ino || first.size !== last.size || first.mtimeMs !== last.mtimeMs || first.ctimeMs !== last.ctimeMs)
      throw new Error("run report destination changed while being read");
    return { bytes, mode: last.mode & 0o777, identity: `${last.dev}:${last.ino}` };
  } catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("run report destination is unreadable or unsafe", { cause }); }
}
class RunReportPublicationError extends Error {
  readonly code = "RUN_REPORT_PARTIAL";
  constructor(readonly completed: readonly string[], readonly phase: string, cause: unknown) {
    super("run report publication is incomplete; earlier effects remain committed", { cause }); this.name = "RunReportPublicationError";
  }
}
export function runReportFailure(completed: readonly string[], phase: string, cause: unknown): never {
  const members = cause instanceof OrgPairsPublicationError ? cause.publishedPaths : [];
  if (completed.length === 0 && members.length === 0) throw cause;
  throw new RunReportPublicationError(Object.freeze([...completed, ...members]), phase, cause);
}
/** Captured before Sign, compared separately immediately before each actual write. No inode-bound TOCTOU claim. */
export function captureRunReportOutputs(workspace: string, paths: readonly string[]) {
  const names = paths.map(path => resolve(path)), config = resolve(workspace, ".amc", "amc.config.yaml");
  if (names.includes(config) || names.includes(`${config}.sig`)) throw new Error("run report output must differ from its signing configuration");
  if (new Set(names).size !== names.length) throw new Error("run report JSON and Markdown destinations must differ");
  const before = new Map(names.map(path => [path, read(path)])), published = new Map<string, Buffer>();
  return { assertPublishedCurrent() {
    for (const [path, bytes] of published) { const current = read(path);
      if (current === null || current.mode !== 0o644 || !bytes.equals(current.bytes)) throw new Error("published run report changed before its later phase");
    }
  }, write(path: string, bytes: string) {
    const name = resolve(path);
    const old = before.get(name);
    if (old === undefined) throw new Error("run report destination was not captured");
    const current = read(name);
    if (old === null ? current !== null : current === null || old.mode !== current.mode || old.identity !== current.identity || !old.bytes.equals(current.bytes))
      throw new Error("run report destination changed while signing");
    try { writeFileAtomic(path, bytes, 0o644); } catch (cause) { throw new Error("run report file publication failed", { cause }); }
    published.set(name, Buffer.from(bytes, "utf8"));
  } };
}

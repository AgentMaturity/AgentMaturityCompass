import { mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { assertOrgPairsCurrent, captureOrgFiles, OrgPairsPublicationError, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { writeFileAtomic } from "../utils/fs.js";

export interface PassportPublicationOptions { beforePublish?: () => void; assertInputsCurrent?: () => void }
export class PassportPublicationError extends Error {
  readonly code = "PASSPORT_PUBLICATION_PARTIAL";
  constructor(readonly phase: string, readonly publishedPaths: readonly string[], readonly createdDirectories: readonly string[],
    readonly attemptedPath: string | null, cause: unknown, readonly createdHash: string | null = null,
    readonly exportedHash: string | null = null, readonly sharedProgressUnknown = false) {
    super("passport publication is incomplete; inspect acknowledged members, directories and the attempted phase before retrying", { cause });
    this.name = "PassportPublicationError";
  }
}
interface Directory { path: string; identity: string | null; mode: number | null }
function readDirectory(path: string): Directory {
  try { const row = statSync(path); if (!row.isDirectory()) throw new Error("passport destination parent is not a directory");
    return { path, identity: `${row.dev}:${row.ino}`, mode: row.mode & 0o777 }; }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { path, identity: null, mode: null }; throw cause; }
}
/** Only known destination parent chains are selected; this is not a host filesystem authorization framework. */
export function capturePassportDirectories(paths: readonly string[]) {
  const expected = new Map<string, Directory>(), mode = 0o777 & ~process.umask(), created: string[] = [];
  for (const input of paths) {
    const chain: Directory[] = [];
    for (let path = resolve(input); !expected.has(path); path = dirname(path)) {
      const row = readDirectory(path); chain.push(row); if (row.identity !== null || dirname(path) === path) break;
    }
    for (const row of chain.reverse()) expected.set(row.path, row);
  }
  const assertCurrent = () => {
    if ((0o777 & ~process.umask()) !== mode) throw new Error("original passport directory mode changed while preparing publication");
    for (const old of expected.values()) { const row = readDirectory(old.path);
      if (row.identity !== old.identity || row.mode !== old.mode) throw new Error("passport destination directory changed while preparing publication"); }
  };
  return { assertCurrent, created, create(beforeMember: () => void) {
    let attempted: string | null = null;
    try { for (const [path, old] of expected) { if (old.identity !== null) continue;
      attempted = null; beforeMember(); assertCurrent(); attempted = path;
      mkdirSync(path, { mode: 0o777 }); created.push(path);
      const own = readDirectory(path); if (own.identity === null || own.mode !== mode) throw new Error("created passport directory differs from its prepared mode");
      expected.set(path, own); attempted = null;
    } } catch (cause) { if (created.length === 0 && attempted === null) throw cause;
      throw new PassportPublicationError("directory", [], Object.freeze([...created]), attempted, cause); }
  } };
}
/** Actual archive/digest expected-state transition. Signature authority stays with the real calling constructor. */
export function capturePassportFiles(workspace: string, paths: readonly string[]) {
  const before = captureOrgFiles(paths), expected = new Map(before.members.map(row => [row.path, row])), published: string[] = [];
  const snapshot = (): OrgPairsSnapshot => ({ members: [...expected.values()] });
  const assertCurrent = () => assertOrgPairsCurrent(snapshot());
  return { assertCurrent, published, publish(writes: readonly { path: string; bytes: Buffer }[], beforeMember: () => void) {
    return withConfigSignaturePairLock(workspace, () => {
      let attempted: string | null = null;
      try { for (const row of writes) {
        attempted = null; beforeMember(); assertCurrent();
        if (!expected.has(row.path)) throw new Error("passport member was not selected before signing");
        attempted = row.path; writeFileAtomic(row.path, row.bytes, 0o644); published.push(row.path);
        const own = captureOrgFiles([row.path]).members[0];
        if (own === undefined || own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(row.bytes)) throw new Error("published passport member differs from exact prepared bytes or mode");
        expected.set(row.path, own); attempted = null;
      }
      beforeMember(); assertCurrent();
      } catch (cause) {
        if (published.length === 0 && attempted === null) throw cause;
        throw new PassportPublicationError("artifact-members", Object.freeze([...published]), [], attempted, cause);
      }
    });
  } };
}
export const passportRequiredDirectories = (workspace: string) => [join(workspace, ".amc", "passport"), join(workspace, ".amc", "passport", "exports"), join(workspace, ".amc", "passport", "cache")];

/** Preserve genuine nested known prefixes and causes; never infer an unreturned native operation succeeded. */
export function passportPublicationFailure(workspace: string, phase: string, paths: readonly string[], directories: readonly string[], attempted: string | null, cause: unknown,
  createdHash: string | null = null, exportedHash: string | null = null, sharedProgressUnknown = false) {
  const nestedPaths = cause instanceof OrgPairsPublicationError ? cause.publishedPaths.map(path => resolve(workspace, path))
    : cause instanceof PassportPublicationError ? cause.publishedPaths : [];
  const nestedDirectories = cause instanceof PassportPublicationError ? cause.createdDirectories : [];
  const nestedAttempt = cause instanceof OrgPairsPublicationError ? (cause.attemptedPath ? resolve(workspace, cause.attemptedPath) : null)
    : cause instanceof PassportPublicationError ? cause.attemptedPath : null;
  return new PassportPublicationError(phase, Object.freeze([...new Set([...paths, ...nestedPaths])]), Object.freeze([...new Set([...directories, ...nestedDirectories])]),
    nestedAttempt ?? attempted, cause, createdHash, exportedHash, sharedProgressUnknown);
}

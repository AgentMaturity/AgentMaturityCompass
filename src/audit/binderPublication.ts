import { dirname, join, relative } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgFiles, assertOrgPairsCurrent, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";

export interface AuditPublicationOptions {
  beforePublish?: () => void; assertInputsCurrent?: () => void;
  /** Additional negative gate for facts replaced by this operation's own checked output. */
  assertPreparationInputsCurrent?: () => void;
  /** Additional negative alias refusal supplied by the actual request/pending owner. */
  assertOutputsSafe?: (paths: readonly string[]) => void;
}
export type AuditFileWrite = { readonly path: string; readonly bytes: Uint8Array; readonly mode?: number };
export class AuditBinderPublicationError extends Error {
  readonly code = "AUDIT_BINDER_PUBLICATION_INCOMPLETE";
  constructor(readonly phase: string, readonly publishedPaths: readonly string[], readonly completedLogHashes: readonly string[], cause: unknown, readonly attemptedPath: string | null = null) {
    super("audit binder publication did not complete; acknowledged effects are retained", { cause }); this.name = "AuditBinderPublicationError";
  }
}
/** Only local checked writes live in this common audit-family lock. Provider and log work precedes/follows it. */
export function publishAuditFiles(workspace: string, writes: readonly AuditFileWrite[], before: OrgPairsSnapshot,
  assertCurrent: () => void, assertBeforeFirstWrite?: () => void): { readonly publishedPaths: readonly string[]; assertCurrent(): void } {
  const own = writes.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes), mode: row.mode ?? 0o644 }));
  if (new Set(own.map(row => row.path)).size !== own.length || own.some(row => !before.members.some(old => old.path === row.path)))
    throw new Error("audit destinations were not uniquely captured");
  return withControlFileLock({ root: join(workspace, ".amc", "audit"), name: "binder-publication", operation: () => {
    const expected = { members: before.members.map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
    const done: string[] = []; let attempted: string | null = null;
    try {
      assertBeforeFirstWrite?.();
      for (const row of own) {
        attempted = null;
        assertCurrent(); assertOrgPairsCurrent(expected); // caller -> original authority/inputs -> remaining/own targets LAST
        ensureDir(dirname(row.path)); attempted = relative(workspace, row.path);
        writeFileAtomic(row.path, row.bytes, row.mode); done.push(attempted);
        const written = captureOrgFiles([row.path]).members[0]!;
        if (written.bytes === null || !written.bytes.equals(row.bytes) || written.mode !== row.mode)
          throw new Error("written audit member does not match its exact prepared bytes and mode");
        expected.members[expected.members.findIndex(old => old.path === row.path)] = { ...written, bytes: Buffer.from(written.bytes) };
      }
      attempted = null; assertCurrent(); assertOrgPairsCurrent(expected);
    } catch (cause) { if (done.length === 0 && attempted === null) throw cause; throw new AuditBinderPublicationError("files", Object.freeze([...done]), [], cause, attempted); }
    return Object.freeze({ publishedPaths: Object.freeze(done), assertCurrent: () => assertOrgPairsCurrent(expected) });
  } });
}

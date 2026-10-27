import { appendFileSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

type Snapshot = { bytes: Buffer; mode: number; links: number } | null;
export interface IntegrationJournalWrite {
  kind: string; sha256: string; bytes: number; entered: boolean; returned: boolean; verified: boolean;
}
/** Storage scope only. It never grants actor/signing authority and expires before the file lock is released. */
export interface IntegrationJournalIo {
  readonly workspace: string;
  deliveryText(): string | null;
  saveDelivery(text: string): void;
  deadLettersText(): string | null;
  normalizeDeadLetters(text: string): void;
  appendDeadLetter(line: string): void;
  sharesExportLock(path: string): boolean;
  exportJournal(path: string, text: string): void;
  exportQueue(path: string, text: string): void;
}
class IntegrationJournalPartialError extends Error {
  constructor(cause: unknown, readonly writes: readonly IntegrationJournalWrite[]) {
    super("Integration journal publication interrupted; earlier writes may remain", { cause }); this.name = "IntegrationJournalPartialError";
  }
}
const activeRoots = new Set<string>();
function snapshot(path: string): Snapshot {
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("integration journal target is not a regular file");
  return { bytes: readFileSync(path), mode: stat.mode & 0o7777, links: stat.nlink };
}
function equal(left: Snapshot, right: Snapshot): boolean {
  return left === null || right === null ? left === right : left.mode === right.mode && left.links === right.links && left.bytes.equals(right.bytes);
}

function sourceRoot(workspace: string): string { return join(resolve(workspace), ".amc", "integrations"); }
function exportRoot(workspace: string, path: string): string {
  ensureDir(dirname(path)); const parent = realpathSync(dirname(path)), name = basename(path).toLowerCase();
  // Inspect only the explicit destination, including directory aliases. No workspace/inode scan is performed.
  return name === "integrations-delivery-journal.json" ? join(parent, "integrations") : name === "dead-letters.jsonl" ? parent : sourceRoot(workspace);
}
function rootIdentity(root: string): string {
  try { return realpathSync(root); } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return join(realpathSync(dirname(root)), basename(root));
    throw cause;
  }
}

/** One fixed cooperating protocol for both journals. No Sign, await or SQL transaction belongs inside. */
export function withIntegrationJournalProtocol<T>(workspace: string, operation: (journal: IntegrationJournalIo) => T,
  beforeWrite?: () => void, writes: IntegrationJournalWrite[] = []): T {
  return withJournalLock(workspace, sourceRoot(workspace), operation, beforeWrite, writes);
}
function withJournalLock<T>(workspace: string, root: string, operation: (journal: IntegrationJournalIo) => T,
  beforeWrite?: () => void, writes: IntegrationJournalWrite[] = []): T {

  beforeWrite?.(); ensureDir(sourceRoot(workspace)); ensureDir(root);
  const identity = realpathSync(root), ownIdentity = realpathSync(sourceRoot(workspace));
  if (activeRoots.has(identity)) throw new Error("nested integration journal lock is forbidden; reuse the active I/O scope");
  try { return withControlFileLock({ root, name: "delivery-journals", operation: () => {
    activeRoots.add(identity); let active = true;
    const delivery = join(workspace, ".amc", "integrations-delivery-journal.json"), dead = join(sourceRoot(workspace), "dead-letters.jsonl");
    const observed = new Map<string, Snapshot>();
    const assertActive = () => { if (!active) throw new Error("integration journal I/O scope has expired"); };
    const key = (path: string) => join(realpathSync(dirname(path)), basename(path));
    const assertSource = () => { assertActive(); if (identity !== ownIdentity) throw new Error("source journal operation needs its own fixed lock"); };
    const sharesExportLock = (path: string) => { assertActive(); return rootIdentity(exportRoot(workspace, path)) === identity; };
    const read = (path: string) => { assertActive(); const value = snapshot(path); observed.set(key(path), value); return value?.bytes.toString("utf8") ?? null; };
    const write = (path: string, text: string, kind: string, recipe: "atomic600" | "atomic644" | "inplace600" | "append600" | "queue") => {
      assertActive(); ensureDir(dirname(path)); const target = key(path);
      if (!observed.has(target)) observed.set(target, snapshot(path));
      const original = observed.get(target)!;
      if ((recipe === "queue" || recipe === "inplace600" || recipe === "append600") && original !== null && original.links > 1)
        throw new Error("in-place integration journal export/write refuses a hard-link alias with unknown writer scope");
      const bytes = Buffer.from(text, "utf8"), output = recipe === "append600" ? Buffer.concat([original?.bytes ?? Buffer.alloc(0), bytes]) : bytes;
      const mode = recipe === "atomic600" ? 0o600 : recipe === "atomic644" ? 0o644 : original?.mode ?? ((recipe === "queue" ? 0o666 : 0o600) & ~process.umask());
      beforeWrite?.(); assertActive();
      if (key(path) !== target || !equal(original, snapshot(path))) throw new Error("integration journal write preimage changed");
      const effect: IntegrationJournalWrite = { kind, sha256: sha256Hex(output), bytes: output.length, entered: true, returned: false, verified: false }; writes.push(effect);
      if (recipe === "atomic600" || recipe === "atomic644") writeFileAtomic(path, bytes, mode);
      else if (recipe === "append600") appendFileSync(path, bytes, { mode: 0o600 });
      else if (recipe === "inplace600") writeFileSync(path, bytes, { mode: 0o600 });
      else writeFileSync(path, bytes);
      effect.returned = true;
      const expected = { bytes: output, mode, links: recipe === "atomic600" || recipe === "atomic644" ? 1 : original?.links ?? 1 };
      if (key(path) !== target || !equal(expected, snapshot(path))) throw new Error("integration journal own postimage differs from the returned write");
      effect.verified = true; observed.set(target, expected);
    };
    const journal: IntegrationJournalIo = { workspace,
      deliveryText: () => { assertSource(); return read(delivery); }, saveDelivery: text => { assertSource(); write(delivery, text, "delivery-save", "atomic600"); },
      deadLettersText: () => { assertSource(); return read(dead); }, normalizeDeadLetters: text => { assertSource(); write(dead, text, "dead-letter-normalize", "inplace600"); },
      appendDeadLetter: line => { assertSource(); write(dead, line, "dead-letter-append", "append600"); }, sharesExportLock,
      exportJournal: (path, text) => { if (!sharesExportLock(path)) throw new Error("release the source journal scope before exporting to another journal lock"); write(path, text, "journal-export", "atomic644"); },
      exportQueue: (path, text) => { if (!sharesExportLock(path)) throw new Error("queue export needs its explicit destination journal lock"); write(path, text, "queue-export", "queue"); } };
    try {
      const result = operation(journal);
      if (result !== null && (typeof result === "object" || typeof result === "function") && typeof (result as { then?: unknown }).then === "function")
        throw new Error("integration journal protocol must be synchronous");
      return result;
    } finally { active = false; activeRoots.delete(identity); }
  } }); } catch (cause) {
    if (writes.some(write => write.entered)) throw new IntegrationJournalPartialError(cause, writes.map(write => ({ ...write })));
    throw cause;
  }
}

/** Source loading has already finished. These fixed export recipes acquire only the explicit destination's lock. */
export function writeIntegrationJournalExport(workspace: string, path: string, text: string, writes: IntegrationJournalWrite[] = []): void {
  try { withJournalLock(workspace, exportRoot(workspace, path), journal => journal.exportJournal(path, text), undefined, writes); }
  catch (cause) {
    if (cause instanceof IntegrationJournalPartialError || !writes.some(write => write.entered)) throw cause;
    throw new IntegrationJournalPartialError(cause, writes.map(write => ({ ...write })));
  }
}
export function writeIntegrationQueueExport(workspace: string, path: string, text: string): void {
  withJournalLock(workspace, exportRoot(workspace, path), journal => journal.exportQueue(path, text));
}

/** Current journal state is concurrency data, not original actor/purpose authority. Each write reads fresh state under the lock. */
export function captureIntegrationJournalPublication(workspace: string, beforeCommit: () => void) {
  const progress: Array<{ stage: string; returned: boolean; writes: IntegrationJournalWrite[] }> = [];
  return { progress, publish: <T>(stage: string, operation: (journal: IntegrationJournalIo) => T, assertRow?: () => void): T => {
    const effect = { stage, returned: false, writes: [] as IntegrationJournalWrite[] }; progress.push(effect);
    const value = withIntegrationJournalProtocol(workspace, operation, () => { beforeCommit(); assertRow?.(); }, effect.writes);
    effect.returned = true; return value;
  } };
}

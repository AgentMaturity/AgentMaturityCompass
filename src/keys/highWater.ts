/**
 * Anti-rollback high-water marks (P1-08). For each trust list, revocation list, key history, rotation chain and key
 * set, the highest sequence this machine accepted and the sha256 of the bytes at that sequence, kept OUTSIDE every
 * workspace in `<AMC home>/state/high-water.json` (mode 0600, atomic writes). A lower sequence is ROLLBACK_DETECTED;
 * the same sequence with other bytes is FORK_DETECTED. The file is per machine, so a fresh verifier starts at zero:
 * the workspace transparency log is the second floor, and P1-26 anchors that log publicly.
 */
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureContainedDir, readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";

export type HighWaterKind = "trust-list" | "trust-list-version" | "trust-list-threshold" | "trust-root-set" | "revocation-list" | "key-history" | "rotation" | "keyset";
export type AntiRollbackCode = "ROLLBACK_DETECTED" | "FORK_DETECTED";

export class AntiRollbackError extends Error {
  constructor(readonly code: AntiRollbackCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "AntiRollbackError";
  }
}

const entrySchema = z.strictObject({
  sequence: z.number().int().nonnegative().safe(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  seenAt: z.iso.datetime()
});
const fileSchema = z.strictObject({
  type: z.literal("amc.high-water"),
  version: z.literal(1),
  entries: z.record(z.string().min(1).max(512), entrySchema)
});
export type HighWaterEntry = z.infer<typeof entrySchema>;

const MAX_BYTES = 8 * 1024 * 1024;
const READ_ONLY_CODES = new Set(["EROFS", "EACCES", "EPERM"]);
const warnedReadOnly = new Set<string>();

export interface HighWaterOptions {
  amcHome?: string;
  env?: NodeJS.ProcessEnv;
}

const STATE_REL = "state/high-water.json";
const homeOf = (opts: HighWaterOptions) => opts.amcHome ?? resolveAmcHome({ env: opts.env });

export function highWaterPath(opts: HighWaterOptions = {}): string {
  return join(homeOf(opts), "state", "high-water.json");
}

/** The machine-local scope of a workspace: a digest of its real path, never an id read from the workspace's own files. */
export function workspaceScope(workspace: string): string {
  let real = resolve(workspace);
  try { real = realpathSync(workspace); } catch { /* a workspace not created yet keeps its resolved path */ }
  return sha256Hex(real).slice(0, 16);
}

export function highWaterKey(kind: HighWaterKind, id: string): string {
  return `${kind}:${id}`;
}

/** One workspace key history's mark: its revision and the sha256 of its canonical envelope. */
export function keyHistoryMarkKey(workspace: string, subject: string): string {
  return highWaterKey("key-history", `${subject}@${workspaceScope(workspace)}`);
}

/** The revision a newly sealed history starts at: above any this machine accepted, so a re-created workspace is no rollback. */
export function nextKeyHistoryRevision(workspace: string, subject: string): number {
  return (readHighWater(keyHistoryMarkKey(workspace, subject))?.sequence ?? 0) + 1;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/**
 * Every entry, or {} when no state file exists. Anything unreadable, malformed, symlinked (the file or the state
 * directory), special or hard-linked throws (src/utils/containedFs.ts).
 */
function readEntries(opts: HighWaterOptions): Record<string, HighWaterEntry> {
  const path = highWaterPath(opts);
  let bytes: Buffer;
  try {
    const read = readContainedOrNull(homeOf(opts), STATE_REL, MAX_BYTES);
    if (read === null) return {};
    bytes = read;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return {};
    throw new Error(`anti-rollback state ${path} is unreadable (${error instanceof Error ? error.message : String(error)}); `
      + "refusing to decide on rollback until it is restored or removed by the machine owner");
  }
  // Written canonically, so a duplicated or re-spelled key never reads as a different mark than the one written.
  let value: unknown = null;
  try { value = parseCanonicalJson(bytes); } catch { /* reported as invalid below */ }
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) throw new Error(`anti-rollback state ${path} is not a valid amc.high-water file; refusing to decide on rollback`);
  return parsed.data.entries;
}

/** The ids of every mark of one kind on this machine. */
export function highWaterIds(kind: HighWaterKind, opts: HighWaterOptions = {}): string[] {
  const prefix = `${kind}:`;
  return Object.keys(readEntries(opts)).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length));
}

export function readHighWater(key: string, opts: HighWaterOptions = {}): HighWaterEntry | null {
  return readEntries(opts)[key] ?? null;
}

/** Throws ROLLBACK_DETECTED for a lower sequence and FORK_DETECTED for the recorded sequence with other bytes. */
export function compareHighWater(key: string, recorded: Pick<HighWaterEntry, "sequence" | "sha256"> | null, sequence: number, sha256: string): void {
  if (recorded === null) return;
  if (sequence < recorded.sequence) {
    throw new AntiRollbackError("ROLLBACK_DETECTED", `${key} sequence ${sequence} is older than the accepted sequence ${recorded.sequence}`);
  }
  if (sequence === recorded.sequence && sha256 !== recorded.sha256) {
    throw new AntiRollbackError("FORK_DETECTED", `${key} sequence ${sequence} has bytes ${sha256}, not the accepted ${recorded.sha256}`);
  }
}

/** Reads the mark and compares; returns the recorded entry (null when this machine has none). */
export function checkHighWater(key: string, sequence: number, sha256: string, opts: HighWaterOptions = {}): HighWaterEntry | null {
  const recorded = readHighWater(key, opts);
  compareHighWater(key, recorded, sequence, sha256);
  return recorded;
}

/**
 * Compares under the state lock, then raises the mark when `sequence` is higher; it never lowers one. Returns false,
 * with one warning per path, when AMC home is read-only (a container with a read-only root): the decision already made
 * stands and the transparency-log floor still applies, but this machine keeps no mark.
 */
export function recordHighWater(key: string, sequence: number, sha256: string, opts: HighWaterOptions = {}): boolean {
  const path = highWaterPath(opts);
  const seen = checkHighWater(key, sequence, sha256, opts);
  if (seen !== null && seen.sequence >= sequence) return true; // nothing to raise: no lock, no write
  try {
    mkdirSync(homeOf(opts), { recursive: true, mode: 0o700 });
    ensureContainedDir(homeOf(opts), "state");
    return withControlFileLock({ root: dirname(path), name: "high-water", operation: () => {
      const entries = readEntries(opts);
      compareHighWater(key, entries[key] ?? null, sequence, sha256);
      if (entries[key] && entries[key].sequence >= sequence) return true;
      const next = { type: "amc.high-water", version: 1, entries: { ...entries, [key]: { sequence, sha256, seenAt: new Date().toISOString() } } };
      writeContained(homeOf(opts), STATE_REL, canonicalize(fileSchema.parse(next)), 0o600);
      return true;
    } });
  } catch (error) {
    const code = errorCode(error);
    if (code === undefined || !READ_ONLY_CODES.has(code)) throw error;
    if (!warnedReadOnly.has(path)) {
      warnedReadOnly.add(path);
      process.stderr.write(`[amc] anti-rollback mark not recorded: ${path} is not writable (${code}); the transparency-log floor still applies.\n`);
    }
    return false;
  }
}

/**
 * Re-records every mark whose key `rename` maps to a new key (never lowering one there). A trust-root rotation uses
 * it so the trust-list marks kept under the old root set keep binding the new one.
 */
export function carryHighWaterMarks(rename: (key: string) => string | null, opts: HighWaterOptions = {}): number {
  let carried = 0;
  for (const [key, entry] of Object.entries(readEntries(opts))) {
    const target = rename(key);
    if (target === null) continue;
    recordHighWater(target, entry.sequence, entry.sha256, opts);
    carried += 1;
  }
  return carried;
}

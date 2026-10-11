/**
 * Atomic key-set transactions (P1-08). A change to signing keys (vault creation, the v1 to v2 migration, a rotation)
 * writes every file under a staged name, then `.amc/keys/keyset.pending.json`, renames the staged files into place and
 * finally renames the pending file to `.amc/keys/keyset.json`, the commit point:
 *
 *   { "type": "amc.keyset", "version": 1, "generation": 12, "keys": { "<purpose>": "<key id>" },
 *     "files": { "keys/artifact-seal.pub": "<sha256>", ... }, "statements": ["<sha256>"] }
 *
 * `files` lists what that generation wrote (paths relative to `.amc`); `keys` binds the vault's key ids, so a secret
 * write that re-encrypts the vault does not open a generation. While a transaction is pending, or a listed public key
 * or statement lost its digest, signing and verifying refuse with "key set generation N is incomplete; run
 * `amc keys rotate --resume`". The vault, its meta and the histories it lists may change later on their own (a secret
 * write, an explicit history admission) and are authenticated by the vault and their signatures instead. Resume rolls
 * forward when every staged file is intact, else rolls back from `.amc/keys/rotations/gen-<N>/`, which holds the bytes
 * of every file the generation replaced (none for a new vault, whose rollback removes what it created).
 */
import { renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureDir, pathExists, readRegularFileNoFollow, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { LOCAL_PURPOSES } from "../vault/vaultPayload.js";
import { AntiRollbackError, checkHighWater, highWaterKey, readHighWater, recordHighWater, workspaceScope } from "./highWater.js";

const hex = z.string().regex(/^[0-9a-f]{64}$/);
const keysetSchema = z.strictObject({
  type: z.literal("amc.keyset"),
  version: z.literal(1),
  generation: z.number().int().positive().safe(),
  keys: z.partialRecord(z.enum(LOCAL_PURPOSES), hex),
  files: z.record(z.string().regex(/^[A-Za-z0-9._/-]+$/), hex),
  statements: z.array(hex)
});
export type Keyset = z.infer<typeof keysetSchema>;

export interface KeysetWrite { path: string; bytes: string | Buffer; mode: number }

const STAGED = ".keyset-staged";
const MAX_BYTES = 1024 * 1024;

class KeysetIncompleteError extends Error {
  constructor(readonly generation: number, detail: string) {
    super(`key set generation ${generation} is incomplete; run \`amc keys rotate --resume\` (${detail})`);
    this.name = "KeysetIncompleteError";
  }
}

function amcDir(workspace: string): string {
  return join(workspace, ".amc");
}

export function keysetPaths(workspace: string): { keyset: string; pending: string; rotations: string } {
  const keys = join(amcDir(workspace), "keys");
  return { keyset: join(keys, "keyset.json"), pending: join(keys, "keyset.pending.json"), rotations: join(keys, "rotations") };
}

function readKeysetFile(path: string): Keyset | null {
  if (!pathExists(path)) return null;
  return keysetSchema.parse(parseCanonicalJson(readRegularFileNoFollow(path, MAX_BYTES)));
}

const fileSha = (path: string): string | null => pathExists(path) ? sha256Hex(readRegularFileNoFollow(path, 256 * 1024 * 1024)) : null;
const markKey = (workspace: string) => highWaterKey("keyset", workspaceScope(workspace));

// Stat-keyed memo of the last complete check, so readers on hot paths re-hash only after a file changed (an atomic
// write always replaces the inode).
const checked = new Map<string, { stamp: string; keyset: Keyset | null }>();
function stamp(paths: readonly string[]): string {
  return paths.map(path => { try { const s = statSync(path); return `${s.ino}:${s.size}:${s.mtimeMs}`; } catch { return "-"; } }).join("|");
}

/**
 * Verifiers: refuse while a key change is pending. A public key replaced after its commit is classified by issuer
 * admission and the ledger trust root (UNANCHORED, distrusted), which name the substitution more precisely than this.
 */
export function assertNoPendingKeyset(workspace: string): void {
  const paths = keysetPaths(workspace);
  if (pathExists(paths.pending)) {
    const pending = readKeysetFile(paths.pending);
    throw new KeysetIncompleteError(pending?.generation ?? 0, "a key change was interrupted");
  }
}

/**
 * Signers: the committed key set, after checking that no transaction is pending, every public key and statement its
 * generation wrote still has its digest, and the generation is not older than this machine accepted. Null for a
 * workspace that has none yet.
 */
export function assertKeysetComplete(workspace: string): Keyset | null {
  const paths = keysetPaths(workspace);
  assertNoPendingKeyset(workspace);
  const keyset = readKeysetFile(paths.keyset);
  if (keyset === null) {
    const accepted = readHighWater(markKey(workspace));
    if (accepted !== null) throw new AntiRollbackError("ROLLBACK_DETECTED", `keyset.json is missing, but generation ${accepted.sequence} was accepted on this machine`);
    return null;
  }
  const listed = Object.keys(keyset.files).filter(pinned).map(rel => join(amcDir(workspace), rel));
  const now = stamp([paths.keyset, ...listed]);
  const memo = checked.get(workspace);
  if (memo && memo.stamp === now) return memo.keyset;
  for (const [rel, digest] of Object.entries(keyset.files)) {
    if (!pinned(rel)) continue;
    if (fileSha(join(amcDir(workspace), rel)) !== digest) throw new KeysetIncompleteError(keyset.generation, `${rel} does not have the digest generation ${keyset.generation} recorded`);
  }
  checkHighWater(markKey(workspace), keyset.generation, sha256Hex(canonicalize(keyset)));
  checked.set(workspace, { stamp: now, keyset });
  return keyset;
}

/** What readers re-check after the commit: published public keys and rotation statements. */
function pinned(rel: string): boolean {
  return rel.endsWith(".pub") || rel.startsWith("keys/statements/");
}

function recoveryName(rel: string): string {
  return rel.replace(/\//g, "__");
}

/**
 * Commits one generation: recovery copies, staged files, the pending intent, renames, then the commit rename. Any
 * failure before the commit rename leaves a pending generation that every signer and verifier refuses until resume.
 */
export function commitKeyset(workspace: string, change: { keys: Keyset["keys"]; writes: readonly KeysetWrite[]; statements?: readonly string[] }): Keyset {
  const paths = keysetPaths(workspace);
  ensureDir(dirname(paths.keyset));
  return withControlFileLock({ root: amcDir(workspace), name: "keyset", operation: () => {
    if (pathExists(paths.pending)) assertKeysetComplete(workspace);
    // A key set re-created after its files were removed continues past the generation this machine accepted.
    const current = pathExists(paths.keyset) ? assertKeysetComplete(workspace) : null;
    const generation = Math.max(current?.generation ?? 0, readHighWater(markKey(workspace))?.sequence ?? 0) + 1;
    const files = Object.fromEntries(change.writes.map(write => [relative(amcDir(workspace), write.path), sha256Hex(Buffer.from(write.bytes))]));
    const next = keysetSchema.parse({ type: "amc.keyset", version: 1, generation, keys: change.keys, files, statements: [...(change.statements ?? [])] });
    const manifest = change.writes.map(write => ({
      rel: relative(amcDir(workspace), write.path),
      existed: pathExists(write.path),
      mode: pathExists(write.path) ? statSync(write.path).mode & 0o777 : write.mode
    }));
    if (manifest.some(row => row.existed)) {
      const recovery = join(paths.rotations, `gen-${generation}`);
      ensureDir(recovery);
      for (const row of manifest) {
        if (row.existed) writeFileAtomic(join(recovery, recoveryName(row.rel)), readRegularFileNoFollow(join(amcDir(workspace), row.rel), 256 * 1024 * 1024), 0o600);
      }
      writeFileAtomic(join(recovery, "manifest.json"), JSON.stringify({ generation, previousGeneration: current?.generation ?? null, files: manifest }, null, 2), 0o600);
    }
    const bytes = canonicalize(next);
    try {
      for (const write of change.writes) writeFileAtomic(`${write.path}${STAGED}`, write.bytes, write.mode);
      writeFileAtomic(paths.pending, bytes, 0o600);
    } catch (error) {
      // Nothing was published yet: drop the stage, keep the previous generation in force.
      for (const write of change.writes) rmSync(`${write.path}${STAGED}`, { force: true });
      throw error;
    }
    for (const write of change.writes) renameSync(`${write.path}${STAGED}`, write.path);
    renameSync(paths.pending, paths.keyset);
    recordHighWater(markKey(workspace), generation, sha256Hex(bytes));
    return next;
  } });
}

/**
 * `amc keys rotate --resume`: completes a pending generation when every file is staged intact or already in place,
 * otherwise restores the previous bytes saved in `.amc/keys/rotations/gen-<N>/` and drops the pending generation.
 */
export function resumeKeyset(workspace: string): { action: "nothing-pending" | "completed" | "rolled-back"; generation: number | null } {
  const paths = keysetPaths(workspace);
  ensureDir(dirname(paths.keyset));
  return withControlFileLock({ root: amcDir(workspace), name: "keyset", operation: () => {
    if (!pathExists(paths.pending)) return { action: "nothing-pending" as const, generation: null };
    const pending = readKeysetFile(paths.pending)!;
    const entries = Object.entries(pending.files).map(([rel, digest]) => ({ rel, digest, target: join(amcDir(workspace), rel) }));
    const ready = entries.every(({ target, digest }) => fileSha(`${target}${STAGED}`) === digest || fileSha(target) === digest);
    if (ready) {
      for (const { target } of entries) if (pathExists(`${target}${STAGED}`)) renameSync(`${target}${STAGED}`, target);
      const bytes = canonicalize(pending);
      renameSync(paths.pending, paths.keyset);
      recordHighWater(markKey(workspace), pending.generation, sha256Hex(bytes));
      return { action: "completed" as const, generation: pending.generation };
    }
    const recovery = join(paths.rotations, `gen-${pending.generation}`);
    // No manifest: the generation replaced nothing, so rolling back removes everything it was creating.
    const manifest = pathExists(join(recovery, "manifest.json"))
      ? JSON.parse(readRegularFileNoFollow(join(recovery, "manifest.json"), MAX_BYTES).toString("utf8")) as { files: Array<{ rel: string; existed: boolean; mode: number }> }
      : { files: Object.keys(pending.files).map(rel => ({ rel, existed: false, mode: 0o600 })) };
    for (const { rel, existed, mode } of manifest.files) {
      const target = join(amcDir(workspace), rel);
      if (existed) writeFileAtomic(target, readRegularFileNoFollow(join(recovery, recoveryName(rel)), 256 * 1024 * 1024), mode);
      else rmSync(target, { force: true });
      rmSync(`${target}${STAGED}`, { force: true });
    }
    rmSync(paths.pending, { force: true });
    return { action: "rolled-back" as const, generation: pending.generation };
  } });
}

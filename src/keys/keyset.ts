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
 * of every file the generation replaced; what the generation had written is kept in `gen-<N>/discarded/`, never deleted.
 */
import { statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import {
  containedExists, ensureContainedDir, readContained, readContainedOrNull, removeContained, renameContained, statStamp, writeContained
} from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { LOCAL_PURPOSES } from "../vault/vaultPayload.js";
import { AntiRollbackError, checkHighWater, highWaterKey, highWaterPath, readHighWater, recordHighWater, workspaceScope } from "./highWater.js";

/**
 * The only files a key set may name, relative to `.amc`: the vault and its meta, key files, history backups, the key
 * revocation list and rotation statements. Anything else (`..`, an absolute path, a separator or NUL inside a name, a
 * look-alike Unicode slash) never reaches a filesystem call; the rest is contained by src/utils/containedFs.ts.
 */
const KEYSET_FILE = /^(?:vault\.amcvault|vault\.amcvault\.meta\.json|previous-vault\.amcvault|keys\/(?:[a-z][a-z-]{0,31}(?:_ed25519)?\.pub|[a-z][a-z-]{0,31}_history\.json(?:\.previous-[0-9a-f]{64})?|revocations\.signed\.json|statements\/[a-z][a-z-]{0,31}\/[1-9][0-9]{0,15}\.json))$/;
const relSchema = z.string().regex(KEYSET_FILE, "not a key-set file");
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const keysetSchema = z.strictObject({
  type: z.literal("amc.keyset"),
  version: z.literal(1),
  generation: z.number().int().positive().safe(),
  keys: z.partialRecord(z.enum(LOCAL_PURPOSES), hex),
  files: z.record(relSchema, hex),
  statements: z.array(hex)
});
const manifestSchema = z.strictObject({
  generation: z.number().int().positive().safe(),
  previousGeneration: z.number().int().positive().safe().nullable(),
  files: z.array(z.strictObject({ rel: relSchema, existed: z.boolean(), mode: z.number().int().min(0).max(0o777) }))
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

/** A key-set file's path relative to the workspace, after the allowlist (containment is checked at every use). */
export function keysetFileRel(rel: string): string {
  relSchema.parse(rel);
  return `.amc/${rel}`;
}

function relOf(workspace: string, path: string): string {
  const rel = relative(amcDir(workspace), path).split(sep).join("/");
  keysetFileRel(rel);
  return rel;
}

const KEYSET_REL = ".amc/keys/keyset.json";
const PENDING_REL = ".amc/keys/keyset.pending.json";
const rotationsRel = (generation: number) => `.amc/keys/rotations/gen-${generation}`;

function readKeysetFile(workspace: string, rel: string): Keyset | null {
  const bytes = readContainedOrNull(workspace, rel, MAX_BYTES);
  if (bytes === null) return null;
  const parsed = keysetSchema.safeParse((() => { try { return parseCanonicalJson(bytes); } catch { return null; } })());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`key set ${rel} is not a valid amc.keyset (${issue ? `${issue.path.join(".")}: ${issue.message}` : "unreadable"}); refusing to sign`);
  }
  return parsed.data;
}

const MAX_KEY_FILE = 256 * 1024 * 1024;
const fileSha = (workspace: string, rel: string): string | null => {
  const bytes = readContainedOrNull(workspace, rel, MAX_KEY_FILE);
  return bytes === null ? null : sha256Hex(bytes);
};
const markKey = (workspace: string) => highWaterKey("keyset", workspaceScope(workspace));

// Stat-keyed memo of the last complete check, so readers on hot paths re-hash only after a file changed (an atomic
// write always replaces the inode).
const checked = new Map<string, { stamp: string; keyset: Keyset | null }>();

/** Whether this workspace has, or this machine accepted, a key set: P1-08 purpose files must then exist. */
export function keysetDeclared(workspace: string): boolean {
  return containedExists(workspace, KEYSET_REL) || containedExists(workspace, PENDING_REL) || readHighWater(markKey(workspace)) !== null;
}

/**
 * Verifiers: refuse while a key change is pending. A public key replaced after its commit is classified by issuer
 * admission and the ledger trust root (UNANCHORED, distrusted), which name the substitution more precisely than this.
 */
export function assertNoPendingKeyset(workspace: string): void {
  if (containedExists(workspace, PENDING_REL)) {
    const pending = readKeysetFile(workspace, PENDING_REL);
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
  const keyset = readKeysetFile(workspace, KEYSET_REL);
  if (keyset === null) {
    const accepted = readHighWater(markKey(workspace));
    if (accepted !== null) throw new AntiRollbackError("ROLLBACK_DETECTED", `keyset.json is missing, but generation ${accepted.sequence} was accepted on this machine`);
    return null;
  }
  const listed = Object.keys(keyset.files).filter(pinned);
  const now = statStamp([paths.keyset, highWaterPath(), ...listed.map(rel => join(amcDir(workspace), rel))]);
  const memo = checked.get(workspace);
  if (memo && memo.stamp === now) return memo.keyset;
  for (const [rel, digest] of Object.entries(keyset.files)) {
    if (!pinned(rel)) continue;
    if (fileSha(workspace, keysetFileRel(rel)) !== digest) throw new KeysetIncompleteError(keyset.generation, `${rel} does not have the digest generation ${keyset.generation} recorded`);
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
  ensureContainedDir(workspace, ".amc/keys");
  return withControlFileLock({ root: amcDir(workspace), name: "keyset", operation: () => {
    if (containedExists(workspace, PENDING_REL)) assertKeysetComplete(workspace);
    // A key set re-created after its files were removed continues past the generation this machine accepted.
    const current = containedExists(workspace, KEYSET_REL) ? assertKeysetComplete(workspace) : null;
    const generation = Math.max(current?.generation ?? 0, readHighWater(markKey(workspace))?.sequence ?? 0) + 1;
    const rows = change.writes.map(write => ({ rel: relOf(workspace, write.path), write }));
    const files = Object.fromEntries(rows.map(({ rel, write }) => [rel, sha256Hex(Buffer.from(write.bytes))]));
    const next = keysetSchema.parse({ type: "amc.keyset", version: 1, generation, keys: change.keys, files, statements: [...(change.statements ?? [])] });
    const manifest = rows.map(({ rel, write }) => {
      const existed = containedExists(workspace, keysetFileRel(rel));
      return { rel, existed, mode: existed ? statSync(join(amcDir(workspace), rel)).mode & 0o777 : write.mode };
    });
    if (manifest.some(row => row.existed)) {
      for (const row of manifest) {
        if (row.existed) writeContained(workspace, `${rotationsRel(generation)}/${recoveryName(row.rel)}`, readContained(workspace, keysetFileRel(row.rel), MAX_KEY_FILE), 0o600);
      }
      writeContained(workspace, `${rotationsRel(generation)}/manifest.json`, JSON.stringify({ generation, previousGeneration: current?.generation ?? null, files: manifest }, null, 2), 0o600);
    }
    const bytes = canonicalize(next);
    try {
      for (const { rel, write } of rows) writeContained(workspace, `${keysetFileRel(rel)}${STAGED}`, write.bytes, write.mode);
      writeContained(workspace, PENDING_REL, bytes, 0o600);
    } catch (error) {
      // Nothing was published yet: drop the stage, keep the previous generation in force.
      for (const { rel } of rows) { try { removeContained(workspace, `${keysetFileRel(rel)}${STAGED}`); } catch { /* reported by the original error */ } }
      throw error;
    }
    for (const { rel } of rows) renameContained(workspace, `${keysetFileRel(rel)}${STAGED}`, keysetFileRel(rel));
    renameContained(workspace, PENDING_REL, KEYSET_REL);
    recordHighWater(markKey(workspace), generation, sha256Hex(bytes));
    return next;
  } });
}

/**
 * `amc keys rotate --resume`: completes a pending generation when every file is staged intact or already in place,
 * otherwise restores the previous bytes saved in `.amc/keys/rotations/gen-<N>/` and drops the pending generation.
 */
export function resumeKeyset(workspace: string): { action: "nothing-pending" | "completed" | "rolled-back"; generation: number | null } {
  ensureContainedDir(workspace, ".amc/keys");
  return withControlFileLock({ root: amcDir(workspace), name: "keyset", operation: () => {
    const pending = readKeysetFile(workspace, PENDING_REL);
    if (pending === null) return { action: "nothing-pending" as const, generation: null };
    const entries = Object.entries(pending.files).map(([rel, digest]) => ({ rel, digest, target: keysetFileRel(rel) }));
    const ready = entries.every(({ target, digest }) => fileSha(workspace, `${target}${STAGED}`) === digest || fileSha(workspace, target) === digest);
    if (ready) {
      for (const { target } of entries) if (containedExists(workspace, `${target}${STAGED}`)) renameContained(workspace, `${target}${STAGED}`, target);
      const bytes = canonicalize(pending);
      renameContained(workspace, PENDING_REL, KEYSET_REL);
      recordHighWater(markKey(workspace), pending.generation, sha256Hex(bytes));
      return { action: "completed" as const, generation: pending.generation };
    }
    const recovery = rotationsRel(pending.generation);
    // No manifest: the generation replaced nothing, so rolling back sets aside everything it was creating.
    const saved = readContainedOrNull(workspace, `${recovery}/manifest.json`, MAX_BYTES);
    const manifest = saved !== null
      ? manifestSchema.parse(JSON.parse(saved.toString("utf8")))
      : { files: Object.keys(pending.files).map(rel => ({ rel, existed: false, mode: 0o600 })) };
    if (manifest.files.some(row => !Object.hasOwn(pending.files, row.rel))) throw new Error(`key set generation ${pending.generation}: its recovery manifest names files the generation did not write`);
    // Rolling back never deletes key material: whatever the generation had put in place moves to discarded/ first.
    for (const { rel, existed, mode } of manifest.files) {
      const target = keysetFileRel(rel);
      if (containedExists(workspace, target)) renameContained(workspace, target, `${recovery}/discarded/${recoveryName(rel)}`);
      if (existed) writeContained(workspace, target, readContained(workspace, `${recovery}/${recoveryName(rel)}`, MAX_KEY_FILE), mode);
      if (containedExists(workspace, `${target}${STAGED}`)) renameContained(workspace, `${target}${STAGED}`, `${recovery}/discarded/${recoveryName(rel)}${STAGED}`);
    }
    removeContained(workspace, PENDING_REL);
    return { action: "rolled-back" as const, generation: pending.generation };
  } });
}

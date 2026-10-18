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
import { mkdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { assertOwnerMode } from "../mode/mode.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import {
  containedExists, ensureContainedDir, readContained, readContainedOrNull, removeContained, renameContained, statStamp, writeContained
} from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { ed25519KeyId } from "../trust/trustList.js";
import { SIGNING_ALGORITHMS, signingKeyId } from "./algorithmPolicy.js";
import { KEY_PROVIDER_IDS } from "./provider.js";
import { LOCAL_PURPOSES, type LocalPurpose } from "../vault/vaultPayload.js";
import { AntiRollbackError, compareHighWater, highWaterKey, highWaterPath, readHighWater, recordHighWater, workspaceScope } from "./highWater.js";

/**
 * The only files a key set may name, relative to `.amc`: the vault and its meta, key files, history backups, the key
 * revocation list and rotation statements. Anything else (`..`, an absolute path, a separator or NUL inside a name, a
 * look-alike Unicode slash) never reaches a filesystem call; the rest is contained by src/utils/containedFs.ts.
 */
const KEYSET_FILE = /^(?:vault\.amcvault|vault\.amcvault\.meta\.json|previous-vault\.amcvault|keys\/(?:[a-z][a-z-]{0,31}(?:_ed25519)?\.pub|[a-z][a-z-]{0,31}_history\.json(?:\.previous-[0-9a-f]{64})?|revocations\.signed\.json|statements\/[a-z][a-z-]{0,31}\/[1-9][0-9]{0,15}\.json))$/;
const relSchema = z.string().regex(KEYSET_FILE, "not a key-set file");
const hex = z.string().regex(/^[0-9a-f]{64}$/);
/** P2-08: a provider-held key bound to a purpose; its public key is `keys/<purpose>-provider.pub`, pinned in `files`. */
const providerBindingSchema = z.strictObject({
  provider: z.enum(KEY_PROVIDER_IDS).exclude(["file"]),
  keyId: hex,
  algorithm: z.enum(SIGNING_ALGORITHMS),
  protection: z.enum(["software", "hsm", "external", "unknown"]),
  protectionBasis: z.enum(["provider-metadata", "configured"])
});
export type ProviderBinding = z.infer<typeof providerBindingSchema>;
const keysetSchema = z.strictObject({
  type: z.literal("amc.keyset"),
  version: z.literal(1),
  generation: z.number().int().positive().safe(),
  keys: z.partialRecord(z.enum(LOCAL_PURPOSES), hex),
  files: z.record(relSchema, hex),
  statements: z.array(hex),
  providers: z.partialRecord(z.enum(LOCAL_PURPOSES), providerBindingSchema).optional()
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
// Pre-images and discarded files hold key material (an older vault, older public keys), so they live in AMC home, out of
// a workspace writer's reach; only the manifest, which names files and modes, stays in the workspace.
const amcHome = () => {
  const home = resolveAmcHome({ env: process.env });
  mkdirSync(home, { recursive: true, mode: 0o700 }); // the contained helpers need an existing root
  return home;
};
const recoveryRel = (workspace: string, generation: number) => `state/keyset-recovery/${workspaceScope(workspace)}/gen-${generation}`;

/** Where a generation's recovery copies and discarded files are kept (in AMC home). */
const intentRel = (workspace: string, generation: number) => `${recoveryRel(workspace, generation)}/intent.json`;

/** Whether commitKeyset on this machine recorded, before writing to the workspace, that it was committing these bytes. */
function recordedIntent(workspace: string, generation: number, keysetBytes: string): boolean {
  const raw = readContainedOrNull(amcHome(), intentRel(workspace, generation), MAX_BYTES);
  if (raw === null) return false;
  let intent: unknown = null;
  try { intent = JSON.parse(raw.toString("utf8")); } catch { return false; } // an unreadable record names nothing
  const record = intent as { generation?: unknown; sha256?: unknown } | null;
  return record?.generation === generation && record.sha256 === sha256Hex(keysetBytes);
}

export function keysetRecoveryDir(workspace: string, generation: number): string {
  return join(amcHome(), recoveryRel(workspace, generation));
}

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
  return containedExists(workspace, KEYSET_REL) || containedExists(workspace, PENDING_REL) || readHighWater(markKey(workspace)) !== null
    || readHighWater(adoptedKey(workspace)) !== null;
}

/** This machine's committed mark for the workspace's key set: null when it never committed one here. */
export function keysetCommittedMark(workspace: string): { sequence: number; sha256: string } | null {
  return readHighWater(markKey(workspace));
}

/** Files every P1-08 key set comes with: one of them without keyset.json means the key set was removed. */
const PURPOSE_FILES = [...LOCAL_PURPOSES.map(purpose => `.amc/keys/${purpose}.pub`), ".amc/keys/revocations.signed.json"];
const adoptedKey = (workspace: string) => highWaterKey("keyset-adopted", workspaceScope(workspace));
const warnedAdoptions = new Set<string>();
const adoptionNotes: string[] = [];

/**
 * Trust on first use, made visible: a machine that never committed this workspace's key set takes it as found, records
 * that it did (a later older or forked key set is then refused here too) and says so once per process, so a receipt or
 * verify output can tell an unanchored key set from one this machine committed.
 */
function adoptUnanchored(workspace: string, keyset: Keyset): void {
  recordHighWater(adoptedKey(workspace), keyset.generation, sha256Hex(canonicalize(keyset)));
  const note = `${workspaceScope(workspace)}#${keyset.generation}`;
  if (warnedAdoptions.has(note)) return;
  // Printed when the process exits, after any verdict, so a verifier's first stderr line stays its verdict.
  if (warnedAdoptions.size === 0) process.once("exit", () => { for (const line of adoptionNotes) console.warn(line); });
  warnedAdoptions.add(note);
  adoptionNotes.push(`[amc] key set generation ${keyset.generation} of ${workspace} adopted unanchored (trust on first use): this machine never committed it, `
    + "so a workspace writer could have replaced it. Pin keys (a trust list, --pubkey, --expect-monitor) for a verdict that must not depend on it.");
}

/** The adoption notes this process will print on exit (for a receipt or a verify report to include now). */
export function keysetAdoptionNotes(): readonly string[] {
  return adoptionNotes;
}

/** How this machine holds the workspace's key set: committed here, adopted on first use, or none. */
export function keysetAnchoring(workspace: string): { state: "committed" | "adopted-unanchored" | "none"; generation: number | null } {
  const committed = readHighWater(markKey(workspace));
  if (committed !== null) return { state: "committed", generation: committed.sequence };
  const adopted = readHighWater(adoptedKey(workspace));
  return adopted === null ? { state: "none", generation: null } : { state: "adopted-unanchored", generation: adopted.sequence };
}

/** Verifiers and signers: refuse while a key change is pending. */
export function assertNoPendingKeyset(workspace: string): void {
  if (containedExists(workspace, PENDING_REL)) {
    const pending = readKeysetFile(workspace, PENDING_REL);
    throw new KeysetIncompleteError(pending?.generation ?? 0, "a key change was interrupted");
  }
}

const bound = new Map<string, { stamp: string; keyset: Keyset | null }>();

/**
 * The committed key set, bound to this machine's mark. The mark (generation and digest) is raised only when this machine
 * commits or resumes a generation, never on a read, so keyset.json, which is unsigned, cannot vouch for itself: once a
 * generation was committed here the file must be exactly that generation. An older one is ROLLBACK_DETECTED, other
 * bytes at it FORK_DETECTED, and a newer one was never committed on this machine and is refused. A machine that never
 * changed keys for this workspace has no mark and takes the file as found (portable verdicts need pinned keys).
 */
export function boundKeyset(workspace: string, opts: { allowUnboundFiles?: boolean } = {}): Keyset | null {
  assertNoPendingKeyset(workspace);
  const stamp = statStamp([keysetPaths(workspace).keyset, highWaterPath()]);
  const memo = bound.get(workspace);
  if (memo && memo.stamp === stamp) return memo.keyset;
  const keyset = readKeysetFile(workspace, KEYSET_REL);
  const mark = readHighWater(markKey(workspace));
  if (mark !== null) {
    if (keyset === null) throw new AntiRollbackError("ROLLBACK_DETECTED", `keyset.json is missing, but this machine committed generation ${mark.sequence}; run \`amc keys rotate --restore\` (owner mode)`);
    if (keyset.generation > mark.sequence) {
      throw new AntiRollbackError("FORK_DETECTED", `key set generation ${keyset.generation} was never committed on this machine (it committed ${mark.sequence}); refusing it. `
        + "Run `amc keys rotate --restore` (owner mode) to put back the key set this machine committed");
    }
    compareHighWater(markKey(workspace), mark, keyset.generation, sha256Hex(canonicalize(keyset)));
  } else {
    const adopted = readHighWater(adoptedKey(workspace));
    if (keyset === null) {
      if (adopted !== null) {
        throw new AntiRollbackError("ROLLBACK_DETECTED", `keyset.json is missing, but this machine adopted generation ${adopted.sequence} (sha256 ${adopted.sha256}); `
          + "copy that keyset.json back from the machine that committed it (there: `amc keys rotate --restore`)");
      }
      // Not memoized: a removed key set is noticed as soon as any purpose file is present.
      const unbound = PURPOSE_FILES.filter(rel => containedExists(workspace, rel));
      if (unbound.length > 0 && opts.allowUnboundFiles !== true) {
        throw new AntiRollbackError("ROLLBACK_DETECTED", `keyset.json is missing from a workspace with purpose key files (${unbound.join(", ")}); refusing every key. `
          + "On the machine that committed the key set run `amc keys rotate --restore`; elsewhere copy keyset.json from it. Files a 1.x workspace "
          + "never wrote can be moved aside with `amc keys rotate --quarantine-unbound-pub` (owner mode).");
      }
      return null;
    }
    const sha256 = sha256Hex(canonicalize(keyset));
    if (adopted === null) {
      adoptUnanchored(workspace, keyset);
    } else if (keyset.generation > adopted.sequence) {
      // A newer key set this machine never committed is a writer's as much as the owner's: only the owner accepts it.
      throw new AntiRollbackError("FORK_DETECTED", `key set generation ${keyset.generation} (sha256 ${sha256}) is newer than generation ${adopted.sequence}, which this machine `
        + "adopted, and was not committed here. Once the committing machine shows that digest (`amc keys list`), accept it with "
        + `\`amc keys rotate --accept ${keyset.generation} --digest ${sha256}\` (owner mode)`);
    } else {
      compareHighWater(adoptedKey(workspace), adopted, keyset.generation, sha256);
    }
  }
  bound.set(workspace, { stamp: statStamp([keysetPaths(workspace).keyset, highWaterPath()]), keyset });
  return keyset;
}

/** The workspace key set's generation and digest as found (what the committing machine shows for `--accept`). */
export function keysetIdentity(workspace: string): { generation: number; sha256: string } | null {
  const keyset = readKeysetFile(workspace, KEYSET_REL);
  return keyset === null ? null : { generation: keyset.generation, sha256: sha256Hex(canonicalize(keyset)) };
}

/** Opens a vault envelope with the owner's passphrase and returns its key ids, or null when it does not open. */
export type VaultKeyIds = (envelope: Buffer) => Keyset["keys"] | null;

/** The owner's proof for a key-set repair: the workspace vault opens with the real passphrase (its key ids, or a refusal). */
function ownerVaultKeyIds(workspace: string, vaultKeyIds: VaultKeyIds, action: string): Keyset["keys"] {
  const envelope = readContainedOrNull(workspace, ".amc/vault.amcvault", MAX_KEY_FILE);
  const ids = envelope === null ? null : vaultKeyIds(envelope);
  if (ids === null) throw new Error(`${action} needs the workspace vault opened with the owner's passphrase; it ${envelope === null ? "is missing" : "does not open with this passphrase"}`);
  return ids;
}

/**
 * `amc keys rotate --accept <generation> --digest <sha256>` (owner mode), on a machine that adopted the key set: accepts
 * exactly the next generation (a gap only with `allowGap`, a stated reason), whose bytes, read once, have the digest the
 * committing machine showed, and whose keys the workspace vault, opened with the owner's passphrase, actually holds.
 */
export function acceptAdoptedKeyset(workspace: string, input: { generation: number; digest: string; vaultKeyIds: VaultKeyIds; allowGap?: string }): { generation: number; sha256: string } {
  assertOwnerMode(workspace, "keys accept");
  assertNoPendingKeyset(workspace);
  if (readHighWater(markKey(workspace)) !== null) throw new Error("this machine committed this workspace's key set; it never accepts another one (use `amc keys rotate --restore`)");
  const adopted = readHighWater(adoptedKey(workspace));
  if (adopted === null) throw new Error("this machine has not adopted this workspace's key set; its first read adopts it, so there is nothing to accept");
  // One read: the digest checked and the digest recorded are of these bytes, whatever the file holds a moment later.
  const bytes = readContainedOrNull(workspace, KEYSET_REL, MAX_BYTES);
  const parsed = bytes === null ? null : keysetSchema.safeParse((() => { try { return parseCanonicalJson(bytes); } catch { return null; } })());
  const keyset = parsed?.success ? parsed.data : null;
  const sha256 = keyset === null ? null : sha256Hex(canonicalize(keyset));
  if (keyset === null || keyset.generation !== input.generation || sha256 !== input.digest.trim().toLowerCase()) {
    throw new Error(`the workspace's keyset.json is ${keyset === null ? "missing or invalid" : `generation ${keyset.generation} with sha256 ${sha256}`}, `
      + `not generation ${input.generation} with sha256 ${input.digest}; nothing was accepted`);
  }
  if (keyset.generation <= adopted.sequence) throw new AntiRollbackError("ROLLBACK_DETECTED", `generation ${keyset.generation} is not newer than the adopted ${adopted.sequence}; nothing was accepted`);
  if (keyset.generation !== adopted.sequence + 1 && (input.allowGap === undefined || input.allowGap.trim().length < 20)) {
    throw new Error(`generation ${keyset.generation} skips generations after the adopted ${adopted.sequence}; accept it only with --allow-gap "<a reason of 20+ characters>"`);
  }
  const held = ownerVaultKeyIds(workspace, input.vaultKeyIds, "accepting a key set");
  if (LOCAL_PURPOSES.some(purpose => held[purpose] !== keyset.keys[purpose])) {
    throw new Error(`the workspace vault does not hold the keys generation ${keyset.generation} names; nothing was accepted (a key set the owner's vault does not back was written by someone else)`);
  }
  recordHighWater(adoptedKey(workspace), keyset.generation, sha256);
  logRepair(workspace, { action: "accept", generation: keyset.generation, sha256, ...(input.allowGap === undefined ? {} : { allowGap: input.allowGap }) });
  return { generation: keyset.generation, sha256 };
}

/**
 * `amc keys rotate --quarantine-unbound-pub` (owner mode): with no keyset.json and no key set committed here, moves the
 * purpose key files and key revocation list no key set binds (strays a 1.x workspace never wrote) to
 * `.amc/quarantine/keys/<time>/`, and logs each move in AMC home. Moves, never deletes.
 */
export function quarantineUnboundPurposeFiles(workspace: string, opts: { vaultKeyIds: VaultKeyIds }): { quarantined: string[]; directory: string | null } {
  assertOwnerMode(workspace, "keys quarantine");
  ownerVaultKeyIds(workspace, opts.vaultKeyIds, "quarantining unbound key-set files");
  const unbound: string[] = [];
  // A pending generation with no write-ahead record in AMC home was not started here: it and its staged files go.
  const pending = readKeysetFile(workspace, PENDING_REL);
  if (pending !== null && !recordedIntent(workspace, pending.generation, canonicalize(pending))) {
    unbound.push(PENDING_REL, ...Object.keys(pending.files).map(rel => `${keysetFileRel(rel)}${STAGED}`).filter(rel => containedExists(workspace, rel)));
    if (containedExists(workspace, `${rotationsRel(pending.generation)}/manifest.json`)) unbound.push(`${rotationsRel(pending.generation)}/manifest.json`);
  } else {
    assertNoPendingKeyset(workspace);
  }
  // Purpose files are unbound only with no keyset.json and no key set this machine committed or adopted: a marked key set
  // names its files, which are restored or copied back, never moved aside.
  const marked = readHighWater(markKey(workspace)) !== null || readHighWater(adoptedKey(workspace)) !== null;
  if (!marked && !containedExists(workspace, KEYSET_REL)) {
    const candidates = [...PURPOSE_FILES, ...LOCAL_PURPOSES.filter(p => p !== "lease" && p !== "session").map(p => `.amc/keys/${p}_history.json`)];
    unbound.push(...candidates.filter(rel => containedExists(workspace, rel)));
  }
  if (unbound.length === 0) return { quarantined: [], directory: null };
  const dir = `.amc/quarantine/keys/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  for (const rel of unbound) {
    const bytes = readContained(workspace, rel, MAX_KEY_FILE);
    renameContained(workspace, rel, `${dir}/${rel.replace(/^\.amc\//, "").replace(/\//g, "__")}`);
    logRepair(workspace, { action: "quarantine", file: rel, sha256: sha256Hex(bytes), to: dir });
  }
  return { quarantined: unbound, directory: join(workspace, dir) };
}

/** One line per explicit owner repair, in AMC home (outside the workspace the repair changes). */
function logRepair(workspace: string, entry: Record<string, unknown>): void {
  const rel = `state/keyset-recovery/${workspaceScope(workspace)}/repairs.jsonl`;
  const home = amcHome();
  const prior = readContainedOrNull(home, rel, MAX_BYTES)?.toString("utf8") ?? "";
  writeContained(home, rel, `${prior}${JSON.stringify({ ts: new Date().toISOString(), workspace, ...entry })}\n`, 0o600);
}

/**
 * Refuses a public key whose id is not the one the bound key set names for `purpose` (a role's file names its primary
 * purpose's key). A workspace without a key set has nothing to bind and passes.
 */
export function assertBoundPublicKey(workspace: string, purpose: LocalPurpose, publicKeyPem: string): void {
  const keyset = boundKeyset(workspace);
  if (keyset === null) return;
  const named = keyset.keys[purpose];
  if (named === undefined || ed25519KeyId(publicKeyPem) !== named) {
    throw new Error(`the ${purpose} public key is not the key generation ${keyset.generation} names (${named ?? "none"}); refusing a replaced public key`);
  }
}

/**
 * The provider key the committed key set binds to `purpose` (P2-08) and its pinned public key, or null when the purpose
 * signs with the vault. Throws when the key set is incomplete or the public key is not the bound one.
 */
export function boundProviderKey(workspace: string, purpose: LocalPurpose): { binding: ProviderBinding; publicKeyPem: string } | null {
  // Presence from the mark-bound key set; the digest checks only once a binding exists, so vault-only readers see no change.
  const binding = boundKeyset(workspace)?.providers?.[purpose];
  if (binding === undefined) return null;
  const keyset = assertKeysetComplete(workspace)!;
  const publicKeyPem = readContainedOrNull(workspace, keysetFileRel(`keys/${purpose}-provider.pub`), 64 * 1024)?.toString("utf8") ?? null;
  if (publicKeyPem === null || signingKeyId(publicKeyPem) !== binding.keyId) {
    throw new KeysetIncompleteError(keyset.generation, `keys/${purpose}-provider.pub is missing or is not the ${binding.provider} key generation ${keyset.generation} binds`);
  }
  return { binding, publicKeyPem };
}

/**
 * Signers: the bound key set (above), after checking that every public key and statement it pins still has its digest.
 * Null for a workspace that has none yet.
 */
export function assertKeysetComplete(workspace: string, opts: { allowUnboundFiles?: boolean } = {}): Keyset | null {
  const keyset = boundKeyset(workspace, opts);
  if (keyset === null) return null;
  const listed = Object.keys(keyset.files).filter(pinned);
  const now = statStamp([keysetPaths(workspace).keyset, highWaterPath(), ...listed.map(rel => join(amcDir(workspace), rel))]);
  const memo = checked.get(workspace);
  if (memo && memo.stamp === now) return memo.keyset;
  for (const rel of listed) {
    if (fileSha(workspace, keysetFileRel(rel)) !== keyset.files[rel]) throw new KeysetIncompleteError(keyset.generation, `${rel} does not have the digest generation ${keyset.generation} recorded`);
  }
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
export function commitKeyset(workspace: string, change: { keys: Keyset["keys"]; writes: readonly KeysetWrite[]; statements?: readonly string[]; providers?: Keyset["providers"] }): Keyset {
  assertOwnerMode(workspace, "keys commit");
  ensureContainedDir(workspace, ".amc/keys");
  return withControlFileLock({ root: amcDir(workspace), name: "keyset", operation: () => {
    // Refuses a pending change, and, once this machine committed a key set here, a keyset.json that is missing or is not
    // exactly that generation: a lost key set is restored by `amc keys rotate --restore`, never re-created.
    // The first generation binds purpose files that already match what it writes (publicKeyWrites refuses any other).
    const current = assertKeysetComplete(workspace, { allowUnboundFiles: true });
    const generation = Math.max(current?.generation ?? 0, readHighWater(markKey(workspace))?.sequence ?? 0) + 1;
    const rows = change.writes.map(write => ({ rel: relOf(workspace, write.path), write }));
    const written = Object.fromEntries(rows.map(({ rel, write }) => [rel, sha256Hex(Buffer.from(write.bytes))]));
    // Every public key and statement in force stays pinned, not only the ones this generation rewrote.
    const carried = Object.entries(current?.files ?? {}).filter(([rel]) => pinned(rel) && !Object.hasOwn(written, rel));
    const files = { ...Object.fromEntries(carried), ...written };
    // Provider bindings (P2-08) carry forward unless this generation sets them; none at all keeps the 1.x-era bytes.
    const providers = change.providers ?? current?.providers;
    const next = keysetSchema.parse({ type: "amc.keyset", version: 1, generation, keys: change.keys, files, statements: [...(change.statements ?? [])],
      ...(providers && Object.keys(providers).length > 0 ? { providers } : {}) });
    const manifest = rows.map(({ rel, write }) => {
      const existed = containedExists(workspace, keysetFileRel(rel));
      return { rel, existed, mode: existed ? statSync(join(amcDir(workspace), rel)).mode & 0o777 : write.mode };
    });
    // Write-ahead, outside the workspace and before anything is written to it: the generation and digest this machine
    // is about to commit. Resume finishes only a pending generation this record names.
    const bytes = canonicalize(next);
    writeContained(amcHome(), intentRel(workspace, generation), JSON.stringify({ generation, sha256: sha256Hex(bytes) }), 0o600);
    // Always written before the pending intent: resume refuses a pending generation that has no manifest.
    for (const row of manifest) {
      if (row.existed) writeContained(amcHome(), `${recoveryRel(workspace, generation)}/${recoveryName(row.rel)}`, readContained(workspace, keysetFileRel(row.rel), MAX_KEY_FILE), 0o600);
    }
    writeContained(workspace, `${rotationsRel(generation)}/manifest.json`, JSON.stringify({ generation, previousGeneration: current?.generation ?? null, files: manifest }, null, 2), 0o600);
    try {
      for (const { rel, write } of rows) writeContained(workspace, `${keysetFileRel(rel)}${STAGED}`, write.bytes, write.mode);
      writeContained(workspace, PENDING_REL, bytes, 0o600);
    } catch (error) {
      // Nothing was published yet: drop the stage, keep the previous generation in force.
      for (const { rel } of rows) { try { removeContained(workspace, `${keysetFileRel(rel)}${STAGED}`); } catch { /* reported by the original error */ } }
      throw error;
    }
    for (const { rel } of rows) renameContained(workspace, `${keysetFileRel(rel)}${STAGED}`, keysetFileRel(rel));
    keepCommittedCopies(workspace, generation, rows.map(({ rel, write }) => ({ rel, bytes: Buffer.from(write.bytes) })), bytes);
    // The mark rises before the commit rename: a crash in between leaves a pending generation that resume rolls forward.
    recordHighWater(markKey(workspace), generation, sha256Hex(bytes));
    renameContained(workspace, PENDING_REL, KEYSET_REL);
    return next;
  } });
}

/**
 * `amc keys rotate --resume`: completes a pending generation when every file is staged intact or already in place,
 * otherwise restores the previous bytes saved in `.amc/keys/rotations/gen-<N>/` and drops the pending generation.
 */
export function resumeKeyset(workspace: string, opts: { vaultKeyIds: VaultKeyIds }): { action: "nothing-pending" | "completed" | "rolled-back"; generation: number | null } {
  assertOwnerMode(workspace, "keys resume");
  ensureContainedDir(workspace, ".amc/keys");
  return withControlFileLock({ root: amcDir(workspace), name: "keyset", operation: () => {
    const pending = readKeysetFile(workspace, PENDING_REL);
    if (pending === null) return { action: "nothing-pending" as const, generation: null };
    // Only the generation commitKeyset would write next (or one it already marked before crashing), with the manifest it
    // writes first, is ever resumed.
    const mark = readHighWater(markKey(workspace));
    const next = Math.max(readKeysetFile(workspace, KEYSET_REL)?.generation ?? 0, mark?.sequence ?? 0) + 1;
    const bytes = canonicalize(pending);
    if (!recordedIntent(workspace, pending.generation, bytes)) {
      throw new Error(`pending key set generation ${pending.generation} has no write-ahead record in AMC home (${join(amcHome(), intentRel(workspace, pending.generation))}): `
        + "AMC on this machine never started it, so it is not resumed. Move it and its staged files to .amc/quarantine/keys/ with "
        + "`amc keys rotate --quarantine-unbound-pub` (owner mode); then, if this machine committed the key set, `amc keys rotate --restore`.");
    }
    const markedHere = mark !== null && mark.sequence === pending.generation && mark.sha256 === sha256Hex(bytes);
    const recovery = rotationsRel(pending.generation);
    const saved = readContainedOrNull(workspace, `${recovery}/manifest.json`, MAX_BYTES);
    if ((pending.generation !== next && !markedHere) || saved === null) {
      throw new Error(`pending key set generation ${pending.generation} is not one this workspace started (next generation ${next}${saved === null ? ", no recovery manifest" : ""}); `
        + `refusing to resume it. Inspect ${PENDING_REL} before removing it`);
    }
    const manifest = manifestSchema.parse(JSON.parse(saved.toString("utf8")));
    if (manifest.files.some(row => !Object.hasOwn(pending.files, row.rel))) throw new Error(`key set generation ${pending.generation}: its recovery manifest names files the generation did not write`);
    const home = amcHome();
    const saves = recoveryRel(workspace, pending.generation);
    // Nothing is ever overwritten or deleted: a file that would be replaced is copied to AMC home first, under a fresh name.
    const discard = (from: string, rel: string, suffix = "") => {
      const base = `${saves}/discarded/${recoveryName(rel)}${suffix}`;
      let name = base;
      for (let n = 1; containedExists(home, name); n += 1) name = `${base}.${n}`;
      writeContained(home, name, readContained(workspace, from, MAX_KEY_FILE), 0o600);
      removeContained(workspace, from);
    };
    const entries = Object.entries(pending.files).map(([rel, digest]) => ({ rel, digest, target: keysetFileRel(rel) }));
    const ready = entries.every(({ target, digest }) => fileSha(workspace, `${target}${STAGED}`) === digest || fileSha(workspace, target) === digest);
    // The owner's vault, opened with the real passphrase, must hold the keys the generation that goes live names.
    const vaultDigest = pending.files["vault.amcvault"];
    const vaultCandidates = [".amc/vault.amcvault.keyset-staged", ".amc/vault.amcvault"].map(rel => readContainedOrNull(workspace, rel, MAX_KEY_FILE));
    if (ready) {
      const live = vaultCandidates.find(candidate => candidate !== null && (vaultDigest === undefined || sha256Hex(candidate) === vaultDigest)) ?? null;
      const held = live === null ? null : opts.vaultKeyIds(live);
      if (held === null || LOCAL_PURPOSES.some(purpose => held[purpose] !== pending.keys[purpose])) {
        throw new Error(`key set generation ${pending.generation}: the vault it puts in place ${held === null ? "does not open with this passphrase" : "does not hold the keys it names"}; not resumed`);
      }
    } else {
      const preImage = readContainedOrNull(home, `${saves}/${recoveryName("vault.amcvault")}`, MAX_KEY_FILE);
      if (![...vaultCandidates, preImage].some(candidate => candidate !== null && opts.vaultKeyIds(candidate) !== null)) {
        throw new Error(`key set generation ${pending.generation}: rolling back needs the vault opened with the owner's passphrase; no vault copy opens with it`);
      }
    }
    if (ready) {
      for (const { rel, digest, target } of entries) {
        if (!containedExists(workspace, `${target}${STAGED}`)) continue;
        if (containedExists(workspace, target) && fileSha(workspace, target) !== digest) discard(target, rel);
        renameContained(workspace, `${target}${STAGED}`, target);
      }
      keepCommittedCopies(workspace, pending.generation, manifest.files.map(({ rel }) => ({ rel, bytes: readContained(workspace, keysetFileRel(rel), MAX_KEY_FILE) })), bytes);
      if (!markedHere) recordHighWater(markKey(workspace), pending.generation, sha256Hex(bytes));
      renameContained(workspace, PENDING_REL, KEYSET_REL);
      return { action: "completed" as const, generation: pending.generation };
    }
    if (markedHere) throw new Error(`key set generation ${pending.generation} was already committed on this machine, but its files are not intact; restore them, rolling back would undo it`);
    for (const { rel, existed, mode } of manifest.files) {
      const target = keysetFileRel(rel);
      if (containedExists(workspace, target)) discard(target, rel);
      if (existed) writeContained(workspace, target, readContained(home, `${saves}/${recoveryName(rel)}`, MAX_KEY_FILE), mode);
      if (containedExists(workspace, `${target}${STAGED}`)) discard(`${target}${STAGED}`, rel, STAGED);
    }
    removeContained(workspace, PENDING_REL);
    return { action: "rolled-back" as const, generation: pending.generation };
  } });
}

/** The committed bytes of a generation (its key set and every file it wrote), kept in AMC home for an explicit restore. */
function keepCommittedCopies(workspace: string, generation: number, files: ReadonlyArray<{ rel: string; bytes: Buffer }>, keysetBytes: string): void {
  const home = amcHome();
  const dir = `${recoveryRel(workspace, generation)}/committed`;
  for (const { rel, bytes } of files) writeContained(home, `${dir}/${recoveryName(rel)}`, bytes, 0o600);
  writeContained(home, `${dir}/keyset.json`, keysetBytes, 0o600);
}

const restoredMode = (rel: string) => rel.endsWith(".pub") || rel.endsWith(".meta.json") || rel.startsWith("keys/statements/") || rel === "keys/revocations.signed.json" ? 0o644 : 0o600;

/**
 * `amc keys rotate --restore` (owner mode): puts back the key set this machine committed, from the copies kept in AMC
 * home. keyset.json comes back only when its copy matches this machine's mark, and with it every file it lists that is
 * missing or, for a public key or statement, lost its digest; a file that is replaced is copied aside first. Nothing is
 * restored automatically, and nothing this machine did not commit.
 */
export function restoreCommittedKeyset(workspace: string, opts: { vaultKeyIds: VaultKeyIds }): {
  generation: number; restored: string[]; missing: string[]; vault: "matches" | "restored";
} {
  assertOwnerMode(workspace, "keys restore");
  ensureContainedDir(workspace, ".amc/keys");
  return withControlFileLock({ root: amcDir(workspace), name: "keyset", operation: () => {
    const mark = readHighWater(markKey(workspace));
    if (mark === null) throw new Error("this machine never committed a key set for this workspace; there is nothing to restore");
    const home = amcHome();
    const copyOf = (generation: number, name: string) => readContainedOrNull(home, `${recoveryRel(workspace, generation)}/committed/${name}`, MAX_KEY_FILE);
    const keysetBytes = copyOf(mark.sequence, "keyset.json");
    if (keysetBytes === null || sha256Hex(keysetBytes) !== mark.sha256) {
      throw new Error(`AMC home holds no copy of key set generation ${mark.sequence} that matches this machine's mark; nothing was restored`);
    }
    const keyset = keysetSchema.parse(parseCanonicalJson(keysetBytes));
    const restored: string[] = [];
    const missing: string[] = [];
    for (const [rel, digest] of Object.entries(keyset.files)) {
      const target = keysetFileRel(rel);
      const present = fileSha(workspace, target);
      if (present === digest || (present !== null && !pinned(rel))) continue; // a vault, list or history that changed since stays
      let bytes: Buffer | null = null;
      for (let generation = mark.sequence; generation >= 1 && bytes === null; generation -= 1) {
        const copy = copyOf(generation, recoveryName(rel));
        if (copy !== null && sha256Hex(copy) === digest) bytes = copy;
      }
      if (bytes === null) { missing.push(rel); continue; }
      if (present !== null) writeContained(home, `${recoveryRel(workspace, mark.sequence)}/discarded/restore-${Date.now()}-${recoveryName(rel)}`, readContained(workspace, target, MAX_KEY_FILE), 0o600);
      writeContained(workspace, target, bytes, restoredMode(rel));
      restored.push(rel);
    }
    writeContained(workspace, KEYSET_REL, keysetBytes, 0o600);
    const vault = restoreVaultHolding(workspace, keyset, mark.sequence, copyOf, opts.vaultKeyIds);
    if (vault === "restored") restored.push("vault.amcvault");
    return { generation: mark.sequence, restored, missing, vault };
  } });
}

/** The v1 vault a migration replaced, kept in AMC home with the recovery copies (it holds the pre-migration keys). */
export function keepPreviousVault(workspace: string, envelope: string): void {
  const rel = `state/keyset-recovery/${workspaceScope(workspace)}/previous-vault.amcvault`;
  const home = amcHome();
  if (!containedExists(home, rel)) writeContained(home, rel, envelope, 0o600);
}

const sameKeys = (a: Keyset["keys"], b: Keyset["keys"]) => LOCAL_PURPOSES.every(purpose => a[purpose] === b[purpose]);

/**
 * A vault that is present with other bytes is not trusted by digest (secret writes change it): opened with the owner's
 * passphrase, it must hold the key ids the committed key set names. If it does not (an older vault swapped in), the
 * newest committed copy that does is put back, the replaced one copied aside; if none does, the refusal names the
 * mismatch and the next step, never the same advice again.
 */
function restoreVaultHolding(workspace: string, keyset: Keyset, generation: number, copyOf: (generation: number, name: string) => Buffer | null,
  vaultKeyIds: VaultKeyIds): "matches" | "restored" {
  const present = readContainedOrNull(workspace, ".amc/vault.amcvault", MAX_KEY_FILE);
  const presentIds = present === null ? null : vaultKeyIds(present);
  if (presentIds !== null && sameKeys(presentIds, keyset.keys)) return "matches";
  for (let candidate = generation; candidate >= 1; candidate -= 1) {
    const copy = copyOf(candidate, recoveryName("vault.amcvault"));
    const ids = copy === null ? null : vaultKeyIds(copy);
    if (copy === null || ids === null || !sameKeys(ids, keyset.keys)) continue;
    if (present !== null) writeContained(amcHome(), `${recoveryRel(workspace, generation)}/discarded/restore-${Date.now()}-vault.amcvault`, present, 0o600);
    writeContained(workspace, ".amc/vault.amcvault", copy, 0o600);
    logRepair(workspace, { action: "restore-vault", fromGeneration: candidate });
    return "restored";
  }
  throw new Error(`the vault ${present === null ? "is missing" : presentIds === null ? "does not open with this passphrase" : `holds key ids ${JSON.stringify(presentIds)}`}, `
    + `not the ones key set generation ${generation} names (${JSON.stringify(keyset.keys)}), and AMC home holds no committed vault copy that does. `
    + `keyset.json was restored; restore vault.amcvault from a backup taken after generation ${generation}, or check the passphrase.`);
}

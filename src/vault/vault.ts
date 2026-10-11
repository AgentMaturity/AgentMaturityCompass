import { generateKeyPairSync } from "node:crypto";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ensureDir, pathExists, writeFileAtomic, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { decryptVaultPayload, encryptVaultPayload, type VaultEnvelope } from "./vaultCrypto.js";
import { buildKeyHistoryEntry } from "../crypto/keyHistoryChain.js";
import { publicKeyFromPrivate, sealKeyHistory, verifyKeyHistoryEnvelope, type KeyHistorySubject } from "../crypto/keyHistoryEnvelope.js";
import { keyHistoryMarkKey, nextKeyHistoryRevision, recordHighWater } from "../keys/highWater.js";
import { assertKeysetComplete, commitKeyset, type KeysetWrite } from "../keys/keyset.js";
import { machineMark } from "../keys/anchors.js";
import { assertKeyNotRevoked, keyRevocationLocation } from "../keys/keyRevocations.js";
import { encodeSignedRevocationList, signRevocationList } from "../keys/revocationList.js";
import { containedExists } from "../utils/containedFs.js";
import { canonicalize } from "../utils/json.js";
import {
  LOCAL_PURPOSES, ROLE_PRIMARY_PURPOSE, parseVaultPayload, payloadFromRoleKeys, purposeKey, roleOfPurpose, safeSecrets,
  type LocalPurpose, type VaultPayloadV2
} from "./vaultPayload.js";

export { rotateMonitorKeyInVault } from "../keys/purposeKeys.js";

export type VaultKeyKind = "monitor" | "auditor" | "lease" | "session";
type VaultPayload = VaultPayloadV2;

/**
 * VaultSession holds the unlocked vault state in memory.
 * SECURITY NOTE: The passphrase is held as a JS string (immutable, not zeroable).
 * This is an accepted limitation of the Node.js runtime — a heap dump could reveal it.
 * Mitigation: sessions are evicted after VAULT_SESSION_TTL_MS of inactivity.
 */
interface VaultSession {
  unlocked: boolean;
  payload: VaultPayload | null;
  lastUnlockedTs: number | null;
  passphrase: string | null;
  /**
   * Digest of the envelope this session was opened from. Unlocking is skipped
   * only when the passphrase AND this digest both still match, so a vault
   * replaced or re-encrypted on disk is never served from memory.
   */
  envelopeDigest: string | null;
}

const sessions = new Map<string, VaultSession>();
// Verification can read encrypted evidence without granting ordinary vault
// access. Cache only authenticated secrets here, never signing-key payloads.
const readOnlySecrets = new Map<string, {
  secrets: Record<string, string>;
  passphrase: string;
  envelopeDigest: string;
  lastReadTs: number;
}>();
const VAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Evict stale vault sessions that haven't been used in VAULT_SESSION_TTL_MS */
function evictStaleSessions(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (session.lastUnlockedTs && now - session.lastUnlockedTs > VAULT_SESSION_TTL_MS) {
      session.passphrase = null;
      session.payload = null;
      session.unlocked = false;
      session.envelopeDigest = null;
      sessions.delete(key);
    }
  }
  for (const [key, cached] of readOnlySecrets) {
    if (now - cached.lastReadTs > VAULT_SESSION_TTL_MS) readOnlySecrets.delete(key);
  }
}

const UNSAFE_SECRET_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafeSecretKey(secretKey: string): void {
  if (!secretKey || secretKey.trim().length === 0) {
    throw new Error("Secret key is required.");
  }
  if (UNSAFE_SECRET_KEYS.has(secretKey)) {
    throw new Error(`Unsafe secret key: ${secretKey}`);
  }
}

export function vaultPaths(workspace: string): {
  vaultFile: string;
  metaFile: string;
  previousVaultFile: string;
  keysDir: string;
  monitorPublic: string;
  auditorPublic: string;
  leasePublic: string;
  sessionPublic: string;
  monitorHistory: string;
  auditorHistory: string;
  leaseHistory: string;
  sessionHistory: string;
  legacyMonitorPrivate: string;
  legacyAuditorPrivate: string;
} {
  const amcDir = join(workspace, ".amc");
  const keysDir = join(amcDir, "keys");
  return {
    vaultFile: join(amcDir, "vault.amcvault"),
    metaFile: join(amcDir, "vault.amcvault.meta.json"),
    previousVaultFile: join(amcDir, "previous-vault.amcvault"),
    keysDir,
    monitorPublic: join(keysDir, "monitor_ed25519.pub"),
    auditorPublic: join(keysDir, "auditor_ed25519.pub"),
    leasePublic: join(keysDir, "lease_ed25519.pub"),
    sessionPublic: join(keysDir, "session_ed25519.pub"),
    monitorHistory: join(keysDir, "monitor_history.json"),
    auditorHistory: join(keysDir, "auditor_history.json"),
    leaseHistory: join(keysDir, "lease_history.json"),
    sessionHistory: join(keysDir, "session_history.json"),
    legacyMonitorPrivate: join(keysDir, "monitor_ed25519"),
    legacyAuditorPrivate: join(keysDir, "auditor_ed25519")
  };
}

/** P1-08 purpose files: `<purpose>.pub` and `<purpose>_history.json` (for lease and session, the role history). */
export function purposeKeyPaths(workspace: string, purpose: LocalPurpose): { publicFile: string; historyFile: string } {
  const keysDir = vaultPaths(workspace).keysDir;
  return { publicFile: join(keysDir, `${purpose}.pub`), historyFile: join(keysDir, `${purpose}_history.json`) };
}

function defaultPassphrase(): string {
  if (process.env.AMC_VAULT_PASSPHRASE && process.env.AMC_VAULT_PASSPHRASE.length > 0) {
    return process.env.AMC_VAULT_PASSPHRASE;
  }
  // No fallback, ever. A passphrase written in this file is public, so a vault sealed with it opens for anyone,
  // private signing keys included; and NODE_ENV or VITEST is set by whoever controls the environment of a
  // production run. Tests inject their passphrase through tests/setup/vaultPassphrase.ts.
  throw new Error(
    "AMC_VAULT_PASSPHRASE environment variable is required: AMC has no default vault passphrase, and NODE_ENV or " +
    "test-runner variables never supply one. Set it before using vault operations: export AMC_VAULT_PASSPHRASE='your-secure-passphrase'"
  );
}

function decodePayload(envelopeRaw: string, passphrase: string): { payload: VaultPayload; sourceVersion: 1 | 2 } {
  return parseVaultPayload(decryptVaultPayload(JSON.parse(envelopeRaw) as VaultEnvelope, passphrase).toString("utf8"));
}

function readEnvelopeRaw(workspace: string): string {
  const paths = vaultPaths(workspace);
  if (!pathExists(paths.vaultFile)) {
    throw new Error(`Vault file not found: ${paths.vaultFile}`);
  }
  return readUtf8(paths.vaultFile);
}

const KEY_KINDS = ["monitor", "auditor", "lease", "session"] as const;

function roleKeyPem(payload: VaultPayload, role: VaultKeyKind): string {
  return payload.keys[ROLE_PRIMARY_PURPOSE[role]]?.privateKeyPem ?? "";
}

/** The encrypted vault bytes for `payload`; the only form a v2 vault is written in. */
export function encryptedVaultBytes(payload: VaultPayload, passphrase: string): string {
  if (passphrase.length < 8) throw new Error("Vault passphrase must be at least 8 characters.");
  return JSON.stringify(encryptVaultPayload(Buffer.from(JSON.stringify(payload), "utf8"), passphrase), null, 2);
}

export function vaultMetaBytes(payload: VaultPayload): string {
  const fingerprint = (role: VaultKeyKind) => {
    const pem = roleKeyPem(payload, role);
    return pem ? sha256Hex(Buffer.from(publicKeyFromPrivate(pem), "utf8")) : null;
  };
  return JSON.stringify({
    createdAt: new Date().toISOString(),
    monitorFingerprint: fingerprint("monitor"),
    auditorFingerprint: fingerprint("auditor"),
    leaseFingerprint: fingerprint("lease"),
    sessionFingerprint: fingerprint("session"),
    purposeKeyIds: Object.fromEntries(LOCAL_PURPOSES.flatMap(purpose => payload.keys[purpose] ? [[purpose, payload.keys[purpose]!.keyId]] : []))
  }, null, 2);
}

export function keyIdsOf(payload: VaultPayload): Partial<Record<LocalPurpose, string>> {
  return Object.fromEntries(LOCAL_PURPOSES.flatMap(purpose => payload.keys[purpose] ? [[purpose, payload.keys[purpose]!.keyId]] : []));
}

/** A fresh history, above any revision this machine accepted for the subject, so re-creating a workspace is no rollback. */
function sealedHistory(workspace: string, subject: KeyHistorySubject, entries: ReturnType<typeof buildKeyHistoryEntry>[], privateKeyPem: string): string {
  return JSON.stringify(sealKeyHistory(subject, entries, privateKeyPem, nextKeyHistoryRevision(workspace, subject)), null, 2);
}

/** After a commit: raise the mark of every history it wrote. */
export function markWrittenHistories(workspace: string, writes: readonly KeysetWrite[]): void {
  const keysDir = vaultPaths(workspace).keysDir;
  for (const write of writes) {
    const match = dirname(write.path) === keysDir ? /^([a-z-]+)_history\.json$/.exec(basename(write.path)) : null;
    if (!match) continue;
    const envelope = JSON.parse(write.bytes.toString()) as { revision: number };
    recordHighWater(keyHistoryMarkKey(workspace, match[1]!), envelope.revision, sha256Hex(canonicalize(envelope)));
  }
}

/** A history file to write, keeping a backup of untrusted bytes it replaces (they are never imported). */
function historyWrites(file: string, history: string): KeysetWrite[] {
  const writes: KeysetWrite[] = [];
  if (pathExists(file)) {
    const original = readUtf8(file);
    const backup = `${file}.previous-${sha256Hex(Buffer.from(original, "utf8"))}`;
    if (original !== history && !pathExists(backup)) writes.push({ path: backup, bytes: original, mode: 0o600 });
  }
  writes.push({ path: file, bytes: history, mode: 0o600 });
  return writes;
}

/**
 * Every public file a new or migrated vault publishes. A role or purpose public key that already exists must name the
 * same key: replacing one is a rotation (src/keys/purposeKeys.ts). Histories are written only where none is
 * authenticated yet; a purpose history starts from its role's authenticated history, so old signatures keep verifying.
 */
function publicKeyWrites(workspace: string, payload: VaultPayload, existingVault: boolean): KeysetWrite[] {
  const paths = vaultPaths(workspace);
  const writes: KeysetWrite[] = [];
  const roleEntries = new Map<VaultKeyKind, ReturnType<typeof buildKeyHistoryEntry>[]>();
  for (const role of KEY_KINDS) {
    const privateKeyPem = roleKeyPem(payload, role);
    if (!privateKeyPem) continue;
    const publicPem = publicKeyFromPrivate(privateKeyPem);
    const publicFile = paths[`${role}Public`];
    const historyFile = paths[`${role}History`];
    const previousPublic = pathExists(publicFile) ? readUtf8(publicFile) : null;
    if (existingVault && previousPublic !== null && previousPublic !== publicPem) throw new Error(`${role} key replacement requires an authenticated rotation`);
    writes.push({ path: publicFile, bytes: publicPem, mode: 0o644 });
    let authenticated = null;
    try { authenticated = existingVault ? verifyKeyHistoryEnvelope(JSON.parse(readUtf8(historyFile)), role, publicPem).envelope : null; } catch { /* sealed fresh below */ }
    if (authenticated) roleEntries.set(role, authenticated.entries);
    else if (!existingVault || !pathExists(historyFile)) {
      // Only a private-key-derived current key is admitted at initialization. Existing unsigned arrays are never imported.
      const entries = [buildKeyHistoryEntry(publicPem, [])];
      roleEntries.set(role, entries);
      writes.push(...historyWrites(historyFile, sealedHistory(workspace, role, entries, privateKeyPem)));
    }
  }
  for (const purpose of LOCAL_PURPOSES) {
    const key = payload.keys[purpose];
    if (!key) continue;
    const { publicFile, historyFile } = purposeKeyPaths(workspace, purpose);
    const publicPem = publicKeyFromPrivate(key.privateKeyPem);
    if (pathExists(publicFile) && readUtf8(publicFile) !== publicPem) throw new Error(`${purpose} key replacement requires an authenticated rotation`);
    writes.push({ path: publicFile, bytes: publicPem, mode: 0o644 });
    if (purpose === "lease" || purpose === "session" || pathExists(historyFile)) continue;
    const inherited = roleEntries.get(roleOfPurpose(purpose));
    const entries = inherited?.some(entry => entry.publicKeyPem === publicPem) ? inherited : [buildKeyHistoryEntry(publicPem, [])];
    writes.push(...historyWrites(historyFile, sealedHistory(workspace, purpose, entries, key.privateKeyPem)));
  }
  return writes;
}

/**
 * Every key set carries the workspace key revocation list, so a missing list is refused rather than read as empty. A
 * new key set starts it empty, above any sequence this machine accepted for the list; an existing one is kept.
 */
function emptyKeyRevocationList(workspace: string, payload: VaultPayload): KeysetWrite[] {
  const location = keyRevocationLocation(workspace, []);
  const key = payload.keys["revocation-list"];
  if (containedExists(workspace, location.rel) || !key) return [];
  const sequence = (machineMark(workspace, "REVOCATION_LIST", location.listId)?.sequence ?? 0) + 1;
  const list = { type: "amc.revocation-list" as const, version: 1 as const, listId: location.listId, sequence, previousSha256: null, issuedAt: new Date().toISOString(), revoked: [] };
  return [{ path: join(workspace, location.rel), bytes: encodeSignedRevocationList(signRevocationList(list, key.privateKeyPem)), mode: 0o644 }];
}

/** Publishes a whole vault (new, migrated or upgraded) as one key-set generation. */
function persistVault(workspace: string, payload: VaultPayload, passphrase: string, extra: readonly KeysetWrite[] = []): void {
  const paths = vaultPaths(workspace);
  ensureDir(join(workspace, ".amc"));
  const existingVault = pathExists(paths.vaultFile);
  const writes: KeysetWrite[] = [
    ...extra,
    { path: paths.vaultFile, bytes: encryptedVaultBytes(payload, passphrase), mode: 0o600 },
    { path: paths.metaFile, bytes: vaultMetaBytes(payload), mode: 0o644 },
    ...publicKeyWrites(workspace, payload, existingVault),
    ...emptyKeyRevocationList(workspace, payload)
  ];
  commitKeyset(workspace, { keys: keyIdsOf(payload), writes });
  markWrittenHistories(workspace, writes);
  // The envelope on disk just changed, so any session opened from the previous one must derive again.
  sessionFor(workspace).envelopeDigest = null;
  // Always remove legacy unencrypted private key files.
  if (pathExists(paths.legacyMonitorPrivate)) rmSync(paths.legacyMonitorPrivate, { force: true });
  if (pathExists(paths.legacyAuditorPrivate)) rmSync(paths.legacyAuditorPrivate, { force: true });
}

function sessionFor(workspace: string): VaultSession {
  evictStaleSessions();
  const current = sessions.get(workspace);
  if (current) {
    return current;
  }
  const created: VaultSession = {
    unlocked: false,
    payload: null,
    lastUnlockedTs: null,
    passphrase: null,
    envelopeDigest: null
  };
  sessions.set(workspace, created);
  return created;
}

export function vaultExists(workspace: string): boolean {
  return pathExists(vaultPaths(workspace).vaultFile);
}

interface CreateVaultParams {
  workspace: string;
  passphrase?: string;
  monitorPrivateKeyPem: string;
  auditorPrivateKeyPem: string;
  leasePrivateKeyPem: string;
  sessionPrivateKeyPem: string;
  monitorPublicKeyPem: string;
  auditorPublicKeyPem: string;
  leasePublicKeyPem: string;
  sessionPublicKeyPem: string;
  secrets?: Record<string, string>;
}

/** Writes a v2 vault whose purposes share their role's key (same bytes as v1), as one key-set generation. */
export function createVault(params: CreateVaultParams): { vaultFile: string; metaFile: string } {
  const passphrase = params.passphrase ?? defaultPassphrase();
  if (passphrase.length < 8) {
    throw new Error("Vault passphrase must be at least 8 characters.");
  }
  for (const role of KEY_KINDS) {
    if (publicKeyFromPrivate(params[`${role}PrivateKeyPem`]) !== params[`${role}PublicKeyPem`]) throw new Error(`${role} public key does not match the vault private key`);
  }
  const payload = payloadFromRoleKeys({
    monitor: params.monitorPrivateKeyPem, auditor: params.auditorPrivateKeyPem, lease: params.leasePrivateKeyPem, session: params.sessionPrivateKeyPem
  }, params.secrets ?? (Object.create(null) as Record<string, string>), Date.now());
  persistVault(params.workspace, payload, passphrase);
  unlockVault(params.workspace, passphrase);
  const paths = vaultPaths(params.workspace);
  return { vaultFile: paths.vaultFile, metaFile: paths.metaFile };
}

export function unlockVault(workspace: string, passphrase?: string): void {
  const phrase = passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!phrase || phrase.length === 0) {
    throw new Error("Vault unlock requires passphrase (set AMC_VAULT_PASSPHRASE or use `amc vault unlock`).");
  }
  try {
    openVaultSession(workspace, phrase);
  } catch (error) {
    // No session survives a failed unlock: not a partial payload, and not one opened from an earlier envelope that a
    // wrong passphrase, a replaced or corrupted file or a key mismatch now refuses (getVaultPrivateKeyPem would serve it).
    lockVault(workspace);
    throw error;
  }
}

/**
 * Every key in the vault must match its published public key file before a session opens. persistVault writes the
 * envelope before the public keys, so an interrupted write (or a replaced .pub) leaves them disagreeing, and signing
 * would then produce signatures nothing verifies. A vault from before lease and session keys may lack such a key and
 * its .pub, and unlock adds the key; a .pub with no key behind it is refused, because a new key would replace it.
 */
function assertPublishedKeysMatch(workspace: string, payload: VaultPayload): void {
  const paths = vaultPaths(workspace);
  for (const kind of KEY_KINDS) {
    const file = paths[`${kind}Public`];
    const published = pathExists(file) ? readUtf8(file) : null;
    const privateKeyPem = roleKeyPem(payload, kind);
    if (!privateKeyPem && (kind === "lease" || kind === "session")) {
      if (published === null) continue;
      throw new Error(`Vault unlock refused: ${file} exists, but this older vault holds no ${kind} private key to match it. `
        + `To let AMC create a new ${kind} key, move ${file} and ${paths[`${kind}History`]} aside; anything signed `
        + `with the old ${kind} key will then no longer verify. See "When unlock refuses" in docs/VAULT.md.`);
    }
    if (published !== publicKeyFromPrivate(privateKeyPem)) {
      throw new Error(`Vault unlock refused: ${file} ${published === null ? "is missing" : `does not match the vault's ${kind} key`}. `
        + `A key write was interrupted or the file was replaced. See "When unlock refuses" in docs/VAULT.md.`);
    }
  }
  for (const purpose of LOCAL_PURPOSES) {
    const key = payload.keys[purpose];
    const { publicFile } = purposeKeyPaths(workspace, purpose);
    if (key && pathExists(publicFile) && readUtf8(publicFile) !== publicKeyFromPrivate(key.privateKeyPem)) {
      throw new Error(`Vault unlock refused: ${publicFile} does not match the vault's ${purpose} key. A key write was interrupted or the file was replaced. `
        + "See \"When unlock refuses\" in docs/VAULT.md.");
    }
  }
}

function openVaultSession(workspace: string, phrase: string): void {
  const session = sessionFor(workspace);
  const envelopeRaw = readEnvelopeRaw(workspace);
  const envelopeDigest = sha256Hex(Buffer.from(envelopeRaw, "utf8"));
  if (session.unlocked && session.passphrase === phrase && session.envelopeDigest === envelopeDigest) {
    // Already open on this exact envelope. Re-deriving the key costs a full
    // KDF (~24ms) and cannot reach a different answer — and signArtifactFile
    // reaches here on every signed artifact AMC writes.
    session.lastUnlockedTs = Date.now();
    return;
  }
  let decoded: ReturnType<typeof decodePayload>;
  try {
    decoded = decodePayload(envelopeRaw, phrase);
  } catch {
    /* decryption or parse failed — rethrow with user-friendly message */
    throw new Error("Vault unlock failed: incorrect passphrase or corrupted vault.");
  }
  let payload = decoded.payload;
  assertPublishedKeysMatch(workspace, payload);
  let openedDigest: string | null = envelopeDigest;
  if (decoded.sourceVersion === 1 || !payload.keys.lease || !payload.keys.session) {
    // P1-08 migration: v1 roles become v2 purposes with the same key bytes, written atomically with the purpose files;
    // the v1 envelope is kept as previous-vault.amcvault. A vault without lease or session keys gains them here, and
    // keeps every key it already has (its .pub matched above).
    const created = Date.now();
    const fresh = () => purposeKey(generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString(), created);
    payload = { ...payload, keys: { ...payload.keys, lease: payload.keys.lease ?? fresh(), session: payload.keys.session ?? fresh() } };
    const previous = vaultPaths(workspace).previousVaultFile;
    persistVault(workspace, payload, phrase, decoded.sourceVersion === 1 && !pathExists(previous) ? [{ path: previous, bytes: envelopeRaw, mode: 0o600 }] : []);
    payload = decodePayload(readEnvelopeRaw(workspace), phrase).payload;
    openedDigest = null; // the envelope was replaced; the next unlock re-derives from the new bytes
  }
  // Publish the session only once its payload is complete.
  session.unlocked = true;
  session.payload = payload;
  session.lastUnlockedTs = Date.now();
  session.passphrase = phrase;
  session.envelopeDigest = openedDigest;
}

export function lockVault(workspace: string): void {
  readOnlySecrets.delete(workspace);
  const session = sessionFor(workspace);
  session.unlocked = false;
  session.payload = null;
  session.passphrase = null;
  session.envelopeDigest = null;
}

export function vaultStatus(workspace: string): {
  exists: boolean;
  unlocked: boolean;
  lastUnlockedTs: number | null;
  metaPath: string;
  vaultPath: string;
} {
  const paths = vaultPaths(workspace);
  const session = sessionFor(workspace);
  return {
    exists: pathExists(paths.vaultFile),
    unlocked: session.unlocked,
    lastUnlockedTs: session.lastUnlockedTs,
    metaPath: paths.metaFile,
    vaultPath: paths.vaultFile
  };
}

// Cache for ephemeral keys used in --no-sign mode (process lifetime only, not persisted)
const ephemeralKeyCache = new Map<string, string>();

function generateEphemeralKey(kind: string): string {
  const cached = ephemeralKeyCache.get(kind);
  if (cached) return cached;
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  ephemeralKeyCache.set(kind, pem);
  return pem;
}

/**
 * The unlocked payload whose keys the committed key set names, or null in no-sign mode. A key set that is incomplete
 * refuses to sign; a session opened before another process committed a new generation re-reads the vault once.
 */
function signingPayload(workspace: string): { payload: VaultPayload; keysetPresent: boolean } | null {
  const session = sessionFor(workspace);
  if (!session.unlocked || !session.payload) {
    const fromEnv = process.env.AMC_VAULT_PASSPHRASE;
    if (fromEnv && fromEnv.length > 0 && vaultExists(workspace)) {
      unlockVault(workspace, fromEnv);
    }
  }
  const refreshed = sessionFor(workspace);
  if (!refreshed.unlocked || !refreshed.payload) {
    // R2/R6: When --no-sign mode is active, use ephemeral (non-persistent) keys so operations
    // can proceed without vault access. Signatures will be valid format but not verifiable later.
    if (process.env.AMC_NO_SIGN === "1") return null;
    throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
  }
  // Unlocking writes a key set (creation and the v1 migration both commit one), so an unlocked vault without one lost it:
  // refuse rather than sign with nothing binding the vault's keys, their revocations or this machine's marks.
  const keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("🔐 This vault has no key set (.amc/keys/keyset.json); refusing to sign. Restore it with the vault, or run `amc keys rotate --resume`.");
  const matches = (payload: VaultPayload) => LOCAL_PURPOSES.every(purpose => keyset.keys[purpose] === undefined || keyset.keys[purpose] === payload.keys[purpose]?.keyId);
  if (matches(refreshed.payload)) return { payload: refreshed.payload, keysetPresent: true };
  const payload = requireUnlockedPayload(workspace);
  if (!matches(payload)) throw new Error(`🔐 The unlocked vault does not hold the keys key set generation ${keyset.generation} names; refusing to sign.`);
  return { payload, keysetPresent: true };
}

/** P1-08: a key is resolved only when the workspace key revocation list, read now, does not name it. */
function usableKey(workspace: string, resolved: { payload: VaultPayload; keysetPresent: boolean }, purpose: LocalPurpose): string {
  const key = resolved.payload.keys[purpose];
  if (!key) return "";
  assertKeyNotRevoked(workspace, resolved.keysetPresent, key.keyId, purpose);
  return key.privateKeyPem;
}

export function getVaultPrivateKeyPem(workspace: string, kind: VaultKeyKind): string {
  const resolved = signingPayload(workspace);
  return resolved === null ? generateEphemeralKey(kind) : usableKey(workspace, resolved, ROLE_PRIMARY_PURPOSE[kind]);
}

/** P1-08: the private key for one local signing purpose (src/keys/purposeKeys.ts getSigningKey). */
export function getVaultPurposeKeyPem(workspace: string, purpose: LocalPurpose): string {
  const resolved = signingPayload(workspace);
  if (resolved === null) return generateEphemeralKey(`purpose:${purpose}`);
  const pem = usableKey(workspace, resolved, purpose);
  if (!pem) throw new Error(`The vault holds no ${purpose} key.`);
  return pem;
}

/** Unlocks with `passphrase` and returns the payload for a key change (rotation); never served in no-sign mode. */
export function unlockedPayloadForKeyChange(workspace: string, passphrase: string): VaultPayload {
  unlockVault(workspace, passphrase);
  const payload = requireUnlockedPayload(workspace);
  assertPublishedKeysMatch(workspace, payload);
  return payload;
}

/** After a committed key change: the session re-reads the vault on its next use. */
export function forgetVaultEnvelope(workspace: string): void {
  sessionFor(workspace).envelopeDigest = null;
}

export function ensureVaultAndPublicKeys(workspace: string): void {
  const paths = vaultPaths(workspace);
  ensureDir(paths.keysDir);

  const legacyMonitorPrivate = pathExists(paths.legacyMonitorPrivate) ? readFileSync(paths.legacyMonitorPrivate, "utf8") : null;
  const legacyAuditorPrivate = pathExists(paths.legacyAuditorPrivate) ? readFileSync(paths.legacyAuditorPrivate, "utf8") : null;

  if (vaultExists(workspace)) {
    // Only the operator's passphrase unlocks here. Without one the vault stays locked, under NODE_ENV=test as anywhere:
    // the command that needs a key then says the vault is locked, instead of this read demanding a passphrase.
    const unlockPhrase = process.env.AMC_VAULT_PASSPHRASE;
    if (unlockPhrase) {
      try {
        unlockVault(workspace, unlockPhrase);
      } catch {
        /* passphrase unavailable or incorrect — keep vault locked */
      }
    }
    if (legacyMonitorPrivate && pathExists(paths.legacyMonitorPrivate)) {
      rmSync(paths.legacyMonitorPrivate, { force: true });
    }
    if (legacyAuditorPrivate && pathExists(paths.legacyAuditorPrivate)) {
      rmSync(paths.legacyAuditorPrivate, { force: true });
    }
    // Reads/unlocks cannot authenticate or rewrite untrusted on-disk history.
    return;
  }

  const pair = () => {
    const generated = generateKeyPairSync("ed25519");
    return { privatePem: generated.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicPem: generated.publicKey.export({ format: "pem", type: "spki" }).toString() };
  };
  const monitorPublicExisting = pathExists(paths.monitorPublic) ? readUtf8(paths.monitorPublic) : null;
  const auditorPublicExisting = pathExists(paths.auditorPublic) ? readUtf8(paths.auditorPublic) : null;
  const monitor = legacyMonitorPrivate && monitorPublicExisting ? { privatePem: legacyMonitorPrivate, publicPem: monitorPublicExisting } : pair();
  const auditor = legacyAuditorPrivate && auditorPublicExisting ? { privatePem: legacyAuditorPrivate, publicPem: auditorPublicExisting } : pair();
  const lease = pair();
  const session = pair();
  createVault({
    workspace,
    passphrase: defaultPassphrase(),
    monitorPrivateKeyPem: monitor.privatePem,
    auditorPrivateKeyPem: auditor.privatePem,
    leasePrivateKeyPem: lease.privatePem,
    sessionPrivateKeyPem: session.privatePem,
    monitorPublicKeyPem: monitor.publicPem,
    auditorPublicKeyPem: auditor.publicPem,
    leasePublicKeyPem: lease.publicPem,
    sessionPublicKeyPem: session.publicPem
  });
}

function requireUnlockedPayload(workspace: string): VaultPayload {
  const session = sessionFor(workspace);
  if (!session.unlocked || !session.payload) {
    throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup.");
  }
  try {
    // Another process may have added a blob key since this session unlocked.
    // Refresh authenticated data in memory only: unlockVault can migrate legacy
    // lease/session keys and write trust files, which a secret read must not do.
    if (!session.passphrase) throw new Error("Unlocked vault passphrase is unavailable");
    const envelopeRaw = readEnvelopeRaw(workspace);
    const envelopeDigest = sha256Hex(Buffer.from(envelopeRaw, "utf8"));
    if (session.envelopeDigest !== envelopeDigest) {
      session.payload = decodePayload(envelopeRaw, session.passphrase).payload;
      session.envelopeDigest = envelopeDigest;
    }
  } catch {
    // Stale secrets and private keys must not survive an unauthenticated refresh.
    lockVault(workspace);
    throw new Error("Vault refresh failed: missing vault, changed passphrase, or corrupted vault.");
  }
  return session.payload;
}

/** A secret write re-encrypts the vault only; its keys, and so the key set, are unchanged. */
function rewriteUnlockedVault(workspace: string, payload: VaultPayload): void {
  const session = sessionFor(workspace);
  const passphrase = session.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase || passphrase.length === 0) {
    throw new Error("AMC_VAULT_PASSPHRASE is required to persist vault secret updates.");
  }
  const paths = vaultPaths(workspace);
  for (const kind of KEY_KINDS) {
    const pem = roleKeyPem(payload, kind);
    if (pem && pathExists(paths[`${kind}Public`]) && readUtf8(paths[`${kind}Public`]) !== publicKeyFromPrivate(pem)) {
      throw new Error(`${kind} public key does not match the vault private key`);
    }
  }
  writeFileAtomic(paths.vaultFile, encryptedVaultBytes({ ...payload, v: 2 }, passphrase), 0o600);
  try { chmodSync(paths.vaultFile, 0o600); } catch { /* chmod not supported on this platform */ }
  session.envelopeDigest = null;
  unlockVault(workspace, passphrase);
}

export function setVaultSecret(workspace: string, secretKey: string, value: string): void {
  assertSafeSecretKey(secretKey);
  const payload = requireUnlockedPayload(workspace);
  const next = { ...payload, secrets: safeSecrets({ ...payload.secrets, [secretKey]: value }) };
  rewriteUnlockedVault(workspace, next);
  sessionFor(workspace).payload = next;
}

/** Rewrites the vault envelope without `secretKey`; refuses when the vault is locked. True when a secret was removed. */
export function deleteVaultSecret(workspace: string, secretKey: string): boolean {
  assertSafeSecretKey(secretKey);
  const payload = requireUnlockedPayload(workspace);
  if (!Object.hasOwn(payload.secrets, secretKey)) return false;
  const next = { ...payload, secrets: safeSecrets(Object.fromEntries(Object.entries(payload.secrets).filter(([key]) => key !== secretKey))) };
  rewriteUnlockedVault(workspace, next);
  sessionFor(workspace).payload = next;
  return true;
}

export function getVaultSecret(workspace: string, secretKey: string): string | null {
  assertSafeSecretKey(secretKey);
  const payload = requireUnlockedPayload(workspace);
  const value = payload.secrets[secretKey];
  return typeof value === "string" ? value : null;
}

/** Read existing encrypted secrets without unlocking or migrating the vault. */
export function getVaultSecretReadOnly(workspace: string, secretKey: string): string | null {
  assertSafeSecretKey(secretKey);
  const session = sessionFor(workspace);
  if (session.unlocked && session.payload) return getVaultSecret(workspace, secretKey);

  try {
    // An earlier read does not authorize a later call without this credential.
    const passphrase = process.env.AMC_VAULT_PASSPHRASE;
    if (!passphrase) throw new Error("Read-only vault access requires a passphrase");
    const envelopeRaw = readEnvelopeRaw(workspace);
    const envelopeDigest = sha256Hex(Buffer.from(envelopeRaw, "utf8"));
    let cached = readOnlySecrets.get(workspace);
    if (!cached || cached.passphrase !== passphrase || cached.envelopeDigest !== envelopeDigest) {
      cached = { secrets: decodePayload(envelopeRaw, passphrase).payload.secrets, passphrase, envelopeDigest, lastReadTs: Date.now() };
      readOnlySecrets.set(workspace, cached);
    } else {
      cached.lastReadTs = Date.now();
    }
    const value = cached.secrets[secretKey];
    return typeof value === "string" ? value : null;
  } catch {
    readOnlySecrets.delete(workspace);
    throw new Error("Read-only vault access failed: missing passphrase or vault, incorrect passphrase, or corrupted vault.");
  }
}

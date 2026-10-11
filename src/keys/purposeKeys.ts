/**
 * Purpose keys (P1-08): one signing key per local purpose, routine rotation with signed statements, key revocation
 * and public-key export. Signing call sites take their key from getSigningKey(workspace, purpose); keys for release,
 * notary, trust-list-root, evidence-authority and independent-attestation never live in a workspace vault.
 *
 * A rotation is one key-set generation (src/keys/keyset.ts): the new vault, purpose and role public keys, the purpose and
 * role histories and one statement per rotated purpose land together or not at all. Role files stay a compatible view:
 * a role's public key follows its primary purpose (monitor: ledger-row, auditor: artifact-seal), and its history admits
 * every key its purposes use, so verifiers that read role histories keep verifying. After the commit each statement and
 * history revision is appended to the transparency log and raises this machine's marks.
 */
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { join } from "node:path";
import { buildKeyHistoryEntry, type KeyHistoryEntry } from "../crypto/keyHistoryChain.js";
import { publicKeyFromPrivate, sealKeyHistory, verifyKeyHistoryEnvelope, type KeyHistoryEnvelope, type KeyHistorySubject } from "../crypto/keyHistoryEnvelope.js";
import { KEY_PURPOSES, type KeyPurpose } from "../trust/keyPurposes.js";
import { ed25519KeyId } from "../trust/trustList.js";
import { listContainedDir, readContained, readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  encryptedVaultBytes, forgetVaultEnvelope, getVaultPurposeKeyPem, keyIdsOf, markWrittenHistories, purposeKeyPaths, unlockVault, vaultEnvelopeKeyIds,
  unlockedPayloadForKeyChange, vaultMetaBytes, vaultPaths, type VaultKeyKind
} from "../vault/vault.js";
import {
  LOCAL_PURPOSES, ROLE_PRIMARY_PURPOSE, isLocalPurpose, purposeKey, roleOfPurpose, type LocalPurpose, type VaultPayloadV2
} from "../vault/vaultPayload.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { assertOwnerMode } from "../mode/mode.js";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { readPinnedTrustRoots } from "../trust/rootRotation.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { logSequence } from "./anchorLog.js";
import { assertNeverAnchored, assertNotRolledBack, machineMark, markSequence } from "./anchors.js";
import { checkHighWater, keyHistoryMarkKey } from "./highWater.js";
import { assertLocal, getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, keyFile, readHistory } from "./signingKeys.js";
export { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem } from "./signingKeys.js";
import { assertKeysetComplete, assertNoPendingKeyset, commitKeyset, keysetAnchoring, keysetDeclared, keysetFileRel, keysetIdentity, keysetPaths, keysetRecoveryDir, resumeKeyset, type KeysetWrite } from "./keyset.js";
import { KEY_REVOCATION_REASONS, keyRevocationLocation, type KeyRevocationReason } from "./keyRevocations.js";
export type { KeyRevocationReason } from "./keyRevocations.js";
import {
  encodeSignedRevocationList, nextRevocationList, publishRevocationList, readAnchoredRevocationList, recoverPendingRevocationList, revocationListSha256,
  signRevocationList
} from "./revocationList.js";
import {
  DEFAULT_MAX_OVERLAP_DAYS, encodeRotationStatement, parseRotationStatement, rotationStatementSha256, signRotationStatement,
  verifyRotationStatement, type RotationReason, type SignedKeyRotationStatement
} from "./rotationStatement.js";

const DAY_MS = 86_400_000;

function statementDir(workspace: string, purpose: LocalPurpose): string {
  return join(vaultPaths(workspace).keysDir, "statements", purpose);
}

/** The purpose's statements in sequence order, as stored (canonical bytes), each read through the contained helpers. */
function readStatements(workspace: string, purpose: LocalPurpose): Buffer[] {
  const sequences = listContainedDir(workspace, `.amc/keys/statements/${purpose}`)
    .flatMap(name => /^[1-9][0-9]{0,15}\.json$/.test(name) ? [Number(name.slice(0, -5))] : []).sort((a, b) => a - b);
  sequences.forEach((sequence, index) => { if (sequence !== index + 1) throw new Error(`${purpose} rotation statements have a gap before sequence ${sequence}`); });
  return sequences.map(sequence => readContained(workspace, keysetFileRel(`keys/statements/${purpose}/${sequence}.json`), 64 * 1024));
}

/** The last statement of a purpose's chain, checked against both anchors so an older chain head is refused. */
function chainHead(workspace: string, purpose: LocalPurpose): SignedKeyRotationStatement | null {
  const statements = readStatements(workspace, purpose);
  const last = statements.at(-1);
  if (last === undefined) return null;
  const signed = parseRotationStatement(last);
  // Compare only: this statement's signatures are not checked here, so it never raises this machine's mark.
  assertNotRolledBack({ workspace, type: "KEY_ROTATION", id: `${workspaceIdFromDirectory(workspace)}:${purpose}`, sequence: signed.statement.sequence, sha256: sha256Hex(last) }, { record: false });
  return signed;
}

export interface RotatePurposeKeysInput {
  workspace: string;
  purposes: readonly LocalPurpose[];
  reason?: RotationReason;
  overlapDays?: number;
  /** Trust-list root private keys held outside AMC; a key-compromise rotation needs at least one. */
  rootPrivateKeyPems?: readonly string[];
  passphrase?: string;
}

export interface RotationResult {
  generation: number;
  recoveryDirectory: string;
  rotated: Array<{ purpose: LocalPurpose; previousKeyId: string; nextKeyId: string; reason: RotationReason; statementPath: string }>;
}

function rebuiltEntries(entries: readonly KeyHistoryEntry[], drop: ReadonlySet<string>, add: readonly string[]): KeyHistoryEntry[] {
  const out: KeyHistoryEntry[] = [];
  for (const entry of entries) {
    if (drop.has(entry.fingerprint)) continue;
    out.push(drop.size === 0 ? entry : buildKeyHistoryEntry(entry.publicKeyPem, out, entry.source, entry.createdTs));
  }
  for (const pem of add) if (!out.some(entry => entry.publicKeyPem === pem)) out.push(buildKeyHistoryEntry(pem, out));
  return out;
}

function authenticated(workspace: string, subject: KeyHistorySubject, currentPublicPem: string): KeyHistoryEnvelope {
  const envelope = readHistory(workspace, subject, currentPublicPem);
  if (!envelope) throw new Error(`${subject} key history is not authenticated; explicitly migrate reviewed history before rotating`);
  return envelope;
}

/**
 * Rotates the given purposes. Purposes that share a key move to one new key together; key-compromise extends the set
 * to every purpose that holds a compromised key, drops those keys from every history and needs a root signature.
 */
export function rotatePurposeKeys(input: RotatePurposeKeysInput): RotationResult {
  const { workspace } = input;
  // Checked here as well as by the CLI, so an SDK, API or script caller cannot skip it.
  assertOwnerMode(workspace, "keys rotate");
  if (process.env.AMC_NO_SIGN === "1") throw new Error("Key rotation is unavailable in no-sign mode");
  const passphrase = input.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("Key rotation requires the vault passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  const payload = unlockedPayloadForKeyChange(workspace, passphrase);
  assertKeysetComplete(workspace);
  const keyOf = (purpose: LocalPurpose) => {
    const key = payload.keys[purpose];
    if (!key) throw new Error(`The vault holds no ${purpose} key.`);
    return key;
  };
  const targets = new Set(input.purposes.map(assertLocal));
  if (targets.size === 0) throw new Error("Name at least one purpose to rotate.");
  const compromised = new Set(input.reason === "key-compromise" ? [...targets].map(purpose => keyOf(purpose).keyId) : []);
  for (const purpose of LOCAL_PURPOSES) if (payload.keys[purpose] && compromised.has(payload.keys[purpose]!.keyId)) targets.add(purpose);
  const overlapDays = input.overlapDays ?? 7;
  if (!Number.isFinite(overlapDays) || overlapDays < 0 || overlapDays > DEFAULT_MAX_OVERLAP_DAYS) throw new Error(`--overlap-days must be between 0 and ${DEFAULT_MAX_OVERLAP_DAYS}`);
  // Root authority comes from this machine's pinned trust-list roots and threshold, never from the keys handed in.
  const rootPems = (input.rootPrivateKeyPems ?? []).map(pem => ({ privatePem: pem, publicPem: publicKeyFromPrivate(pem) }));
  const pinned = rootPems.length > 0 || compromised.size > 0 ? readPinnedTrustRoots(resolveAmcHome({ env: process.env })) : null;
  const unpinned = rootPems.filter(root => !pinned?.roots.includes(ed25519KeyId(root.publicPem) ?? ""));
  if (unpinned.length > 0) throw new Error(`--root-key ${ed25519KeyId(unpinned[0]!.publicPem)} is not a pinned trust-list root (<AMC home>/trust/trust-roots.json); refusing it`);
  const rootThreshold = pinned?.threshold ?? 1;
  if (compromised.size > 0 && new Set(rootPems.map(root => root.publicPem)).size < rootThreshold) {
    throw new Error(`A key-compromise rotation needs ${rootThreshold} pinned trust-list root signature(s) (--root-key): the compromised key has no authority over its replacement.`);
  }

  // One new key per group of target purposes that share a key today.
  const fresh = new Map<string, string>();
  const nextKeys: VaultPayloadV2["keys"] = { ...payload.keys };
  const now = new Date();
  const workspaceId = workspaceIdFromDirectory(workspace);
  const statements: Array<{ purpose: LocalPurpose; previousKeyId: string; reason: RotationReason; bytes: Buffer; sha256: string; path: string }> = [];
  for (const purpose of [...targets].sort()) {
    const old = keyOf(purpose);
    const nextPem = fresh.get(old.keyId) ?? generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    fresh.set(old.keyId, nextPem);
    nextKeys[purpose] = purposeKey(nextPem, now.getTime());
    const sharedOutside = LOCAL_PURPOSES.some(other => !targets.has(other) && payload.keys[other]?.keyId === old.keyId);
    const reason: RotationReason = input.reason ?? (sharedOutside ? "purpose-split" : "scheduled");
    const head = chainHead(workspace, purpose);
    if (head && head.statement.nextKeyId !== old.keyId) throw new Error(`${purpose} rotation chain does not end at the vault's current key; refusing to extend it`);
    const nextPublicKeyPem = publicKeyFromPrivate(nextPem);
    const signed = signRotationStatement({
      type: "amc.key-rotation", version: 1, workspaceId, purpose,
      sequence: (head?.statement.sequence ?? 0) + 1,
      previousStatementSha256: head ? rotationStatementSha256(head) : null,
      previousKeyId: old.keyId, nextKeyId: ed25519KeyId(nextPublicKeyPem)!, nextPublicKeyPem, reason,
      overlap: reason === "key-compromise" || overlapDays === 0 ? null : { notBefore: now.toISOString(), notAfter: new Date(now.getTime() + overlapDays * DAY_MS).toISOString() },
      issuedAt: now.toISOString()
    }, { next: nextPem, previous: reason === "key-compromise" ? null : old.privateKeyPem, roots: rootPems.map(root => root.privatePem) });
    const bytes = encodeRotationStatement(signed);
    const verdict = verifyRotationStatement(bytes, { expected: { workspaceId, purpose }, trustedCurrentPublicKeyPem: publicKeyFromPrivate(old.privateKeyPem),
      previous: head, roots: { publicKeyPems: rootPems.map(root => root.publicPem), threshold: rootThreshold } });
    if (!verdict.valid) throw new Error(`${purpose} rotation statement does not verify: ${verdict.reason}`);
    statements.push({ purpose, previousKeyId: old.keyId, reason, bytes, sha256: sha256Hex(bytes), path: join(statementDir(workspace, purpose), `${signed.statement.sequence}.json`) });
  }
  const nextPayload: VaultPayloadV2 = { ...payload, keys: nextKeys };
  const writes = rotationWrites(workspace, payload, nextPayload, targets, compromised, passphrase);
  writes.push(...statements.map(row => ({ path: row.path, bytes: row.bytes, mode: 0o644 })));
  // Serialized with amc keys revoke: a new revocation-list key re-signs the key revocation list in the same generation,
  // so the list never stands signed only by a key the rotation dropped.
  const keyset = withControlFileLock({ root: vaultPaths(workspace).keysDir, name: "key-revocations", operation: () => {
    const resigned = targets.has("revocation-list") ? resignedKeyRevocations(workspace, nextPayload) : null;
    if (resigned) writes.push(resigned.write);
    const committed = commitKeyset(workspace, { keys: keyIdsOf(nextPayload), writes, statements: statements.map(row => row.sha256) });
    forgetVaultEnvelope(workspace);
    unlockVault(workspace, passphrase);
    markWrittenHistories(workspace, writes);
    anchorRotation(workspace, statements, writes);
    if (resigned) {
      logSequence(resigned.anchor);
      markSequence(resigned.anchor);
    }
    return committed;
  } });
  return {
    generation: keyset.generation,
    recoveryDirectory: keysetRecoveryDir(workspace, keyset.generation),
    rotated: statements.map(row => ({ purpose: row.purpose, previousKeyId: row.previousKeyId, nextKeyId: nextKeys[row.purpose]!.keyId, reason: row.reason, statementPath: row.path }))
  };
}

/** The key revocation list's next sequence, same rows, signed by the rotation's new revocation-list key. */
function resignedKeyRevocations(workspace: string, after: VaultPayloadV2): { write: KeysetWrite; anchor: Parameters<typeof markSequence>[0] } {
  const location = keyRevocationLocation(workspace);
  const current = readAnchoredRevocationList(location);
  if (current === null && keysetDeclared(workspace)) throw new Error("the workspace key revocation list is missing; restore it before rotating the revocation-list key");
  const list = nextRevocationList(location.listId, current ? { sequence: current.list.sequence, sha256: revocationListSha256(current.list) } : null, current?.list.revoked ?? [], 0);
  const bytes = encodeSignedRevocationList(signRevocationList(list, after.keys["revocation-list"]!.privateKeyPem));
  return { write: { path: join(workspace, location.rel), bytes, mode: 0o644 },
    anchor: { workspace, type: "REVOCATION_LIST", id: location.listId, sequence: list.sequence, sha256: revocationListSha256(list), fileSha256: sha256Hex(bytes) } };
}

/** The vault, its meta and every public file and history the rotation changes. */
function rotationWrites(workspace: string, before: VaultPayloadV2, after: VaultPayloadV2, targets: ReadonlySet<LocalPurpose>, compromised: ReadonlySet<string>, passphrase: string): KeysetWrite[] {
  const paths = vaultPaths(workspace);
  const writes: KeysetWrite[] = [
    { path: paths.vaultFile, bytes: encryptedVaultBytes(after, passphrase), mode: 0o600 },
    { path: paths.metaFile, bytes: vaultMetaBytes(after), mode: 0o644 }
  ];
  const pem = (payload: VaultPayloadV2, purpose: LocalPurpose) => publicKeyFromPrivate(payload.keys[purpose]!.privateKeyPem);
  for (const purpose of targets) {
    const { publicFile, historyFile } = purposeKeyPaths(workspace, purpose);
    writes.push({ path: publicFile, bytes: pem(after, purpose), mode: 0o644 });
    if (purpose === "lease" || purpose === "session") continue; // their history is the role history, rewritten below
    const prior = authenticated(workspace, purpose, pem(before, purpose));
    const entries = rebuiltEntries(prior.entries, compromised, [pem(after, purpose)]);
    writes.push({ path: historyFile, bytes: JSON.stringify(sealKeyHistory(purpose, entries, after.keys[purpose]!.privateKeyPem, prior.revision + 1), null, 2), mode: 0o600 });
  }
  // A compromised key leaves every history that still admits it as an older key, not only the rotated purposes'.
  const scrubbed = LOCAL_PURPOSES.filter(purpose => compromised.size > 0 && !targets.has(purpose) && purpose !== "lease" && purpose !== "session");
  for (const purpose of scrubbed) {
    // A history that does not authenticate admits no older key already.
    const prior = readHistory(workspace, purpose, pem(after, purpose));
    if (prior === null || !prior.entries.some(entry => compromised.has(entry.fingerprint))) continue;
    writes.push({ path: purposeKeyPaths(workspace, purpose).historyFile,
      bytes: JSON.stringify(sealKeyHistory(purpose, rebuiltEntries(prior.entries, compromised, []), after.keys[purpose]!.privateKeyPem, prior.revision + 1), null, 2), mode: 0o600 });
  }
  for (const role of new Set([...targets].map(roleOfPurpose))) {
    const primary = ROLE_PRIMARY_PURPOSE[role as VaultKeyKind];
    const prior = authenticated(workspace, role, pem(before, primary));
    const added = LOCAL_PURPOSES.filter(purpose => targets.has(purpose) && roleOfPurpose(purpose) === role).map(purpose => pem(after, purpose));
    const entries = rebuiltEntries(prior.entries, compromised, added);
    writes.push({ path: paths[`${role}Public`], bytes: pem(after, primary), mode: 0o644 });
    writes.push({ path: paths[`${role}History`], bytes: JSON.stringify(sealKeyHistory(role, entries, after.keys[primary]!.privateKeyPem, prior.revision + 1), null, 2), mode: 0o600 });
  }
  return writes;
}

/** After the commit: each statement and history revision goes to the transparency log, and the marks rise. */
function anchorRotation(workspace: string, statements: ReadonlyArray<{ purpose: LocalPurpose; sha256: string; bytes: Buffer }>, writes: readonly KeysetWrite[]): void {
  const workspaceId = workspaceIdFromDirectory(workspace);
  for (const row of statements) {
    const target = { workspace, type: "KEY_ROTATION" as const, id: `${workspaceId}:${row.purpose}`, sequence: parseRotationStatement(row.bytes).statement.sequence, sha256: row.sha256 };
    logSequence(target);
    markSequence(target);
  }
  for (const write of writes) {
    const match = /([a-z-]+)_history\.json$/.exec(write.path);
    if (!match) continue;
    const envelope = JSON.parse(write.bytes.toString()) as KeyHistoryEnvelope;
    logSequence({ workspace, type: "KEY_HISTORY_REVISION", id: `${workspaceId}:${match[1]}`, sequence: envelope.revision, sha256: sha256Hex(canonicalize(envelope)) });
  }
}

/** `amc vault rotate-keys`: rotates ledger-row and receipt, which share the monitor key, to one new key. */
export function rotateMonitorKeyInVault(workspace: string, passphrase?: string): {
  fingerprint: string;
  publicKeyPath: string;
  rotationReceiptPath: string;
  recoveryDirectory: string;
} {
  const result = rotatePurposeKeys({ workspace, purposes: ["ledger-row", "receipt"], passphrase });
  const ledgerRow = result.rotated.find(row => row.purpose === "ledger-row")!;
  return { fingerprint: ledgerRow.nextKeyId, publicKeyPath: vaultPaths(workspace).monitorPublic, rotationReceiptPath: ledgerRow.statementPath, recoveryDirectory: result.recoveryDirectory };
}

/** `amc keys rotate --resume`: completes or rolls back an interrupted key change. */
export function resumeKeyRotation(workspace: string, passphrase: string | undefined = process.env.AMC_VAULT_PASSPHRASE): ReturnType<typeof resumeKeyset> {
  if (!passphrase) throw new Error("Resuming a key change requires the vault passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  const result = resumeKeyset(workspace, { vaultKeyIds: bytes => vaultEnvelopeKeyIds(bytes.toString("utf8"), passphrase) });
  forgetVaultEnvelope(workspace);
  return result;
}

const POP_TAG = "AMC_KEY_POP_V1";

function popBytes(body: { keyId: string; purpose: string; issuedAt: string }): Buffer {
  return Buffer.concat([Buffer.from(POP_TAG, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(body), "utf8")]);
}

/**
 * `amc keys export-public`: the purpose's public key, key id and a proof of possession (tag AMC_KEY_POP_V1, 0x00, the
 * canonical { keyId, purpose, issuedAt }) so an organisation can add the key to its own trust list.
 */
export function exportPublicKey(workspace: string, purpose: KeyPurpose): { purpose: LocalPurpose; keyId: string; publicKeyPem: string; proofOfPossession: { issuedAt: string; signature: string } } {
  const local = assertLocal(purpose);
  const privateKeyPem = getSigningKey(workspace, local);
  const publicKeyPem = publicKeyFromPrivate(privateKeyPem);
  const keyId = ed25519KeyId(publicKeyPem)!;
  const issuedAt = new Date().toISOString();
  return { purpose: local, keyId, publicKeyPem, proofOfPossession: { issuedAt, signature: sign(null, popBytes({ keyId, purpose: local, issuedAt }), privateKeyPem).toString("base64") } };
}

export function verifyProofOfPossession(exported: { purpose: string; keyId: string; publicKeyPem: string; proofOfPossession: { issuedAt: string; signature: string } }): boolean {
  if (ed25519KeyId(exported.publicKeyPem) !== exported.keyId || !(KEY_PURPOSES as readonly string[]).includes(exported.purpose)) return false;
  try {
    return verify(null, popBytes({ keyId: exported.keyId, purpose: exported.purpose, issuedAt: exported.proofOfPossession.issuedAt }),
      exported.publicKeyPem, Buffer.from(exported.proofOfPossession.signature, "base64"));
  } catch {
    return false;
  }
}

/** `amc keys list`: public information only, no vault unlock. */
export function listKeys(workspace: string): { generation: number | null; digest: string | null; anchoring: ReturnType<typeof keysetAnchoring>["state"]; complete: boolean; detail: string | null; purposes: Array<{ purpose: LocalPurpose; role: string; keyId: string | null; sharedWith: LocalPurpose[]; historyKeys: number; rotations: number }> } {
  let generation: number | null = null;
  let detail: string | null = null;
  try {
    generation = assertKeysetComplete(workspace)?.generation ?? null;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  const keyIds = new Map(LOCAL_PURPOSES.map(purpose => {
    try { return [purpose, ed25519KeyId(getSigningPublicKeyPem(workspace, purpose))] as const; } catch { return [purpose, null] as const; }
  }));
  const purposes = LOCAL_PURPOSES.map(purpose => {
    let historyKeys = 0;
    let rotations = 0;
    try { historyKeys = getPurposeKeyHistory(workspace, purpose).length; } catch { /* reported as 0 */ }
    try { rotations = readStatements(workspace, purpose).length; } catch { /* reported as 0 */ }
    const keyId = keyIds.get(purpose) ?? null;
    return { purpose, role: roleOfPurpose(purpose), keyId, sharedWith: LOCAL_PURPOSES.filter(other => other !== purpose && keyId !== null && keyIds.get(other) === keyId), historyKeys, rotations };
  });
  // The digest another machine needs for `amc keys rotate --accept`, and how this machine holds the key set.
  return { generation, digest: keysetIdentity(workspace)?.sha256 ?? null, anchoring: keysetAnchoring(workspace).state, complete: detail === null, detail, purposes };
}

/**
 * `amc keys revoke`: records that a retired key of `purpose` must no longer be admitted, in the workspace's signed,
 * sequenced and anchored key revocation list (`.amc/keys/revocations.signed.json`, revocation-list purpose). A key a
 * purpose still signs with is refused: rotate it first. The workspace's own self-check honours the list; portable
 * verifiers learn of it when the trust-list owner publishes the revocation.
 */
export function revokeKey(workspace: string, purpose: KeyPurpose, keyId: string, reason: KeyRevocationReason,
  passphrase: string | undefined = process.env.AMC_VAULT_PASSPHRASE): { listId: string; sequence: number } {
  assertOwnerMode(workspace, "keys revoke");
  if (!passphrase) throw new Error("Key revocation requires the vault passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  // The owner's gate, as for a rotation: the real passphrase opens the vault and its keys match the published ones.
  unlockedPayloadForKeyChange(workspace, passphrase);
  const local = assertLocal(purpose);
  if (!/^[0-9a-f]{64}$/.test(keyId)) throw new Error("--key-id must be a 64 hex key id");
  if (!(KEY_REVOCATION_REASONS as readonly string[]).includes(reason)) throw new Error(`--reason must be one of ${KEY_REVOCATION_REASONS.join(", ")}`);
  if (LOCAL_PURPOSES.some(other => ed25519KeyId(getSigningPublicKeyPem(workspace, other)) === keyId)) {
    throw new Error(`key ${keyId} still signs for this workspace; rotate it first (amc keys rotate --purpose ${local})`);
  }
  if (!getPurposeKeyHistory(workspace, local).some(pem => ed25519KeyId(pem) === keyId)) throw new Error(`key ${keyId} is not in the ${local} key history`);
  return withControlFileLock({ root: vaultPaths(workspace).keysDir, name: "key-revocations", operation: () => {
    const location = keyRevocationLocation(workspace);
    recoverPendingRevocationList(location);
    const current = readAnchoredRevocationList(location);
    if (current === null) {
      if (keysetDeclared(workspace)) throw new Error("the workspace key revocation list is missing; restore it before revoking");
      assertNeverAnchored(workspace, "REVOCATION_LIST", location.listId);
    }
    const rows = [...(current?.list.revoked ?? []).filter(row => row.id !== keyId),
      { id: keyId, kind: "key" as const, revokedAt: new Date().toISOString(), reason: `${reason}: ${local}` }];
    const previous = current ? { sequence: current.list.sequence, sha256: revocationListSha256(current.list) } : null;
    const published = publishRevocationList(location, nextRevocationList(location.listId, previous, rows, 0), getSigningKey(workspace, "revocation-list"), logSequence);
    return { listId: location.listId, sequence: published.list.sequence };
  } });
}

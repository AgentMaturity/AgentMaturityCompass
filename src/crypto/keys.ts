import { sign, verify, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { ensureVaultAndPublicKeys, getVaultPrivateKeyPem, vaultPaths } from "../vault/vault.js";
import {
  buildKeyHistoryEntry
} from "./keyHistoryChain.js";
import { publicKeyFromPrivate, sealKeyHistory, validHistoryEntry, verifyKeyHistoryEnvelope, type KeyHistoryEnvelope, type KeyHistoryRole } from "./keyHistoryEnvelope.js";

/** Admission verification is independent of an unlocked vault. */
export function verifyKeyHistoryChain(
  workspace: string,
  kind: KeyHistoryRole
): { ok: boolean; brokenAtIndex: number | null; legacyEntries: number; reason: string | null } {
  const file = historyPath(workspace, kind);
  if (!pathExists(file)) return { ok: false, brokenAtIndex: null, legacyEntries: 0, reason: "history admission envelope is missing" };
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    const result = verifyKeyHistoryEnvelope(value, kind, getPublicKeyPem(workspace, kind));
    return { ok: result.valid, brokenAtIndex: result.valid ? null : 0, legacyEntries: Array.isArray(value) ? value.length : 0, reason: result.reason };
  } catch {
    return { ok: false, brokenAtIndex: 0, legacyEntries: 0, reason: "history or current key could not be read" };
  }
}

function keyDir(workspace: string): string {
  return join(workspace, ".amc", "keys");
}

function historyPath(workspace: string, kind: "monitor" | "auditor" | "lease" | "session"): string {
  return join(keyDir(workspace), `${kind}_history.json`);
}

function publicPath(workspace: string, kind: "monitor" | "auditor" | "lease" | "session"): string {
  return join(keyDir(workspace), `${kind}_ed25519.pub`);
}

export function getAuthenticatedKeyHistory(workspace: string, kind: KeyHistoryRole): KeyHistoryEnvelope | null {
  try {
    const value: unknown = JSON.parse(readFileSync(historyPath(workspace, kind), "utf8"));
    return verifyKeyHistoryEnvelope(value, kind, getPublicKeyPem(workspace, kind)).envelope;
  } catch {
    return null;
  }
}

export function addPublicKeyToHistory(
  workspace: string,
  kind: KeyHistoryRole,
  publicPem: string,
  source: "local" | "notary" | "imported" = "local"
): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("Key admission is unavailable in no-sign mode");
  const current = getPublicKeyPem(workspace, kind);
  const privateKey = getVaultPrivateKeyPem(workspace, kind);
  if (publicKeyFromPrivate(privateKey) !== current) {
    throw new Error("Key admission requires the active vault role key; no-sign or mismatched keys cannot authorize history");
  }
  const prior = getAuthenticatedKeyHistory(workspace, kind);
  if (!prior) throw new Error(`${kind} key history is not authenticated; explicitly migrate reviewed history before admitting keys`);
  if (prior.entries.some((entry) => entry.publicKeyPem === publicPem)) return;
  const next = [...prior.entries, buildKeyHistoryEntry(publicPem, prior.entries, source)];
  const envelope = sealKeyHistory(kind, next, privateKey, prior.revision + 1);
  writeFileAtomic(historyPath(workspace, kind), JSON.stringify(envelope, null, 2), 0o600);
  if (source !== "local") console.warn(`[amc] Explicit ${source} admission expanded the ${kind} signing role (${next[next.length - 1]!.fingerprint}).`);
}

/** Explicit recovery of reviewed legacy keys; a hash binds approval to exact bytes. */
export function migratePublicKeyHistory(params: {
  workspace: string;
  kind: KeyHistoryRole;
  expectedSha256: string;
  approvedFingerprints: readonly string[];
}): { path: string; backupPath: string; admittedFingerprints: string[] } {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("History migration is unavailable in no-sign mode");
  const file = historyPath(params.workspace, params.kind);
  const original = readFileSync(file, "utf8");
  const digest = sha256Hex(Buffer.from(original, "utf8"));
  if (digest !== params.expectedSha256) throw new Error("History changed since review; expected SHA-256 does not match");
  const current = getPublicKeyPem(params.workspace, params.kind);
  const privateKey = getVaultPrivateKeyPem(params.workspace, params.kind);
  if (publicKeyFromPrivate(privateKey) !== current) throw new Error("Migration requires the active vault role key");
  if (getAuthenticatedKeyHistory(params.workspace, params.kind)) throw new Error("History is already authenticated; migration is for untrusted legacy or damaged history only");
  let candidates: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(original);
    if (Array.isArray(parsed)) candidates = parsed;
    else if (parsed && typeof parsed === "object" && "entries" in parsed && Array.isArray(parsed.entries)) candidates = parsed.entries;
  } catch { /* explicit current-only reset may discard malformed bytes */ }
  if (candidates.length > 10000) throw new Error("History exceeds migration entry limit");
  const entries = [buildKeyHistoryEntry(current, [])];
  for (const fingerprint of new Set(params.approvedFingerprints)) {
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Approved fingerprints must be exact lowercase SHA-256 values");
    if (fingerprint === entries[0]!.fingerprint) continue;
    const matching = candidates.filter((entry) => validHistoryEntry(entry) && entry.fingerprint === fingerprint);
    if (matching.length !== 1 || !validHistoryEntry(matching[0])) throw new Error(`Approved fingerprint is missing, invalid or duplicated: ${fingerprint}`);
    entries.push(buildKeyHistoryEntry(matching[0].publicKeyPem, entries, "imported"));
  }
  const envelope = sealKeyHistory(params.kind, entries, privateKey);
  const backupPath = `${file}.untrusted-${digest}`;
  writeFileAtomic(backupPath, original, 0o600);
  writeFileAtomic(file, JSON.stringify(envelope, null, 2), 0o600);
  return { path: file, backupPath, admittedFingerprints: entries.map((entry) => entry.fingerprint) };
}

export function ensureSigningKeys(workspace: string): void {
  ensureDir(keyDir(workspace));
  ensureVaultAndPublicKeys(workspace);
}

export function getPrivateKeyPem(workspace: string, kind: "monitor" | "auditor" | "lease" | "session"): string {
  return getVaultPrivateKeyPem(workspace, kind);
}

export function getPublicKeyPem(workspace: string, kind: "monitor" | "auditor" | "lease" | "session"): string {
  const p = publicPath(workspace, kind);
  if (!pathExists(p)) {
    throw new Error(`Missing public key: ${p}`);
  }
  return readFileSync(p, "utf8");
}

export function getPublicKeyHistory(workspace: string, kind: KeyHistoryRole): string[] {
  const current = getPublicKeyPem(workspace, kind);
  const history = getAuthenticatedKeyHistory(workspace, kind);
  return [...new Set([...(history?.entries.map((entry) => entry.publicKeyPem) ?? []), current])];
}

export function isSha256HexDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function assertSha256HexDigest(value: string): void {
  if (!isSha256HexDigest(value)) throw new Error("Signing requires exactly 64 lowercase hexadecimal SHA-256 characters");
}

export function signHexDigest(digestHex: string, privateKeyPem: string): string {
  assertSha256HexDigest(digestHex);
  const signature = sign(null, Buffer.from(digestHex, "hex"), privateKeyPem);
  return signature.toString("base64");
}

/**
 * Signs a hex digest with an already-parsed private key.
 *
 * `sign(null, data, pem)` re-parses the PEM into a key object on every call.
 * A caller that signs in a hot loop — the ledger, once per appended event —
 * pays that parse each time for a key that never changes. Passing a KeyObject
 * it parsed once (via crypto.createPrivateKey) avoids the re-parse; the produced
 * signature is byte-identical to signHexDigest's, so verification is unaffected.
 */
export function signHexDigestWith(privateKey: KeyObject, digestHex: string): string {
  assertSha256HexDigest(digestHex);
  const signature = sign(null, Buffer.from(digestHex, "hex"), privateKey);
  return signature.toString("base64");
}

export function verifyHexDigest(digestHex: string, signatureB64: string, publicKeyPem: string): boolean {
  if (!isSha256HexDigest(digestHex)) return false;
  try {
    return verify(null, Buffer.from(digestHex, "hex"), publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export function verifyHexDigestAny(digestHex: string, signatureB64: string, publicKeys: string[]): boolean {
  return publicKeys.some((pub) => verifyHexDigest(digestHex, signatureB64, pub));
}

export function keyPaths(workspace: string): {
  vaultFile: string;
  vaultMeta: string;
  monitorPublic: string;
  auditorPublic: string;
  leasePublic: string;
  sessionPublic: string;
} {
  const paths = vaultPaths(workspace);
  return {
    vaultFile: paths.vaultFile,
    vaultMeta: paths.metaFile,
    monitorPublic: paths.monitorPublic,
    auditorPublic: paths.auditorPublic,
    leasePublic: paths.leasePublic,
    sessionPublic: paths.sessionPublic
  };
}

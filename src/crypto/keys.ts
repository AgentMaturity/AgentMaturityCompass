import { sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { ensureVaultAndPublicKeys, getVaultPrivateKeyPem, vaultPaths } from "../vault/vault.js";

interface KeyHistoryItem {
  createdTs: number;
  fingerprint: string;
  publicKeyPem: string;
  /**
   * sha256 over the previous entry's hash plus this entry's own fields.
   *
   * The key history is the root of trust for signature verification:
   * verifyHexDigestAny accepts a signature if ANY listed key validates it, so
   * writing one public key into this file forges every signature of that role.
   * Chaining makes a silent insertion or reordering detectable — an attacker
   * must rewrite every later entry, not just append one.
   *
   * Optional so histories written before chaining still load; those entries
   * verify as "legacy" rather than failing closed on data that predates the
   * mechanism.
   */
  entryHash?: string;
  prevHash?: string;
  /**
   * How this key entered the trust set.
   *
   * "local" keys were generated in this workspace's vault. "notary" keys were
   * admitted because a notary response passed fingerprint pinning — a real but
   * permanent expansion of who can sign for this role, which was previously
   * silent. Recording the source lets an auditor see at a glance whether a role
   * gained keys from outside.
   */
  source?: "local" | "notary" | "imported";
}

/** Computes the chain hash for an entry. */
function keyHistoryEntryHash(
  item: Pick<KeyHistoryItem, "createdTs" | "fingerprint" | "publicKeyPem">,
  prevHash: string
): string {
  return sha256Hex(
    Buffer.from(`${prevHash}|${item.createdTs}|${item.fingerprint}|${item.publicKeyPem}`, "utf8")
  );
}

/**
 * Verifies the key-history chain for a role.
 *
 * Returns the index of the first broken link, or null when the chain is intact.
 * Entries without a hash are treated as legacy and skipped rather than failed.
 */
export function verifyKeyHistoryChain(
  workspace: string,
  kind: "monitor" | "auditor" | "lease" | "session"
): { ok: boolean; brokenAtIndex: number | null; legacyEntries: number } {
  const file = historyPath(workspace, kind);
  if (!pathExists(file)) return { ok: true, brokenAtIndex: null, legacyEntries: 0 };
  const entries = JSON.parse(readFileSync(file, "utf8")) as KeyHistoryItem[];
  let prev = "GENESIS";
  let legacy = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (!entry.entryHash) {
      legacy += 1;
      prev = "GENESIS";
      continue;
    }
    const expected = keyHistoryEntryHash(entry, entry.prevHash ?? prev);
    if (expected !== entry.entryHash) {
      return { ok: false, brokenAtIndex: i, legacyEntries: legacy };
    }
    prev = entry.entryHash;
  }
  return { ok: true, brokenAtIndex: null, legacyEntries: legacy };
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

function ensureHistoryEntry(
  workspace: string,
  kind: "monitor" | "auditor" | "lease" | "session",
  publicPem: string,
  source: "local" | "notary" | "imported" = "local"
): void {
  const file = historyPath(workspace, kind);
  const existing: KeyHistoryItem[] = pathExists(file) ? JSON.parse(readFileSync(file, "utf8")) as KeyHistoryItem[] : [];
  if (!existing.some((item) => item.publicKeyPem === publicPem)) {
    const prevHash = existing.length > 0 ? (existing[existing.length - 1]!.entryHash ?? "GENESIS") : "GENESIS";
    const base = {
      createdTs: Date.now(),
      fingerprint: sha256Hex(Buffer.from(publicPem, "utf8")),
      publicKeyPem: publicPem
    };
    existing.push({ ...base, prevHash, entryHash: keyHistoryEntryHash(base, prevHash), source });
    if (source !== "local") {
      // Admitting an external key permanently widens who can sign for this
      // role; say so rather than doing it silently.
      console.warn(
        `[amc] ${kind} trust set expanded with a ${source} key (${base.fingerprint.slice(0, 16)}...). ` +
          `Review with: amc doctor`
      );
    }
    // 0600: this file decides which keys can sign as this role, so it must not
    // be writable (or readable) by other users on the host.
    writeFileAtomic(file, JSON.stringify(existing, null, 2), 0o600);
  }
}

export function addPublicKeyToHistory(
  workspace: string,
  kind: "monitor" | "auditor" | "lease" | "session",
  publicPem: string,
  source: "local" | "notary" | "imported" = "local"
): void {
  ensureDir(keyDir(workspace));
  const file = historyPath(workspace, kind);
  if (!pathExists(file)) {
    writeFileAtomic(file, "[]", 0o600);
  }
  ensureHistoryEntry(workspace, kind, publicPem, source);
}

export function ensureSigningKeys(workspace: string): void {
  ensureDir(keyDir(workspace));
  ensureVaultAndPublicKeys(workspace);

  // keep key history compatible with existing verify logic
  const monitorPub = getPublicKeyPem(workspace, "monitor");
  const auditorPub = getPublicKeyPem(workspace, "auditor");
  const leasePub = getPublicKeyPem(workspace, "lease");
  const sessionPub = getPublicKeyPem(workspace, "session");
  const monitorHistoryFile = historyPath(workspace, "monitor");
  const auditorHistoryFile = historyPath(workspace, "auditor");
  const leaseHistoryFile = historyPath(workspace, "lease");
  const sessionHistoryFile = historyPath(workspace, "session");

  if (!pathExists(monitorHistoryFile)) {
    writeFileAtomic(monitorHistoryFile, "[]", 0o644);
  }
  if (!pathExists(auditorHistoryFile)) {
    writeFileAtomic(auditorHistoryFile, "[]", 0o644);
  }
  if (!pathExists(leaseHistoryFile)) {
    writeFileAtomic(leaseHistoryFile, "[]", 0o644);
  }
  if (!pathExists(sessionHistoryFile)) {
    writeFileAtomic(sessionHistoryFile, "[]", 0o644);
  }
  ensureHistoryEntry(workspace, "monitor", monitorPub);
  ensureHistoryEntry(workspace, "auditor", auditorPub);
  ensureHistoryEntry(workspace, "lease", leasePub);
  ensureHistoryEntry(workspace, "session", sessionPub);
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

export function getPublicKeyHistory(workspace: string, kind: "monitor" | "auditor" | "lease" | "session"): string[] {
  const file = historyPath(workspace, kind);
  if (!pathExists(file)) {
    return [getPublicKeyPem(workspace, kind)];
  }
  const entries: KeyHistoryItem[] = JSON.parse(readFileSync(file, "utf8")) as KeyHistoryItem[];
  const out = new Set<string>(entries.map((entry) => entry.publicKeyPem));
  out.add(getPublicKeyPem(workspace, kind));
  return [...out];
}

export function signHexDigest(digestHex: string, privateKeyPem: string): string {
  const signature = sign(null, Buffer.from(digestHex, "hex"), privateKeyPem);
  return signature.toString("base64");
}

export function verifyHexDigest(digestHex: string, signatureB64: string, publicKeyPem: string): boolean {
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

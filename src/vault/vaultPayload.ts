/**
 * Vault payload formats (P1-08). v1 holds four role keys; v2 holds one key per local signing purpose. A v1 payload is
 * read as v2 through ROLE_PURPOSES (same key bytes, no forced rotation); unlocking writes it back as v2. Keys for
 * release, notary, trust-list-root, evidence-authority and independent-attestation never live in a workspace vault.
 */
import { createPrivateKey, createPublicKey } from "node:crypto";
import { ROLE_PURPOSES, type KeyPurpose } from "../trust/keyPurposes.js";
import { sha256Hex } from "../utils/hash.js";

export const LOCAL_PURPOSES = ["ledger-row", "receipt", "artifact-seal", "revocation-list", "config-signature", "lease", "session"] as const;
export type LocalPurpose = (typeof LOCAL_PURPOSES)[number];
export type VaultRole = keyof typeof ROLE_PURPOSES;

/** The purpose whose key a role's `<role>_ed25519.pub` names and whose key signs the role's key history. */
export const ROLE_PRIMARY_PURPOSE: Record<VaultRole, LocalPurpose> = { monitor: "ledger-row", auditor: "artifact-seal", lease: "lease", session: "session" };

export interface PurposeKey {
  keyId: string;
  privateKeyPem: string;
  createdTs: number;
}

export interface VaultPayloadV2 {
  v: 2;
  keys: Partial<Record<LocalPurpose, PurposeKey>>;
  secrets: Record<string, string>;
}

const UNSAFE_SECRET_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isLocalPurpose(purpose: string): purpose is LocalPurpose {
  return (LOCAL_PURPOSES as readonly string[]).includes(purpose);
}

export function roleOfPurpose(purpose: LocalPurpose): VaultRole {
  return (Object.keys(ROLE_PURPOSES) as VaultRole[]).find(role => (ROLE_PURPOSES[role] as readonly KeyPurpose[]).includes(purpose))!;
}

/** sha256 of the key's canonical SPKI PEM: the id trust lists, histories and statements use. */
function keyIdOfPrivate(privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("vault keys must be Ed25519");
  return sha256Hex(Buffer.from(createPublicKey(key).export({ format: "pem", type: "spki" }).toString(), "utf8"));
}

export function purposeKey(privateKeyPem: string, createdTs: number): PurposeKey {
  return { keyId: keyIdOfPrivate(privateKeyPem), privateKeyPem, createdTs };
}

export function safeSecrets(input: unknown): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  if (typeof input !== "object" || input === null) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!UNSAFE_SECRET_KEYS.has(key) && typeof value === "string") out[key] = value;
  }
  return out;
}

/** Same key bytes as the v1 roles: each role's key serves every purpose ROLE_PURPOSES lists for it. */
export function payloadFromRoleKeys(roleKeys: Partial<Record<VaultRole, string>>, secrets: Record<string, string>, createdTs: number): VaultPayloadV2 {
  const keys: VaultPayloadV2["keys"] = {};
  for (const role of Object.keys(ROLE_PURPOSES) as VaultRole[]) {
    const pem = roleKeys[role];
    if (!pem) continue;
    const key = purposeKey(pem, createdTs);
    for (const purpose of ROLE_PURPOSES[role]) keys[purpose] = key;
  }
  return { v: 2, keys, secrets: safeSecrets(secrets) };
}

/** Parses v1 or v2 into v2. A v2 key whose id does not match its private key, or a non-local purpose, is refused. */
export function parseVaultPayload(raw: string): { payload: VaultPayloadV2; sourceVersion: 1 | 2 } {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.v === 1 && typeof parsed.monitorPrivateKeyPem === "string" && typeof parsed.auditorPrivateKeyPem === "string") {
    const role = (name: string) => typeof parsed[`${name}PrivateKeyPem`] === "string" && parsed[`${name}PrivateKeyPem`] !== "" ? parsed[`${name}PrivateKeyPem`] as string : undefined;
    const createdTs = typeof parsed.createdTs === "number" ? parsed.createdTs : Date.now();
    return { payload: payloadFromRoleKeys({ monitor: role("monitor"), auditor: role("auditor"), lease: role("lease"), session: role("session") }, safeSecrets(parsed.secrets), createdTs), sourceVersion: 1 };
  }
  if (parsed.v !== 2 || typeof parsed.keys !== "object" || parsed.keys === null || typeof parsed.secrets !== "object" || parsed.secrets === null) {
    throw new Error("Invalid vault payload format");
  }
  const keys: VaultPayloadV2["keys"] = {};
  for (const [purpose, value] of Object.entries(parsed.keys as Record<string, unknown>)) {
    const entry = value as Partial<PurposeKey> | null;
    if (!isLocalPurpose(purpose) || typeof entry?.privateKeyPem !== "string" || typeof entry.keyId !== "string" || typeof entry.createdTs !== "number"
      || keyIdOfPrivate(entry.privateKeyPem) !== entry.keyId) throw new Error("Invalid vault payload format");
    keys[purpose] = { keyId: entry.keyId, privateKeyPem: entry.privateKeyPem, createdTs: entry.createdTs };
  }
  if (!keys["ledger-row"] || !keys["artifact-seal"]) throw new Error("Invalid vault payload format");
  return { payload: { v: 2, keys, secrets: safeSecrets(parsed.secrets) }, sourceVersion: 2 };
}

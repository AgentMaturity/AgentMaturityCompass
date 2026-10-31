import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildKeyHistoryEntry } from "../../src/crypto/keyHistoryChain.js";
import { sealKeyHistory } from "../../src/crypto/keyHistoryEnvelope.js";
import { vaultPaths } from "../../src/vault/vault.js";
import { decryptVaultPayload, encryptVaultPayload } from "../../src/vault/vaultCrypto.js";

/**
 * P1-08: vaults are written as payload v2 (one key per purpose). Tests that need a 1.x vault rebuild its v1 payload
 * (four role keys) from the v2 one; delete `leasePrivateKeyPem` or `sessionPrivateKeyPem` for a pre-lease vault.
 */
export function legacyV1Payload(vaultFile: string, passphrase: string): Record<string, unknown> & { secrets: Record<string, string> } {
  const v2 = JSON.parse(decryptVaultPayload(JSON.parse(readFileSync(vaultFile, "utf8")), passphrase).toString("utf8")) as {
    keys: Record<string, { privateKeyPem: string }>; secrets: Record<string, string>;
  };
  return {
    v: 1, createdTs: 1, secrets: v2.secrets,
    monitorPrivateKeyPem: v2.keys["ledger-row"]!.privateKeyPem,
    auditorPrivateKeyPem: v2.keys["artifact-seal"]!.privateKeyPem,
    leasePrivateKeyPem: v2.keys.lease!.privateKeyPem,
    sessionPrivateKeyPem: v2.keys.session!.privateKeyPem
  };
}

type Role = "monitor" | "auditor" | "lease" | "session";
const pair = () => {
  const keys = generateKeyPairSync("ed25519");
  return { privatePem: keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString() };
};

/** A workspace exactly as AMC 1.x left it: a v1 vault, role public keys and role histories, nothing else. The caller removes `root`. */
export function v1Workspace(passphrase: string): { root: string; roles: Record<Role, ReturnType<typeof pair>>; envelope: string } {
  const root = mkdtempSync(join(tmpdir(), "amc-v1-vault-"));
  const roles = { monitor: pair(), auditor: pair(), lease: pair(), session: pair() };
  const paths = vaultPaths(root);
  mkdirSync(paths.keysDir, { recursive: true });
  const payload = { v: 1, createdTs: 1, secrets: { kept: "secret" }, ...Object.fromEntries(Object.entries(roles).map(([role, keys]) => [`${role}PrivateKeyPem`, keys.privatePem])) };
  const envelope = JSON.stringify(encryptVaultPayload(Buffer.from(JSON.stringify(payload)), passphrase), null, 2);
  writeFileSync(paths.vaultFile, envelope, { mode: 0o600 });
  for (const role of ["monitor", "auditor", "lease", "session"] as const) {
    writeFileSync(paths[`${role}Public`], roles[role].publicPem);
    writeFileSync(paths[`${role}History`], JSON.stringify(sealKeyHistory(role, [buildKeyHistoryEntry(roles[role].publicPem, [])], roles[role].privatePem)));
  }
  return { root, roles, envelope };
}

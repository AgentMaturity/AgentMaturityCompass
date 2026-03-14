import { generateKeyPairSync, sign, verify } from "node:crypto";
import { setVaultSecret, getVaultSecret, unlockVault, vaultStatus } from "../vault/vault.js";
import { sha256Hex } from "../utils/hash.js";

const FED_PRIVATE_KEY = "federation/publisher/privateKeyPem";
const FED_PUBLIC_KEY = "federation/publisher/publicKeyPem";

function ensureVaultUnlocked(workspace: string): void {
  const status = vaultStatus(workspace);
  if (!status.unlocked) {
    const passphrase = process.env.AMC_VAULT_PASSPHRASE;
    if (!passphrase || passphrase.length === 0) {
      throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or set AMC_VAULT_PASSPHRASE env var before federation operations.");
    }
    unlockVault(workspace, passphrase);
  }
}

export function ensureFederationPublisherKey(workspace: string): {
  privateKeyPem: string;
  publicKeyPem: string;
  fingerprint: string;
} {
  ensureVaultUnlocked(workspace);
  let privateKeyPem = getVaultSecret(workspace, FED_PRIVATE_KEY);
  let publicKeyPem = getVaultSecret(workspace, FED_PUBLIC_KEY);
  if (!privateKeyPem || !publicKeyPem) {
    const pair = generateKeyPairSync("ed25519");
    privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    setVaultSecret(workspace, FED_PRIVATE_KEY, privateKeyPem);
    setVaultSecret(workspace, FED_PUBLIC_KEY, publicKeyPem);
  }
  return {
    privateKeyPem,
    publicKeyPem,
    fingerprint: sha256Hex(Buffer.from(publicKeyPem, "utf8"))
  };
}

export function signFederationDigest(workspace: string, digestHex: string): string {
  const { privateKeyPem } = ensureFederationPublisherKey(workspace);
  return sign(null, Buffer.from(digestHex, "hex"), privateKeyPem).toString("base64");
}

export function verifyFederationDigest(digestHex: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    return verify(null, Buffer.from(digestHex, "hex"), publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

import inquirer from "inquirer";
import { createVault, ensureVaultAndPublicKeys, lockVault, rotateMonitorKeyInVault, unlockVault, vaultExists, vaultPaths, vaultStatus } from "./vault.js";
import { generateKeyPairSync } from "node:crypto";

async function promptPassphrase(message: string): Promise<string> {
  const answers = await inquirer.prompt<{ passphrase: string }>([
    {
      type: "password",
      name: "passphrase",
      message,
      mask: "*"
    }
  ]);
  return answers.passphrase;
}

export async function initVaultInteractive(workspace: string): Promise<{ vaultFile: string; metaFile: string }> {
  const paths = vaultPaths(workspace);
  if (vaultExists(workspace)) {
    ensureVaultAndPublicKeys(workspace);
    return {
      vaultFile: paths.vaultFile,
      metaFile: paths.metaFile
    };
  }

  const passphrase = process.env.AMC_VAULT_PASSPHRASE ?? (await promptPassphrase("Vault passphrase:"));
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Vault passphrase must be at least 8 characters.");
  }

  const monitor = generateKeyPairSync("ed25519");
  const auditor = generateKeyPairSync("ed25519");
  const lease = generateKeyPairSync("ed25519");
  const session = generateKeyPairSync("ed25519");

  return createVault({
    workspace,
    passphrase,
    monitorPrivateKeyPem: monitor.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    auditorPrivateKeyPem: auditor.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    leasePrivateKeyPem: lease.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    sessionPrivateKeyPem: session.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    monitorPublicKeyPem: monitor.publicKey.export({ format: "pem", type: "spki" }).toString(),
    auditorPublicKeyPem: auditor.publicKey.export({ format: "pem", type: "spki" }).toString(),
    leasePublicKeyPem: lease.publicKey.export({ format: "pem", type: "spki" }).toString(),
    sessionPublicKeyPem: session.publicKey.export({ format: "pem", type: "spki" }).toString()
  });
}

export async function unlockVaultInteractive(workspace: string): Promise<string> {
  const passphrase = process.env.AMC_VAULT_PASSPHRASE ?? (await promptPassphrase("Unlock vault passphrase:"));
  unlockVault(workspace, passphrase);
  return passphrase;
}

export function lockVaultNow(workspace: string): void {
  lockVault(workspace);
}

export function vaultStatusNow(workspace: string): ReturnType<typeof vaultStatus> {
  return vaultStatus(workspace);
}

export async function rotateVaultKeysInteractive(workspace: string): Promise<ReturnType<typeof rotateMonitorKeyInVault>> {
  const passphrase = process.env.AMC_VAULT_PASSPHRASE ?? (await promptPassphrase("Passphrase for key rotation:"));
  return rotateMonitorKeyInVault(workspace, passphrase);
}

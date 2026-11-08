import inquirer from "inquirer";
import { rotateMonitorKeyInVault } from "../keys/purposeKeys.js";
import { createVault, encryptedVaultBytes, ensureVaultAndPublicKeys, lockVault, unlockedPayloadForKeyChange, unlockVault, vaultExists, vaultMetaBytes,
  vaultPaths, vaultStatus } from "./vault.js";
import { forgetVaultPassphrase, operatorRememberedPassphrase } from "./passphraseStore.js";
import { writeFileAtomic } from "../utils/fs.js";
import { generateKeyPairSync } from "node:crypto";

export async function promptPassphrase(message: string): Promise<string> {
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

/**
 * AMC_VAULT_PASSPHRASE, else the passphrase `amc up` remembered for this workspace (an interactive operator only:
 * operatorRememberedPassphrase), else a prompt. Without a terminal there is nobody to prompt, so it refuses with the fix.
 */
export async function unlockVaultInteractive(workspace: string): Promise<string> {
  const passphrase = process.env.AMC_VAULT_PASSPHRASE ?? operatorRememberedPassphrase(workspace)?.passphrase
    ?? (await promptUnlockPassphrase());
  unlockVault(workspace, passphrase);
  return passphrase;
}

function promptUnlockPassphrase(): Promise<string> {
  if (process.stdin.isTTY !== true) {
    throw new Error("Vault passphrase needed: export AMC_VAULT_PASSPHRASE for this shell, or re-run this command from your terminal.");
  }
  return promptPassphrase("Unlock vault passphrase:");
}

/**
 * LIVE-VAULT-19: re-seals the vault under a new passphrase with the same keys, so every key id, signature and the key set
 * stay as they are. The envelope and its meta are rewritten (each atomically) the way createVault writes them; then this
 * process's session is locked and the remembered entry, which holds the old passphrase, is forgotten.
 */
export function changeVaultPassphrase(workspace: string, current: string, next: string): void {
  if (next === current) throw new Error("The new vault passphrase is the current one; nothing changed.");
  const payload = unlockedPayloadForKeyChange(workspace, current);
  const paths = vaultPaths(workspace);
  writeFileAtomic(paths.vaultFile, encryptedVaultBytes(payload, next), 0o600);
  writeFileAtomic(paths.metaFile, vaultMetaBytes(payload), 0o644);
  lockVault(workspace);
  forgetVaultPassphrase(workspace);
}

/** `amc vault passphrase`: the current passphrase from AMC_VAULT_PASSPHRASE, the operator-gated remembered store or a prompt; the new one typed twice, never argv. */
export async function changeVaultPassphraseInteractive(workspace: string): Promise<void> {
  if (process.stdin.isTTY !== true) throw new Error("A new vault passphrase is typed at a prompt, never passed on the command line: re-run this command from your terminal.");
  const current = process.env.AMC_VAULT_PASSPHRASE || operatorRememberedPassphrase(workspace)?.passphrase || (await promptPassphrase("Current vault passphrase:"));
  const next = await promptPassphrase("New vault passphrase (at least 8 characters):");
  if ((await promptPassphrase("Repeat the new vault passphrase:")) !== next) throw new Error("The new passphrases do not match; nothing changed.");
  changeVaultPassphrase(workspace, current, next);
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

import chalk from "chalk";
import inquirer from "inquirer";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { assertKeysetComplete, commitKeyset, keysetFileRel, resealRecoveryVaults, type KeysetWrite } from "../keys/keyset.js";
import { rotateMonitorKeyInVault } from "../keys/purposeKeys.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { sha256Hex } from "../utils/hash.js";
import { createVault, encryptedVaultBytes, ensureVaultAndPublicKeys, keyIdsOf, lockVault, unlockedPayloadForKeyChange, unlockVault, vaultExists, vaultMetaBytes,
  vaultPaths, vaultStatus, withVaultEnvelopeLock } from "./vault.js";
import { resealVaultEnvelope } from "./vaultCrypto.js";
import { localVaultPassphrasePath } from "./localPassphrase.js";
import { vaultPassphraseFromEnv } from "./passphraseFile.js";
import { forgetVaultPassphrase, operatorRememberedPassphrase } from "./passphraseStore.js";
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

  const passphrase = vaultPassphraseFromEnv() ?? (await promptPassphrase("Vault passphrase:"));
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
 * AMC_VAULT_PASSPHRASE (or AMC_VAULT_PASSPHRASE_FILE), else the passphrase `amc up` remembered for this workspace (an interactive operator only:
 * operatorRememberedPassphrase), else a prompt. Without a terminal there is nobody to prompt, so it refuses with the fix.
 */
export async function unlockVaultInteractive(workspace: string): Promise<string> {
  const passphrase = vaultPassphraseFromEnv() ?? operatorRememberedPassphrase(workspace)?.passphrase
    ?? (await promptUnlockPassphrase());
  unlockVault(workspace, passphrase);
  return passphrase;
}

function promptUnlockPassphrase(): Promise<string> {
  if (process.stdin.isTTY !== true) {
    throw new Error("Vault passphrase needed: export AMC_VAULT_PASSPHRASE (or AMC_VAULT_PASSPHRASE_FILE) for this shell, or re-run this command from your terminal.");
  }
  return promptPassphrase("Unlock vault passphrase:");
}

/** What `amc vault passphrase` changed (LIVE-VAULT-19). */
export interface VaultPassphraseChange {
  /** The key-set generation that carries the re-sealed vault; the key ids are the ones before. */
  generation: number;
  /** Copies of the vault AMC keeps in AMC home (key-set recovery copies, the replaced 1.x vault), re-sealed. */
  resealedCopies: number;
  /** Sealed files that did not open with the current passphrase and were left as they are. */
  unopenedCopies: string[];
  /** `.amc/local-vault-passphrase`, which held the old passphrase, was removed. */
  localPassphraseRemoved: boolean;
}

/**
 * LIVE-VAULT-19: re-seals the vault under a new passphrase with the same keys, as one key-set generation, so key ids and
 * signatures stay as they are. SR-V1: it holds the key-change lock (rotation, revocation, provider changes) and the
 * vault-envelope lock (secret writes), and inside them re-opens the vault and refuses when its contents changed since the
 * passphrase was checked. The generation also re-seals the child vaults the key set pins (sealed under the vault
 * passphrase). Then this process's session is locked, the remembered entry and `.amc/local-vault-passphrase` (both hold
 * the old passphrase) are removed, and every copy of the vault AMC keeps in AMC home is re-sealed.
 */
export function changeVaultPassphrase(workspace: string, current: string, next: string): VaultPassphraseChange {
  if (next === current) throw new Error("The new vault passphrase is the current one; nothing changed.");
  if (next.length < 8) throw new Error("Vault passphrase must be at least 8 characters.");
  const contents = (payload: object) => sha256Hex(JSON.stringify(payload));
  // The owner's gate, as for a rotation: the current passphrase opens the vault and its keys match the published ones.
  const checked = contents(unlockedPayloadForKeyChange(workspace, current));
  const paths = vaultPaths(workspace);
  return withControlFileLock({ root: paths.keysDir, name: "key-revocations", operation: () => withVaultEnvelopeLock(workspace, () => {
    const payload = unlockedPayloadForKeyChange(workspace, current);
    if (contents(payload) !== checked) {
      throw new Error("the vault changed while its passphrase was being changed (a key rotation or a secret write); nothing changed. Run `amc vault passphrase` again.");
    }
    const keyset = assertKeysetComplete(workspace);
    const writes: KeysetWrite[] = [
      { path: paths.vaultFile, bytes: encryptedVaultBytes(payload, next), mode: 0o600 },
      { path: paths.metaFile, bytes: vaultMetaBytes(payload), mode: 0o644 }
    ];
    const unopened: string[] = [];
    for (const rel of Object.keys(keyset?.files ?? {}).filter(name => name.endsWith(".amcvault") && name !== "vault.amcvault")) {
      const path = join(workspace, keysetFileRel(rel));
      if (!existsSync(path)) continue;
      const sealed = resealVaultEnvelope(readFileSync(path), current, next);
      if (sealed === null) unopened.push(path); else writes.push({ path, bytes: sealed, mode: 0o600 });
    }
    const { generation } = commitKeyset(workspace, { keys: keyIdsOf(payload), writes, expectedGeneration: keyset?.generation });
    lockVault(workspace);
    forgetVaultPassphrase(workspace);
    const local = localVaultPassphrasePath(workspace);
    const localPassphraseRemoved = existsSync(local);
    if (localPassphraseRemoved) rmSync(local, { force: true });
    const copies = resealRecoveryVaults(workspace, generation, envelope => resealVaultEnvelope(envelope, current, next));
    return { generation, resealedCopies: copies.resealed, unopenedCopies: [...unopened, ...copies.unopened], localPassphraseRemoved };
  }) });
}

/** `amc vault passphrase`: the current passphrase from AMC_VAULT_PASSPHRASE, the operator-gated remembered store or a prompt; the new one typed twice, never argv. */
export async function changeVaultPassphraseInteractive(workspace: string): Promise<VaultPassphraseChange> {
  if (process.stdin.isTTY !== true) throw new Error("A new vault passphrase is typed at a prompt, never passed on the command line: re-run this command from your terminal.");
  const current = vaultPassphraseFromEnv() || operatorRememberedPassphrase(workspace)?.passphrase || (await promptPassphrase("Current vault passphrase:"));
  const next = await promptPassphrase("New vault passphrase (at least 8 characters):");
  if ((await promptPassphrase("Repeat the new vault passphrase:")) !== next) throw new Error("The new passphrases do not match; nothing changed.");
  return changeVaultPassphrase(workspace, current, next);
}

/** What `amc vault passphrase` prints; a copy made before the change (a backup, a git commit) still opens with the old passphrase. */
export function printVaultPassphraseChange(change: VaultPassphraseChange): void {
  console.log(chalk.green(`Passphrase changed: key set generation ${change.generation} holds the re-sealed vault with the same keys; ${change.resealedCopies} `
    + `vault cop${change.resealedCopies === 1 ? "y" : "ies"} in AMC home re-sealed; remembered entry forgotten`
    + `${change.localPassphraseRemoved ? "; .amc/local-vault-passphrase (it held the old passphrase) removed" : ""}.`));
  if (change.unopenedCopies.length > 0) console.log(chalk.yellow(`Left as they were (they did not open with the current passphrase): ${change.unopenedCopies.join(", ")}`));
  console.log("A copy of the vault made before this change (a backup, a git commit, another machine) still opens with the old passphrase. "
    + "If it may have leaked, rotate the keys too: docs/VAULT.md \"When to rotate\".");
}

export function lockVaultNow(workspace: string): void {
  lockVault(workspace);
}

export function vaultStatusNow(workspace: string): ReturnType<typeof vaultStatus> {
  return vaultStatus(workspace);
}

export async function rotateVaultKeysInteractive(workspace: string): Promise<ReturnType<typeof rotateMonitorKeyInVault>> {
  const passphrase = vaultPassphraseFromEnv() ?? (await promptPassphrase("Passphrase for key rotation:"));
  return rotateMonitorKeyInVault(workspace, passphrase);
}

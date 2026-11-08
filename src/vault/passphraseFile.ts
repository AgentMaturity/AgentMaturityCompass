/**
 * B1(b): AMC_VAULT_PASSPHRASE_FILE for every command, the form the container entrypoint, the Compose files and the Helm
 * chart set. AMC_VAULT_PASSPHRASE wins; with neither, nothing changes. The file is read like the other private operator
 * secret files (readPrivateTokenFile): a regular file, never a symlink, owned by this user and closed to group and others,
 * so a secret other accounts can read, or one another account planted, is refused and the vault stays locked. Its value
 * opens the vault in this process only: it never enters the environment, so no child process inherits it, and it is never
 * printed. It is an explicit operator secret like AMC_VAULT_PASSPHRASE, so the remembered-store operator gate
 * (operatorContext.ts) does not apply, and while it is set the remembered store is not read (passphraseStore.ts).
 */
import { readPrivateTokenFile } from "../setup/nativeApprovalIdentity.js";
import { unlockVault, vaultExists, vaultStatus } from "./vault.js";

export function unlockWithPassphraseFile(workspace: string, env: NodeJS.ProcessEnv = process.env): void {
  const file = (env.AMC_VAULT_PASSPHRASE_FILE ?? "").trim();
  if (file.length === 0 || (env.AMC_VAULT_PASSPHRASE ?? "").length > 0 || !vaultExists(workspace) || vaultStatus(workspace).unlocked) return;
  try {
    unlockVault(workspace, readPrivateTokenFile(file, "Vault passphrase"));
  } catch (error) {
    process.stderr.write(`AMC: AMC_VAULT_PASSPHRASE_FILE was not used, so the vault stays locked: ${error instanceof Error ? error.message : String(error)}. `
      + "It must be a regular file you own with mode 0600 or 0400 (not a symlink); or export AMC_VAULT_PASSPHRASE.\n");
  }
}

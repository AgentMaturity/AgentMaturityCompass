/**
 * B1(b) and its follow-up: the one reader of the vault passphrase an operator supplies. AMC_VAULT_PASSPHRASE always
 * wins; else AMC_VAULT_PASSPHRASE_FILE, the form the container entrypoint, the Compose files and the Helm chart set,
 * read through readSecretMountFile (private to its owner, or a mounted secret this user cannot change); with neither,
 * nothing. The CLI's preAction unlock, bootstrap, host bootstrap, studio start, doctor and `amc up` all read it here.
 * The preAction value opens the vault in this process only: it never enters the environment, so no child process
 * inherits it, and it is never printed. It is an explicit operator secret like AMC_VAULT_PASSPHRASE, so the
 * remembered-store operator gate (operatorContext.ts) does not apply, and while it is set the remembered store is not
 * read (passphraseStore.ts).
 */
import { readSecretMountFile } from "./secretMountFile.js";
import { unlockVault, vaultExists, vaultStatus } from "./vault.js";

const FILE_HINT = "Use a regular file you own with mode 0600 or 0400 (not a symlink), or a secret mounted read-only "
  + "(Docker or Compose secrets, a Kubernetes secret volume); or export AMC_VAULT_PASSPHRASE.";

/** A configured passphrase file that was not used: refused, missing or unreadable. The message never holds the value. */
export class VaultPassphraseFileError extends Error {
  constructor(cause: unknown) {
    super(`AMC_VAULT_PASSPHRASE_FILE was not used, so the vault stays locked: ${(cause instanceof Error ? cause.message : String(cause)).replace(/\.+$/, "")}. ${FILE_HINT}`);
    this.name = "VaultPassphraseFileError";
  }
}

const inlineSet = (env: NodeJS.ProcessEnv): boolean => (env.AMC_VAULT_PASSPHRASE ?? "").length > 0;
const fileSet = (env: NodeJS.ProcessEnv): string => (env.AMC_VAULT_PASSPHRASE_FILE ?? "").trim();

/** AMC_VAULT_PASSPHRASE, else the file's value, else null. Throws VaultPassphraseFileError when the file is set but not used. */
export function vaultPassphraseFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  if (inlineSet(env)) return env.AMC_VAULT_PASSPHRASE!;
  const file = fileSet(env);
  if (file.length === 0) return null;
  try {
    return readSecretMountFile(file, "Vault passphrase");
  } catch (error) {
    throw new VaultPassphraseFileError(error);
  }
}

/**
 * Workspace and host bootstrap read the passphrase from the file only. AMC_VAULT_PASSPHRASE would win over it, so a
 * bootstrap that has both is refused rather than run on the inline value.
 */
export function bootstrapVaultPassphrase(env: NodeJS.ProcessEnv = process.env): string {
  if (fileSet(env).length === 0) throw new Error("Bootstrap requires AMC_VAULT_PASSPHRASE_FILE. Refusing to run with inline passphrase.");
  if (inlineSet(env)) {
    throw new Error("Bootstrap reads the vault passphrase from AMC_VAULT_PASSPHRASE_FILE only, and AMC_VAULT_PASSPHRASE is also set. "
      + "AMC_VAULT_PASSPHRASE wins over the file everywhere, so unset it and run bootstrap again.");
  }
  return vaultPassphraseFromEnv(env)!;
}

/**
 * Commands that create a vault (init, setup) seal it with the passphrase in AMC_VAULT_PASSPHRASE, so before creating
 * one they adopt the file's value into this process's environment, as `amc up`, studio start and doctor do. Throws
 * VaultPassphraseFileError when the file is set but refused.
 */
export function adoptVaultPassphraseFile(env: NodeJS.ProcessEnv = process.env): void {
  if (inlineSet(env)) return;
  const fromFile = vaultPassphraseFromEnv(env);
  if (fromFile !== null) env.AMC_VAULT_PASSPHRASE = fromFile;
}

export function unlockWithPassphraseFile(workspace: string, env: NodeJS.ProcessEnv = process.env): void {
  if (fileSet(env).length === 0 || inlineSet(env) || !vaultExists(workspace) || vaultStatus(workspace).unlocked) return;
  try {
    unlockVault(workspace, vaultPassphraseFromEnv(env)!);
  } catch (error) {
    process.stderr.write(`AMC: ${(error instanceof VaultPassphraseFileError ? error : new VaultPassphraseFileError(error)).message}\n`);
  }
}

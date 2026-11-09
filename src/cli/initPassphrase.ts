/**
 * LIVE-VAULT-04: the passphrase `amc init --minimal` and `amc init --skip-vault` (and `amc setup`, LIVE-VAULT-15) generate
 * when AMC_VAULT_PASSPHRASE is empty. Never a guessable value; `--skip-vault` remembers it instead of printing it.
 */
import { randomBytes } from "node:crypto";
import { rememberEnabled, rememberVaultPassphrase } from "../vault/passphraseStore.js";

export function generatedPassphraseForInit(): string {
  return `amc-local-${randomBytes(18).toString("base64url")}`;
}

/** `--skip-vault`: refused when no store may hold a generated passphrase, else one is set for this process (null: one was exported). */
export function skipVaultPassphrase(env: NodeJS.ProcessEnv = process.env): { refused: string } | { generated: string | null } {
  if ((env.AMC_VAULT_PASSPHRASE ?? "").length > 0) return { generated: null };
  if (!rememberEnabled(env)) return { refused: "--skip-vault needs a passphrase to remember: export AMC_VAULT_PASSPHRASE, or unset AMC_VAULT_REMEMBER." };
  const generated = generatedPassphraseForInit();
  env.AMC_VAULT_PASSPHRASE = generated;
  return { generated };
}

/** Once the vault exists: remembers the generated passphrase and says where, never what. */
export function rememberInitPassphrase(workspace: string, passphrase: string): string {
  const saved = rememberVaultPassphrase(workspace, passphrase);
  return `Vault passphrase generated and remembered in ${saved.location}; your own terminal unlocks from it (export AMC_VAULT_PASSPHRASE elsewhere).`;
}

/**
 * LIVE-VAULT-04: the passphrase `amc init --minimal` and `amc init --skip-vault` (and `amc setup`, LIVE-VAULT-15) generate
 * when AMC_VAULT_PASSPHRASE is empty. Never a guessable value; `--skip-vault` remembers it instead of printing it.
 */
import { randomBytes } from "node:crypto";
import { agentMarker } from "../vault/operatorContext.js";
import { rememberEnabled, rememberVaultPassphrase, type RememberBackend } from "../vault/passphraseStore.js";

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
export function rememberInitPassphrase(workspace: string, passphrase: string, env: NodeJS.ProcessEnv = process.env): string {
  const saved = rememberVaultPassphrase(workspace, passphrase, env);
  return rememberedPassphraseNotice(saved.location, saved.backend);
}

/**
 * Where a generated passphrase goes: remembered and never shown for an operator in a terminal (no agent marker, not CI)
 * with remembering on; shown once otherwise, since a vault whose passphrase is neither kept nor shown cannot be opened.
 */
export function generatedPassphraseRoute(env: NodeJS.ProcessEnv, stdinIsTTY: boolean): "remember" | "show-once" {
  const ci = (env.CI ?? "").length > 0 || (env.GITHUB_ACTIONS ?? "").length > 0;
  return rememberEnabled(env) && stdinIsTTY && agentMarker(env) === null && !ci ? "remember" : "show-once";
}

/** The new-vault menu `amc init` and `amc up` show; the created value is never in a label. */
export function newVaultPassphraseChoices(canRemember: boolean): Array<{ name: string; value: "auto" | "custom" }> {
  return [
    { name: canRemember ? "Let AMC create and remember one (recommended)" : "Let AMC create one (shown once; remembering is off)", value: "auto" },
    { name: "Enter my own", value: "custom" }
  ];
}

/** Where a remembered generated passphrase is kept and the existing commands that manage it; never the value. */
export function rememberedPassphraseNotice(location: string, backend: RememberBackend): string {
  return `Vault passphrase generated and remembered in ${location}; it is not shown, and your own terminal unlocks from it. `
    + `${backend === "keychain" ? "To see it, open Keychain Access and search amc-vault. " : ""}`
    + "To set one you know, run amc vault passphrase; amc vault forget removes the remembered copy.";
}

/**
 * A passphrase AMC created for an operator: remembered and never shown. When the store refuses the write, it is shown once
 * instead, since the vault it seals cannot be opened by anyone otherwise.
 */
export function rememberOrShowOnce(workspace: string, passphrase: string, env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    return [rememberInitPassphrase(workspace, passphrase, env)];
  } catch (error) {
    return [`The vault passphrase could not be remembered (${error instanceof Error ? error.message : String(error)}).`, ...shownOncePassphraseLines(passphrase)];
  }
}

/** Only where nothing keeps it: printed once, with the reason to save it now. */
export function shownOncePassphraseLines(passphrase: string): string[] {
  return ["Save this vault passphrase now. It is not stored anywhere, and the vault cannot be opened without it:", `    ${passphrase}`];
}

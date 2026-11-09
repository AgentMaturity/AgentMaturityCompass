/**
 * LIVE-VAULT-02 (S4, D14): `.amc/local-vault-passphrase`, the plaintext 0600 passphrase bare `amc` and `amc monitor start`
 * keep for a vault they created. It reaches AMC_VAULT_PASSPHRASE only in a process that is not an agent: not agent mode,
 * no agent marker. No terminal is required (the monitor is a daemon; bare `amc` runs in CI). Beside an existing vault it
 * is read only when this machine committed that vault's key set: a cloned repository's file never opens its vault.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { keysetAnchoring } from "../keys/keyset.js";
import { getMode } from "../mode/mode.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { agentMarker } from "./operatorContext.js";

export function localVaultPassphrasePath(workspace: string): string {
  return join(workspace, ".amc", "local-vault-passphrase");
}

export function loadLocalVaultPassphrase(workspace: string, env: NodeJS.ProcessEnv = process.env):
  { loaded: boolean; reason?: "agent-mode" | "agent-marker" | "unanchored"; marker?: string } {
  const file = localVaultPassphrasePath(workspace);
  if ((env.AMC_VAULT_PASSPHRASE ?? "").length > 0 || !pathExists(file)) return { loaded: false };
  const value = readUtf8(file).trim();
  if (value.length < 8) return { loaded: false };
  if (getMode(workspace) === "agent") return { loaded: false, reason: "agent-mode" };
  const marker = agentMarker(env);
  if (marker !== null) return { loaded: false, reason: "agent-marker", marker };
  // SH-SANDBOX-07 (S19): a repository can ship a vault and this file beside it. Opening that vault migrates or upgrades
  // it, which commits its key set on this machine, and the clone would then read as the operator's own workspace. So the
  // file opens only a vault whose key set this machine committed (one bare `amc` or the monitor created here).
  if (pathExists(join(workspace, ".amc", "vault.amcvault")) && keysetAnchoring(workspace).state !== "committed") return { loaded: false, reason: "unanchored" };
  env.AMC_VAULT_PASSPHRASE = value;
  return { loaded: true };
}

/** Why the file was not read, for a refusal or an unsigned-score note. */
export function localPassphraseRefusal(local: { reason?: "agent-mode" | "agent-marker" | "unanchored"; marker?: string }): string {
  return local.reason === "agent-mode" ? "in agent mode"
    : local.reason === "unanchored" ? "beside a vault whose key set this machine did not create (a clone or a copy)"
      : `under the agent marker ${local.marker ?? "(unknown)"}`;
}

/** Generates a passphrase for a vault about to be created, keeps it in the 0600 file, and sets it for this process. */
export function createLocalVaultPassphrase(workspace: string, prefix: string): string {
  const file = localVaultPassphrasePath(workspace);
  const generated = `${prefix}${randomBytes(32).toString("base64url")}`;
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(file, `${generated}\n`, 0o600);
  process.env.AMC_VAULT_PASSPHRASE = generated;
  return file;
}

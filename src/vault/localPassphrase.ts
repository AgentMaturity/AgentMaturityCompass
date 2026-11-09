/**
 * LIVE-VAULT-02 (S4, D14): `.amc/local-vault-passphrase`, the plaintext 0600 passphrase bare `amc` and `amc monitor start`
 * keep for a vault they created. It reaches AMC_VAULT_PASSPHRASE only in a process that is not an agent: not agent mode,
 * no agent marker. No terminal is required (the monitor is a daemon; bare `amc` runs in CI).
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { getMode } from "../mode/mode.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { agentMarker } from "./operatorContext.js";

export function localVaultPassphrasePath(workspace: string): string {
  return join(workspace, ".amc", "local-vault-passphrase");
}

export function loadLocalVaultPassphrase(workspace: string, env: NodeJS.ProcessEnv = process.env):
  { loaded: boolean; reason?: "agent-mode" | "agent-marker"; marker?: string } {
  const file = localVaultPassphrasePath(workspace);
  if ((env.AMC_VAULT_PASSPHRASE ?? "").length > 0 || !pathExists(file)) return { loaded: false };
  const value = readUtf8(file).trim();
  if (value.length < 8) return { loaded: false };
  if (getMode(workspace) === "agent") return { loaded: false, reason: "agent-mode" };
  const marker = agentMarker(env);
  if (marker !== null) return { loaded: false, reason: "agent-marker", marker };
  env.AMC_VAULT_PASSPHRASE = value;
  return { loaded: true };
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

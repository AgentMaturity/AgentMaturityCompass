/**
 * Remembered vault passphrase store.
 *
 * Lets `amc up` start without prompts for returning users. Storage prefers the
 * macOS Keychain (`security` CLI); on other platforms — or when
 * AMC_VAULT_REMEMBER_FILE is set — a 0600 JSON credentials file under
 * ~/.config/amc is used. Remembering is a convenience trade-off: any process
 * running as the same OS user can read the stored passphrase. Users who want
 * prompt-per-start semantics can pass `--no-remember` to `amc up`, set
 * AMC_VAULT_REMEMBER=0, or run `amc vault forget`.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";

export type RememberBackend = "keychain" | "file";

const KEYCHAIN_SERVICE = "amc-vault";

function rememberDisabled(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.AMC_VAULT_REMEMBER ?? "").trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "off" || raw === "no";
}

function credentialsFile(env: NodeJS.ProcessEnv): string {
  const override = env.AMC_VAULT_REMEMBER_FILE;
  if (override && override.trim().length > 0) {
    return resolve(override.trim());
  }
  return join(homedir(), ".config", "amc", "vault-credentials.json");
}

function workspaceKey(workspace: string): string {
  return sha256Hex(resolve(workspace)).slice(0, 32);
}

function keychainAvailable(env: NodeJS.ProcessEnv): boolean {
  return process.platform === "darwin" && !env.AMC_VAULT_REMEMBER_FILE;
}

function readFileStore(env: NodeJS.ProcessEnv): Record<string, string> {
  const file = credentialsFile(env);
  if (!existsSync(file)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFileStore(store: Record<string, string>, env: NodeJS.ProcessEnv): string {
  const file = credentialsFile(env);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

export function getRememberedVaultPassphrase(
  workspace: string,
  env: NodeJS.ProcessEnv = process.env
): { passphrase: string; backend: RememberBackend } | null {
  if (rememberDisabled(env)) {
    return null;
  }
  const account = workspaceKey(workspace);
  if (keychainAvailable(env)) {
    try {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE, "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      if (out.length > 0) {
        return { passphrase: out, backend: "keychain" };
      }
    } catch {
      // fall through to the file store
    }
  }
  const stored = readFileStore(env)[account];
  return typeof stored === "string" && stored.length > 0
    ? { passphrase: stored, backend: "file" }
    : null;
}

export function rememberVaultPassphrase(
  workspace: string,
  passphrase: string,
  env: NodeJS.ProcessEnv = process.env
): { backend: RememberBackend; location: string } {
  if (rememberDisabled(env)) {
    throw new Error("Vault passphrase remembering is disabled (AMC_VAULT_REMEMBER=0).");
  }
  const account = workspaceKey(workspace);
  if (keychainAvailable(env)) {
    try {
      execFileSync(
        "security",
        ["add-generic-password", "-U", "-a", account, "-s", KEYCHAIN_SERVICE, "-w", passphrase],
        { stdio: ["ignore", "ignore", "ignore"] }
      );
      return { backend: "keychain", location: `the macOS Keychain (service ${KEYCHAIN_SERVICE})` };
    } catch {
      // fall through to the file store
    }
  }
  const store = readFileStore(env);
  store[account] = passphrase;
  const file = writeFileStore(store, env);
  return { backend: "file", location: file };
}

export function forgetVaultPassphrase(
  workspace: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const account = workspaceKey(workspace);
  let removed = false;
  if (keychainAvailable(env)) {
    try {
      execFileSync(
        "security",
        ["delete-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE],
        { stdio: ["ignore", "ignore", "ignore"] }
      );
      removed = true;
    } catch {
      // nothing stored in the keychain
    }
  }
  const store = readFileStore(env);
  if (store[account]) {
    delete store[account];
    writeFileStore(store, env);
    removed = true;
  }
  return removed;
}

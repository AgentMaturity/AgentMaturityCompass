/**
 * Remembered vault passphrase store.
 *
 * Lets `amc up` start without prompts for returning users, and lets the other amc commands in that workspace unlock
 * the vault with it (unlockWithRememberedPassphrase). Storage prefers the macOS Keychain (`security` CLI) when stdin
 * is a terminal; on other platforms, in a non-interactive shell, when a Keychain call fails or does not answer within
 * SECURITY_TIMEOUT_MS, or when AMC_VAULT_REMEMBER_FILE is set, a 0600 JSON file in the AMC home ($AMC_HOME, else
 * ~/.config/amc) is used. The passphrase reaches `security` on stdin, never as a process argument. Remembering is a
 * convenience trade-off: any process running as the same OS user can read the stored passphrase. Users who want
 * prompt-per-start semantics can pass `--no-remember` to `amc up`, set AMC_VAULT_REMEMBER=0, or run `amc vault forget`.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { getMode } from "../mode/mode.js";
import { sha256Hex } from "../utils/hash.js";
import { unlockVault, vaultExists, vaultStatus } from "./vault.js";

export type RememberBackend = "keychain" | "file";

const KEYCHAIN_SERVICE = "amc-vault";
/** A Keychain call can wait forever on a dialog nobody can answer (no GUI session, no default keychain). */
const SECURITY_TIMEOUT_MS = 5_000;

function rememberDisabled(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.AMC_VAULT_REMEMBER ?? "").trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "off" || raw === "no";
}

function credentialsFile(env: NodeJS.ProcessEnv): string {
  const override = env.AMC_VAULT_REMEMBER_FILE;
  if (override && override.trim().length > 0) {
    return resolve(override.trim());
  }
  return join(resolveAmcHome({ env }), "vault-credentials.json");
}

function workspaceKey(workspace: string): string {
  return sha256Hex(resolve(workspace)).slice(0, 32);
}

function keychainAvailable(env: NodeJS.ProcessEnv): boolean {
  return process.platform === "darwin" && !env.AMC_VAULT_REMEMBER_FILE;
}

/** Runs security(1), bounded by SECURITY_TIMEOUT_MS: its output when it exits 0, else null (failed, timed out, absent). */
function security(args: readonly string[], env: NodeJS.ProcessEnv, input?: string): { stdout: string; stderr: string } | null {
  const result = spawnSync("security", args, {
    env, input, encoding: "utf8", timeout: SECURITY_TIMEOUT_MS, killSignal: "SIGKILL",
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
  });
  return result.status === 0 && result.error === undefined ? { stdout: result.stdout, stderr: result.stderr } : null;
}

/**
 * `find-generic-password -g` prints `password: "<text>"` for plain text and `password: 0x<HEX>  "<escaped>"` for
 * anything else; `-w` prints both forms bare, so there a passphrase that is itself hex cannot be told apart.
 */
function keychainRead(account: string, env: NodeJS.ProcessEnv): string | null {
  const line = security(["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE, "-g"], env)?.stderr
    .split("\n").find((row) => row.startsWith("password: "));
  if (line === undefined) return null;
  const hex = /^password: 0x([0-9a-f]+)\s/i.exec(line);
  if (hex) return Buffer.from(hex[1]!, "hex").toString("utf8");
  return line.startsWith("password: \"") && line.endsWith("\"") ? line.slice("password: \"".length, -1) : null;
}

/** `security -i` reads the command from stdin, so the passphrase (hex, -X) is in no process's arguments. Read back to confirm. */
function keychainWrite(account: string, passphrase: string, env: NodeJS.ProcessEnv): boolean {
  const hex = Buffer.from(passphrase, "utf8").toString("hex");
  return security(["-i"], env, `add-generic-password -U -a ${account} -s ${KEYCHAIN_SERVICE} -X ${hex}\n`) !== null
    && keychainRead(account, env) === passphrase;
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

/** Where a remembered passphrase is kept, as the operator would look for it. */
export function rememberedLocation(backend: RememberBackend, env: NodeJS.ProcessEnv = process.env): string {
  return backend === "keychain" ? `the macOS Keychain (service ${KEYCHAIN_SERVICE})` : credentialsFile(env);
}

/** Every place a passphrase `amc up` remembered can be, for advice that has to name them. */
export function rememberedStores(env: NodeJS.ProcessEnv = process.env): string {
  return keychainAvailable(env) ? `${rememberedLocation("keychain", env)} or ${credentialsFile(env)}` : credentialsFile(env);
}

export function getRememberedVaultPassphrase(
  workspace: string,
  env: NodeJS.ProcessEnv = process.env
): { passphrase: string; backend: RememberBackend } | null {
  if (rememberDisabled(env)) {
    return null;
  }
  const account = workspaceKey(workspace);
  const fromKeychain = keychainAvailable(env) ? keychainRead(account, env) : null;
  if (fromKeychain !== null && fromKeychain.length > 0) {
    return { passphrase: fromKeychain, backend: "keychain" };
  }
  const stored = readFileStore(env)[account];
  return typeof stored === "string" && stored.length > 0
    ? { passphrase: stored, backend: "file" }
    : null;
}

/**
 * The remembered passphrase for an operator's command. None in agent mode (`amc up`, its only user before, is blocked
 * there) or in a process holding an agent's credential (AMC_LEASE, AMC_TOKEN): an agent AMC launched never gets the
 * vault this way, as it never gets AMC_VAULT_PASSPHRASE.
 */
export function operatorRememberedPassphrase(workspace: string, env: NodeJS.ProcessEnv = process.env): ReturnType<typeof getRememberedVaultPassphrase> {
  return getMode(workspace) === "agent" || env.AMC_LEASE || env.AMC_TOKEN ? null : getRememberedVaultPassphrase(workspace, env);
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
  // B1: only a terminal session can answer a Keychain dialog, so a non-interactive shell goes straight to the file.
  if (keychainAvailable(env) && process.stdin.isTTY === true && keychainWrite(account, passphrase, env)) {
    return { backend: "keychain", location: rememberedLocation("keychain", env) };
  }
  const file = writeFileStore({ ...readFileStore(env), [account]: passphrase }, env);
  return { backend: "file", location: file };
}

export function forgetVaultPassphrase(
  workspace: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const account = workspaceKey(workspace);
  let removed = keychainAvailable(env)
    && security(["delete-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE], env) !== null;
  const store = readFileStore(env);
  if (store[account]) {
    delete store[account];
    writeFileStore(store, env);
    removed = true;
  }
  return removed;
}

const rememberedUnlocks = new Map<string, string>();

/**
 * B2: a command in a workspace whose vault passphrase was remembered starts with that vault unlocked in this process,
 * as `amc vault unlock` leaves it, so signing and verification work in a new shell. AMC_VAULT_PASSPHRASE wins. The
 * passphrase stays in the vault session and never enters the environment, so no child process inherits it. One that
 * does not open the vault leaves it locked, as before, and says why on stderr.
 * ponytail: a session idle past the vault's 30-minute TTL is not reopened from here; long-running servers get
 * AMC_VAULT_PASSPHRASE from `amc up`.
 */
export function unlockWithRememberedPassphrase(workspace: string, env: NodeJS.ProcessEnv = process.env): void {
  if ((env.AMC_VAULT_PASSPHRASE ?? "").length > 0 || !vaultExists(workspace) || vaultStatus(workspace).unlocked) return;
  const remembered = operatorRememberedPassphrase(workspace, env);
  if (remembered === null) return;
  const location = rememberedLocation(remembered.backend, env);
  try {
    unlockVault(workspace, remembered.passphrase);
    rememberedUnlocks.set(resolve(workspace), location);
  } catch (error) {
    process.stderr.write(`AMC: the vault passphrase remembered in ${location} did not unlock this workspace's vault `
      + `(${error instanceof Error ? error.message : String(error)}). Set AMC_VAULT_PASSPHRASE, or run \`amc vault forget\` if it is stale.\n`);
  }
}

/** Where the passphrase that unlocked `workspace` in this process was remembered, or null when it was not that one. */
export function rememberedUnlockLocation(workspace: string): string | null {
  return rememberedUnlocks.get(resolve(workspace)) ?? null;
}

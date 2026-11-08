/**
 * The file backend of the remembered vault passphrase store (src/vault/passphraseStore.ts): a 0600 JSON object keyed by
 * a hash of the workspace path, in the AMC home ($AMC_HOME, else ~/.config/amc) or at AMC_VAULT_REMEMBER_FILE. It is
 * plaintext: any process running as the same OS user can read it.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";

/** The file the store reads and writes. A secret deny list must also cover legacyCredentialsFile (S5). */
export function credentialsFile(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AMC_VAULT_REMEMBER_FILE;
  if (override && override.trim().length > 0) {
    return resolve(override.trim());
  }
  return join(resolveAmcHome({ env }), "vault-credentials.json");
}

/**
 * Where the file store lived before it moved to the AMC home (~/.config/amc/vault-credentials.json), under the home the
 * env names (HOME, else USERPROFILE). Never the process's own home: a caller passing an env without one gets null.
 */
export function legacyCredentialsFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const home = (env.HOME ?? env.USERPROFILE ?? "").trim();
  return home.length > 0 ? join(home, ".config", "amc", "vault-credentials.json") : null;
}

function readStore(file: string): Record<string, string> {
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

function writeStore(file: string, store: Record<string, string>): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function readFileStore(env: NodeJS.ProcessEnv): Record<string, string> {
  return readStore(credentialsFile(env));
}

export function writeFileStore(store: Record<string, string>, env: NodeJS.ProcessEnv): string {
  const file = credentialsFile(env);
  writeStore(file, store);
  return file;
}

/** The legacy file when it can hold entries this store does not: not with AMC_VAULT_REMEMBER_FILE, not when it is the same file. */
function legacyFile(env: NodeJS.ProcessEnv): string | null {
  const legacy = legacyCredentialsFile(env);
  if ((env.AMC_VAULT_REMEMBER_FILE ?? "").trim().length > 0 || legacy === null || resolve(legacy) === credentialsFile(env)) return null;
  return legacy;
}

/**
 * LIVE-VAULT-08: an entry still under the legacy path is moved into the current file for the one workspace being read,
 * never as a bulk copy (another AMC_HOME may be another operator's): written here first, then removed there (the file is
 * deleted when it empties), so an interruption leaves a copy rather than nothing. Returns the passphrase, or null.
 */
export function migrateLegacyEntry(account: string, env: NodeJS.ProcessEnv): string | null {
  const legacy = legacyFile(env);
  const value = legacy === null ? undefined : readStore(legacy)[account];
  if (typeof value !== "string" || value.length === 0) return null;
  writeFileStore({ ...readFileStore(env), [account]: value }, env);
  removeLegacyEntry(account, env);
  return value;
}

/** Removes the workspace's entry from the legacy file (`amc vault forget`), so a later read cannot migrate it back. */
export function removeLegacyEntry(account: string, env: NodeJS.ProcessEnv): boolean {
  const legacy = legacyFile(env);
  if (legacy === null) return false;
  const store = readStore(legacy);
  if (!store[account]) return false;
  delete store[account];
  if (Object.keys(store).length === 0) rmSync(legacy, { force: true });
  else writeStore(legacy, store);
  return true;
}

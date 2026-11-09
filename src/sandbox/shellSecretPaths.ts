import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveAmcHome, resolveCredentialsPaths } from "../credentials/credentialsPaths.js";
import { isAmcSecretEnv } from "../utils/providerKeys.js";
import { credentialsFile, legacyCredentialsFile } from "../vault/passphraseFileStore.js";

/**
 * What every confined shell is denied whatever the signed `readDeny` says, on both backends: Seatbelt denies these
 * paths outright; Bubblewrap mounts no host path outside the workspace and the runtime roots, and masks any of these
 * that lie inside the workspace.
 */

/** Home-relative credential stores. */
export const HOME_SECRET_PATHS = [".ssh", ".aws", ".config/gcloud", ".azure", ".gnupg", ".kube", ".docker",
  ".netrc", ".npmrc", "Library/Keychains", ".amc"] as const;

const sessionSecretPaths = new Set<string>();

/**
 * AMC's own authority on this machine, as absolute paths (SH-SANDBOX-08): the AMC home (`AMC_HOME`: provider
 * credentials, high-water marks, workspace trust) and always the default `~/.config/amc` as well, the credentials file
 * wherever `AMC_CREDENTIALS_FILE` keeps it, the user `.env` layer, the remembered vault passphrase file exactly as the
 * vault resolves it (`AMC_VAULT_REMEMBER_FILE`, else the AMC home) and its pre-AMC_HOME location (S5), every AMC secret
 * a `_FILE` variable names (`AMC_VAULT_PASSPHRASE_FILE`, the bootstrap password files, the session signing key, the
 * notary auth secret, the Postgres URL), and the credential stores sessions in this process selected by option.
 */
export function amcSecretPaths(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const credentials = resolveCredentialsPaths({ env, projectDir: null });
  const legacy = legacyCredentialsFile(env);
  const secretFiles = Object.entries(env).flatMap(([name, value]) => name.endsWith("_FILE") && isAmcSecretEnv(name) && value?.trim() ? [resolve(value.trim())] : []);
  return [...new Set([resolveAmcHome({ env }), join(homedir(), ".config", "amc"), credentials.file, credentials.userEnvFile,
    credentialsFile(env), ...(legacy === null ? [] : [legacy]), ...secretFiles, ...sessionSecretPaths])];
}

/** The home credential stores (under the resolved home, so one created later still matches) and AMC's own secrets. */
export function shellSecretPaths(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  let home = homedir();
  try { home = realpathSync(home); } catch { /* an unresolvable home is denied as spelled */ }
  return [...HOME_SECRET_PATHS.map(path => join(home, path)), ...amcSecretPaths(env)];
}

/**
 * Credential stores a session selected by option rather than by environment (`--credentials-home`, `--credentials-file`,
 * the SDK's `credentialsHome`/`credentialsFile`): nothing in `process.env` names them, so the kernel's credentials
 * service registers them here when it opens the store, and every later confined shell in this process denies them.
 * ponytail: process-wide set; a per-session deny list would need the policy to carry the store paths through the toolset.
 */
export function denySessionSecretPaths(paths: readonly string[]): void {
  for (const path of paths) sessionSecretPaths.add(resolve(path));
}

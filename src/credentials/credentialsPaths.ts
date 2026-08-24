/**
 * Where the four layers live on disk.
 *
 * Path resolution is its own module because three different things need to
 * agree on it and none of them should re-derive it: the loader that reads the
 * layers, the write path that locks and patches the AMC-owned file, and the
 * watcher that must know which directory to observe and which filename to care
 * about. A second, slightly different derivation of "the credentials file" is
 * how a process ends up reading one file and writing another.
 */
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** The AMC-owned store's filename, dotted so it does not clutter the home. */
export const CREDENTIALS_FILENAME = ".credentials.yaml";

/** Overrides the AMC home directory wholesale (tests, containers, multi-tenant). */
export const AMC_HOME_ENV = "AMC_HOME";

/** Overrides just the credentials file, for operators who keep it elsewhere. */
export const CREDENTIALS_PATH_ENV = "AMC_CREDENTIALS_FILE";

/** The filename of the `.env` layers, in both the project and the user home. */
export const DOTENV_FILENAME = ".env";

export interface CredentialsPathsInput {
  /** Environment used for the `AMC_HOME` / `AMC_CREDENTIALS_FILE` overrides. */
  readonly env?: NodeJS.ProcessEnv;
  /** Explicit AMC home; beats `AMC_HOME`. */
  readonly homeDir?: string;
  /** Explicit credentials file; beats everything, including `homeDir`. */
  readonly path?: string;
  /**
   * Workspace root supplying the `project-env` layer. Defaults to the cwd.
   *
   * `null` DISABLES the layer. Required for outbound credentials AMC sends on
   * the operator's behalf: the workspace is writable by the evaluated agent, so
   * including it would let that agent supply the very credentials the gateway's
   * stripAgentProvidedCredentials control exists to reject.
   */
  readonly projectDir?: string | null;
  /** Explicit user `.env`. Defaults to `~/.env`. */
  readonly userEnvPath?: string;
}

export interface CredentialsPaths {
  /** Directory whose permissions are asserted, and where the write lock lives. */
  readonly homeDir: string;
  /** The one file AMC writes. */
  readonly file: string;
  /** Filename component of {@link CredentialsPaths.file}, for watch filtering. */
  readonly fileName: string;
  /** Directory watched for external edits to the credentials file. */
  readonly watchDir: string;
  /** `null` when the project-env layer is disabled. */
  readonly projectEnvFile: string | null;
  readonly userEnvFile: string;
}

function trimmedOrNull(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * The AMC home.
 *
 * `~/.config/amc` rather than `~/.amc` because that is already where AMC keeps
 * the remembered vault passphrase (`src/vault/passphraseStore.ts`). One home
 * directory for both secrets means one directory whose permissions matter, and
 * one place an operator has to look.
 */
export function resolveAmcHome(input: CredentialsPathsInput = {}): string {
  const explicit = trimmedOrNull(input.homeDir);
  if (explicit !== null) return resolve(explicit);
  const fromEnv = trimmedOrNull((input.env ?? process.env)[AMC_HOME_ENV]);
  if (fromEnv !== null) return resolve(fromEnv);
  return join(homedir(), ".config", "amc");
}

/**
 * Resolves every path the store touches.
 *
 * Note that `watchDir` is the credentials file's *directory*, not the file.
 * Watching the file itself would miss the very edits that matter most: an
 * atomic rewrite (this store's own, or an editor's) replaces the inode, and a
 * file watcher keeps observing the old one. The directory survives the swap.
 */
export function resolveCredentialsPaths(input: CredentialsPathsInput = {}): CredentialsPaths {
  const env = input.env ?? process.env;
  const homeDir = resolveAmcHome(input);
  const override = trimmedOrNull(input.path) ?? trimmedOrNull(env[CREDENTIALS_PATH_ENV]);
  const file = override !== null ? resolve(override) : join(homeDir, CREDENTIALS_FILENAME);
  const projectDir =
    input.projectDir === null ? null : resolve(trimmedOrNull(input.projectDir) ?? process.cwd());
  const userEnvFile = trimmedOrNull(input.userEnvPath);

  return {
    // The directory whose mode is asserted is the one actually holding the
    // file, which is not `homeDir` when the path was overridden.
    homeDir: dirname(file),
    file,
    fileName: basename(file),
    watchDir: dirname(file),
    projectEnvFile: projectDir === null ? null : join(projectDir, DOTENV_FILENAME),
    userEnvFile: userEnvFile !== null ? resolve(userEnvFile) : join(homedir(), DOTENV_FILENAME)
  };
}

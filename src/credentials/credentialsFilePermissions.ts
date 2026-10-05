/**
 * "Owner alone, or not at all."
 *
 * Asserted at boot and again on every reload, because the interesting case is
 * not a file that was always world-readable — that one fails on the first run
 * and gets fixed. The interesting case is the file that was 0600 at boot and
 * became 0644 an hour later: a backup tool, a container image build, a
 * well-meaning `chmod -R`. A check that only runs at startup declares that file
 * safe for the entire life of the process.
 */
import type { Stats } from "node:fs";
import {
  CredentialsFilePermissionsError
} from "./credentialsStoreErrors.js";

/** The only acceptable mode for the credentials file. */
export const OWNER_ONLY_FILE_MODE = 0o600;

/** The only acceptable mode for the directory holding it. */
export const OWNER_ONLY_DIR_MODE = 0o700;

/**
 * The bits that must all be clear: group rwx and other rwx.
 *
 * Group-*execute* on a directory is included deliberately — it is exactly the
 * bit that lets a group member `cd` in and stat a file whose name they already
 * know, which for a store with one well-known filename is the whole attack.
 */
const GROUP_AND_OTHER_BITS = 0o077;

/** Permission bits only; `Stats.mode` also encodes the file type. */
function permissionBits(mode: number): number {
  return mode & 0o777;
}

/** True when neither group nor other holds any bit. */
function isOwnerOnlyMode(mode: number): boolean {
  return (permissionBits(mode) & GROUP_AND_OTHER_BITS) === 0;
}

/**
 * Whether POSIX mode bits mean anything on this platform.
 *
 * On Windows they do not: Node synthesises a mode from the read-only attribute,
 * and access is governed by ACLs this check cannot see. Enforcing there would
 * fail honest setups while proving nothing, so the check is skipped and the
 * skip is stated rather than hidden behind a passing assertion.
 */
export function permissionsAreEnforced(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "win32";
}

/**
 * Asserts a stat'ed path is owner-only, or throws with the fix.
 *
 * Takes the already-stat'ed `Stats` rather than a path so the caller performs
 * exactly one stat and the check cannot race a swap between stat and read.
 */
export function assertOwnerOnly(input: {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly stats: Pick<Stats, "mode">;
  readonly platform?: NodeJS.Platform;
}): void {
  if (!permissionsAreEnforced(input.platform ?? process.platform)) return;
  const mode = permissionBits(input.stats.mode);
  if (isOwnerOnlyMode(mode)) return;
  throw new CredentialsFilePermissionsError({
    path: input.path,
    kind: input.kind,
    mode,
    requiredMode: input.kind === "file" ? OWNER_ONLY_FILE_MODE : OWNER_ONLY_DIR_MODE
  });
}

/**
 * Putting bytes on disk without ever exposing them.
 *
 * Three separate hazards, three separate measures:
 *
 *   A reader mid-write must never see a half-file. Write to a temporary and
 *   `rename` over the target, which is atomic within a filesystem — otherwise a
 *   consumer resolving during a rotation gets a truncated key and a 401 that
 *   looks like the key was revoked.
 *
 *   The temporary must never be group- or world-readable, not even for the
 *   microseconds before a `chmod`. `open` with mode 0600 creates it right;
 *   creating it at the default mode and fixing it afterwards leaves a window in
 *   which the file holds every credential and anyone can read it.
 *
 *   A crash must not lose an accepted write. `fsync` before the rename means a
 *   rotation an operator was told succeeded is on the platter.
 */
import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { OWNER_ONLY_DIR_MODE, OWNER_ONLY_FILE_MODE, permissionsAreEnforced } from "./credentialsFilePermissions.js";

/**
 * Creates the store's directory if it is missing, at owner-only mode.
 *
 * An *existing* directory is never chmod'ed. Repairing it would hide the fact
 * that the store had been group-readable, and the permission assertion exists
 * precisely so that fact is reported rather than quietly corrected. Only a
 * directory this call just created is chmod'ed, and only because `mkdir`'s mode
 * argument is masked by the umask — a 0022 umask would otherwise leave 0755 on
 * a directory this code believes it made private.
 */
export function ensureCredentialsDirectory(path: string): void {
  const created = mkdirSync(path, { recursive: true, mode: OWNER_ONLY_DIR_MODE });
  if (created === undefined || !permissionsAreEnforced()) return;
  chmodSync(path, OWNER_ONLY_DIR_MODE);
}

/** Atomically replaces `path` with `text`, owner-readable only. */
export function writeCredentialsFileAtomic(path: string, text: string): void {
  const directory = dirname(path);
  ensureCredentialsDirectory(directory);
  const temporary = join(directory, `.${randomBytes(8).toString("hex")}.tmp`);

  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, "wx", OWNER_ONLY_FILE_MODE);
    writeSync(descriptor, text, null, "utf8");
    fsyncSync(descriptor);
  } catch (error) {
    if (descriptor !== null) {
      try { closeSync(descriptor); } catch { /* already closed */ }
    }
    try { unlinkSync(temporary); } catch { /* nothing to clean up */ }
    throw error;
  }
  closeSync(descriptor);

  try {
    // `rename` preserves the temporary's mode, so the replacement file is 0600
    // even when the file it replaced was not — the one case where this store
    // improves permissions, and it does so by writing a new file rather than by
    // chmod'ing a file whose exposure has already happened.
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* nothing to clean up */ }
    throw error;
  }
}

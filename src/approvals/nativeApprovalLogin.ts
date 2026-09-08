import { constants, closeSync, fchmodSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { authenticateUser, createSession, revokeSessionByToken, verifyTrackedSessionToken } from "../auth/authApi.js";
import type { UserRole } from "../auth/roles.js";

export const NATIVE_APPROVAL_PASSWORD_BYTES = 4096;
export const NATIVE_APPROVAL_TTL_MINUTES = Object.freeze({ min: 5, max: 60, default: 15 });

export class NativeApprovalLoginError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "NativeApprovalLoginError"; }
}
export interface NativeApprovalLoginOptions {
  readonly workspace: string;
  readonly username: string;
  readonly tokenFile: string;
  readonly ttlMinutes?: number;
}
export interface NativeApprovalLoginReceipt {
  readonly schemaVersion: 1;
  readonly authSource: "LOCAL_USER";
  readonly userId: string;
  readonly username: string;
  readonly roles: readonly UserRole[];
  readonly issuedTs: number;
  readonly expiresTs: number;
  readonly tokenFile: string;
}

function fail(code: string, message: string): never { throw new NativeApprovalLoginError(code, message); }
function absent(path: string): void {
  try { lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return; throw error; }
  fail("TOKEN_FILE_EXISTS", "The token file already exists. Choose a new path; existing files are never overwritten.");
}
function sameFile(path: string, owned: { dev: number; ino: number }): boolean {
  try { const stat = lstatSync(path); return stat.isFile() && !stat.isSymbolicLink() && stat.dev === owned.dev && stat.ino === owned.ino; }
  catch { return false; }
}
function validate(options: NativeApprovalLoginOptions) {
  const ttlMinutes = options.ttlMinutes ?? NATIVE_APPROVAL_TTL_MINUTES.default;
  if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < NATIVE_APPROVAL_TTL_MINUTES.min || ttlMinutes > NATIVE_APPROVAL_TTL_MINUTES.max) {
    fail("TTL_INVALID", "Approval login TTL must be an integer from 5 to 60 minutes (the existing session API has a 5-minute minimum).");
  }
  if (!options.username || Buffer.byteLength(options.username) > 256 || /[\x00-\x1f\x7f]/.test(options.username)) {
    fail("USERNAME_INVALID", "Provide the exact existing local username without control characters.");
  }
  if (!options.tokenFile || /[\x00-\x1f\x7f]/.test(options.tokenFile)) fail("TOKEN_PATH_INVALID", "Choose a new token-file path without control characters.");
  const workspace = resolve(options.workspace);
  const requested = resolve(workspace, options.tokenFile);
  // Resolve ordinary directory aliases (including macOS /tmp) once, then pin
  // the actual directory. The final filename is still opened with NOFOLLOW.
  const parent = realpathSync(dirname(requested));
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory()) fail("TOKEN_PARENT_INVALID", "The token file needs an existing directory.");
  const parentIdentity = { dev: parentStat.dev, ino: parentStat.ino };
  const tokenFile = join(parent, basename(requested));
  absent(tokenFile);
  return { workspace, tokenFile, parent, parentIdentity, ttlMinutes };
}

/**
 * Authenticate an existing signed ACTIVE user, then mint through the existing
 * tracked local-session API. No identity/role defaults or secret return values.
 */
export async function loginNativeApprovals(
  options: NativeApprovalLoginOptions,
  readPassword: () => Promise<string>
): Promise<NativeApprovalLoginReceipt> {
  let fd: number | undefined;
  let owned: { dev: number; ino: number } | undefined;
  let tokenFile: string | undefined;
  let workspace: string | undefined;
  let token: string | undefined;
  let password = "";
  let bytes: Buffer | undefined;
  try {
    const validated = validate(options);
    ({ workspace, tokenFile } = validated);
    password = await readPassword();
    if (!password || Buffer.byteLength(password) > NATIVE_APPROVAL_PASSWORD_BYTES || password.includes("\0")) {
      fail("PASSWORD_INVALID", "Password input must be nonempty, at most 4096 UTF-8 bytes and contain no NUL bytes.");
    }
    const authenticated = authenticateUser({ workspace, username: options.username, password });
    password = "";
    if (!authenticated.ok || authenticated.user === null || authenticated.user.status !== "ACTIVE") {
      fail("LOGIN_REFUSED", "Login refused. An existing ACTIVE local user with a valid signed users configuration and the correct password is required.");
    }
    // Recheck after the asynchronous prompt, then reserve before minting. O_EXCL
    // is the actual existing-file refusal, not just the earlier friendly check.
    const currentParent = lstatSync(validated.parent);
    if (realpathSync(validated.parent) !== validated.parent || !currentParent.isDirectory()
      || currentParent.dev !== validated.parentIdentity.dev || currentParent.ino !== validated.parentIdentity.ino) {
      fail("TOKEN_PARENT_CHANGED", "The token-file directory changed while waiting for the password.");
    }
    fd = openSync(tokenFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const created = fstatSync(fd);
    owned = { dev: created.dev, ino: created.ino };
    if (!created.isFile()) fail("TOKEN_FILE_INVALID", "The new token output is not a regular file.");
    fchmodSync(fd, 0o600);
    const issued = createSession({ workspace, user: authenticated.user, ttlMs: validated.ttlMinutes * 60_000 });
    token = issued.token;
    const tracked = verifyTrackedSessionToken({ workspace, token });
    if (!tracked.ok || tracked.payload === null || tracked.authSource !== "LOCAL_USER"
      || tracked.payload.userId !== authenticated.user.userId || tracked.payload.username !== authenticated.user.username) {
      fail("SESSION_REFUSED", "The newly issued tracked local session could not be confirmed; no login file is accepted.");
    }
    bytes = Buffer.from(`${token}\n`, "utf8");
    if (bytes.length > 16_384) fail("TOKEN_LIMIT", "The issued session exceeds the native approval token-file size limit.");
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    const written = fstatSync(fd);
    if (!sameFile(tokenFile, owned) || written.nlink !== 1 || (process.platform !== "win32" && (written.mode & 0o777) !== 0o600)) {
      fail("TOKEN_FILE_CHANGED", "The token output path, link count or private permissions changed; this login is being revoked.");
    }
    const receipt: NativeApprovalLoginReceipt = {
      schemaVersion: 1, authSource: "LOCAL_USER", userId: tracked.payload.userId,
      username: tracked.payload.username, roles: [...tracked.payload.roles], issuedTs: tracked.payload.issuedTs,
      expiresTs: tracked.payload.expiresTs, tokenFile
    };
    closeSync(fd); fd = undefined;
    return receipt;
  } catch (error) {
    let rollbackFailed = false;
    if (token !== undefined && workspace !== undefined) {
      try {
        revokeSessionByToken({ workspace, token });
        // The existing revoker handles storage failures internally. Confirm the
        // revocation instead of claiming successful cleanup merely on return.
        const after = verifyTrackedSessionToken({ workspace, token });
        if (after.ok || (after.error !== "session revoked" && after.error !== "session expired")) rollbackFailed = true;
      } catch { rollbackFailed = true; }
    }
    if (fd !== undefined) {
      try { ftruncateSync(fd, 0); } catch { rollbackFailed = true; }
      try { closeSync(fd); } catch { rollbackFailed = true; }
      fd = undefined;
    }
    if (tokenFile !== undefined && owned !== undefined && sameFile(tokenFile, owned)) {
      try { unlinkSync(tokenFile); } catch { rollbackFailed = true; }
    }
    if (rollbackFailed) fail("LOGIN_ROLLBACK_INCOMPLETE", "Login failed and cleanup could not be fully confirmed. Review the workspace's tracked sessions and selected output path; no token or successful login is being reported.");
    if (error instanceof NativeApprovalLoginError) throw error;
    if ((error as NodeJS.ErrnoException | null)?.code === "EEXIST") fail("TOKEN_FILE_EXISTS", "The token file already exists. Choose a new path; existing files are never overwritten.");
    return fail("LOGIN_FAILED", "Approval login failed. Check local authentication, signing access and the new private file destination; secret and filesystem diagnostics are withheld.");
  } finally {
    password = ""; token = undefined;
    bytes?.fill(0);
  }
}

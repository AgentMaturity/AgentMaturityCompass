import { constants, openSync, closeSync, fstatSync } from "node:fs";
import { readBoundedBytes } from "../utils/fs.js";
import { verifyTrackedSessionToken } from "../auth/authApi.js";

/** A secret token from a private regular file (0600, owned by this user, no symlink); never logged. */
export function readPrivateTokenFile(path: string, label: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
    if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) throw new Error(`${label} file must be private to its owner (0600)`);
    const bytes = readBoundedBytes(fd, 16_384);
    if (bytes === null || bytes.length === 0) throw new Error(`${label} file is empty or exceeds its size limit`);
    const token = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    bytes.fill(0);
    return token;
  } finally { closeSync(fd); }
}

/** Read an existing authenticated session; never mint an identity or infer a role. The token is a live credential: keep it in memory only. */
export function readNativeApprovalSession(workspace: string, tokenFile: string, acceptScope?: "a4_comment") {
  const token = readPrivateTokenFile(tokenFile, "Approval session token");
  const verified = verifyTrackedSessionToken({ workspace, token, acceptScope });
  if (!verified.ok || verified.payload === null) throw new Error("An active tracked workspace login is required; the approval session is missing, expired, revoked or untrusted");
  return { token, payload: verified.payload };
}

export function readNativeApprovalActor(workspace: string, tokenFile: string) {
  const { payload } = readNativeApprovalSession(workspace, tokenFile);
  return { userId: payload.userId, username: payload.username, roles: [...payload.roles], expiresTs: payload.expiresTs };
}

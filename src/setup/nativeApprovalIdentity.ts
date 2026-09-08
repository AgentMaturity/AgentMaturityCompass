import { constants, openSync, closeSync, fstatSync, readSync } from "node:fs";
import { verifyTrackedSessionToken } from "../auth/authApi.js";

/** Read an existing authenticated session; never mint an identity or infer a role. */
export function readNativeApprovalActor(workspace: string, tokenFile: string) {
  const fd = openSync(tokenFile, constants.O_RDONLY | constants.O_NONBLOCK);
  let token: string;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("Approval session token must be a regular file");
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error("Approval session token file must be private to its owner (0600)");
    const buffer = Buffer.alloc(16_385); let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (!count) break; offset += count;
    }
    if (offset === 0 || offset > 16_384) throw new Error("Approval session token file is empty or exceeds its size limit");
    token = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset)).trim();
    buffer.fill(0);
  } finally { closeSync(fd); }
  const verified = verifyTrackedSessionToken({ workspace, token });
  if (!verified.ok || verified.payload === null) throw new Error("An active tracked workspace login is required; the approval session is missing, expired, revoked or untrusted");
  return { userId: verified.payload.userId, username: verified.payload.username, roles: [...verified.payload.roles], expiresTs: verified.payload.expiresTs };
}

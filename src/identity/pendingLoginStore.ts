/** OIDC-only, capped single-use login state. PKCE material stays inside owner-only host storage. */
import { chmodSync, constants, existsSync, lstatSync, mkdirSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { openHostDb, type HostDbHandle } from "../workspaces/hostDb.js";
import { hostDbPath } from "../workspaces/workspacePaths.js";
import { sha256Hex } from "../utils/hash.js";

const TTL_MS = 10 * 60_000;
const MAX_PENDING = 1000;
interface PendingOidcLogin { providerId: string; verifier: string; nonce: string; createdTs: number; expiresTs: number }

function ownerOnly(path: string, directory: boolean): void {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("OIDC state storage unavailable");
  const before = lstatSync(path);
  if (before.uid !== uid || before.isSymbolicLink() || (directory ? !before.isDirectory() : !before.isFile())) {
    throw new Error("OIDC state storage unavailable");
  }
  const mode = directory ? 0o700 : 0o600;
  chmodSync(path, mode);
  const after = lstatSync(path);
  if (after.uid !== uid || (after.mode & 0o777) !== mode || after.ino !== before.ino || after.dev !== before.dev) {
    throw new Error("OIDC state storage unavailable");
  }
}

function protectStorage(hostDir: string): void {
  ownerOnly(hostDir, true);
  for (const path of [hostDbPath(hostDir), `${hostDbPath(hostDir)}-wal`, `${hostDbPath(hostDir)}-shm`]) {
    if (existsSync(path)) ownerOnly(path, false);
  }
}

function protectedDb(hostDir: string): HostDbHandle {
  const root = resolve(hostDir);
  let handle: HostDbHandle | undefined;
  try {
    if (process.getuid === undefined) throw new Error("owner unavailable");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    ownerOnly(root, true);
    const path = hostDbPath(root);
    if (!existsSync(path)) {
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
      closeSync(fd);
    }
    protectStorage(root);
    handle = openHostDb(root);
    protectStorage(root);
    handle.db.exec(`CREATE TABLE IF NOT EXISTS identity_pending_logins (
      state_hash TEXT PRIMARY KEY, provider_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind = 'OIDC'),
      request_id TEXT NOT NULL, nonce TEXT NOT NULL, pkce_verifier TEXT NOT NULL,
      created_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL
    )`);
    return handle;
  } catch {
    try { handle?.close(); } catch { /* refuse regardless */ }
    throw new Error("OIDC state storage unavailable");
  }
}

export function savePendingOidcLogin(input: { hostDir: string; state: string; providerId: string; verifier: string; nonce: string }): void {
  if (!input.state || input.state.length > 512 || !input.providerId || input.providerId.length > 512
    || !input.verifier || input.verifier.length > 128 || !input.nonce || input.nonce.length > 512) throw new Error("OIDC state storage unavailable");
  const hostDir = resolve(input.hostDir), handle = protectedDb(hostDir);
  try {
    handle.db.transaction(() => {
      const now = Date.now();
      handle.db.prepare("DELETE FROM identity_pending_logins WHERE expires_ts <= ?").run(now);
      const row = handle.db.prepare("SELECT COUNT(*) AS count FROM identity_pending_logins").get() as { count: number };
      if (row.count >= MAX_PENDING) throw new Error("OIDC pending login limit reached");
      handle.db.prepare(`INSERT INTO identity_pending_logins(state_hash, provider_id, kind, request_id, nonce, pkce_verifier, created_ts, expires_ts)
        VALUES(?, ?, 'OIDC', ?, ?, ?, ?, ?)`)
        .run(sha256Hex(input.state), input.providerId, sha256Hex(input.state), input.nonce, input.verifier, now, now + TTL_MS);
    }).immediate();
    protectStorage(hostDir);
  } finally { handle.close(); }
}

export function consumePendingOidcLogin(input: { hostDir: string; state: string; providerId: string }): PendingOidcLogin {
  if (!input.state || input.state.length > 512) throw new Error("OIDC state mismatch");
  const hostDir = resolve(input.hostDir), handle = protectedDb(hostDir);
  try {
    const row = handle.db.prepare(`DELETE FROM identity_pending_logins WHERE state_hash = ? RETURNING
      provider_id AS providerId, nonce, pkce_verifier AS verifier, created_ts AS createdTs, expires_ts AS expiresTs`)
      .get(sha256Hex(input.state)) as PendingOidcLogin | undefined;
    protectStorage(hostDir);
    if (!row || row.providerId !== input.providerId) throw new Error("OIDC state mismatch");
    const now = Date.now();
    if (!Number.isFinite(row.createdTs) || !Number.isFinite(row.expiresTs) || row.expiresTs <= now
      || row.createdTs > now || row.expiresTs - row.createdTs !== TTL_MS) throw new Error("OIDC state expired");
    if (typeof row.nonce !== "string" || !row.nonce || typeof row.verifier !== "string" || !row.verifier) throw new Error("OIDC state mismatch");
    return row;
  } finally { handle.close(); }
}

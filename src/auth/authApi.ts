import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import YAML from "yaml";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { parseCookieHeader, issueSessionToken, issueSessionTokenAsync, verifySessionToken, type SessionPayload } from "./sessionTokens.js";
import { hashPassword, verifyPassword } from "./passwordHash.js";
import { createUserRecord, usersFileSchema, type UserRecord, type UsersFile } from "./userSchema.js";
import type { UserRole } from "./roles.js";
import { enforceRoleOrAdmin, type AccessContext } from "./rbac.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { KeyProviderError, KEY_PROVIDER_ERRORS } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";

interface UsersSignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export interface SessionStoreRecord {
  sessionId: string;
  userId: string;
  username: string;
  roles: UserRole[];
  issuedTs: number;
  expiresTs: number;
  revoked: boolean;
  revokedTs?: number;
  tokenSha256?: string;
  authSource?: "LOCAL_USER" | "WORKSPACE_ROUTER";
}

function usersPath(workspace: string): string {
  return join(workspace, ".amc", "users.yaml");
}

function usersSigPath(workspace: string): string {
  return `${usersPath(workspace)}.sig`;
}

function sessionsDir(workspace: string): string {
  return join(workspace, ".amc", "studio", "sessions");
}

function sessionStorePath(workspace: string, sessionId: string): string {
  return join(sessionsDir(workspace), `${sessionId}.json`);
}

export function usersConfigPath(workspace: string): string {
  return usersPath(workspace);
}

export function usersConfigSigPath(workspace: string): string {
  return usersSigPath(workspace);
}

export function verifyUsersConfigSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  return readSignedUsersConfig(workspace).verdict;
}

/**
 * One read of users.yaml and its .sig: the verdict over exactly these bytes, the bytes themselves (null when the file
 * is missing) and the auditor key that verified them. Callers parse these bytes, never a second read of the file.
 */
function readSignedUsersConfig(workspace: string, captured?: UsersPublicationSnapshot): {
  verdict: ReturnType<typeof verifyUsersConfigSignature>;
  bytes: Buffer | null;
  signerPem: string | null;
} {
  const path = usersPath(workspace);
  const sigPath = usersSigPath(workspace);
  const verdict = (valid: boolean, signatureExists: boolean, reason: string | null) => ({ valid, signatureExists, reason, path, sigPath });
  if (captured === undefined ? !pathExists(path) : captured.bytes === null) {
    return { verdict: verdict(false, false, "users config missing"), bytes: null, signerPem: null };
  }
  let bytes: Buffer | null = null;
  try {
    bytes = captured === undefined ? readFileSync(path) : Buffer.from(captured.bytes!);
    if (captured === undefined ? !pathExists(sigPath) : captured.signature === null) {
      return { verdict: verdict(false, false, "users signature missing"), bytes, signerPem: null };
    }
    const sig = JSON.parse(captured === undefined ? readUtf8(sigPath) : captured.signature!.toString("utf8")) as UsersSignature;
    const digest = sha256Hex(bytes);
    if (digest !== sig.digestSha256) {
      return { verdict: verdict(false, true, "digest mismatch"), bytes, signerPem: null };
    }
    assertKeysetComplete(workspace);
    const signerPem = getPurposeKeyHistory(workspace, "config-signature")
      .find(pem => typeof sig.signature === "string" && verifyWithKey(Buffer.from(digest, "hex"), pem, Buffer.from(sig.signature, "base64"))) ?? null;
    return { verdict: verdict(signerPem !== null, true, signerPem !== null ? null : "signature verification failed"), bytes, signerPem };
  } catch {
    return { verdict: verdict(false, true, "users config or signature unreadable"), bytes, signerPem: null };
  }
}

function signUsersConfig(workspace: string): string {
  const path = usersPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`users config not found: ${path}`);
  }
  const digest = sha256Hex(readFileSync(path));
  const signature = signHexDigest(digest, getSigningKey(workspace, "config-signature"));
  const payload: UsersSignature = {
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = usersSigPath(workspace);
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

function loadUsersConfig(workspace: string, options?: { requireValidSignature?: boolean }): UsersFile {
  return loadSignedUsersConfig(workspace, options).config;
}

/** users.yaml parsed from the bytes its signature was verified over, in the same read, and the verifying auditor key. */
function loadSignedUsersConfig(workspace: string, options?: { requireValidSignature?: boolean }, captured?: UsersPublicationSnapshot): { config: UsersFile; signerPem: string | null } {
  const { verdict, bytes, signerPem } = readSignedUsersConfig(workspace, captured);
  if (verdict.reason === "users config missing") {
    throw new Error("users config missing");
  }
  if ((options?.requireValidSignature !== false && !verdict.valid) || bytes === null) {
    throw new Error(`users signature invalid: ${verdict.reason ?? "unknown"}`);
  }
  return { config: usersFileSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown), signerPem };
}

function saveUsersConfig(workspace: string, users: UsersFile): void {
  // Compatibility writers must refuse a held/locked key before replacing the authenticated body.
  getSigningKey(workspace, "config-signature");
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(usersPath(workspace), YAML.stringify(usersFileSchema.parse(users)), 0o644);
}

export function initUsersConfig(params: {
  workspace: string;
  username: string;
  password: string;
}): { path: string; sigPath: string; owner: UserRecord } {
  return withUsersConfigLock(params.workspace, () => {
  const owner = createUserRecord({
    username: params.username,
    roles: ["OWNER"],
    passwordHash: hashPassword(params.password)
  });
  const config: UsersFile = {
    v: 1,
    updatedTs: Date.now(),
    users: [owner]
  };
  saveUsersConfig(params.workspace, config);
  const sigPath = signUsersConfig(params.workspace);
  return {
    path: usersPath(params.workspace),
    sigPath,
    owner
  };
  });
}

export function listUsers(workspace: string): UserRecord[] {
  return listVerifiedUsers(workspace).users;
}

/**
 * The users of a users.yaml whose signature verifies, parsed from the verified bytes, with the sha256 of the auditor
 * public key PEM that verified them. Throws when the file is missing or its signature does not verify.
 */
export function listVerifiedUsers(workspace: string): { users: UserRecord[]; signerFingerprint: string } {
  const { config, signerPem } = loadSignedUsersConfig(workspace);
  return { users: config.users.slice().sort((a, b) => a.username.localeCompare(b.username)), signerFingerprint: sha256Hex(Buffer.from(signerPem!, "utf8")) };
}

/**
 * The active user `userId` of the signed users.yaml, from one verified read, or null when no active user has that id
 * (P1-78: a lease's principal and a native task's lease issuer resolve through this). Throws when users.yaml is missing
 * or does not verify.
 */
export function activeUserRecord(workspace: string, userId: string): UserRecord | null {
  return listVerifiedUsers(workspace).users.find((user) => user.userId === userId && user.status === "ACTIVE") ?? null;
}

export function addUser(params: {
  workspace: string;
  username: string;
  roles: UserRole[];
  password: string;
}): UserRecord {
  return withUsersConfigLock(params.workspace, () => {
  const config = loadUsersConfig(params.workspace);
  if (config.users.some((user) => user.username.toLowerCase() === params.username.toLowerCase())) {
    throw new Error(`user already exists: ${params.username}`);
  }
  const record = createUserRecord({
    username: params.username,
    roles: params.roles,
    passwordHash: hashPassword(params.password)
  });
  const next: UsersFile = {
    ...config,
    updatedTs: Date.now(),
    users: [...config.users, record]
  };
  saveUsersConfig(params.workspace, next);
  signUsersConfig(params.workspace);
  return record;
  });
}

export function revokeUser(params: {
  workspace: string;
  username: string;
}): UserRecord {
  return withUsersConfigLock(params.workspace, () => {
  const config = loadUsersConfig(params.workspace);
  const index = config.users.findIndex((user) => user.username.toLowerCase() === params.username.toLowerCase());
  if (index < 0) {
    throw new Error(`user not found: ${params.username}`);
  }
  const updated = {
    ...config.users[index]!,
    status: "REVOKED" as const
  };
  const users = config.users.slice();
  users[index] = updated;
  saveUsersConfig(params.workspace, {
    ...config,
    updatedTs: Date.now(),
    users
  });
  signUsersConfig(params.workspace);
  return updated;
  });
}

export function setUserRoles(params: {
  workspace: string;
  username: string;
  roles: UserRole[];
}): UserRecord {
  return withUsersConfigLock(params.workspace, () => {
  const config = loadUsersConfig(params.workspace);
  const index = config.users.findIndex((user) => user.username.toLowerCase() === params.username.toLowerCase());
  if (index < 0) {
    throw new Error(`user not found: ${params.username}`);
  }
  const updated = {
    ...config.users[index]!,
    roles: params.roles
  };
  const users = config.users.slice();
  users[index] = updated;
  saveUsersConfig(params.workspace, {
    ...config,
    updatedTs: Date.now(),
    users
  });
  signUsersConfig(params.workspace);
  return updated;
  });
}

interface UsersPublicationSnapshot { bytes: Buffer | null; signature: Buffer | null }
function usersPublicationSnapshot(workspace: string): UsersPublicationSnapshot {
  try {
    return { bytes: pathExists(usersPath(workspace)) ? readFileSync(usersPath(workspace)) : null,
      signature: pathExists(usersSigPath(workspace)) ? readFileSync(usersSigPath(workspace)) : null };
  } catch { throw new Error("users config or signature unreadable"); }
}
function withUsersConfigLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc"), name: "users-config", operation });
}
const sameUsersBytes = (left: Buffer | null, right: Buffer | null) => left === null ? right === null : right !== null && left.equals(right);

/** A maintained caller rechecks its existing authorization after the provider wait, before any users-file write. */
export interface UsersMutationOptions { assertAuthorized?: () => void }
class UsersAuthorizationChangedError extends Error {
  constructor() { super("user mutation authority changed while signing"); this.name = "UsersAuthorizationChangedError"; }
}

const usersVaultLockedMessages = new Set([
  "🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup.",
  "🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported."
]);
/** Only the three existing users-mutation POST routes receive this response mapping. */
export function respondUsersMutationError(request: Pick<IncomingMessage, "method" | "url">, error: unknown, send: (status: number, body: { error: string; code?: string }) => void): boolean {
  if (request.method !== "POST") return false;
  let path: string;
  try { path = new URL(request.url ?? "/", "http://local.invalid").pathname; } catch { return false; }
  if (!["/users/add", "/users/revoke", "/users/roles"].includes(path)) return false;
  if (error instanceof UsersAuthorizationChangedError) {
    send(403, { error: "user mutation authority changed while signing" }); return true;
  }
  if (error instanceof KeyProviderError && Object.hasOwn(KEY_PROVIDER_ERRORS, error.code)) {
    send(KEY_PROVIDER_ERRORS[error.code], { error: `${error.code}: user mutation signing refused`, code: error.code }); return true;
  }
  if (error instanceof KeyRevokedError) {
    send(409, { error: "KEY_REVOKED: the config-signature key was revoked", code: "KEY_REVOKED" }); return true;
  }
  // The vault compatibility API currently throws Error, not a distinct lock class. Match only its two fixed messages.
  if (error instanceof Error && usersVaultLockedMessages.has(error.message)) {
    send(423, { error: "VAULT_LOCKED: unlock the vault to change users", code: "VAULT_LOCKED" }); return true;
  }
  return false;
}

interface UsersMutationActor { isAdmin: boolean; userId: string | null; sessionAuthSource?: string }
/** Current request authentication and the caller's established access conversion remain authoritative. */
export function createUsersMutationGuard<Actor extends UsersMutationActor>(input: {
  workspace: string; expected: Actor; authenticate: () => Actor | null; access: (actor: Actor) => AccessContext; readOnly: () => boolean;
}): () => void {
  const { workspace, authenticate, access, readOnly } = input;
  const expected = { isAdmin: input.expected.isAdmin, userId: input.expected.userId };
  return () => {
    const current = authenticate();
    if (current === null || current.isAdmin !== expected.isAdmin || current.userId !== expected.userId
      || !enforceRoleOrAdmin({ access: access(current), requiredAny: ["OWNER"],
        usersConfigValid: verifyUsersConfigSignature(workspace).valid || current.sessionAuthSource === "WORKSPACE_ROUTER" }).ok
      || readOnly()) throw new UsersAuthorizationChangedError();
  };
}

/** HTTP user mutations expose record metadata, never its password verifier. */
export function publicUsersMutationRecord({ passwordHash: _passwordHash, ...user }: UserRecord): Omit<UserRecord, "passwordHash"> {
  return user;
}

async function mutateUsersConfigAsync<T>(workspace: string, change: (current: UsersFile | null) => { config: UsersFile; result: T },
  opts: UsersMutationOptions = {}, replace = false): Promise<T> {
  const assertAuthorized = opts.assertAuthorized;
  assertAuthorized?.();
  // Existing file-provider migration/gates occur before the users lock. No provider await holds that lock.
  const authority = capturePurposePublication(workspace, "config-signature");
  const prepared = withUsersConfigLock(workspace, () => {
    assertAuthorized?.();
    const predecessor = usersPublicationSnapshot(workspace);
    const current = replace ? null : loadSignedUsersConfig(workspace, undefined, predecessor).config;
    const changed = change(current);
    const bytes = Buffer.from(YAML.stringify(usersFileSchema.parse(changed.config)), "utf8");
    return { predecessor, bytes, result: changed.result };
  });
  const digest = sha256Hex(prepared.bytes);
  const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digest, "hex"));
  const signature = Buffer.from(JSON.stringify({ digestSha256: digest, signature: signed.signature.toString("base64"),
    signedTs: Date.now(), signer: "auditor" } satisfies UsersSignature, null, 2), "utf8");
  return withUsersConfigLock(workspace, () => {
    const current = usersPublicationSnapshot(workspace);
    if (!sameUsersBytes(prepared.predecessor.bytes, current.bytes) || !sameUsersBytes(prepared.predecessor.signature, current.signature)) {
      throw new Error("users config changed while signing; retry");
    }
    assertPurposePublicationCurrent(workspace, authority, signed);
    assertAuthorized?.();
    // Same YAML, digest and sidecar shape as the synchronous APIs; a partial pair still fails closed.
    writeFileAtomic(usersPath(workspace), prepared.bytes, 0o644);
    writeFileAtomic(usersSigPath(workspace), signature, 0o644);
    return prepared.result;
  });
}

export async function initUsersConfigAsync(input: Parameters<typeof initUsersConfig>[0], opts: UsersMutationOptions = {}): Promise<ReturnType<typeof initUsersConfig>> {
  const params = { ...input };
  return mutateUsersConfigAsync(params.workspace, () => {
    const owner = createUserRecord({ username: params.username, roles: ["OWNER"], passwordHash: hashPassword(params.password) });
    return { config: { v: 1, updatedTs: Date.now(), users: [owner] },
      result: { path: usersPath(params.workspace), sigPath: usersSigPath(params.workspace), owner } };
  }, opts, true);
}

export async function addUserAsync(input: Parameters<typeof addUser>[0], opts: UsersMutationOptions = {}): Promise<UserRecord> {
  const params = { ...input, roles: [...input.roles] };
  return mutateUsersConfigAsync(params.workspace, current => {
    const config = current!;
    if (config.users.some(user => user.username.toLowerCase() === params.username.toLowerCase())) throw new Error(`user already exists: ${params.username}`);
    const record = createUserRecord({ username: params.username, roles: params.roles, passwordHash: hashPassword(params.password) });
    return { config: { ...config, updatedTs: Date.now(), users: [...config.users, record] }, result: record };
  }, opts);
}

export async function revokeUserAsync(input: Parameters<typeof revokeUser>[0], opts: UsersMutationOptions = {}): Promise<UserRecord> {
  const params = { ...input };
  return mutateUsersConfigAsync(params.workspace, current => {
    const config = current!, index = config.users.findIndex(user => user.username.toLowerCase() === params.username.toLowerCase());
    if (index < 0) throw new Error(`user not found: ${params.username}`);
    const updated = { ...config.users[index]!, status: "REVOKED" as const }, users = config.users.slice(); users[index] = updated;
    return { config: { ...config, updatedTs: Date.now(), users }, result: updated };
  }, opts);
}

export async function setUserRolesAsync(input: Parameters<typeof setUserRoles>[0], opts: UsersMutationOptions = {}): Promise<UserRecord> {
  const params = { ...input, roles: [...input.roles] };
  return mutateUsersConfigAsync(params.workspace, current => {
    const config = current!, index = config.users.findIndex(user => user.username.toLowerCase() === params.username.toLowerCase());
    if (index < 0) throw new Error(`user not found: ${params.username}`);
    const updated = { ...config.users[index]!, roles: params.roles }, users = config.users.slice(); users[index] = updated;
    return { config: { ...config, updatedTs: Date.now(), users }, result: updated };
  }, opts);
}

export function authenticateUser(params: {
  workspace: string;
  username: string;
  password: string;
}): { ok: boolean; user: UserRecord | null; error?: string } {
  let config: UsersFile;
  try {
    config = loadUsersConfig(params.workspace, { requireValidSignature: true });
  } catch (error) {
    return {
      ok: false,
      user: null,
      error: String(error)
    };
  }
  const user = config.users.find((row) => row.username === params.username);
  if (!user) {
    return {
      ok: false,
      user: null,
      error: "invalid credentials"
    };
  }
  if (user.status !== "ACTIVE") {
    return {
      ok: false,
      user: null,
      error: "user revoked"
    };
  }
  if (!verifyPassword(params.password, user.passwordHash)) {
    return {
      ok: false,
      user: null,
      error: "invalid credentials"
    };
  }
  return {
    ok: true,
    user
  };
}

export function createTrackedSession(params: {
  workspace: string;
  userId: string;
  username: string;
  roles: UserRole[];
  ttlMs?: number;
  authSource: "LOCAL_USER" | "WORKSPACE_ROUTER";
}): { token: string; payload: SessionPayload } {
  return storeTrackedSession(params, issueSessionToken(params));
}

function storeTrackedSession(params: Parameters<typeof createTrackedSession>[0], issued: ReturnType<typeof issueSessionToken>): ReturnType<typeof issueSessionToken> {
  const sessionId = `sess_${sha256Hex(issued.token).slice(0, 24)}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const store: SessionStoreRecord = {
    sessionId,
    userId: issued.payload.userId,
    username: issued.payload.username,
    roles: issued.payload.roles,
    issuedTs: issued.payload.issuedTs,
    expiresTs: issued.payload.expiresTs,
    revoked: false,
    tokenSha256: sha256Hex(issued.token),
    authSource: params.authSource
  };
  ensureDir(sessionsDir(params.workspace));
  writeFileAtomic(sessionStorePath(params.workspace, sessionId), JSON.stringify(store, null, 2), 0o600);
  return issued;
}

/** Persist no tracked session until the committed purpose signer has successfully returned a verified signature. */
export async function createTrackedSessionAsync(params: Parameters<typeof createTrackedSession>[0]): Promise<ReturnType<typeof createTrackedSession>> {
  const requested = { ...params, roles: [...params.roles] };
  const issued = await issueSessionTokenAsync(requested);
  // A provider await must not publish the authority of a user revoked or changed while signing was pending.
  if (requested.authSource === "LOCAL_USER") {
    const current = activeUserRecord(requested.workspace, requested.userId);
    if (current === null || current.username !== requested.username
      || [...current.roles].sort().join("\n") !== [...issued.payload.roles].sort().join("\n")) {
      throw new Error("local session authority changed while signing");
    }
  }
  return storeTrackedSession(requested, issued);
}

export function createSession(params: {
  workspace: string;
  user: UserRecord;
  ttlMs?: number;
}): { token: string; payload: SessionPayload } {
  return createTrackedSession({
    workspace: params.workspace,
    userId: params.user.userId,
    username: params.user.username,
    roles: params.user.roles,
    ttlMs: params.ttlMs,
    authSource: "LOCAL_USER"
  });
}

/** Runtime local-login counterpart of the synchronous compatibility API. */
export async function createSessionAsync(params: Parameters<typeof createSession>[0]): Promise<ReturnType<typeof createSession>> {
  return createTrackedSessionAsync({ workspace: params.workspace, userId: params.user.userId, username: params.user.username,
    roles: params.user.roles, ttlMs: params.ttlMs, authSource: "LOCAL_USER" });
}

export function revokeSessionByToken(params: {
  workspace: string;
  token: string;
}): void {
  const verified = verifySessionToken({
    workspace: params.workspace,
    token: params.token
  });
  if (!verified.ok || !verified.payload) {
    return;
  }
  const dir = sessionsDir(params.workspace);
  if (!pathExists(dir)) {
    return;
  }
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  const tokenSha256 = sha256Hex(params.token);
  for (const file of files) {
    const path = join(dir, file);
    try {
      const parsed = JSON.parse(readUtf8(path)) as SessionStoreRecord;
      const matchesToken = parsed.tokenSha256
        ? parsed.tokenSha256 === tokenSha256
        : parsed.userId === verified.payload.userId &&
          parsed.expiresTs === verified.payload.expiresTs &&
          parsed.issuedTs === verified.payload.issuedTs;
      if (matchesToken) {
        writeFileAtomic(
          path,
          JSON.stringify(
            {
              ...parsed,
              revoked: true,
              revokedTs: Date.now()
            },
            null,
            2
          ),
          0o600
        );
      }
    } catch {
      continue;
    }
  }
}

export function verifyTrackedSessionToken(params: {
  workspace: string;
  token: string;
}): {
  ok: boolean;
  payload: SessionPayload | null;
  error?: string;
  authSource?: "LOCAL_USER" | "WORKSPACE_ROUTER";
} {
  const token = params.token;
  const verified = verifySessionToken({
    workspace: params.workspace,
    token
  });
  if (!verified.ok || !verified.payload) {
    return verified;
  }

  const dir = sessionsDir(params.workspace);
  if (!pathExists(dir)) {
    return { ok: false, payload: null, error: "session not found" };
  }
  const tokenSha256 = sha256Hex(token);
  let session: SessionStoreRecord | null = null;
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    try {
      const parsed = JSON.parse(readUtf8(join(dir, file))) as SessionStoreRecord;
      const matchesToken = parsed.tokenSha256
        ? parsed.tokenSha256 === tokenSha256
        : parsed.userId === verified.payload.userId &&
          parsed.username === verified.payload.username &&
          parsed.issuedTs === verified.payload.issuedTs &&
          parsed.expiresTs === verified.payload.expiresTs;
      if (matchesToken) {
        session = parsed;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!session) {
    return { ok: false, payload: null, error: "session not found" };
  }
  if (session.revoked) {
    return { ok: false, payload: null, error: "session revoked" };
  }
  const sameRoles = (left: readonly UserRole[], right: readonly UserRole[]): boolean =>
    [...left].sort().join("\n") === [...right].sort().join("\n");
  if (
    session.userId !== verified.payload.userId ||
    session.username !== verified.payload.username ||
    session.issuedTs !== verified.payload.issuedTs ||
    session.expiresTs !== verified.payload.expiresTs ||
    !sameRoles(session.roles, verified.payload.roles)
  ) {
    return { ok: false, payload: null, error: "session record mismatch" };
  }

  if (session.authSource !== "WORKSPACE_ROUTER") {
    let users: UsersFile;
    try {
      users = loadUsersConfig(params.workspace, { requireValidSignature: true });
    } catch {
      return { ok: false, payload: null, error: "users config invalid" };
    }
    const user = users.users.find((row) =>
      row.userId === verified.payload!.userId && row.username === verified.payload!.username
    );
    if (!user || user.status !== "ACTIVE") {
      return { ok: false, payload: null, error: "user revoked" };
    }
    if (!sameRoles(user.roles, verified.payload.roles)) {
      return { ok: false, payload: null, error: "session roles changed" };
    }
  }

  return {
    ...verified,
    authSource: session.authSource
  };
}

export function sessionFromRequest(params: {
  workspace: string;
  req: IncomingMessage;
}): {
  ok: boolean;
  payload: SessionPayload | null;
  error?: string;
  authSource?: "LOCAL_USER" | "WORKSPACE_ROUTER";
} {
  const token = parseCookieHeader(params.req.headers.cookie, "amc_session");
  if (!token) {
    return {
      ok: false,
      payload: null,
      error: "missing session cookie"
    };
  }
  return verifyTrackedSessionToken({ workspace: params.workspace, token });
}

export function clearSessionCookie(res: ServerResponse, path = "/", secure = false): void {
  res.setHeader(
    "set-cookie",
    `amc_session=; HttpOnly${secure ? "; Secure" : ""}; SameSite=Strict; Path=${path}; Max-Age=0`
  );
}

export function setSessionCookie(
  res: ServerResponse,
  token: string,
  maxAgeSeconds: number,
  path = "/",
  secure = false
): void {
  res.setHeader(
    "set-cookie",
    `amc_session=${encodeURIComponent(token)}; HttpOnly${secure ? "; Secure" : ""}; SameSite=Strict; Path=${path}; Max-Age=${Math.max(60, maxAgeSeconds)}`
  );
}

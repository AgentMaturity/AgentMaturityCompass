import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { hostMembershipSchema, hostUserSchema, hostUserRoleSchema, hostWorkspaceSchema, type HostUserRole } from "./hostSchema.js";
import { hashHostPassword, verifyHostPassword } from "./hostAuth.js";
import { ensureHostDirLayout, hostDbPath } from "./workspacePaths.js";
import { normalizeWorkspaceId } from "./workspaceId.js";

export interface HostDbHandle {
  db: Database.Database;
  close: () => void;
}

function hostDbShaPath(hostDir: string): string {
  return join(hostDir, "host.db.sha256");
}

function updateHostDbDigest(hostDir: string): void {
  const digest = sha256Hex(readFileSync(hostDbPath(hostDir)));
  writeFileAtomic(hostDbShaPath(hostDir), `${digest}\n`, 0o644);
}

function migrate(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      username_lc TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_ts INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      is_host_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_host_admin IN (0, 1)),
      auth_type TEXT NOT NULL DEFAULT 'LOCAL',
      provider_id TEXT,
      subject TEXT,
      email TEXT,
      display_name TEXT,
      external_id TEXT,
      CHECK (auth_type IN ('LOCAL', 'OIDC', 'SAML', 'SCIM'))
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED'))
    );
    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      roles_json TEXT NOT NULL,
      created_ts INTEGER NOT NULL,
      PRIMARY KEY (user_id, workspace_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS host_audit (
      event_id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor_username TEXT,
      meta_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS host_sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      csrf_token TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      provider_id TEXT,
      issued_ts INTEGER NOT NULL,
      exp_ts INTEGER NOT NULL,
      last_seen_ts INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      CHECK (auth_type IN ('LOCAL', 'OIDC', 'SAML', 'SCIM')),
      CHECK (exp_ts >= issued_ts),
      CHECK (last_seen_ts >= issued_ts)
    );
    CREATE TABLE IF NOT EXISTS membership_sources (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      role TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      created_ts INTEGER NOT NULL,
      PRIMARY KEY (user_id, workspace_id, role, source_type, source_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      CHECK (role IN ('OWNER', 'OPERATOR', 'AUDITOR', 'VIEWER'))
    );
    CREATE TABLE IF NOT EXISTS scim_groups (
      group_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL UNIQUE,
      external_id TEXT,
      created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scim_group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_ts INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES scim_groups(group_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_username_lc ON users(username_lc);
    CREATE INDEX IF NOT EXISTS idx_users_provider_subject ON users(provider_id, subject);
    CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);
    CREATE INDEX IF NOT EXISTS idx_host_sessions_user ON host_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_host_sessions_exp_revoked ON host_sessions(revoked, exp_ts);
    CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
    CREATE INDEX IF NOT EXISTS idx_membership_sources_source ON membership_sources(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_scim_group_members_user ON scim_group_members(user_id);

    CREATE TRIGGER IF NOT EXISTS users_provider_subject_unique_insert
    BEFORE INSERT ON users
    WHEN NEW.provider_id IS NOT NULL
      AND NEW.subject IS NOT NULL
      AND EXISTS(
        SELECT 1 FROM users
        WHERE provider_id = NEW.provider_id
          AND subject = NEW.subject
      )
    BEGIN
      SELECT RAISE(ABORT, 'users provider_id + subject must be unique');
    END;

    CREATE TRIGGER IF NOT EXISTS users_provider_subject_unique_update
    BEFORE UPDATE ON users
    WHEN NEW.provider_id IS NOT NULL
      AND NEW.subject IS NOT NULL
      AND EXISTS(
        SELECT 1 FROM users
        WHERE provider_id = NEW.provider_id
          AND subject = NEW.subject
          AND user_id != NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'users provider_id + subject must be unique');
    END;

    CREATE TRIGGER IF NOT EXISTS users_external_id_unique_insert
    BEFORE INSERT ON users
    WHEN NEW.external_id IS NOT NULL
      AND EXISTS(
        SELECT 1 FROM users
        WHERE external_id = NEW.external_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'users external_id must be unique');
    END;

    CREATE TRIGGER IF NOT EXISTS users_external_id_unique_update
    BEFORE UPDATE ON users
    WHEN NEW.external_id IS NOT NULL
      AND EXISTS(
        SELECT 1 FROM users
        WHERE external_id = NEW.external_id
          AND user_id != NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'users external_id must be unique');
    END;

    CREATE TRIGGER IF NOT EXISTS host_audit_append_only_update
    BEFORE UPDATE ON host_audit
    BEGIN
      SELECT RAISE(ABORT, 'host_audit rows are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS host_audit_append_only_delete
    BEFORE DELETE ON host_audit
    BEGIN
      SELECT RAISE(ABORT, 'host_audit rows cannot be deleted');
    END;
  `);

  // Backward-compatible migrations for older host.db files.
  const userCols = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((row) => row.name)
  );
  if (!userCols.has("auth_type")) {
    db.exec("ALTER TABLE users ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'LOCAL';");
  }
  if (!userCols.has("provider_id")) {
    db.exec("ALTER TABLE users ADD COLUMN provider_id TEXT;");
  }
  if (!userCols.has("subject")) {
    db.exec("ALTER TABLE users ADD COLUMN subject TEXT;");
  }
  if (!userCols.has("email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT;");
  }
  if (!userCols.has("display_name")) {
    db.exec("ALTER TABLE users ADD COLUMN display_name TEXT;");
  }
  if (!userCols.has("external_id")) {
    db.exec("ALTER TABLE users ADD COLUMN external_id TEXT;");
  }
}

export function openHostDb(hostDir: string): HostDbHandle {
  ensureHostDirLayout(hostDir);
  const db = new Database(hostDbPath(hostDir));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return {
    db,
    close: () => {
      db.close();
      updateHostDbDigest(hostDir);
    }
  };
}

export function initHostDb(hostDir: string): void {
  const handle = openHostDb(hostDir);
  handle.close();
}

export function appendHostAudit(hostDir: string, eventType: string, actorUsername: string | null, meta: Record<string, unknown>): void {
  const handle = openHostDb(hostDir);
  try {
    handle.db
      .prepare(
        `INSERT INTO host_audit(event_id, ts, event_type, actor_username, meta_json)
         VALUES(@eventId, @ts, @eventType, @actorUsername, @metaJson)`
      )
      .run({
        eventId: `hostevt_${randomUUID().replace(/-/g, "")}`,
        ts: Date.now(),
        eventType,
        actorUsername,
        metaJson: JSON.stringify(meta)
      });
  } finally {
    handle.close();
  }
}

export function createHostUser(params: {
  hostDir: string;
  username: string;
  password: string;
  isHostAdmin?: boolean;
}): { userId: string; username: string; createdTs: number; disabled: boolean; isHostAdmin: boolean } {
  const username = params.username.trim();
  if (username.length === 0) {
    throw new Error("Username cannot be empty.");
  }
  const now = Date.now();
  const userId = randomUUID();
  const handle = openHostDb(params.hostDir);
  try {
    handle.db
      .prepare(
        `INSERT INTO users(user_id, username, username_lc, password_hash, created_ts, disabled, is_host_admin)
         VALUES(@userId, @username, @usernameLc, @passwordHash, @createdTs, 0, @isHostAdmin)`
      )
      .run({
        userId,
        username,
        usernameLc: username.toLowerCase(),
        passwordHash: hashHostPassword(params.password),
        createdTs: now,
        isHostAdmin: params.isHostAdmin ? 1 : 0
      });
    const parsed = hostUserSchema.parse({
      userId,
      username,
      createdTs: now,
      disabled: false,
      isHostAdmin: Boolean(params.isHostAdmin)
    });
    return parsed;
  } finally {
    handle.close();
  }
}

export type IdentityAuthType = "LOCAL" | "OIDC" | "SAML" | "SCIM";

export function upsertIdentityUser(params: {
  hostDir: string;
  username: string;
  email: string;
  displayName?: string | null;
  authType: IdentityAuthType;
  providerId?: string | null;
  subject?: string | null;
  externalId?: string | null;
  disabled?: boolean;
  isHostAdmin?: boolean;
}): { userId: string; username: string; email: string; isHostAdmin: boolean; disabled: boolean } {
  const username = params.username.trim().toLowerCase();
  if (!username) {
    throw new Error("username is required");
  }
  const email = params.email.trim().toLowerCase();
  if (!email) {
    throw new Error("email is required");
  }
  const now = Date.now();
  const handle = openHostDb(params.hostDir);
  try {
    const existing = handle.db
      .prepare(
        `SELECT user_id AS userId, username, disabled, is_host_admin AS isHostAdmin
         FROM users
         WHERE username_lc = ? OR (provider_id IS NOT NULL AND provider_id = ? AND subject IS NOT NULL AND subject = ?)
         LIMIT 1`
      )
      .get(username, params.providerId ?? "", params.subject ?? "") as
      | { userId: string; username: string; disabled: number; isHostAdmin: number }
      | undefined;
    if (existing) {
      handle.db
        .prepare(
          `UPDATE users
           SET username = ?,
               username_lc = ?,
               email = ?,
               display_name = ?,
               auth_type = ?,
               provider_id = ?,
               subject = ?,
               external_id = ?,
               disabled = ?,
               is_host_admin = ?,
               password_hash = CASE
                 WHEN password_hash IS NULL OR password_hash = '' THEN ?
                 ELSE password_hash
               END
           WHERE user_id = ?`
        )
        .run(
          params.username.trim(),
          username,
          email,
          params.displayName ?? null,
          params.authType,
          params.providerId ?? null,
          params.subject ?? null,
          params.externalId ?? null,
          params.disabled ? 1 : 0,
          params.isHostAdmin ? 1 : existing.isHostAdmin,
          hashHostPassword(randomUUID()),
          existing.userId
        );
      return {
        userId: existing.userId,
        username: params.username.trim(),
        email,
        isHostAdmin: params.isHostAdmin ? true : existing.isHostAdmin === 1,
        disabled: Boolean(params.disabled)
      };
    }
    const userId = randomUUID();
    handle.db
      .prepare(
        `INSERT INTO users(
          user_id, username, username_lc, password_hash, created_ts, disabled, is_host_admin,
          auth_type, provider_id, subject, email, display_name, external_id
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        params.username.trim(),
        username,
        hashHostPassword(randomUUID()),
        now,
        params.disabled ? 1 : 0,
        params.isHostAdmin ? 1 : 0,
        params.authType,
        params.providerId ?? null,
        params.subject ?? null,
        email,
        params.displayName ?? null,
        params.externalId ?? null
      );
    return {
      userId,
      username: params.username.trim(),
      email,
      isHostAdmin: Boolean(params.isHostAdmin),
      disabled: Boolean(params.disabled)
    };
  } finally {
    handle.close();
  }
}

export function findHostUserById(hostDir: string, userId: string): {
  userId: string;
  username: string;
  email: string | null;
  disabled: boolean;
  isHostAdmin: boolean;
} | null {
  const handle = openHostDb(hostDir);
  try {
    const row = handle.db
      .prepare(
        `SELECT user_id AS userId, username, email, disabled, is_host_admin AS isHostAdmin
         FROM users WHERE user_id = ?`
      )
      .get(userId) as
      | {
          userId: string;
          username: string;
          email: string | null;
          disabled: number;
          isHostAdmin: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      userId: row.userId,
      username: row.username,
      email: row.email,
      disabled: row.disabled === 1,
      isHostAdmin: row.isHostAdmin === 1
    };
  } finally {
    handle.close();
  }
}

export function authenticateHostUser(params: {
  hostDir: string;
  username: string;
  password: string;
}): { ok: boolean; user?: { userId: string; username: string; isHostAdmin: boolean; disabled: boolean }; error?: string } {
  const handle = openHostDb(params.hostDir);
  try {
    const row = handle.db
      .prepare(
        `SELECT user_id AS userId, username, password_hash AS passwordHash, disabled, is_host_admin AS isHostAdmin
         FROM users WHERE username_lc = ?`
      )
      .get(params.username.trim().toLowerCase()) as
      | { userId: string; username: string; passwordHash: string; disabled: number; isHostAdmin: number }
      | undefined;
    if (!row) {
      return { ok: false, error: "invalid credentials" };
    }
    if (row.disabled === 1) {
      return { ok: false, error: "user disabled" };
    }
    if (!verifyHostPassword(params.password, row.passwordHash)) {
      return { ok: false, error: "invalid credentials" };
    }
    return {
      ok: true,
      user: {
        userId: row.userId,
        username: row.username,
        isHostAdmin: row.isHostAdmin === 1,
        disabled: row.disabled === 1
      }
    };
  } finally {
    handle.close();
  }
}

export function listHostUsers(hostDir: string): Array<{ userId: string; username: string; createdTs: number; disabled: boolean; isHostAdmin: boolean }> {
  const handle = openHostDb(hostDir);
  try {
    const rows = handle.db
      .prepare(`SELECT user_id AS userId, username, created_ts AS createdTs, disabled, is_host_admin AS isHostAdmin FROM users ORDER BY username_lc`)
      .all() as Array<{ userId: string; username: string; createdTs: number; disabled: number; isHostAdmin: number }>;
    return rows.map((row) =>
      hostUserSchema.parse({
        userId: row.userId,
        username: row.username,
        createdTs: row.createdTs,
        disabled: row.disabled === 1,
        isHostAdmin: row.isHostAdmin === 1
      })
    );
  } finally {
    handle.close();
  }
}

export function disableHostUser(hostDir: string, username: string): void {
  const handle = openHostDb(hostDir);
  try {
    handle.db
      .prepare(`UPDATE users SET disabled = 1 WHERE username_lc = ?`)
      .run(username.trim().toLowerCase());
  } finally {
    handle.close();
  }
}

export function createWorkspaceRecord(params: {
  hostDir: string;
  workspaceId: string;
  name: string;
}): { workspaceId: string; name: string; createdTs: number; updatedTs: number; status: "ACTIVE" | "SUSPENDED" | "DELETED" } {
  const workspaceId = normalizeWorkspaceId(params.workspaceId);
  const now = Date.now();
  const handle = openHostDb(params.hostDir);
  try {
    handle.db
      .prepare(
        `INSERT INTO workspaces(workspace_id, name, created_ts, updated_ts, status)
         VALUES(@workspaceId, @name, @createdTs, @updatedTs, 'ACTIVE')`
      )
      .run({
        workspaceId,
        name: params.name.trim().length > 0 ? params.name.trim() : workspaceId,
        createdTs: now,
        updatedTs: now
      });
    return hostWorkspaceSchema.parse({
      workspaceId,
      name: params.name.trim().length > 0 ? params.name.trim() : workspaceId,
      createdTs: now,
      updatedTs: now,
      status: "ACTIVE"
    });
  } finally {
    handle.close();
  }
}

export function setWorkspaceStatus(hostDir: string, workspaceId: string, status: "ACTIVE" | "SUSPENDED" | "DELETED"): void {
  const normalized = normalizeWorkspaceId(workspaceId);
  const handle = openHostDb(hostDir);
  try {
    handle.db.prepare(`UPDATE workspaces SET status = ?, updated_ts = ? WHERE workspace_id = ?`).run(status, Date.now(), normalized);
  } finally {
    handle.close();
  }
}

export function listWorkspaceRecords(hostDir: string): Array<{
  workspaceId: string;
  name: string;
  createdTs: number;
  updatedTs: number;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
}> {
  const handle = openHostDb(hostDir);
  try {
    const rows = handle.db
      .prepare(
        `SELECT workspace_id AS workspaceId, name, created_ts AS createdTs, updated_ts AS updatedTs, status
         FROM workspaces ORDER BY workspace_id`
      )
      .all() as Array<{
      workspaceId: string;
      name: string;
      createdTs: number;
      updatedTs: number;
      status: "ACTIVE" | "SUSPENDED" | "DELETED";
    }>;
    return rows.map((row) => hostWorkspaceSchema.parse(row));
  } finally {
    handle.close();
  }
}

export function getWorkspaceRecord(hostDir: string, workspaceId: string): {
  workspaceId: string;
  name: string;
  createdTs: number;
  updatedTs: number;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
} | null {
  const normalized = normalizeWorkspaceId(workspaceId);
  const handle = openHostDb(hostDir);
  try {
    const row = handle.db
      .prepare(
        `SELECT workspace_id AS workspaceId, name, created_ts AS createdTs, updated_ts AS updatedTs, status
         FROM workspaces WHERE workspace_id = ?`
      )
      .get(normalized) as
      | {
          workspaceId: string;
          name: string;
          createdTs: number;
          updatedTs: number;
          status: "ACTIVE" | "SUSPENDED" | "DELETED";
        }
      | undefined;
    return row ? hostWorkspaceSchema.parse(row) : null;
  } finally {
    handle.close();
  }
}

export function grantMembership(params: {
  hostDir: string;
  username: string;
  workspaceId: string;
  role: HostUserRole;
}): void {
  const role = hostUserRoleSchema.parse(params.role);
  const workspaceId = normalizeWorkspaceId(params.workspaceId);
  const handle = openHostDb(params.hostDir);
  try {
    const user = handle.db
      .prepare(`SELECT user_id AS userId FROM users WHERE username_lc = ?`)
      .get(params.username.trim().toLowerCase()) as { userId: string } | undefined;
    if (!user) {
      throw new Error(`Unknown user: ${params.username}`);
    }
    const existing = handle.db
      .prepare(`SELECT roles_json AS rolesJson FROM memberships WHERE user_id = ? AND workspace_id = ?`)
      .get(user.userId, workspaceId) as { rolesJson: string } | undefined;
    const roles = new Set<string>();
    if (existing) {
      try {
        const parsed = JSON.parse(existing.rolesJson) as unknown;
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (typeof value === "string") {
              roles.add(value);
            }
          }
        }
      } catch {
        // ignore malformed legacy row and rewrite
      }
    }
    roles.add(role);
    const rolesJson = JSON.stringify(Array.from(roles).sort());
    if (existing) {
      handle.db
        .prepare(`UPDATE memberships SET roles_json = ?, created_ts = ? WHERE user_id = ? AND workspace_id = ?`)
        .run(rolesJson, Date.now(), user.userId, workspaceId);
    } else {
      handle.db
        .prepare(`INSERT INTO memberships(user_id, workspace_id, roles_json, created_ts) VALUES(?, ?, ?, ?)`)
        .run(user.userId, workspaceId, rolesJson, Date.now());
    }
  } finally {
    handle.close();
  }
}

export function revokeMembershipRole(params: {
  hostDir: string;
  username: string;
  workspaceId: string;
  role: HostUserRole;
}): void {
  const role = hostUserRoleSchema.parse(params.role);
  const workspaceId = normalizeWorkspaceId(params.workspaceId);
  const handle = openHostDb(params.hostDir);
  try {
    const user = handle.db
      .prepare(`SELECT user_id AS userId FROM users WHERE username_lc = ?`)
      .get(params.username.trim().toLowerCase()) as { userId: string } | undefined;
    if (!user) {
      throw new Error(`Unknown user: ${params.username}`);
    }
    const existing = handle.db
      .prepare(`SELECT roles_json AS rolesJson FROM memberships WHERE user_id = ? AND workspace_id = ?`)
      .get(user.userId, workspaceId) as { rolesJson: string } | undefined;
    if (!existing) {
      return;
    }
    const roles = new Set<string>();
    try {
      const parsed = JSON.parse(existing.rolesJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const value of parsed) {
          if (typeof value === "string") {
            roles.add(value);
          }
        }
      }
    } catch {
      // malformed row; remove membership
    }
    roles.delete(role);
    if (roles.size === 0) {
      handle.db.prepare(`DELETE FROM memberships WHERE user_id = ? AND workspace_id = ?`).run(user.userId, workspaceId);
      return;
    }
    handle.db
      .prepare(`UPDATE memberships SET roles_json = ?, created_ts = ? WHERE user_id = ? AND workspace_id = ?`)
      .run(JSON.stringify(Array.from(roles).sort()), Date.now(), user.userId, workspaceId);
  } finally {
    handle.close();
  }
}

export function workspaceRolesForUser(params: {
  hostDir: string;
  username: string;
  workspaceId: string;
}): HostUserRole[] {
  const workspaceId = normalizeWorkspaceId(params.workspaceId);
  const handle = openHostDb(params.hostDir);
  try {
    const row = handle.db
      .prepare(
        `SELECT m.roles_json AS rolesJson
         FROM memberships m
         INNER JOIN users u ON u.user_id = m.user_id
         WHERE u.username_lc = ? AND m.workspace_id = ? AND u.disabled = 0`
      )
      .get(params.username.trim().toLowerCase(), workspaceId) as { rolesJson: string } | undefined;
    if (!row) {
      return [];
    }
    try {
      const parsed = JSON.parse(row.rolesJson) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      const roles = parsed
        .filter((value): value is string => typeof value === "string")
        .map((value) => hostUserRoleSchema.parse(value));
      return Array.from(new Set(roles));
    } catch {
      return [];
    }
  } finally {
    handle.close();
  }
}

export function listWorkspaceMemberships(hostDir: string, workspaceId: string): Array<{ username: string; roles: HostUserRole[] }> {
  const normalized = normalizeWorkspaceId(workspaceId);
  const handle = openHostDb(hostDir);
  try {
    const rows = handle.db
      .prepare(
        `SELECT u.username AS username, m.roles_json AS rolesJson
         FROM memberships m
         INNER JOIN users u ON u.user_id = m.user_id
         WHERE m.workspace_id = ? AND u.disabled = 0
         ORDER BY u.username_lc`
      )
      .all(normalized) as Array<{ username: string; rolesJson: string }>;
    return rows.map((row) => {
      const roles: HostUserRole[] = [];
      try {
        const parsed = JSON.parse(row.rolesJson) as unknown;
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (typeof value === "string") {
              roles.push(hostUserRoleSchema.parse(value));
            }
          }
        }
      } catch {
        // noop
      }
      return {
        username: row.username,
        roles: Array.from(new Set(roles)).sort()
      };
    });
  } finally {
    handle.close();
  }
}

export function listAccessibleWorkspaces(hostDir: string, username: string): Array<{
  workspaceId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  roles: HostUserRole[];
}> {
  const handle = openHostDb(hostDir);
  try {
    const user = handle.db
      .prepare(`SELECT user_id AS userId, is_host_admin AS isHostAdmin, disabled FROM users WHERE username_lc = ?`)
      .get(username.trim().toLowerCase()) as { userId: string; isHostAdmin: number; disabled: number } | undefined;
    if (!user || user.disabled === 1) {
      return [];
    }
    if (user.isHostAdmin === 1) {
      const workspaces = listWorkspaceRecords(hostDir);
      return workspaces.map((row) => ({
        workspaceId: row.workspaceId,
        name: row.name,
        status: row.status,
        roles: ["OWNER", "OPERATOR", "AUDITOR", "VIEWER"]
      }));
    }
    const rows = handle.db
      .prepare(
        `SELECT w.workspace_id AS workspaceId, w.name AS name, w.status AS status, m.roles_json AS rolesJson
         FROM memberships m
         INNER JOIN workspaces w ON w.workspace_id = m.workspace_id
         WHERE m.user_id = ?
         ORDER BY w.workspace_id`
      )
      .all(user.userId) as Array<{
      workspaceId: string;
      name: string;
      status: "ACTIVE" | "SUSPENDED" | "DELETED";
      rolesJson: string;
    }>;
    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      name: row.name,
      status: row.status,
      roles: (() => {
        try {
          const parsed = JSON.parse(row.rolesJson) as unknown;
          if (!Array.isArray(parsed)) {
            return [];
          }
          const out = parsed
            .filter((value): value is string => typeof value === "string")
            .map((value) => hostUserRoleSchema.parse(value));
          return Array.from(new Set(out));
        } catch {
          return [];
        }
      })()
    }));
  } finally {
    handle.close();
  }
}

export function rolesForUserIdInWorkspace(params: {
  hostDir: string;
  userId: string;
  workspaceId: string;
}): HostUserRole[] {
  const workspaceId = normalizeWorkspaceId(params.workspaceId);
  const handle = openHostDb(params.hostDir);
  try {
    const row = handle.db
      .prepare(`SELECT roles_json AS rolesJson FROM memberships WHERE user_id = ? AND workspace_id = ?`)
      .get(params.userId, workspaceId) as { rolesJson: string } | undefined;
    if (!row) {
      return [];
    }
    try {
      const parsed = JSON.parse(row.rolesJson) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return Array.from(
        new Set(parsed.filter((value): value is string => typeof value === "string").map((value) => hostUserRoleSchema.parse(value)))
      );
    } catch {
      return [];
    }
  } finally {
    handle.close();
  }
}

export function createHostSessionRow(params: {
  hostDir: string;
  sessionId: string;
  userId: string;
  csrfToken: string;
  authType: IdentityAuthType;
  providerId?: string | null;
  issuedTs: number;
  expTs: number;
}): void {
  const handle = openHostDb(params.hostDir);
  try {
    handle.db
      .prepare(
        `INSERT INTO host_sessions(
          session_id, user_id, csrf_token, auth_type, provider_id, issued_ts, exp_ts, last_seen_ts, revoked
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        params.sessionId,
        params.userId,
        params.csrfToken,
        params.authType,
        params.providerId ?? null,
        params.issuedTs,
        params.expTs,
        params.issuedTs
      );
  } finally {
    handle.close();
  }
}

export function getHostSessionRow(hostDir: string, sessionId: string): {
  sessionId: string;
  userId: string;
  csrfToken: string;
  authType: IdentityAuthType;
  providerId: string | null;
  issuedTs: number;
  expTs: number;
  lastSeenTs: number;
  revoked: boolean;
} | null {
  const handle = openHostDb(hostDir);
  try {
    const row = handle.db
      .prepare(
        `SELECT
           session_id AS sessionId,
           user_id AS userId,
           csrf_token AS csrfToken,
           auth_type AS authType,
           provider_id AS providerId,
           issued_ts AS issuedTs,
           exp_ts AS expTs,
           last_seen_ts AS lastSeenTs,
           revoked
         FROM host_sessions
         WHERE session_id = ?`
      )
      .get(sessionId) as
      | {
          sessionId: string;
          userId: string;
          csrfToken: string;
          authType: IdentityAuthType;
          providerId: string | null;
          issuedTs: number;
          expTs: number;
          lastSeenTs: number;
          revoked: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      ...row,
      revoked: row.revoked === 1
    };
  } finally {
    handle.close();
  }
}

export function touchHostSession(hostDir: string, sessionId: string): void {
  const handle = openHostDb(hostDir);
  try {
    handle.db.prepare(`UPDATE host_sessions SET last_seen_ts = ? WHERE session_id = ?`).run(Date.now(), sessionId);
  } finally {
    handle.close();
  }
}

export function revokeHostSessionRow(hostDir: string, sessionId: string): void {
  const handle = openHostDb(hostDir);
  try {
    handle.db.prepare(`UPDATE host_sessions SET revoked = 1 WHERE session_id = ?`).run(sessionId);
  } finally {
    handle.close();
  }
}

export function applyMembershipRolesFromSource(params: {
  hostDir: string;
  userId: string;
  workspaceId: string;
  roles: HostUserRole[];
  sourceType: "SCIM_GROUP" | "SSO_GROUP" | "MANUAL";
  sourceId: string;
}): void {
  const workspaceId = normalizeWorkspaceId(params.workspaceId);
  const roleSet = new Set(params.roles.map((role) => hostUserRoleSchema.parse(role)));
  const handle = openHostDb(params.hostDir);
  try {
    const existing = handle.db
      .prepare(`SELECT roles_json AS rolesJson FROM memberships WHERE user_id = ? AND workspace_id = ?`)
      .get(params.userId, workspaceId) as { rolesJson: string } | undefined;
    const merged = new Set<HostUserRole>();
    if (existing) {
      try {
        const parsed = JSON.parse(existing.rolesJson) as unknown;
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (typeof value === "string") {
              merged.add(hostUserRoleSchema.parse(value));
            }
          }
        }
      } catch {
        // ignore
      }
    }
    for (const role of roleSet) {
      merged.add(role);
    }
    const rolesJson = JSON.stringify(Array.from(merged).sort());
    if (existing) {
      handle.db
        .prepare(`UPDATE memberships SET roles_json = ?, created_ts = ? WHERE user_id = ? AND workspace_id = ?`)
        .run(rolesJson, Date.now(), params.userId, workspaceId);
    } else {
      handle.db
        .prepare(`INSERT INTO memberships(user_id, workspace_id, roles_json, created_ts) VALUES(?, ?, ?, ?)`)
        .run(params.userId, workspaceId, rolesJson, Date.now());
    }
    const now = Date.now();
    const sourceStmt = handle.db.prepare(
      `INSERT OR IGNORE INTO membership_sources(user_id, workspace_id, role, source_type, source_id, created_ts)
       VALUES(?, ?, ?, ?, ?, ?)`
    );
    for (const role of roleSet) {
      sourceStmt.run(params.userId, workspaceId, role, params.sourceType, params.sourceId, now);
    }
  } finally {
    handle.close();
  }
}

export function revokeMembershipRolesFromSource(params: {
  hostDir: string;
  userId: string;
  sourceType: "SCIM_GROUP" | "SSO_GROUP" | "MANUAL";
  sourceId: string;
}): void {
  const handle = openHostDb(params.hostDir);
  try {
    const rows = handle.db
      .prepare(
        `SELECT user_id AS userId, workspace_id AS workspaceId, role
         FROM membership_sources
         WHERE user_id = ? AND source_type = ? AND source_id = ?`
      )
      .all(params.userId, params.sourceType, params.sourceId) as Array<{
      userId: string;
      workspaceId: string;
      role: HostUserRole;
    }>;
    handle.db
      .prepare(`DELETE FROM membership_sources WHERE user_id = ? AND source_type = ? AND source_id = ?`)
      .run(params.userId, params.sourceType, params.sourceId);

    for (const row of rows) {
      const stillBacked = handle.db
        .prepare(
          `SELECT 1
           FROM membership_sources
           WHERE user_id = ? AND workspace_id = ? AND role = ?
           LIMIT 1`
        )
        .get(row.userId, row.workspaceId, row.role);
      if (stillBacked) {
        continue;
      }
      const current = handle.db
        .prepare(`SELECT roles_json AS rolesJson FROM memberships WHERE user_id = ? AND workspace_id = ?`)
        .get(row.userId, row.workspaceId) as { rolesJson: string } | undefined;
      if (!current) {
        continue;
      }
      const set = new Set<HostUserRole>();
      try {
        const parsed = JSON.parse(current.rolesJson) as unknown;
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (typeof value === "string") {
              set.add(hostUserRoleSchema.parse(value));
            }
          }
        }
      } catch {
        // ignore
      }
      set.delete(row.role);
      if (set.size === 0) {
        handle.db.prepare(`DELETE FROM memberships WHERE user_id = ? AND workspace_id = ?`).run(row.userId, row.workspaceId);
      } else {
        handle.db
          .prepare(`UPDATE memberships SET roles_json = ?, created_ts = ? WHERE user_id = ? AND workspace_id = ?`)
          .run(JSON.stringify(Array.from(set).sort()), Date.now(), row.userId, row.workspaceId);
      }
    }
  } finally {
    handle.close();
  }
}

export function upsertScimGroup(params: {
  hostDir: string;
  groupId?: string;
  displayName: string;
  externalId?: string | null;
}): { groupId: string; displayName: string; externalId: string | null } {
  const displayName = params.displayName.trim();
  if (!displayName) {
    throw new Error("displayName is required");
  }
  const groupId = params.groupId?.trim() || randomUUID();
  const now = Date.now();
  const handle = openHostDb(params.hostDir);
  try {
    const existing = handle.db
      .prepare(`SELECT group_id AS groupId FROM scim_groups WHERE group_id = ?`)
      .get(groupId) as { groupId: string } | undefined;
    if (existing) {
      handle.db
        .prepare(`UPDATE scim_groups SET display_name = ?, external_id = ?, updated_ts = ? WHERE group_id = ?`)
        .run(displayName, params.externalId ?? null, now, groupId);
    } else {
      handle.db
        .prepare(`INSERT INTO scim_groups(group_id, display_name, external_id, created_ts, updated_ts) VALUES(?, ?, ?, ?, ?)`)
        .run(groupId, displayName, params.externalId ?? null, now, now);
    }
    return { groupId, displayName, externalId: params.externalId ?? null };
  } finally {
    handle.close();
  }
}

export function listScimGroups(hostDir: string): Array<{ groupId: string; displayName: string; externalId: string | null }> {
  const handle = openHostDb(hostDir);
  try {
    return handle.db
      .prepare(`SELECT group_id AS groupId, display_name AS displayName, external_id AS externalId FROM scim_groups ORDER BY display_name`)
      .all() as Array<{ groupId: string; displayName: string; externalId: string | null }>;
  } finally {
    handle.close();
  }
}

export function replaceScimGroupMembers(params: { hostDir: string; groupId: string; userIds: string[] }): void {
  const handle = openHostDb(params.hostDir);
  try {
    handle.db.prepare(`DELETE FROM scim_group_members WHERE group_id = ?`).run(params.groupId);
    const stmt = handle.db.prepare(`INSERT INTO scim_group_members(group_id, user_id, created_ts) VALUES(?, ?, ?)`);
    const now = Date.now();
    for (const userId of params.userIds) {
      stmt.run(params.groupId, userId, now);
    }
    handle.db.prepare(`UPDATE scim_groups SET updated_ts = ? WHERE group_id = ?`).run(now, params.groupId);
  } finally {
    handle.close();
  }
}

export function listScimGroupMembers(hostDir: string, groupId: string): string[] {
  const handle = openHostDb(hostDir);
  try {
    const rows = handle.db
      .prepare(`SELECT user_id AS userId FROM scim_group_members WHERE group_id = ? ORDER BY user_id`)
      .all(groupId) as Array<{ userId: string }>;
    return rows.map((row) => row.userId);
  } finally {
    handle.close();
  }
}

export function deleteScimGroup(hostDir: string, groupId: string): void {
  const handle = openHostDb(hostDir);
  try {
    handle.db.prepare(`DELETE FROM scim_group_members WHERE group_id = ?`).run(groupId);
    handle.db.prepare(`DELETE FROM scim_groups WHERE group_id = ?`).run(groupId);
  } finally {
    handle.close();
  }
}

export function findHostUserByUsernameOrExternalId(params: {
  hostDir: string;
  username?: string;
  externalId?: string;
}): { userId: string; username: string } | null {
  const handle = openHostDb(params.hostDir);
  try {
    if (params.username) {
      const byName = handle.db
        .prepare(`SELECT user_id AS userId, username FROM users WHERE username_lc = ? LIMIT 1`)
        .get(params.username.trim().toLowerCase()) as { userId: string; username: string } | undefined;
      if (byName) {
        return byName;
      }
    }
    if (params.externalId) {
      const byExternal = handle.db
        .prepare(`SELECT user_id AS userId, username FROM users WHERE external_id = ? LIMIT 1`)
        .get(params.externalId) as { userId: string; username: string } | undefined;
      if (byExternal) {
        return byExternal;
      }
    }
    return null;
  } finally {
    handle.close();
  }
}

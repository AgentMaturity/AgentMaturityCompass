import { randomUUID } from "node:crypto";
import {
  appendHostAudit,
  disableHostUser,
  findHostUserById,
  findHostUserByUsernameOrExternalId,
  openHostDb,
  upsertIdentityUser
} from "../../workspaces/hostDb.js";
import { scimListResponse } from "./scimTypes.js";

interface ScimUserRecord {
  id: string;
  userName: string;
  active: boolean;
  externalId?: string | null;
  displayName?: string | null;
  emails: Array<{ value: string; primary: boolean }>;
}

function parseActive(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const active = value.toLowerCase();
    if (active === "true" || active === "false") {
      return active === "true";
    }
  }
  throw new Error("invalidValue");
}

/**
 * Core and enterprise User attributes AMC receives but does not store through PATCH (docs/SCIM.md). An operation on one
 * is accepted as a no-op, so it cannot reject a deprovisioning change in the same request; any other unknown attribute
 * is still invalidPath. Lower-case names; sub-attributes (`name.familyName`) and filters (`emails[type eq "work"]`) match
 * their parent.
 */
const IGNORED_USER_ATTRIBUTES = new Set(["externalid", "emails", "name", "title", "preferredlanguage", "phonenumbers", "addresses"]);
const ENTERPRISE_USER_URN = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:user";

function ignoredUserAttribute(path: string): boolean {
  if (path === ENTERPRISE_USER_URN || path.startsWith(`${ENTERPRISE_USER_URN}:`)) return true;
  return IGNORED_USER_ATTRIBUTES.has(path.split(/[.[]/, 1)[0] ?? "");
}

function toScimUser(row: {
  userId: string;
  username: string;
  disabled: number;
  email: string | null;
  externalId: string | null;
  displayName: string | null;
}): ScimUserRecord {
  return {
    id: row.userId,
    userName: row.username,
    active: row.disabled !== 1,
    externalId: row.externalId ?? undefined,
    displayName: row.displayName ?? undefined,
    emails: row.email
      ? [
          {
            value: row.email,
            primary: true
          }
        ]
      : []
  };
}

export function scimListUsers(params: {
  hostDir: string;
  startIndex: number;
  count: number;
  filter?: string | null;
}) {
  const start = Math.max(1, params.startIndex || 1);
  const limit = Math.max(1, Math.min(200, params.count || 100));
  let where = "";
  const args: unknown[] = [];
  if (params.filter && params.filter.trim().length > 0) {
    const filter = params.filter.trim();
    const userNameEq = /^userName\s+eq\s+"([^"]+)"$/i.exec(filter);
    const externalEq = /^externalId\s+eq\s+"([^"]+)"$/i.exec(filter);
    if (userNameEq) {
      where = "WHERE username_lc = ?";
      args.push(userNameEq[1]!.toLowerCase());
    } else if (externalEq) {
      where = "WHERE external_id = ?";
      args.push(externalEq[1]!);
    } else {
      throw new Error("invalidFilter");
    }
  }
  const handle = openHostDb(params.hostDir);
  try {
    const total = handle.db
      .prepare(`SELECT COUNT(*) AS n FROM users ${where}`)
      .get(...args) as { n: number };
    const rows = handle.db
      .prepare(
        `SELECT user_id AS userId, username, disabled, email, external_id AS externalId, display_name AS displayName
         FROM users
         ${where}
         ORDER BY username_lc
         LIMIT ? OFFSET ?`
      )
      .all(...args, limit, start - 1) as Array<{
      userId: string;
      username: string;
      disabled: number;
      email: string | null;
      externalId: string | null;
      displayName: string | null;
    }>;
    const resources = rows.map(toScimUser);
    return scimListResponse(resources, start, total.n);
  } finally {
    handle.close();
  }
}

export function scimGetUser(hostDir: string, userId: string): ScimUserRecord | null {
  const handle = openHostDb(hostDir);
  try {
    const row = handle.db
      .prepare(
        `SELECT user_id AS userId, username, disabled, email, external_id AS externalId, display_name AS displayName
         FROM users WHERE user_id = ?`
      )
      .get(userId) as
      | {
          userId: string;
          username: string;
          disabled: number;
          email: string | null;
          externalId: string | null;
          displayName: string | null;
        }
      | undefined;
    return row ? toScimUser(row) : null;
  } finally {
    handle.close();
  }
}

export function scimCreateUser(params: {
  hostDir: string;
  body: Record<string, unknown>;
  actorTokenId: string;
}): ScimUserRecord {
  const userName = typeof params.body.userName === "string" ? params.body.userName.trim() : "";
  if (!userName) {
    throw new Error("SCIM userName is required");
  }
  const externalId = typeof params.body.externalId === "string" ? params.body.externalId : null;
  const displayName = typeof params.body.displayName === "string" ? params.body.displayName : null;
  const emails = Array.isArray(params.body.emails) ? params.body.emails : [];
  const emailFromArray = emails
    .map((item) => (item && typeof item === "object" && typeof (item as { value?: unknown }).value === "string" ? String((item as { value: string }).value) : ""))
    .find((value) => value.length > 0);
  const email = typeof emailFromArray === "string" && emailFromArray.length > 0 ? emailFromArray : userName;
  const active = typeof params.body.active === "boolean" ? params.body.active : true;
  const created = upsertIdentityUser({
    hostDir: params.hostDir,
    username: userName,
    email,
    displayName,
    authType: "SCIM",
    externalId,
    disabled: !active
  });
  appendHostAudit(params.hostDir, "SCIM_USER_CREATED", null, {
    actorTokenId: params.actorTokenId,
    userId: created.userId
  });
  const out = scimGetUser(params.hostDir, created.userId);
  if (!out) {
    throw new Error("SCIM create failed");
  }
  return out;
}

export function scimReplaceUser(params: {
  hostDir: string;
  userId: string;
  body: Record<string, unknown>;
  actorTokenId: string;
}): ScimUserRecord {
  const current = findHostUserById(params.hostDir, params.userId);
  if (!current) {
    throw new Error("SCIM user not found");
  }
  const userName = typeof params.body.userName === "string" ? params.body.userName.trim() : current.username;
  const externalId = typeof params.body.externalId === "string" ? params.body.externalId : null;
  const displayName = typeof params.body.displayName === "string" ? params.body.displayName : null;
  const emails = Array.isArray(params.body.emails) ? params.body.emails : [];
  const emailFromArray = emails
    .map((item) => (item && typeof item === "object" && typeof (item as { value?: unknown }).value === "string" ? String((item as { value: string }).value) : ""))
    .find((value) => value.length > 0);
  const email = typeof emailFromArray === "string" && emailFromArray.length > 0 ? emailFromArray : current.email ?? userName;
  const active = typeof params.body.active === "boolean" ? params.body.active : !current.disabled;
  upsertIdentityUser({
    hostDir: params.hostDir,
    username: userName,
    email,
    displayName,
    authType: "SCIM",
    externalId,
    disabled: !active
  });
  appendHostAudit(params.hostDir, "SCIM_USER_UPDATED", null, {
    actorTokenId: params.actorTokenId,
    userId: params.userId
  });
  const resolved = findHostUserByUsernameOrExternalId({
    hostDir: params.hostDir,
    username: userName,
    externalId: externalId ?? undefined
  });
  if (!resolved) {
    throw new Error("SCIM update failed");
  }
  const out = scimGetUser(params.hostDir, resolved.userId);
  if (!out) {
    throw new Error("SCIM update failed");
  }
  return out;
}

export function scimDisableUser(params: {
  hostDir: string;
  userId: string;
  actorTokenId: string;
}): void {
  const user = findHostUserById(params.hostDir, params.userId);
  if (!user) {
    return;
  }
  disableHostUser(params.hostDir, user.username);
  appendHostAudit(params.hostDir, "SCIM_USER_DISABLED", null, {
    actorTokenId: params.actorTokenId,
    userId: params.userId
  });
}

export function scimPatchUser(params: {
  hostDir: string;
  userId: string;
  operations: Array<{ op: "add" | "remove" | "replace"; path?: string; value?: unknown }>;
  actorTokenId: string;
}): ScimUserRecord {
  if (!Array.isArray(params.operations) || params.operations.length === 0) {
    throw new Error("invalidValue");
  }
  let nextActive: boolean | undefined;
  let nextDisplayName: string | null | undefined;
  // Validate every received operation before opening the host database.
  for (const op of params.operations) {
    if (!op || typeof op !== "object" || Array.isArray(op) || !["add", "remove", "replace"].includes(op.op)) {
      throw new Error("invalidValue");
    }
    if (op.path !== undefined && typeof op.path !== "string") {
      throw new Error("invalidPath");
    }
    const path = (op.path ?? "").toLowerCase();
    if (path !== "" && ignoredUserAttribute(path)) {
      continue;
    }
    if (path !== "active" && path !== "displayname" && path !== "") {
      throw new Error("invalidPath");
    }
    if (op.op === "remove") {
      if (op.value !== undefined) {
        throw new Error("invalidValue");
      }
      if (path === "displayname") {
        nextDisplayName = null;
      } else {
        nextActive = false;
      }
    } else if (path === "displayname") {
      if (typeof op.value !== "string") {
        throw new Error("invalidValue");
      }
      nextDisplayName = op.value;
    } else if (path === "" && op.value && typeof op.value === "object" && !Array.isArray(op.value)) {
      const attributes = Object.entries(op.value);
      if (attributes.length === 0) {
        throw new Error("invalidValue");
      }
      for (const [attribute, value] of attributes) {
        const field = attribute.toLowerCase();
        if (field === "active") {
          nextActive = parseActive(value);
        } else if (field === "displayname") {
          if (typeof value !== "string") {
            throw new Error("invalidValue");
          }
          nextDisplayName = value;
        } else if (!ignoredUserAttribute(field)) {
          throw new Error("invalidPath");
        }
      }
    } else {
      nextActive = parseActive(op.value);
    }
  }
  const current = scimGetUser(params.hostDir, params.userId);
  if (!current) {
    throw new Error("SCIM user not found");
  }
  const user = findHostUserById(params.hostDir, params.userId);
  if (!user) {
    throw new Error("SCIM user not found");
  }
  upsertIdentityUser({
    hostDir: params.hostDir,
    username: user.username,
    email: user.email ?? user.username,
    displayName: nextDisplayName === undefined ? current.displayName ?? null : nextDisplayName,
    authType: "SCIM",
    disabled: !(nextActive ?? current.active)
  });
  appendHostAudit(params.hostDir, "SCIM_USER_UPDATED", null, {
    actorTokenId: params.actorTokenId,
    userId: params.userId,
    patch: true
  });
  const refreshed = scimGetUser(params.hostDir, params.userId);
  if (!refreshed) {
    throw new Error("SCIM patch failed");
  }
  return refreshed;
}

export function newScimId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

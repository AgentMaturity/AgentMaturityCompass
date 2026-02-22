import { randomUUID } from "node:crypto";
import { resolveSsoRole, type EnterpriseRole, type SsoRoleMapping } from "../auth/ssoConfig.js";

export interface ScimRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ScimResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface ScimProvisionedUser {
  id: string;
  userName: string;
  externalId: string | null;
  displayName: string | null;
  active: boolean;
  emails: Array<{ value: string; primary: boolean }>;
  groups: string[];
  role: EnterpriseRole;
  createdAt: string;
  updatedAt: string;
}

export interface ScimUserStore {
  findByUserName(userName: string): ScimProvisionedUser | null;
  save(user: ScimProvisionedUser): void;
}

export class InMemoryScimUserStore implements ScimUserStore {
  private readonly byId = new Map<string, ScimProvisionedUser>();
  private readonly byUserName = new Map<string, string>();

  findByUserName(userName: string): ScimProvisionedUser | null {
    const key = userName.trim().toLowerCase();
    const id = this.byUserName.get(key);
    if (!id) {
      return null;
    }
    return this.byId.get(id) ?? null;
  }

  save(user: ScimProvisionedUser): void {
    this.byId.set(user.id, user);
    this.byUserName.set(user.userName.trim().toLowerCase(), user.id);
  }

  list(): ScimProvisionedUser[] {
    return Array.from(this.byId.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }
}

export interface ScimAdapterOptions {
  bearerToken: string;
  roleMapping: SsoRoleMapping;
  userStore: ScimUserStore;
  now?: () => Date;
}

interface ScimCreateUserBody {
  userName?: unknown;
  externalId?: unknown;
  displayName?: unknown;
  active?: unknown;
  emails?: unknown;
  groups?: unknown;
  roles?: unknown;
}

function scimError(status: number, detail: string): {
  schemas: string[];
  status: string;
  detail: string;
} {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: String(status),
    detail
  };
}

function scimJson(status: number, payload: unknown): ScimResponse {
  return {
    status,
    headers: {
      "content-type": "application/scim+json"
    },
    body: payload
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function headerValue(headers: Record<string, string | undefined> | undefined, key: string): string | null {
  if (!headers) {
    return null;
  }
  const normalizedKey = key.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === normalizedKey && typeof value === "string") {
      return value;
    }
  }
  return null;
}

function parseEmails(value: unknown): Array<{ value: string; primary: boolean }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Array<{ value: string; primary: boolean }> = [];
  for (const row of value) {
    if (typeof row === "string") {
      const email = row.trim();
      if (email.length > 0) {
        out.push({ value: email, primary: out.length === 0 });
      }
      continue;
    }
    const obj = asObject(row);
    if (!obj) {
      continue;
    }
    const emailRaw = obj.value;
    const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
    if (email.length === 0) {
      continue;
    }
    out.push({
      value: email,
      primary: obj.primary === true || out.length === 0
    });
  }
  return out;
}

function parseStringValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const row of value) {
    if (typeof row === "string") {
      const item = row.trim();
      if (item.length > 0) {
        out.push(item);
      }
      continue;
    }
    const obj = asObject(row);
    if (!obj) {
      continue;
    }
    const nested = obj.value;
    if (typeof nested === "string" && nested.trim().length > 0) {
      out.push(nested.trim());
    }
  }
  return out;
}

function toScimUserResponse(user: ScimProvisionedUser, basePath: string): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user.id,
    userName: user.userName,
    externalId: user.externalId ?? undefined,
    displayName: user.displayName ?? undefined,
    active: user.active,
    emails: user.emails.map((row) => ({
      value: row.value,
      primary: row.primary
    })),
    groups: user.groups.map((group) => ({ value: group })),
    roles: [{ value: user.role }],
    meta: {
      resourceType: "User",
      created: user.createdAt,
      lastModified: user.updatedAt,
      location: `${basePath}/${encodeURIComponent(user.id)}`
    }
  };
}

function validateBearerToken(headers: Record<string, string | undefined> | undefined, expectedToken: string): boolean {
  const authorization = headerValue(headers, "authorization");
  if (!authorization) {
    return false;
  }
  const parts = authorization.split(/\s+/);
  if (parts.length !== 2) {
    return false;
  }
  return parts[0]?.toLowerCase() === "bearer" && parts[1] === expectedToken;
}

export async function handleScimRequest(params: {
  request: ScimRequest;
  options: ScimAdapterOptions;
}): Promise<ScimResponse> {
  const path = params.request.path.replace(/\/+$/g, "") || "/";
  if (path !== "/scim/v2/Users") {
    return scimJson(404, scimError(404, "Unknown SCIM endpoint"));
  }

  const method = params.request.method.toUpperCase();
  if (method !== "POST") {
    return scimJson(405, scimError(405, "Method Not Allowed"));
  }

  if (!validateBearerToken(params.request.headers, params.options.bearerToken)) {
    return scimJson(401, scimError(401, "Unauthorized"));
  }

  const body = asObject(params.request.body as ScimCreateUserBody);
  if (!body) {
    return scimJson(400, scimError(400, "Invalid SCIM payload"));
  }

  const userNameRaw = body.userName;
  const userName = typeof userNameRaw === "string" ? userNameRaw.trim() : "";
  if (userName.length === 0) {
    return scimJson(400, scimError(400, "userName is required"));
  }

  const existing = params.options.userStore.findByUserName(userName);
  if (existing) {
    return scimJson(409, scimError(409, "User already exists"));
  }

  const groups = parseStringValues(body.groups);
  const explicitRoles = parseStringValues(body.roles);
  const role = resolveSsoRole({
    groups,
    explicitRoles,
    mapping: params.options.roleMapping
  });
  const emails = parseEmails(body.emails);
  if (emails.length === 0 && userName.includes("@")) {
    emails.push({
      value: userName,
      primary: true
    });
  }

  const now = (params.options.now ?? (() => new Date()))().toISOString();
  const user: ScimProvisionedUser = {
    id: randomUUID(),
    userName,
    externalId: typeof body.externalId === "string" ? body.externalId : null,
    displayName: typeof body.displayName === "string" ? body.displayName : null,
    active: body.active !== false,
    emails,
    groups,
    role,
    createdAt: now,
    updatedAt: now
  };
  params.options.userStore.save(user);
  return scimJson(201, toScimUserResponse(user, "/scim/v2/Users"));
}

export function createScimAdapter(options: ScimAdapterOptions): {
  handle(request: ScimRequest): Promise<ScimResponse>;
} {
  return {
    async handle(request: ScimRequest): Promise<ScimResponse> {
      return handleScimRequest({
        request,
        options
      });
    }
  };
}

import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { handleStudioApiDelegation, principalFromAuth, type StudioApiAuthContext } from "../src/studio/apiDelegation.js";
import { handleProductRoute } from "../src/api/productRouter.js";
import { handleApiRoute } from "../src/api/index.js";
import { enforceRoleOrAdmin } from "../src/auth/rbac.js";
import { parseUserRoles } from "../src/auth/roles.js";
import { openProductDb, closeProductDb } from "../src/product/productDb.js";
import { PortalManager } from "../src/product/portal.js";

/**
 * AMC-1508: an authorized OPERATOR/OWNER could previously forge submittedBy.
 * Exercise real delegation, registry, role enforcement, router and SQLite after
 * authentication. Authentication is injected at its supported seam: this is not
 * a live cookie/credential test. No product persistence or role guard is mocked.
 */
const pathname = "/api/v1/product/portal/submit";
let workspace: string;

beforeEach(() => {
  closeProductDb();
  workspace = mkdtempSync(join(tmpdir(), "amc-portal-attribution-"));
  // Explicit path primes the existing singleton without changing process env/cwd.
  openProductDb(join(workspace, "product.db"));
  new PortalManager().submitJob("existing", "scan", "prior-owner", { retained: true });
});

afterEach(() => {
  closeProductDb();
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

function persistedRows() {
  return openProductDb().prepare("SELECT id, name, type, submitted_by, payload FROM portal_jobs ORDER BY id").all();
}

function jsonReq(method: string, url: string, body: unknown): IncomingMessage {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  return Object.assign(Readable.from([bytes]), {
    method, url,
    headers: { "content-type": "application/json", "content-length": String(bytes.length), host: "127.0.0.1" },
    socket: { remoteAddress: "127.0.0.1" }
  }) as unknown as IncomingMessage;
}

function captureRes(): { res: ServerResponse; state: { status: number; body: string } } {
  const state = { status: 200, body: "" };
  const res = {
    writeHead: (status: number) => { state.status = status; return res; },
    setHeader: () => res,
    getHeader: () => undefined,
    end: (chunk?: unknown) => { if (chunk !== undefined) state.body += String(chunk); return res; },
    write: (chunk: unknown) => { state.body += String(chunk); return true; },
    headersSent: false
  };
  return { res: res as unknown as ServerResponse, state };
}

const limiter = () => ({ allowed: true, limit: 60, remaining: 59, resetTs: Date.now() + 60_000, retryAfterSeconds: 0 });

async function submitVia(auth: StudioApiAuthContext | null, body: unknown, usersConfigValid = true) {
  const { res, state } = captureRes();
  const handled = await handleStudioApiDelegation({
    pathname, method: "POST", clientIp: "127.0.0.1", workspace,
    token: "fixture-admin-token", req: jsonReq("POST", pathname, body), res,
    authenticate: () => auth,
    requireRoles: ({ auth: caller, roles }) => {
      const decision = enforceRoleOrAdmin({
        access: {
          isAdminToken: caller.isAdmin,
          principal: caller.username ? {
            userId: caller.username, username: caller.username,
            roles: parseUserRoles([...caller.roles])
          } : null
        },
        requiredAny: parseUserRoles(roles),
        usersConfigValid
      });
      if (!decision.ok) {
        state.status = decision.status;
        state.body = JSON.stringify({ error: decision.error });
      }
      return decision.ok;
    },
    json: (_target, status, payload) => { state.status = status; state.body = JSON.stringify(payload); },
    apiLimiter: limiter, privilegedApiLimiter: limiter,
    setRateLimitHeaders: () => undefined
  });
  expect(handled).toBe(true);
  return state;
}

const sessionUser: StudioApiAuthContext = { isAdmin: false, agentId: null, username: "sid", roles: new Set(["OPERATOR"]) };
const bootstrapAdmin: StudioApiAuthContext = { isAdmin: true, agentId: null, username: "bootstrap-admin", roles: new Set(["OWNER", "AGENT"]) };

const allowedCallers: Array<{ name: string; auth: StudioApiAuthContext; expectedPrincipal: string }> = [
  { name: "operator", auth: sessionUser, expectedPrincipal: "sid" },
  { name: "human owner", auth: { ...sessionUser, username: "owner-sid", roles: new Set(["OWNER"]) }, expectedPrincipal: "owner-sid" },
  { name: "bootstrap admin with AGENT role", auth: bootstrapAdmin, expectedPrincipal: "bootstrap-admin" },
  { name: "trimmed human identity", auth: { ...sessionUser, username: "  alice  " }, expectedPrincipal: "alice" }
];
const deniedCallers: Array<{ name: string; auth: StudioApiAuthContext | null; status: number }> = [
  { name: "anonymous", auth: null, status: 401 },
  { name: "missing identity", auth: { ...sessionUser, username: null }, status: 401 },
  { name: "blank identity", auth: { ...sessionUser, username: "  " }, status: 401 },
  { name: "viewer", auth: { ...sessionUser, roles: new Set(["VIEWER"]) }, status: 403 },
  { name: "approver", auth: { ...sessionUser, roles: new Set(["APPROVER"]) }, status: 403 },
  { name: "auditor", auth: { ...sessionUser, roles: new Set(["AUDITOR"]) }, status: 403 },
  { name: "no roles", auth: { ...sessionUser, roles: new Set() }, status: 403 },
  { name: "agent token with OPERATOR role", auth: { ...sessionUser, agentId: "agent-7", username: "agent-token", roles: new Set(["AGENT", "OPERATOR"]) }, status: 403 },
  { name: "lease with OWNER role", auth: { ...sessionUser, agentId: "agent-9", username: "agent-lease", roles: new Set(["AGENT", "OWNER"]) }, status: 403 }
];

describe("AMC-1508 — persisted portal attribution after authentication", () => {
  test.each(allowedCallers)("$name persists the authenticated principal", async ({ auth, expectedPrincipal }) => {
    const before = persistedRows();
    const state = await submitVia(auth, { name: "job", type: "scan", payload: { x: 1, submittedBy: "payload-is-data" } });
    expect(state.status).toBe(201);
    const response = JSON.parse(state.body) as { ok: boolean; data: { id: string; submittedBy: string } };
    expect(response.ok).toBe(true);
    expect(response.data.submittedBy).toBe(expectedPrincipal);
    const inserted = openProductDb().prepare("SELECT name, type, submitted_by, payload FROM portal_jobs WHERE id = ?").get(response.data.id);
    expect(inserted).toEqual({ name: "job", type: "scan", submitted_by: expectedPrincipal, payload: JSON.stringify({ x: 1, submittedBy: "payload-is-data" }) });
    expect(persistedRows()).toHaveLength(before.length + 1);
    expect(persistedRows()).toEqual(expect.arrayContaining(before));
  });

  test.each(["someone-else", "sid", "", null])("rejects client submittedBy=%s without changing persisted rows", async (submittedBy) => {
    const before = persistedRows();
    const state = await submitVia(sessionUser, { name: "job", type: "scan", submittedBy });
    expect(state.status).toBe(400);
    expect(persistedRows()).toEqual(before);
  });

  test.each(deniedCallers)("$name is refused without changing persisted rows", async ({ auth, status }) => {
    const before = persistedRows();
    const state = await submitVia(auth, { name: "job", type: "scan" });
    expect(state.status).toBe(status);
    expect(persistedRows()).toEqual(before);
  });

  test("an invalid users-config verdict keeps a human operator read-only", async () => {
    const before = persistedRows();
    const state = await submitVia(sessionUser, { name: "job", type: "scan" }, false);
    expect(state.status).toBe(403);
    expect(persistedRows()).toEqual(before);
  });

  test("a direct product route with no principal fails closed", async () => {
    const before = persistedRows();
    const { res, state } = captureRes();
    expect(await handleProductRoute(pathname, "POST", jsonReq("POST", pathname, { name: "job", type: "scan" }), res, { workspace })).toBe(true);
    expect(state.status).toBe(401);
    expect(persistedRows()).toEqual(before);
  });

  test("the registry cannot manufacture an omitted principal", async () => {
    const before = persistedRows();
    const { res, state } = captureRes();
    expect(await handleApiRoute(pathname, "POST", jsonReq("POST", pathname, { name: "job", type: "scan" }), res, workspace, "fixture-admin-token")).toBe(true);
    expect(state.status).toBe(401);
    expect(persistedRows()).toEqual(before);
  });

  test("principal derivation preserves agent identities and bootstrap attribution", () => {
    expect(principalFromAuth({ isAdmin: false, agentId: "agent-7", username: "agent-token", roles: new Set(["AGENT"]) })).toBe("agent:agent-7");
    expect(principalFromAuth({ isAdmin: false, agentId: "agent-9", username: "agent-lease", roles: new Set(["AGENT"]) })).toBe("agent:agent-9");
    expect(principalFromAuth(sessionUser)).toBe("sid");
    expect(principalFromAuth(bootstrapAdmin)).toBe("bootstrap-admin");
    expect(principalFromAuth({ isAdmin: false, agentId: null, username: "  ", roles: new Set() })).toBeNull();
  });
});

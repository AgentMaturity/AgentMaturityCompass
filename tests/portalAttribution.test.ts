import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test, vi } from "vitest";
import { handleStudioApiDelegation, principalFromAuth } from "../src/studio/apiDelegation.js";
import { handleProductRoute } from "../src/api/productRouter.js";

/**
 * AMC-1508 — who a portal job is attributed to comes from authentication.
 *
 * `POST /api/v1/product/portal/submit` REQUIRED a caller-supplied `submittedBy`
 * and persisted it as `submitted_by` — the only record of who asked for the
 * work, on a table with no receipt, hash chain or signature. An authenticated
 * viewer could therefore file a job as anyone. Recovered from the
 * `vigilant-merkle-2d8549` worktree (base 3d6b8d4a) and ported onto the
 * current runtime, with one correction: the principal is derived by ROLE, not
 * `username ?? agentId` — agent credentials carry a synthetic username
 * ("agent-token", "agent-lease") and their identity in `agentId`.
 */

const m = vi.hoisted(() => ({
  submitJob: vi.fn((name: string, type: string, submittedBy: string, payload?: unknown) => ({
    id: "job-1", name, type, submittedBy, payload, status: "submitted"
  }))
}));
vi.mock("../src/product/portal.js", () => ({
  PortalManager: class { submitJob = m.submitJob; }
}));

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

async function submitVia(auth: ReturnType<StudioAuth> | null, body: unknown) {
  const { res, state } = captureRes();
  const handled = await handleStudioApiDelegation({
    pathname: "/api/v1/product/portal/submit",
    method: "POST",
    clientIp: "127.0.0.1",
    workspace: process.cwd(),
    token: "admin-token",
    req: jsonReq("POST", "/api/v1/product/portal/submit", body),
    res,
    authenticate: () => auth,
    requireRoles: () => true,
    json: (target, status, payload) => { state.status = status; state.body = JSON.stringify(payload); },
    apiLimiter: limiter,
    privilegedApiLimiter: limiter,
    setRateLimitHeaders: () => undefined
  });
  expect(handled).toBe(true);
  return state;
}
type StudioAuth = () => { isAdmin: boolean; agentId: string | null; username: string | null; roles: ReadonlySet<string> };

const sessionUser = { isAdmin: false, agentId: null, username: "sid", roles: new Set(["OPERATOR"]) };
const bootstrapAdmin = { isAdmin: true, agentId: null, username: "bootstrap-admin", roles: new Set(["OWNER", "AGENT"]) };

describe("AMC-1508 — portal attribution comes from authentication", () => {
  test("a client-supplied submittedBy is rejected, not silently overridden", async () => {
    m.submitJob.mockClear();
    const state = await submitVia(sessionUser, { name: "job", type: "scan", submittedBy: "someone-else" });
    expect(state.status).toBe(400);
    expect(m.submitJob).not.toHaveBeenCalled();
  });

  test("the recorded submitter is the authenticated session user", async () => {
    m.submitJob.mockClear();
    const state = await submitVia(sessionUser, { name: "job", type: "scan", payload: { x: 1 } });
    expect(state.status).toBe(201);
    expect(m.submitJob).toHaveBeenCalledWith("job", "scan", "sid", { x: 1 });
  });

  test("the bootstrap admin is attributed by its own name, not by its AGENT role", async () => {
    m.submitJob.mockClear();
    const state = await submitVia(bootstrapAdmin, { name: "job", type: "scan" });
    expect(state.status).toBe(201);
    expect(m.submitJob).toHaveBeenCalledWith("job", "scan", "bootstrap-admin", undefined);
  });

  test("an anonymous caller fails closed before any job is written", async () => {
    m.submitJob.mockClear();
    const state = await submitVia(null, { name: "job", type: "scan" });
    expect(state.status).toBe(401);
    expect(m.submitJob).not.toHaveBeenCalled();
  });

  test("a route call with no principal in its context fails closed", async () => {
    m.submitJob.mockClear();
    const { res, state } = captureRes();
    const handled = await handleProductRoute(
      "/api/v1/product/portal/submit", "POST",
      jsonReq("POST", "/api/v1/product/portal/submit", { name: "job", type: "scan" }),
      res,
      { workspace: process.cwd() }
    );
    expect(handled).toBe(true);
    expect(state.status).toBe(401);
    expect(m.submitJob).not.toHaveBeenCalled();
  });

  test("principal derivation never loses an agent identity behind its synthetic username", () => {
    expect(principalFromAuth({ isAdmin: false, agentId: "agent-7", username: "agent-token", roles: new Set(["AGENT"]) })).toBe("agent:agent-7");
    expect(principalFromAuth({ isAdmin: false, agentId: "agent-9", username: "agent-lease", roles: new Set(["AGENT"]) })).toBe("agent:agent-9");
    expect(principalFromAuth(sessionUser)).toBe("sid");
    expect(principalFromAuth(bootstrapAdmin)).toBe("bootstrap-admin");
    expect(principalFromAuth({ isAdmin: false, agentId: null, username: "  ", roles: new Set() })).toBeNull();
  });
});

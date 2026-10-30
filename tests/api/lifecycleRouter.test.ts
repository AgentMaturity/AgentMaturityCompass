/** P2-23 /api/v1/lifecycle: role classes through the real Studio delegation, and the router's actor and transitions. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleLifecycleRoute } from "../../src/api/lifecycleRouter.js";
import { handleStudioApiDelegation, type StudioApiAuthContext } from "../../src/studio/apiDelegation.js";
import { cleanupGovernanceFixtures, governanceFixture, loginAs } from "../governor/governanceFixture.js";

afterEach(cleanupGovernanceFixtures);

const HUMAN = ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"];
const limiter = () => ({ allowed: true, limit: 60, remaining: 59, resetTs: Date.now() + 60_000, retryAfterSeconds: 0 });
interface Reply { status: number; body: string; roles?: string[] }

function fakeRes(reply: Reply): ServerResponse {
  return { headersSent: false, setHeader: () => undefined, writeHead(status: number) { reply.status = status; return this; },
    end(body?: string | Buffer) { reply.body = String(body ?? ""); } } as unknown as ServerResponse;
}
function fakeReq(url: string, body?: unknown): IncomingMessage {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { url, headers: { "content-type": "application/json" } });
  return req;
}

async function rolesFor(path: string, method: string): Promise<string[] | undefined> {
  const reply: Reply = { status: 0, body: "" };
  await handleStudioApiDelegation({ pathname: path, method, clientIp: "127.0.0.1", workspace: process.cwd(), token: "admin-token", req: fakeReq(path), res: fakeRes(reply),
    authenticate: () => ({ isAdmin: false, agentId: null, username: "viewer", userId: "u-viewer", roles: new Set(["VIEWER"]) }) as StudioApiAuthContext,
    requireRoles: (params) => { reply.roles = params.roles; return false; },
    json: (_res, status, payload) => { reply.status = status; reply.body = JSON.stringify(payload); },
    apiLimiter: limiter, privilegedApiLimiter: limiter, setRateLimitHeaders: () => undefined });
  return reply.roles;
}

async function call(workspace: string, path: string, method: string, principal: string | undefined, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply: Reply = { status: 0, body: "" };
  await handleLifecycleRoute(path, method, fakeReq(path, body), fakeRes(reply), { workspace, ...(principal === undefined ? {} : { principal }) });
  return { status: reply.status, json: JSON.parse(reply.body) as Record<string, unknown> };
}

describe("/api/v1/lifecycle (P2-23)", () => {
  test("GET takes every human role; POST .../transition is OWNER only", async () => {
    expect(await rolesFor("/api/v1/lifecycle/agents/default", "GET")).toEqual(HUMAN);
    expect(await rolesFor("/api/v1/lifecycle/agents/default/transition", "POST")).toEqual(["OWNER"]);
  });

  test("the actor is the signed-in users.yaml OWNER: a body never names one, a non-owner or unknown principal is refused", async () => {
    const { workspace } = governanceFixture();
    loginAs(workspace, "api-owner", ["OWNER"]);
    loginAs(workspace, "api-operator", ["OPERATOR"]);
    const path = "/api/v1/lifecycle/agents/default/transition";
    expect((await call(workspace, path, "POST", "api-owner", { to: "proposed", actor: "someone-else" })).status).toBe(400);
    expect((await call(workspace, path, "POST", "api-operator", { to: "proposed" })).json.code).toBe("owner_required");
    expect((await call(workspace, path, "POST", undefined, { to: "proposed" })).json.code).toBe("owner_required");
    const done = await call(workspace, path, "POST", "api-owner", { to: "proposed", note: "registered through Studio" });
    expect(done.status).toBe(200);
    const read = await call(workspace, "/api/v1/lifecycle/agents/default", "GET", "api-operator");
    const data = read.json.data as { state: Record<string, unknown>; transitions: Array<Record<string, unknown>> };
    expect(data.state).toMatchObject({ state: "proposed", reason: "registered" });
    expect(data.transitions[0]).toMatchObject({ to: "proposed", note: "registered through Studio", actor: expect.objectContaining({ username: "api-owner", via: "studio-session" }) });
    expect((await call(workspace, path, "POST", "api-owner", { to: "approved" })).json.code).toBe("approval_required");
    expect((await call(workspace, path, "POST", "api-owner", { to: "approved", requestApproval: true })).json.code).toBe("manifest_required");
  });
});

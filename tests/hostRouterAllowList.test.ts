import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadAssurancePolicy, saveAssurancePolicy } from "../src/assurance/assurancePolicyStore.js";
import { createHostUser, createWorkspaceRecord, grantMembership, initHostDb } from "../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-09 (anonymous readiness neither enumerates workspaces nor doubles as liveness) and LIVE-RUNTIME-20
// (the router enforces its allow list, trusts its proxy correctly and rewrites the forwarding headers it passes on).
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function host(): string {
  const hostDir = mkdtempSync(join(tmpdir(), "amc-router-allow-"));
  roots.push(hostDir);
  initHostDb(hostDir);
  createHostUser({ hostDir, username: "admin", password: "admin-pass-123", isHostAdmin: true });
  createHostUser({ hostDir, username: "member", password: "member-pass-123", isHostAdmin: false });
  for (const workspaceId of ["ws-a", "ws-b"]) {
    createWorkspaceRecord({ hostDir, workspaceId, name: workspaceId });
    const workspace = hostWorkspaceDir(hostDir, workspaceId);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const policy = loadAssurancePolicy(workspace);
    policy.assurancePolicy.thresholds.failClosedIfBelowThresholds = false;
    saveAssurancePolicy(workspace, policy);
  }
  grantMembership({ hostDir, username: "member", workspaceId: "ws-b", role: "VIEWER" });
  return hostDir;
}

async function router(hostDir: string, options: { allowedCidrs?: string[]; trustedProxyHops?: number; trustedProxyCidrs?: string[] } = {}): Promise<number> {
  const runtime = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0, defaultWorkspaceId: "ws-a", ...options });
  closers.push(() => runtime.close());
  return runtime.port;
}

function call(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<{ status: number; body: string; cookie: string }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: options.method ?? "GET",
      headers: { connection: "close", "content-type": "application/json", "content-length": Buffer.byteLength(raw), ...options.headers } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"];
        resolvePromise({ status: res.statusCode ?? 0, body, cookie: (Array.isArray(setCookie) ? setCookie[0] : setCookie ?? "").split(";", 1)[0] ?? "" });
      });
    });
    req.on("error", rejectPromise);
    req.end(raw);
  });
}

const login = async (port: number, username: string, password: string): Promise<string> =>
  (await call(port, "/host/api/login", { method: "POST", body: { username, password } })).cookie;

describe("host router readiness", () => {
  test("anonymous readiness is a summary; host admins see every workspace, members theirs; liveness ignores tenants", async () => {
    const hostDir = host();
    writeFileSync(join(hostWorkspaceDir(hostDir, "ws-b"), ".amc", "trust.yaml"), "tampered: true\n");
    const port = await router(hostDir);
    const anonymous = await call(port, "/host/readyz");
    expect(anonymous.status).toBe(503);
    const body = JSON.parse(anonymous.body) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "NOT_READY", mode: "host", summary: { total: 2, ready: 1, notReady: 1 } });
    expect(body).not.toHaveProperty("workspaces");
    expect(anonymous.body).not.toContain("ws-");
    expect(JSON.parse((await call(port, "/readyz")).body)).not.toHaveProperty("workspaces");

    const admin = JSON.parse((await call(port, "/host/readyz", { headers: { cookie: await login(port, "admin", "admin-pass-123") } })).body) as { workspaces: Array<{ workspaceId: string }> };
    expect(admin.workspaces.map((row) => row.workspaceId).sort()).toEqual(["ws-a", "ws-b"]);
    const member = JSON.parse((await call(port, "/host/readyz", { headers: { cookie: await login(port, "member", "member-pass-123") } })).body) as { workspaces: Array<{ workspaceId: string }> };
    expect(member.workspaces.map((row) => row.workspaceId)).toEqual(["ws-b"]);

    const live = await call(port, "/healthz");
    expect(live.status, "liveness does not fail for one tenant's misconfiguration").toBe(200);
    expect(JSON.parse(live.body)).toEqual({ ok: true, mode: "host" });
  }, 120_000);

  test("anonymous /w/<id>/readyz answers the same 401 for known and unknown ids; a host session sees readiness", async () => {
    const port = await router(host());
    const known = await call(port, "/w/ws-a/readyz");
    const unknown = await call(port, "/w/no-such-workspace/readyz");
    expect(known.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(known.body).toBe(unknown.body);
    expect(JSON.parse(known.body)).toEqual({ error: "authentication required" });
    const signedIn = await call(port, "/w/ws-a/readyz", { headers: { cookie: await login(port, "admin", "admin-pass-123") } });
    expect(signedIn.status).toBe(200);
    expect(JSON.parse(signedIn.body)).toMatchObject({ status: "READY", workspaceId: "ws-a" });
  }, 120_000);

  // SR-5: any valid host session used to read any workspace's readiness, a cross-tenant disclosure.
  test("a host user reads only the workspaces they belong to; another tenant answers as to an anonymous caller", async () => {
    const port = await router(host());
    const cookie = await login(port, "member", "member-pass-123"); // a member of ws-b only
    const own = await call(port, "/w/ws-b/readyz", { headers: { cookie } });
    expect(own.status).toBe(200);
    expect(JSON.parse(own.body)).toMatchObject({ workspaceId: "ws-b" });
    const other = await call(port, "/w/ws-a/readyz", { headers: { cookie } });
    const anonymous = await call(port, "/w/ws-a/readyz");
    expect({ status: other.status, body: other.body }).toEqual({ status: anonymous.status, body: anonymous.body });
    expect(other.body).not.toContain("ws-a");
    const otherApi = await call(port, "/w/ws-a/api/status", { headers: { cookie } });
    expect(otherApi.status, "the other tenant's API is not proxied either").toBe(403);
    expect(JSON.parse(otherApi.body)).toEqual({ error: "membership required" });
    const unknownApi = await call(port, "/w/no-such-workspace/api/status", { headers: { cookie } });
    expect({ status: unknownApi.status, body: unknownApi.body }, "and that refusal names no workspace that exists").toEqual({ status: otherApi.status, body: otherApi.body });
  }, 120_000);
});

describe("host router allow list and forwarding", () => {
  test("enforces the allow list on the client a trusted hop names; loopback always passes", async () => {
    const hostDir = host();
    const trusted = await router(hostDir, { allowedCidrs: ["10.9.0.0/16"], trustedProxyHops: 1, trustedProxyCidrs: ["127.0.0.1/32"] });
    expect((await call(trusted, "/host/healthz")).status).toBe(200);
    expect((await call(trusted, "/host/healthz", { headers: { "x-forwarded-for": "10.9.1.2" } })).status).toBe(200);
    const refused = await call(trusted, "/host/healthz", { headers: { "x-forwarded-for": "198.51.100.9" } });
    expect(refused.status).toBe(403);
    expect(JSON.parse(refused.body)).toEqual({ error: "client IP not allowed", ip: "198.51.100.9" });
    const direct = await router(hostDir, { allowedCidrs: ["10.9.0.0/16"], trustedProxyHops: 0 });
    expect((await call(direct, "/host/healthz", { headers: { "x-forwarded-for": "198.51.100.9" } })).status, "an untrusted header is ignored").toBe(200);
  }, 120_000);

  test("a client's own X-Forwarded-For never reaches the workspace API: the router states the client it computed", async () => {
    const hostDir = host();
    const port = await router(hostDir);
    const cookie = await login(port, "admin", "admin-pass-123");
    // The workspace API trusts one hop (the router) and admits loopback only, so a client-chosen 203.0.113.5 passed
    // through unchanged would be refused there with 403 naming it.
    const proxied = await call(port, "/w/ws-a/api/status", { headers: { cookie, "x-forwarded-for": "203.0.113.5", forwarded: "for=203.0.113.5" } });
    expect(proxied.status).not.toBe(403);
    expect(proxied.body).not.toContain("203.0.113.5");
  }, 120_000);
});

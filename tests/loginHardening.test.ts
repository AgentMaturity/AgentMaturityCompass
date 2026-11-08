import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

// Pass-through spies, so one case can make the users loader or the host password login fail its own way (LIVE-RUNTIME-06).
const spies = vi.hoisted(() => ({ authenticateUser: vi.fn(), localPasswordLogin: vi.fn() }));
vi.mock("../src/auth/authApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/authApi.js")>();
  spies.authenticateUser.mockImplementation(actual.authenticateUser);
  return { ...actual, authenticateUser: spies.authenticateUser };
});
vi.mock("../src/identity/identityApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/identity/identityApi.js")>();
  spies.localPasswordLogin.mockImplementation(actual.localPasswordLogin);
  return { ...actual, localPasswordLogin: spies.localPasswordLogin };
});

const { initWorkspace } = await import("../src/workspace.js");
const { addUser, initUsersConfig, revokeUser } = await import("../src/auth/authApi.js");
const { startStudioApiServer } = await import("../src/studio/studioServer.js");
const { createHostUser, createWorkspaceRecord, disableHostUser, grantMembership, initHostDb } = await import("../src/workspaces/hostDb.js");
const { hostWorkspaceDir } = await import("../src/workspaces/workspacePaths.js");
const { startWorkspaceRouter } = await import("../src/workspaces/workspaceRouter.js");

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function newDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolvePromise) => probe.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = probe.address();
  await new Promise<void>((resolvePromise) => probe.close(() => resolvePromise()));
  return typeof address === "object" && address ? address.port : 0;
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const raw = JSON.stringify(body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(url, { method: "POST", headers: { connection: "close", "content-type": "application/json", "content-length": Buffer.byteLength(raw), ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }));
    });
    req.on("error", rejectPromise);
    req.end(raw);
  });
}

async function studio(): Promise<{ url: string; workspace: string }> {
  const workspace = newDir("amc-login-hardening-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: "owner-password" });
  addUser({ workspace, username: "viewer", password: "viewer-password", roles: ["VIEWER"] });
  // One trusted hop (loopback is listed), so a forwarded address is a different client of the same Studio.
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-login-hardening",
    allowedCidrs: ["127.0.0.1/32", "::1/128", "10.0.0.0/8"], trustedProxyHops: 1 });
  closers.push(() => api.close());
  return { url: api.url, workspace };
}

async function hostRouter(trustedProxyHops = 0): Promise<{ url: string; hostDir: string }> {
  const hostDir = newDir("amc-login-hardening-host-");
  initHostDb(hostDir);
  createHostUser({ hostDir, username: "admin", password: "admin-pass-123", isHostAdmin: true });
  createHostUser({ hostDir, username: "member", password: "member-pass-123", isHostAdmin: false });
  createWorkspaceRecord({ hostDir, workspaceId: "ws-a", name: "Workspace A" });
  initWorkspace({ workspacePath: hostWorkspaceDir(hostDir, "ws-a"), trustBoundaryMode: "isolated" });
  grantMembership({ hostDir, username: "member", workspaceId: "ws-a", role: "VIEWER" });
  const port = await freePort();
  const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port, defaultWorkspaceId: "ws-a", trustedProxyHops });
  closers.push(() => router.close());
  return { url: `http://127.0.0.1:${port}`, hostDir };
}

describe("Studio login throttle per (account, address)", () => {
  test("10 wrong passwords lock that address out of that account; another address and another account are unaffected", async () => {
    const { url } = await studio();
    for (let i = 0; i < 10; i += 1) {
      expect((await post(`${url}/auth/login`, { username: "owner", password: "wrong" })).status).toBe(401);
    }
    const refused = await post(`${url}/auth/login`, { username: "owner", password: "owner-password" });
    expect(refused.status, "the right password from the throttled address is refused").toBe(429);
    expect(JSON.parse(refused.body)).toEqual({ error: "too many failed logins for this account from this address" });
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(800);

    const elsewhere = await post(`${url}/auth/login`, { username: "owner", password: "owner-password" }, { "x-forwarded-for": "10.9.9.9" });
    expect(elsewhere.status, "the owner at another address signs in").toBe(200);
    expect((await post(`${url}/auth/login`, { username: "viewer", password: "viewer-password" })).status).toBe(200);
  }, 60_000);
});

describe("host router login throttle", () => {
  test("/host/api/login refuses the throttled pair and serves another account", async () => {
    const { url } = await hostRouter();
    for (let i = 0; i < 10; i += 1) {
      expect((await post(`${url}/host/api/login`, { username: "admin", password: "wrong" })).status).toBe(401);
    }
    const refused = await post(`${url}/host/api/login`, { username: "admin", password: "admin-pass-123" });
    expect(refused.status).toBe(429);
    expect(refused.headers["retry-after"]).toBeDefined();
    expect((await post(`${url}/host/api/login`, { username: "member", password: "member-pass-123" })).status).toBe(200);
  }, 60_000);

  test("the workspace login route shares the host-account throttle", async () => {
    const { url } = await hostRouter();
    for (let i = 0; i < 10; i += 1) {
      expect((await post(`${url}/w/ws-a/login`, { username: "member", password: "wrong" })).status).toBe(401);
    }
    expect((await post(`${url}/w/ws-a/login`, { username: "member", password: "member-pass-123" })).status).toBe(429);
    expect((await post(`${url}/host/api/login`, { username: "member", password: "member-pass-123" })).status).toBe(429);
  }, 60_000);
});

describe("login responses name neither internal errors nor account status (LIVE-RUNTIME-06)", () => {
  test("a users-config load failure and a revoked user both answer exactly invalid credentials", async () => {
    const { url, workspace } = await studio();
    spies.authenticateUser.mockReturnValueOnce({ ok: false, user: null, error: "Error: ENOENT /secret/path/users.yaml" });
    const loaderFailure = await post(`${url}/auth/login`, { username: "owner", password: "owner-password" });
    expect(loaderFailure.status).toBe(401);
    expect(loaderFailure.body).toBe("{\"error\":\"invalid credentials\"}");

    revokeUser({ workspace, username: "viewer" });
    const revoked = await post(`${url}/auth/login`, { username: "viewer", password: "viewer-password" });
    expect(revoked.status).toBe(401);
    expect(revoked.body).toBe("{\"error\":\"invalid credentials\"}");
  }, 60_000);

  test("a disabled host user answers invalid credentials on the host and workspace login routes", async () => {
    const { url, hostDir } = await hostRouter();
    disableHostUser(hostDir, "member");
    for (const path of ["/host/api/login", "/w/ws-a/login"]) {
      const disabled = await post(`${url}${path}`, { username: "member", password: "member-pass-123" });
      expect(disabled.status, path).toBe(401);
      expect(JSON.parse(disabled.body), path).toEqual({ error: "invalid credentials" });
    }
  }, 60_000);

  test("a host login that throws never puts its message in the body", async () => {
    const { url } = await hostRouter();
    spies.localPasswordLogin.mockImplementationOnce(() => { throw new Error("/secret/path"); });
    const failed = await post(`${url}/host/api/login`, { username: "admin", password: "wrong" });
    expect(failed.status).toBe(401);
    expect(failed.body).not.toContain("/secret/path");
  }, 60_000);
});

describe("the session cookie is Secure only behind a trusted hop (formerly LIVE-VAULT-10)", () => {
  test("x-forwarded-proto from a peer that is not a trusted hop leaves the cookie without Secure", async () => {
    const workspace = newDir("amc-login-secure-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-password" });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-login-secure" });
    closers.push(() => api.close());
    const login = await post(`${api.url}/auth/login`, { username: "owner", password: "owner-password" }, { "x-forwarded-proto": "https" });
    expect(login.status).toBe(200);
    expect(String(login.headers["set-cookie"] ?? "")).not.toContain("Secure");
  }, 60_000);
});

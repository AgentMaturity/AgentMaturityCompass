import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

// Pass-through spies, so one case can make the users loader or the host password login fail its own way (LIVE-RUNTIME-06).
const spies = vi.hoisted(() => ({ authenticateUser: vi.fn(), localPasswordLogin: vi.fn(), throttleFails: [] as unknown[][] }));
vi.mock("../src/auth/authApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/authApi.js")>();
  spies.authenticateUser.mockImplementation(actual.authenticateUser);
  return { ...actual, authenticateUser: spies.authenticateUser };
});
// SR-11: records what each login route reports to the throttle's fail(); the throttle itself is the real one.
vi.mock("../src/studio/loginThrottle.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/studio/loginThrottle.js")>();
  const createLoginThrottle: typeof actual.createLoginThrottle = (options) => {
    const throttle = actual.createLoginThrottle(options);
    return { ...throttle, fail: (...args) => { spies.throttleFails.push(args); throttle.fail(...args); } };
  };
  return { ...actual, createLoginThrottle };
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
  // One trusted proxy (loopback is named as one), so a forwarded address is a different client of the same Studio.
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-login-hardening",
    allowedCidrs: ["127.0.0.1/32", "::1/128", "10.0.0.0/8"], trustedProxyHops: 1, trustedProxyCidrs: ["127.0.0.1/32"] });
  closers.push(() => api.close());
  return { url: api.url, workspace };
}

async function hostRouter(trustedProxyHops = 0, trustedProxyCidrs: string[] = []): Promise<{ url: string; hostDir: string }> {
  const hostDir = newDir("amc-login-hardening-host-");
  initHostDb(hostDir);
  createHostUser({ hostDir, username: "admin", password: "admin-pass-123", isHostAdmin: true });
  createHostUser({ hostDir, username: "member", password: "member-pass-123", isHostAdmin: false });
  createWorkspaceRecord({ hostDir, workspaceId: "ws-a", name: "Workspace A" });
  initWorkspace({ workspacePath: hostWorkspaceDir(hostDir, "ws-a"), trustBoundaryMode: "isolated" });
  grantMembership({ hostDir, username: "member", workspaceId: "ws-a", role: "VIEWER" });
  const port = await freePort();
  const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port, defaultWorkspaceId: "ws-a", trustedProxyHops, trustedProxyCidrs, allowedCidrs: ["10.0.0.0/8"] });
  closers.push(() => router.close());
  return { url: `http://127.0.0.1:${port}`, hostDir };
}

describe("Studio login throttle per (account, address)", () => {
  test("10 wrong passwords lock that address out of that account; another address and another account are unaffected", async () => {
    const { url } = await studio();
    const here = { "x-forwarded-for": "10.9.9.8" }; // a client the trusted proxy names
    for (let i = 0; i < 10; i += 1) {
      expect((await post(`${url}/auth/login`, { username: "owner", password: "wrong" }, here)).status).toBe(401);
    }
    const refused = await post(`${url}/auth/login`, { username: "owner", password: "owner-password" }, here);
    expect(refused.status, "the right password from the throttled address is refused").toBe(429);
    expect(JSON.parse(refused.body)).toEqual({ error: "too many failed logins for this account from this address" });
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(800);

    const elsewhere = await post(`${url}/auth/login`, { username: "owner", password: "owner-password" }, { "x-forwarded-for": "10.9.9.9" });
    expect(elsewhere.status, "the owner at another address signs in").toBe(200);
    expect((await post(`${url}/auth/login`, { username: "viewer", password: "viewer-password" })).status).toBe(200);
  }, 60_000);
});

// SR-1: X-Forwarded-For counted whenever the peer was in the client allow list, so any allowed client could rotate it and
// get a fresh limiter bucket and throttle pair per request. Now only a named proxy's header counts.
describe("forwarded addresses from a peer that is no named proxy", () => {
  test("an allowed client rotating X-Forwarded-For keeps one key: the per-address login limiter still trips", async () => {
    const workspace = newDir("amc-login-spoof-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-password" });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-login-spoof",
      allowedCidrs: ["127.0.0.1/32", "::1/128", "10.0.0.0/8"], trustedProxyHops: 1 });
    closers.push(() => api.close());
    for (let i = 0; i < 20; i += 1) {
      expect((await post(`${api.url}/auth/login`, { username: "owner", password: "owner-password" }, { "x-forwarded-for": `10.7.0.${i + 1}` })).status).toBe(200);
    }
    const next = await post(`${api.url}/auth/login`, { username: "owner", password: "owner-password" }, { "x-forwarded-for": "10.7.1.1" });
    expect(next.status).toBe(429);
    expect(JSON.parse(next.body)).toEqual({ error: "too many login attempts" });
  }, 60_000);

  // SR-2: on such an address (proxy hops declared, peer no named proxy) a pair refusal would lock out everyone sharing it.
  test("on Studio, a shared address's pair is delayed, never refused", async () => {
    const workspace = newDir("amc-login-shared-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-password" });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-login-shared", trustedProxyHops: 1 });
    closers.push(() => api.close());
    for (let i = 0; i < 10; i += 1) expect((await post(`${api.url}/auth/login`, { username: "owner", password: "wrong" })).status).toBe(401);
    const started = Date.now();
    expect((await post(`${api.url}/auth/login`, { username: "owner", password: "owner-password" })).status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_900);
  }, 60_000);
});

// SR-11: only failures from untrusted addresses feed the untrusted refusal, so every failure site must say which it was.
describe("failed logins reach the throttle with their address trust", () => {
  test("Studio and all three host-router failure paths pass the resolved trust", async () => {
    spies.throttleFails.length = 0;
    const forwarded = (client: string) => ({ "x-forwarded-for": client }); // loopback is the named proxy in both servers
    const { url } = await studio();
    for (const headers of [forwarded("10.9.8.1"), {}]) expect((await post(`${url}/auth/login`, { username: "owner", password: "wrong" }, headers)).status).toBe(401);
    const host = await hostRouter(1, ["127.0.0.1/32"]);
    for (const headers of [forwarded("10.5.9.1"), {}]) {
      expect((await post(`${host.url}/host/api/login`, { username: "admin", password: "wrong" }, headers)).status).toBe(401);
    }
    for (const headers of [forwarded("10.5.9.2"), {}]) { // the legacy fallback, taken when identity sessions are unavailable
      spies.localPasswordLogin.mockImplementationOnce(() => { throw new Error("identity sessions not initialised"); });
      expect((await post(`${host.url}/host/api/login`, { username: "member", password: "wrong" }, headers)).status).toBe(401);
    }
    for (const headers of [forwarded("10.5.9.3"), {}]) expect((await post(`${host.url}/w/ws-a/login`, { username: "member", password: "wrong" }, headers)).status).toBe(401);
    expect(spies.throttleFails).toEqual([["owner", "10.9.8.1", true], ["owner", "127.0.0.1", false], ["admin", "10.5.9.1", true], ["admin", "127.0.0.1", false],
      ["member", "10.5.9.2", true], ["member", "127.0.0.1", false], ["member", "10.5.9.3", true], ["member", "127.0.0.1", false]]);
  }, 60_000);

  // SR-11: an untrusted refusal used to count every failure, so 30 failures through the named proxy refused the account on
  // every untrusted address, loopback included. Loopback is exempt, and those failures no longer feed that count anyway.
  test("after 30 failures through the named proxy, the owner still signs in from loopback", async () => {
    const { url } = await studio();
    for (let i = 0; i < 30; i += 1) {
      expect((await post(`${url}/auth/login`, { username: "owner", password: "wrong" }, { "x-forwarded-for": `10.9.7.${i + 1}` })).status).toBe(401);
    }
    const started = Date.now();
    expect((await post(`${url}/auth/login`, { username: "owner", password: "owner-password" })).status).toBe(200);
    expect(Date.now() - started, "the username cap still delays").toBeGreaterThanOrEqual(1_900);
  }, 120_000);
});

describe("host router login throttle", () => {
  // SR-2, both modes: a named proxy's clients are told apart; without one, the shared address is delayed, not refused.
  test("behind a named proxy the throttled pair is refused and another forwarded client signs in", async () => {
    const { url } = await hostRouter(1, ["127.0.0.1/32"]);
    for (let i = 0; i < 10; i += 1) {
      expect((await post(`${url}/host/api/login`, { username: "admin", password: "wrong" }, { "x-forwarded-for": "10.5.0.1" })).status).toBe(401);
    }
    expect((await post(`${url}/host/api/login`, { username: "admin", password: "admin-pass-123" }, { "x-forwarded-for": "10.5.0.1" })).status).toBe(429);
    expect((await post(`${url}/host/api/login`, { username: "admin", password: "admin-pass-123" }, { "x-forwarded-for": "10.5.0.2" })).status).toBe(200);
  }, 60_000);

  test("with proxy hops but no named proxy, the shared address is delayed, never refused", async () => {
    const { url } = await hostRouter(1);
    for (let i = 0; i < 10; i += 1) {
      expect((await post(`${url}/host/api/login`, { username: "admin", password: "wrong" }, { "x-forwarded-for": "10.5.0.1" })).status).toBe(401);
    }
    const started = Date.now();
    expect((await post(`${url}/host/api/login`, { username: "admin", password: "admin-pass-123" }, { "x-forwarded-for": "10.5.0.1" })).status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_900);
  }, 60_000);

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

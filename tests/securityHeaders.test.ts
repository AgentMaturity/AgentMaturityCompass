import { mkdtempSync, rmSync } from "node:fs";
import http, { createServer, request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createApiServer, handleRequest } from "../api/index.js";
import { initUsersConfig } from "../src/auth/authApi.js";
import { gatewayConfigSchema, initGatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initHostDb } from "../src/workspaces/hostDb.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { initWorkspace } from "../src/workspace.js";

// A route that fails on demand, for the 500 case (vi.mock is hoisted above the imports).
vi.mock("../src/studio/onboardingApi.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/studio/onboardingApi.js")>(),
  onboardingStatusForApi: () => { throw new Error("forced failure for the 500 path"); }
}));

// LIVE-RUNTIME-07 (D-R6): nosniff, DENY, same-origin and no-store on every JSON server's own responses; HSTS only for
// HTTPS a trusted hop vouches for; the console keeps r2-d's CSP and is cacheable.
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function dir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

function send(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: IncomingHttpHeaders }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: { connection: "close", ...options.headers } }, (res) => {
      res.resume();
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on("error", rejectPromise);
    req.end(options.body);
  });
}

function expectJsonHeaders(headers: IncomingHttpHeaders, label: string): void {
  expect(headers["x-content-type-options"], label).toBe("nosniff");
  expect(headers["x-frame-options"], label).toBe("DENY");
  expect(headers["referrer-policy"], label).toBe("same-origin");
  expect(headers["cache-control"], label).toBe("no-store");
}

async function studio(options: { trustedProxyHops?: number; allowedCidrs?: string[] } = {}) {
  const workspace = dir("amc-security-headers-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: "owner-password" }); // a signed users file, so login parses its body
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-security-headers", ...options });
  closers.push(() => api.close());
  return api;
}

describe("Studio", () => {
  test("JSON responses, errors included, carry the headers and no-store", async () => {
    const { port } = await studio();
    const admin = { "x-amc-admin-token": "admin-token-security-headers" };
    for (const [path, status, headers] of [["/healthz", 200, {}], ["/auth/me", 401, {}], ["/console/snapshot", 401, {}], ["/nonexistent", 404, admin]] as const) {
      const response = await send(port, path, { headers });
      expect(response.status, path).toBe(status);
      expectJsonHeaders(response.headers, path);
    }
    const failed = await send(port, "/onboarding/status", { headers: admin });
    expect(failed.status).toBe(500);
    expectJsonHeaders(failed.headers, "500");
  }, 60_000);

  test("console pages and assets keep r2-d's CSP and are not no-store", async () => {
    const { port } = await studio();
    for (const path of ["/console/", "/console/assets/app.js"]) {
      const response = await send(port, path);
      expect(response.status, path).toBe(200);
      expect(String(response.headers["content-security-policy"]), path).toContain("default-src 'self'");
      expect(response.headers["cache-control"], path).toBeUndefined();
      expect(response.headers["x-content-type-options"], path).toBe("nosniff");
    }
  }, 60_000);

  test("HSTS only when a trusted hop says https", async () => {
    const trusted = await studio({ trustedProxyHops: 1, allowedCidrs: ["127.0.0.1/32", "::1/128"] });
    expect((await send(trusted.port, "/healthz", { headers: { "x-forwarded-proto": "https" } })).headers["strict-transport-security"]).toBe("max-age=31536000");
    expect((await send(trusted.port, "/healthz")).headers["strict-transport-security"]).toBeUndefined();
    const untrusted = await studio({ trustedProxyHops: 0 });
    expect((await send(untrusted.port, "/healthz", { headers: { "x-forwarded-proto": "https" } })).headers["strict-transport-security"]).toBeUndefined();
    const unlisted = await studio({ trustedProxyHops: 1, allowedCidrs: ["10.0.0.0/8"] });
    expect((await send(unlisted.port, "/healthz", { headers: { "x-forwarded-proto": "https" } })).headers["strict-transport-security"]).toBeUndefined();
  }, 60_000);
});

describe("host router, gateway and hosted API", () => {
  test("the router's own responses carry the headers", async () => {
    const hostDir = dir("amc-security-headers-host-");
    initHostDb(hostDir);
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0 });
    closers.push(() => router.close());
    expectJsonHeaders((await send(router.port, "/host/healthz")).headers, "/host/healthz");
  }, 60_000);

  test("the gateway's health response carries the headers", async () => {
    const workspace = dir("amc-security-headers-gateway-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initGatewayConfig(workspace, gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
      upstreams: { test: { baseUrl: "http://127.0.0.1:9", auth: { type: "none" }, allowLocalhost: true } },
      routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: false }]
    }));
    const gateway = await startGateway({ workspace });
    closers.push(() => gateway.close());
    expectJsonHeaders((await send(gateway.port, "/__amc/health")).headers, "/__amc/health");
  }, 60_000);

  test("the hosted API's health response carries the headers", async () => {
    const server = createServer(handleRequest as http.RequestListener);
    const port = await new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));
    closers.push(() => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }));
    expectJsonHeaders((await send(port, "/api/health")).headers, "/api/health");
  }, 60_000);
});

// LIVE-RUNTIME-12 (D-R9): keep-alive above a reverse proxy's idle timeout, headers timeout above it, a request timeout
// on every server but the gateway (long uploads).
describe("server timeouts", () => {
  const expectTimeouts = (server: http.Server, requestTimeout: number | null, label: string): void => {
    expect(server.keepAliveTimeout, label).toBe(65_000);
    expect(server.headersTimeout, label).toBe(70_000);
    if (requestTimeout !== null) expect(server.requestTimeout, label).toBe(requestTimeout);
  };

  test("Studio, the router, the gateway and the hosted API", async () => {
    const api = await studio();
    expectTimeouts(api.server, 120_000, "studio");
    const hostDir = dir("amc-timeouts-host-");
    initHostDb(hostDir);
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0 });
    closers.push(() => router.close());
    expectTimeouts(router.server, 120_000, "router");
    const workspace = dir("amc-timeouts-gateway-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initGatewayConfig(workspace, gatewayConfigSchema.parse({
      listen: { host: "127.0.0.1", port: 0 },
      redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
      upstreams: { test: { baseUrl: "http://127.0.0.1:9", auth: { type: "none" }, allowLocalhost: true } },
      routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: false }]
    }));
    const gateway = await startGateway({ workspace });
    closers.push(() => gateway.close());
    expectTimeouts(gateway.server, null, "gateway");
    expect(gateway.server.requestTimeout, "the gateway keeps Node's request timeout").toBe(createServer().requestTimeout);
    expectTimeouts(createApiServer(), 120_000, "hosted API");
  }, 60_000);
});


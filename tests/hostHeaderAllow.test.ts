import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { hostAllowed, allowedHostnamesFrom } from "../src/studio/hostAllow.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { createWorkspaceRecord, initHostDb } from "../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-19 (D-R12): a request that did not come through a trusted hop must name an IP literal, localhost, a
// *.localhost name or a configured host; DNS rebinding (attacker.example resolving to 127.0.0.1) is refused.
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

function get(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; body: string; setCookie: string | string[] | undefined }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, headers: { connection: "close", ...headers } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body, setCookie: res.headers["set-cookie"] }));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

async function studio(options: { trustedProxyHops?: number; corsAllowedOrigins?: string[] } = {}): Promise<number> {
  const workspace = dir("amc-host-allow-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-host-allow", ...options });
  closers.push(() => api.close());
  return api.port;
}

describe("hostAllowed", () => {
  test("IP literals, localhost and configured names pass; any other name does not", () => {
    const configured = allowedHostnamesFrom(["https://studio.example.com", "http://[fd00::1]:8080", null]);
    expect(hostAllowed("127.0.0.1:3212", configured)).toBe(true);
    expect(hostAllowed("[::1]:3212", configured)).toBe(true);
    expect(hostAllowed("localhost:3212", configured)).toBe(true);
    expect(hostAllowed("app.localhost", configured)).toBe(true);
    expect(hostAllowed("STUDIO.example.com", configured)).toBe(true);
    expect(hostAllowed("attacker.example:3212", configured)).toBe(false);
    expect(hostAllowed("localhost.attacker.example", configured)).toBe(false);
    expect(hostAllowed(undefined, configured)).toBe(false);
  });
});

describe("Studio host header check", () => {
  test("IP and localhost hosts pass; a rebinding name is refused before routing", async () => {
    const port = await studio();
    expect((await get(port, "/healthz", { host: `127.0.0.1:${port}` })).status).toBe(200);
    expect((await get(port, "/healthz", { host: `localhost:${port}` })).status).toBe(200);
    const refused = await get(port, "/healthz", { host: `attacker.example:${port}`, origin: `http://attacker.example:${port}` });
    expect(refused.status).toBe(403);
    expect(JSON.parse(refused.body)).toEqual({ error: "host not allowed" });
  }, 60_000);

  test("a trusted hop is not checked, and a configured origin's host passes", async () => {
    const trusted = await studio({ trustedProxyHops: 1 });
    expect((await get(trusted, "/healthz", { host: `attacker.example:${trusted}` })).status).toBe(200);
    const named = await studio({ corsAllowedOrigins: ["https://studio.example.com"] });
    expect((await get(named, "/healthz", { host: "studio.example.com" })).status).toBe(200);
  }, 60_000);

  test("a request with no Host header is refused", async () => {
    const port = await studio();
    const response = await new Promise<string>((resolvePromise, rejectPromise) => {
      const socket = connect(port, "127.0.0.1", () => socket.write("GET /healthz HTTP/1.0\r\n\r\n"));
      let data = "";
      socket.on("data", (chunk: Buffer) => { data += chunk.toString("utf8"); });
      socket.on("end", () => resolvePromise(data));
      socket.on("error", rejectPromise);
    });
    expect(response.split("\r\n")[0]).toContain("403");
  }, 60_000);
});

describe("host router host header check", () => {
  test("the demo workspace mints no session for a rebinding host", async () => {
    const hostDir = dir("amc-host-allow-router-");
    initHostDb(hostDir);
    createWorkspaceRecord({ hostDir, workspaceId: "demo", name: "Demo Workspace" });
    initWorkspace({ workspacePath: hostWorkspaceDir(hostDir, "demo"), trustBoundaryMode: "isolated" });
    const probe = createServer();
    const port = await new Promise<number>((done) => probe.listen(0, "127.0.0.1", () => done((probe.address() as { port: number }).port)));
    await new Promise<void>((done) => probe.close(() => done()));
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port, defaultWorkspaceId: "demo", allowLocalDemoWorkspace: true });
    closers.push(() => router.close());
    const refused = await get(port, "/w/demo/console/", { host: `attacker.example:${port}` });
    expect(refused.status).toBe(403);
    expect(JSON.parse(refused.body)).toEqual({ error: "host not allowed" });
    expect(refused.setCookie).toBeUndefined();
    expect((await get(port, "/host/healthz", { host: `localhost:${port}` })).status).toBe(200);
  }, 60_000);
});

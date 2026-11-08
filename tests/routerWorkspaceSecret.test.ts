/**
 * Follow-up 11 (DNS-rebinding residual): a workspace API the host router starts binds 127.0.0.1 and trusts its loopback
 * peer as the router's one forwarding hop, so a page whose name rebinds to 127.0.0.1 (or any local process) reaching the
 * workspace port directly skipped the router's Host check by adding X-Forwarded-For. The router now sends a per-boot
 * secret on every request it proxies, and those workspace APIs refuse any request without it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const seen = vi.hoisted(() => ({ apis: [] as Array<{ port: number; routerSecret?: string }> }));
vi.mock("../src/studio/studioServer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/studio/studioServer.js")>();
  return {
    ...actual,
    startStudioApiServer: async (options: Parameters<typeof actual.startStudioApiServer>[0]) => {
      const api = await actual.startStudioApiServer(options);
      seen.apis.push({ port: api.port, routerSecret: (options as { routerSecret?: string }).routerSecret });
      return api;
    }
  };
});

import { ROUTER_SECRET_HEADER } from "../src/studio/routerSecret.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { createWorkspaceRecord, initHostDb } from "../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
  seen.apis.length = 0;
});

function get(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, headers: { connection: "close", ...headers } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

describe("workspace APIs behind the host router", () => {
  test("refuse a direct loopback request without the router's secret, rebinding host or not; the router's own requests pass", async () => {
    const hostDir = mkdtempSync(join(tmpdir(), "amc-router-secret-"));
    roots.push(hostDir);
    initHostDb(hostDir);
    createWorkspaceRecord({ hostDir, workspaceId: "demo", name: "Demo Workspace" });
    initWorkspace({ workspacePath: hostWorkspaceDir(hostDir, "demo"), trustBoundaryMode: "isolated" });
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0, defaultWorkspaceId: "demo", allowLocalDemoWorkspace: true });
    closers.push(() => router.close());

    // Through the router: the workspace API starts, and the router's proxied request carries the secret.
    const proxied = await get(router.port, "/w/demo/console/", { host: `localhost:${router.port}`, [ROUTER_SECRET_HEADER]: "a client guess" });
    expect(proxied.status).toBe(200);
    expect(seen.apis).toHaveLength(1);
    const { port, routerSecret } = seen.apis[0]!;
    expect(routerSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Directly: the rebinding page (its own Host, and X-Forwarded-For to pose as the router's hop), and a plain local client.
    const rebinding = await get(port, "/healthz", { host: `attacker.example:${port}`, "x-forwarded-for": "203.0.113.9" });
    expect(rebinding.status).toBe(403);
    expect(JSON.parse(rebinding.body)).toEqual({ error: "this workspace API answers its host router only" });
    expect((await get(port, "/healthz", { host: `127.0.0.1:${port}` })).status).toBe(403);
    expect((await get(port, "/healthz", { host: `127.0.0.1:${port}`, [ROUTER_SECRET_HEADER]: "x".repeat(43) })).status).toBe(403);
    expect((await get(port, "/healthz", { host: `127.0.0.1:${port}`, [ROUTER_SECRET_HEADER]: routerSecret! })).status).toBe(200);
  }, 120_000);

  test("a Studio started without a router secret (single-workspace mode) is unchanged", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-router-secret-single-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-single" });
    closers.push(() => api.close());
    expect((await get(api.port, "/healthz", { host: `127.0.0.1:${api.port}` })).status).toBe(200);
  }, 60_000);
});

import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest, type ClientRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { addUser, initUsersConfig } from "../src/auth/authApi.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { createHostUser, initHostDb } from "../src/workspaces/hostDb.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-13: at most 64 open event streams per hub; the next is 503 until one closes.
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
const streams: ClientRequest[] = [];
afterEach(async () => {
  while (streams.length > 0) streams.pop()!.destroy();
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function dir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

/** Opens a stream and resolves with its status once the response headers arrive; the stream stays open. */
function open(port: number, path: string, cookie: string): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, agent: false, headers: { cookie } }, (res) => {
      resolvePromise(res.statusCode ?? 0);
      res.resume();
    });
    req.on("error", rejectPromise);
    streams.push(req);
    req.end();
  });
}

async function login(url: string, path: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  return String(response.headers.get("set-cookie") ?? "").split(";", 1)[0]!;
}

async function expectCap(port: number, path: string, cookie: string): Promise<void> {
  const statuses = await Promise.all(Array.from({ length: 64 }, () => open(port, path, cookie)));
  expect(statuses.every((status) => status === 200)).toBe(true);
  expect(await open(port, path, cookie), "the 65th stream").toBe(503);
  streams.shift()!.destroy();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  expect(await open(port, path, cookie), "a closed stream frees its slot").toBe(200);
}

describe("event stream caps", () => {
  test("/events/org admits 64 streams", async () => {
    const workspace = dir("amc-sse-cap-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-password" });
    addUser({ workspace, username: "viewer", password: "viewer-password", roles: ["VIEWER"] });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-sse-cap" });
    closers.push(() => api.close());
    await expectCap(api.port, "/events/org", await login(api.url, "/auth/login", "viewer", "viewer-password"));
  }, 120_000);

  test("/host/events admits 64 streams", async () => {
    const hostDir = dir("amc-sse-cap-host-");
    initHostDb(hostDir);
    createHostUser({ hostDir, username: "admin", password: "admin-pass-123", isHostAdmin: true });
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0 });
    closers.push(() => router.close());
    await expectCap(router.port, "/host/events", await login(`http://127.0.0.1:${router.port}`, "/host/api/login", "admin", "admin-pass-123"));
  }, 120_000);
});

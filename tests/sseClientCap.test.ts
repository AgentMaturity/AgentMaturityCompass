import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest, type ClientRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { addUser, initUsersConfig } from "../src/auth/authApi.js";
import { createStreamCap } from "../src/studio/rateLimiter.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { createHostUser, initHostDb } from "../src/workspaces/hostDb.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-13 and SR-8: at most 64 open event streams per hub and 4 per principal. A principal at its limit loses its
// own oldest stream; one signed-in user can no longer hold all 64 and lock everyone else out.
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

/** Opens a stream: its status once the headers arrive, and whether the server has since ended it. It stays open. */
function open(port: number, path: string, cookie: string): Promise<{ status: number; ended: () => boolean }> {
  return new Promise((resolvePromise, rejectPromise) => {
    let ended = false;
    const req = httpRequest({ host: "127.0.0.1", port, path, agent: false, headers: { cookie } }, (res) => {
      res.on("close", () => { ended = true; });
      resolvePromise({ status: res.statusCode ?? 0, ended: () => ended });
      res.resume();
    });
    req.on("error", (error) => (ended ? undefined : rejectPromise(error)));
    streams.push(req);
    req.end();
  });
}

async function login(url: string, path: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  return String(response.headers.get("set-cookie") ?? "").split(";", 1)[0]!;
}

const settle = () => new Promise((resolvePromise) => setTimeout(resolvePromise, 200));

/** User A at its limit of 4 loses its oldest stream to a 5th; user B still connects. */
async function expectPerPrincipalLimit(port: number, path: string, cookieA: string, cookieB: string): Promise<void> {
  const first = await open(port, path, cookieA);
  const rest = await Promise.all(Array.from({ length: 3 }, () => open(port, path, cookieA)));
  expect([first, ...rest].map((stream) => stream.status)).toEqual([200, 200, 200, 200]);
  const fifth = await open(port, path, cookieA);
  expect(fifth.status, "a 5th stream for the same user").toBe(200);
  await settle();
  expect(first.ended(), "the user's oldest stream was closed to make room").toBe(true);
  expect(rest.some((stream) => stream.ended())).toBe(false);
  expect((await open(port, path, cookieB)).status, "another user still connects").toBe(200);
  await settle();
  expect([...rest, fifth].some((stream) => stream.ended()), "and takes nothing from the first user").toBe(false);
}

describe("stream cap", () => {
  test("per principal, the oldest gives way; a full hub refuses new principals but not privileged ones", () => {
    const cap = createStreamCap(3, 2);
    const closed: string[] = [];
    const a1 = cap.admit("a", () => closed.push("a1"))!;
    cap.admit("a", () => closed.push("a2"));
    expect(cap.admit("a", () => closed.push("a3")), "a at its limit loses its oldest").not.toBeNull();
    expect(closed).toEqual(["a1"]);
    a1(); // the evicted stream's own close event: already released, so nothing changes
    expect(cap.admit("b", () => undefined)).not.toBeNull();
    expect(cap.admit("c", () => undefined), "the hub is full (a: 2, b: 1)").toBeNull();
    expect(cap.admit("admin", () => undefined, true), "a privileged principal is always admitted").not.toBeNull();
  });
});

describe("event stream caps", () => {
  test("/events/org: 4 streams per user, the oldest gives way, and another user connects", async () => {
    const workspace = dir("amc-sse-cap-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-password" });
    addUser({ workspace, username: "viewer", password: "viewer-password", roles: ["VIEWER"] });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-sse-cap" });
    closers.push(() => api.close());
    await expectPerPrincipalLimit(api.port, "/events/org", await login(api.url, "/auth/login", "viewer", "viewer-password"),
      await login(api.url, "/auth/login", "owner", "owner-password"));
  }, 120_000);

  test("/host/events: 4 streams per host user, the oldest gives way, and the host admin connects", async () => {
    const hostDir = dir("amc-sse-cap-host-");
    initHostDb(hostDir);
    createHostUser({ hostDir, username: "admin", password: "admin-pass-123", isHostAdmin: true });
    createHostUser({ hostDir, username: "member", password: "member-pass-123", isHostAdmin: false });
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0 });
    closers.push(() => router.close());
    const url = `http://127.0.0.1:${router.port}`;
    await expectPerPrincipalLimit(router.port, "/host/events", await login(url, "/host/api/login", "member", "member-pass-123"),
      await login(url, "/host/api/login", "admin", "admin-pass-123"));
  }, 120_000);
});

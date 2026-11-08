import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createHostUser, createWorkspaceRecord, initHostDb } from "../src/workspaces/hostDb.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";

// LIVE-RUNTIME-15: the host portfolio page runs no inline script, carries the console CSP, and its script never
// interprets a workspace name as markup.
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("host portfolio page", () => {
  test("no inline script, the console CSP, a textContent-only script, and names served as data", async () => {
    const hostDir = mkdtempSync(join(tmpdir(), "amc-host-page-"));
    roots.push(hostDir);
    initHostDb(hostDir);
    createHostUser({ hostDir, username: "admin", password: "admin-pass-123", isHostAdmin: true });
    createWorkspaceRecord({ hostDir, workspaceId: "ws-x", name: "<img src=x onerror=1>" });
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port: 0 });
    closers.push(() => router.close());
    const base = `http://127.0.0.1:${router.port}`;

    const page = await fetch(`${base}/host/console/host.html`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain("<script type='module' src='/host/console/assets/host.js'></script>");
    expect(html.match(/<script(?![^>]*\bsrc=)[^>]*>/g)).toBeNull();
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");

    const script = await fetch(`${base}/host/console/assets/host.js`);
    expect(script.headers.get("content-type")).toContain("javascript");
    const source = await script.text();
    expect(source).not.toContain("innerHTML");
    expect(source).toContain("textContent");
    expect(source).toContain("encodeURIComponent");

    const login = await fetch(`${base}/host/api/login`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-pass-123" }) });
    const cookie = String(login.headers.get("set-cookie") ?? "").split(";", 1)[0]!;
    const list = await (await fetch(`${base}/host/api/workspaces`, { headers: { cookie } })).json() as { workspaces: Array<{ workspaceId: string; name: string }> };
    expect(list.workspaces.find((row) => row.workspaceId === "ws-x")?.name).toBe("<img src=x onerror=1>");
  }, 60_000);
});

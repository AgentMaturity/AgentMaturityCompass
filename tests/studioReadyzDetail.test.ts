import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initUsersConfig } from "../src/auth/authApi.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { ensureAgentToken } from "../src/studio/studioState.js";
import { valuePolicyPath } from "../src/value/valueStore.js";
import { initWorkspace } from "../src/workspace.js";

// LIVE-RUNTIME-14 (D-R10): anonymous /readyz keeps status and reason codes for probes; messages and checks go only to
// signed-in humans, decided without writing a 403 (an agent gets the anonymous body).
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Studio readiness detail", () => {
  test("anonymous: codes only and no checks; OWNER: messages and checks; agent: the anonymous body", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-readyz-detail-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace, username: "owner", password: "owner-password" });
    writeFileSync(valuePolicyPath(workspace), `${"valuePolicy: [tampered"}\n`); // a NOT_READY reason with a message after its code
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-readyz" });
    closers.push(() => api.close());

    const anonymous = await fetch(`${api.url}/readyz`);
    expect(anonymous.status).toBe(503);
    const anonymousBody = await anonymous.json() as { status: string; reasons: string[]; checks?: unknown };
    expect(anonymousBody.status).toBe("NOT_READY");
    expect(anonymousBody.reasons).toContain("VALUE_POLICY_UNTRUSTED");
    expect(anonymousBody.reasons.every((reason) => !reason.includes(":"))).toBe(true);
    expect(anonymousBody).not.toHaveProperty("checks");

    const login = await fetch(`${api.url}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "owner-password" }) });
    const cookie = String(login.headers.get("set-cookie") ?? "").split(";", 1)[0]!;
    const owner = await (await fetch(`${api.url}/readyz`, { headers: { cookie } })).json() as { reasons: string[]; checks?: unknown };
    expect(owner).toHaveProperty("checks");
    expect(owner.reasons.some((reason) => reason.startsWith("VALUE_POLICY_UNTRUSTED:"))).toBe(true);

    const agent = await fetch(`${api.url}/readyz`, { headers: { "x-amc-agent-token": ensureAgentToken(workspace, "default").token } });
    expect(agent.status).toBe(503);
    expect(await agent.json()).not.toHaveProperty("checks");
  }, 60_000);
});

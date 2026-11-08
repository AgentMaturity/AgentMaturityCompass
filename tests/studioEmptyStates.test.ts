import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initUsersConfig } from "../src/auth/authApi.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { ensureAgentToken } from "../src/studio/studioState.js";
import { initWorkspace } from "../src/workspace.js";

// Coordinator section 9 (P1): on a fresh signed-in workspace the console's calls answered 500, 403 and 404. A missing
// contract or schema is a legitimately empty state: a status and body the console renders as empty, never a 500.
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

async function freshStudio(): Promise<{ url: string; cookie: string; agentToken: string }> {
  const workspace = mkdtempSync(join(tmpdir(), "amc-empty-states-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: "owner-password" });
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-empty-states" });
  closers.push(() => api.close());
  const login = await fetch(`${api.url}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "owner-password" }) });
  return { url: api.url, cookie: String(login.headers.get("set-cookie") ?? "").split(";", 1)[0]!, agentToken: ensureAgentToken(workspace, "default").token };
}

const call = async (url: string, headers: Record<string, string>, method = "GET", body?: unknown) => {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
};

describe("fresh workspace empty states", () => {
  test("value routes answer 404 VALUE_CONTRACT_MISSING, never 500; an unsafe agent id is 400", async () => {
    const { url, cookie } = await freshStudio();
    for (const path of ["/value/snapshot/latest", "/value/report", "/value/contracts", "/value/contracts?scope=agent&id=default"]) {
      const response = await call(`${url}${path}`, { cookie });
      expect(response.status, path).toBe(404);
      expect(response.json, path).toMatchObject({ error: "value contract missing", code: "VALUE_CONTRACT_MISSING" });
    }
    expect((await call(`${url}/value/contracts?scope=agent&id=..%2F..%2Fusers`, { cookie })).status).toBe(400);
  }, 60_000);

  test("the outcomes report without a contract is an empty 200 the outcomes page renders", async () => {
    const { url, cookie } = await freshStudio();
    const response = await call(`${url}/outcomes/report?agentId=default&window=14d`, { cookie });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ agentId: "default", status: "OUTCOME_CONTRACT_MISSING", report: null });
  }, 60_000);

  test("a schema that is not generated, or unknown, is 404", async () => {
    const { url, cookie } = await freshStudio();
    for (const name of ["amcpass.schema.json", "no-such-schema"]) {
      const response = await call(`${url}/standard/schemas/${name}`, { cookie });
      expect(response.status, name).toBe(404);
      expect(response.json, name).toMatchObject({ code: "STANDARD_SCHEMA_NOT_GENERATED" });
    }
  }, 60_000);

  test("an OWNER session runs the governor check; an agent still checks only itself", async () => {
    const { url, cookie, agentToken } = await freshStudio();
    const owner = await call(`${url}/governor/check`, { cookie }, "POST", { agentId: "default", actionClass: "READ_ONLY", riskTier: "low", mode: "SIMULATE" });
    expect(owner.status).toBe(200);
    expect(owner.json).toHaveProperty("allowed");
    const other = await call(`${url}/governor/check`, { "x-amc-agent-token": agentToken }, "POST", { agentId: "other-agent", actionClass: "READ_ONLY" });
    expect(other.status).toBe(403);
    expect(other.json).toEqual({ error: "scope does not include this agent" });
  }, 60_000);

  test("the exploit-confirmation lists the console reads are served to human roles only", async () => {
    const { url, cookie, agentToken } = await freshStudio();
    expect(await call(`${url}/shield/exploit-confirmation/scopes`, { cookie })).toEqual({ status: 200, json: { scopes: [], total: 0 } });
    expect(await call(`${url}/shield/exploit-confirmation/proofs`, { cookie })).toEqual({ status: 200, json: { proofs: [], total: 0 } });
    expect((await call(`${url}/shield/exploit-confirmation/scopes`, { "x-amc-agent-token": agentToken })).status).toBe(403);
  }, 60_000);
});

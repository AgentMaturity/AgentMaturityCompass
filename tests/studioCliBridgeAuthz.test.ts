import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { ensureAgentToken } from "../src/studio/studioState.js";
import { initUsersConfig } from "../src/auth/authApi.js";

/**
 * The CLI bridge must be AUTHORIZED, not merely authenticated.
 *
 * `POST /cli/exec` spawns `amc <argv>` in the workspace and its own banner calls
 * it "exposes all CLI commands via API". It sits after Studio's global
 * `authenticate()` gate and carries no `requireRoles`, no `hasScope` and no
 * `verifyLeaseForScope`.
 *
 * `authenticate()` accepts `x-amc-agent-token` and returns roles `["AGENT"]` —
 * and an agent token is the credential AMC hands to the very agents it governs,
 * issued with `toolhub:intent`, `toolhub:execute`, `governor:check` and
 * `receipt:verify` and nothing else. So an agent could reach the whole CLI:
 * signing configs, rewriting policy, issuing leases — authority its scopes never
 * granted.
 *
 * The `confirm: true` guard on dangerous commands is not a barrier either; the
 * caller supplies it.
 */
const PASS = "cli-bridge-authz-test-passphrase";
const dirs: string[] = [];
const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

async function pickFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function studio(): Promise<{ url: string; workspace: string; agentToken: string }> {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-authz-")));
  dirs.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  // A SIGNED users config, so the role check is the thing under test. Without
  // one, `enforceRoleOrAdmin` returns 403 to every non-admin regardless of roles
  // ("users signature invalid; console is read-only") -- and an earlier version
  // of this file passed for that reason, not because AGENT was excluded.
  // Mutation testing found it: adding AGENT to the allowed roles left it green.
  initUsersConfig({ workspace, username: "owner", password: "owner-password" });
  const port = await pickFreePort();
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port, token: "admin-secret" });
  servers.push(api);
  return { url: api.url, workspace, agentToken: ensureAgentToken(workspace, "default").token };
}

const post = (url: string, body: unknown, headers: Record<string, string>) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("an agent token cannot reach the CLI bridge", () => {
  it("refuses /cli/exec presented with an agent token", async () => {
    const { url, agentToken } = await studio();

    const response = await post(`${url}/cli/exec`, { command: "version" }, { "x-amc-agent-token": agentToken });

    expect(response.status, "an AGENT is authenticated but not authorised here")
      .toBe(403);
    expect(await response.text(), "and refused by the ROLE check specifically")
      .toContain("requires role");
  }, 30_000);

  it("refuses /cli/batch the same way", async () => {
    const { url, agentToken } = await studio();

    const response = await post(`${url}/cli/batch`, { commands: ["version"] }, { "x-amc-agent-token": agentToken });

    expect(response.status).toBe(403);
  }, 30_000);

  it("still refuses an unauthenticated caller", async () => {
    const { url } = await studio();
    const response = await post(`${url}/cli/exec`, { command: "version" }, {});
    expect(response.status).toBe(401);
  }, 30_000);

  it("still lets the admin token through", async () => {
    // The fix must not close the route to the principal it exists for.
    const { url } = await studio();

    const response = await post(`${url}/cli/exec`, { command: "version" }, { "x-amc-token": "admin-secret" });

    expect(response.status, "an operator with the admin token keeps the bridge")
      .not.toBe(403);
  }, 30_000);
});

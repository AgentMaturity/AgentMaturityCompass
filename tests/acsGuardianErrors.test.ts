/**
 * P2-19 security review 3: an unexpected error's message never reaches the ACS caller; it goes to local stderr only.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/bridge/hookControlRoute.js", () => ({
  handleHookControlRequest: () => { throw new Error("SECRET-DETAIL /private/ledger/path"); },
}));
vi.mock("../src/bridge/hookIngress.js", async (original) => ({
  ...(await original<typeof import("../src/bridge/hookIngress.js")>()),
  consumeObservedHookRateLimit: () => { throw new Error("SECRET-DETAIL SQLITE_CORRUPT /private/ledger/path"); },
}));

const { handleAcsGuardianRequest } = await import("../src/standards/acs/acsGuardian.js");
const { startBridgeServer } = await import("../src/bridge/bridgeServer.js");
const { issueLeaseToken } = await import("../src/leases/leaseSigner.js");
const { workspaceIdFromDirectory } = await import("../src/workspaces/workspaceId.js");
const { ACS_GUARDIAN_PATH, ACS_GUARDIAN_ROUTE } = await import("../src/standards/acs/acsGuardianHttp.js");
const { controlledWorkspace, freePort, removeFixtureWorkspaces } = await import("./helpers/piHookFixtures.js");

const agentId = "acs-errors";
afterEach(() => {
  removeFixtureWorkspaces();
  vi.restoreAllMocks();
});

const request = (workspace: string) => ({ jsonrpc: "2.0", method: "steps/toolCallRequest", id: 1, params: { acs_version: "0.1.0",
  request_id: randomUUID(), timestamp: new Date().toISOString(), metadata: { agent_id: agentId, session_id: randomUUID() },
  payload: { tool: { name: "fs.read" }, arguments: { path: { value: join(workspace, "workspace", "public.txt") } } } } });

describe("ACS guardian error disclosure", () => {
  test("an unexpected control-path error is a deny with a fixed reasoning; the detail goes to stderr", () => {
    const workspace = controlledWorkspace(agentId);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const response = handleAcsGuardianRequest({ workspace, authenticatedAgentId: agentId, rawBody: JSON.stringify(request(workspace)) });
    expect(response).toMatchObject({ result: { decision: "deny", reason_codes: ["amc_decision_unrecorded"] } });
    expect(JSON.stringify(response)).not.toContain("SECRET-DETAIL");
    expect(stderr.mock.calls.some(([line]) => String(line).includes("SECRET-DETAIL"))).toBe(true);
  });

  test("an unexpected route error is a 503 with a fixed body", async () => {
    const workspace = controlledWorkspace(agentId);
    const token = issueLeaseToken({ workspace, workspaceId: workspaceIdFromDirectory(workspace), agentId, ttlMs: 30 * 60_000, scopes: ["hook:control"],
      routeAllowlist: [ACS_GUARDIAN_ROUTE], modelAllowlist: ["*"], maxRequestsPerMinute: 60, maxTokensPerMinute: 1_000, maxCostUsdPerDay: null }).token;
    const port = await freePort();
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const response = await fetch(`http://127.0.0.1:${port}${ACS_GUARDIAN_PATH}`, { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(request(workspace)) });
      const text = await response.text();
      expect(response.status).toBe(503);
      expect(JSON.parse(text)).toMatchObject({ error: { code: -32000, message: "ACS guardian unavailable", data: { reason: "guardian_unavailable" } } });
      expect(text).not.toMatch(/SQLITE|database|SECRET-DETAIL/i);
      expect(stderr.mock.calls.length).toBeGreaterThan(0);
    } finally {
      stderr.mockRestore();
      await bridge.close();
    }
  });
});

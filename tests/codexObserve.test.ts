/**
 * P2-17: Codex observe mode. The installer writes a PostToolUse command hook in Codex 0.165.0's HooksFile shape; AMC's
 * forwarder posts what Codex reports to the Bridge's Codex route, which records digests only and claims "observed".
 * No Codex binary runs here (pending): payloads follow Codex's own post-tool-use input schema at the pin.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { CODEX_FORWARD_PATH, forwardCodexObservation } from "../src/adapters/codex/codexObserveForwarder.js";
import { codexActionId } from "../src/adapters/codex/codexIdentity.js";
import { getHookIntegrationStatus, installHookIntegration, removeHookIntegration } from "../src/adapters/hookIntegration.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { recordCodexPostToolUse } from "../src/bridge/codexObservations.js";
import { CODEX_OBSERVE_PATH } from "../src/bridge/codexObserveHttp.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { HookControlError } from "../src/bridge/hookProviders.js";
import { revokeLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { controlledWorkspace, freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "codex-observed";
afterEach(removeFixtureWorkspaces);

const report = (overrides: Record<string, unknown> = {}) => ({
  hook_event_name: "PostToolUse", session_id: "codex-session", turn_id: "turn-1", transcript_path: null, cwd: "/w", model: "gpt-test",
  permission_mode: "default", tool_name: "Bash", tool_use_id: "call-1", tool_input: { command: "cat secret.txt" }, tool_response: { output: "TOP-SECRET" },
  ...overrides,
});

function ledgerRow(workspace: string, id: string): Record<string, unknown> | null {
  const ledger = openLedger(workspace);
  try {
    const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id LIKE ? LIMIT 1").get(`${id}%`) as { meta_json: string } | undefined;
    return row ? JSON.parse(row.meta_json) as Record<string, unknown> : null;
  } finally {
    ledger.close();
  }
}

describe("Codex observe installation", () => {
  test("install writes one PostToolUse command hook running AMC's forwarder, with single-quoted paths", () => {
    const workspace = controlledWorkspace(agentId);
    const result = installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" });
    expect(result).toMatchObject({ applied: true, provider: "codex", mode: "observe" });
    const file = JSON.parse(readFileSync(join(workspace, ".codex", "hooks.json"), "utf8")) as { hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>> };
    expect(Object.keys(file.hooks)).toEqual(["PostToolUse"]);
    const handler = file.hooks.PostToolUse![0]!.hooks[0]!;
    expect(handler).toMatchObject({ type: "command", timeout: 10 });
    expect(handler.command).toMatch(/^'[^']+node[^']*' '[^']+codexObserveForwarder\.js' '[^']+'$/);
    expect(getHookIntegrationStatus({ workspace, provider: "codex" }).state).toBe("installed");
  });

  test("control mode is refused: Codex's PreToolUse fails open", () => {
    const workspace = controlledWorkspace(agentId);
    expect(() => installHookIntegration({ workspace, provider: "codex", agentId, mode: "control" })).toThrow(/observe mode only/);
  });

  test("a .codex/hooks.json AMC did not write is never overwritten", () => {
    const workspace = controlledWorkspace(agentId);
    mkdirSync(join(workspace, ".codex"));
    writeFileSync(join(workspace, ".codex", "hooks.json"), "{\"hooks\":{}}\n");
    expect(() => installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" })).toThrow(/does not merge Codex hooks/);
    expect(readFileSync(join(workspace, ".codex", "hooks.json"), "utf8")).toBe("{\"hooks\":{}}\n");
  });

  test("remove revokes the lease and removes AMC's hook file", () => {
    const workspace = controlledWorkspace(agentId);
    installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" });
    expect(removeHookIntegration({ workspace, provider: "codex" }).applied).toBe(true);
    expect(existsSync(join(workspace, ".codex", "hooks.json"))).toBe(false);
    expect(getHookIntegrationStatus({ workspace, provider: "codex" }).state).toBe("not-installed");
  });

  test("the hook control route never accepts Codex", () => {
    const workspace = controlledWorkspace(agentId);
    expect(() => handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "codex" as never,
      rawInput: JSON.stringify({ hook_event_name: "PreToolUse" }) })).toThrow(HookControlError);
  });
});

describe("Codex observations", () => {
  test("a report is recorded as observed with digests, never the input or output", () => {
    const workspace = controlledWorkspace(agentId);
    const recorded = recordCodexPostToolUse({ workspace, authenticatedAgentId: agentId, rawInput: JSON.stringify(report()) });
    expect(recorded).toMatchObject({ recorded: true, idempotentReplay: false, provider: "codex" });
    const meta = ledgerRow(workspace, "cxpost_")!;
    expect(meta).toMatchObject({ provider: "codex", claim: "observed", toolName: "Bash", actionId: codexActionId("codex-session", "call-1") });
    expect(JSON.stringify(meta)).not.toMatch(/TOP-SECRET|secret\.txt/);
  });

  test("the same report sent again is a replay; a different one for the same call is kept and flagged", () => {
    const workspace = controlledWorkspace(agentId);
    const rawInput = JSON.stringify(report());
    recordCodexPostToolUse({ workspace, authenticatedAgentId: agentId, rawInput });
    expect(recordCodexPostToolUse({ workspace, authenticatedAgentId: agentId, rawInput }).idempotentReplay).toBe(true);
    expect(() => recordCodexPostToolUse({ workspace, authenticatedAgentId: agentId, rawInput: JSON.stringify(report({ tool_response: { output: "other" } })) }))
      .toThrow(/conflicts/);
  });

  test.each([
    ["an unknown field", report({ extra: 1 })],
    ["another event", report({ hook_event_name: "PreToolUse" })],
    ["a missing tool_use_id", (({ tool_use_id: _omit, ...rest }) => rest)(report())],
    ["an unknown permission mode", report({ permission_mode: "yolo" })],
  ])("a report with %s is refused", (_label, body) => {
    const workspace = controlledWorkspace(agentId);
    expect(() => recordCodexPostToolUse({ workspace, authenticatedAgentId: agentId, rawInput: JSON.stringify(body) })).toThrow(/does not match its schema/);
  });

  test("the forwarder posts to the Bridge route with the installation's lease, end to end", async () => {
    expect(CODEX_FORWARD_PATH).toBe(CODEX_OBSERVE_PATH);
    const workspace = controlledWorkspace(agentId);
    const port = await freePort();
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    try {
      installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe", bridgeBase: `http://127.0.0.1:${port}` });
      await forwardCodexObservation(workspace, JSON.stringify(report({ tool_use_id: "call-forwarded" })));
      expect(ledgerRow(workspace, "cxpost_")).toMatchObject({ toolUseId: "call-forwarded", leaseId: expect.stringMatching(/./) });
      await expect(forwardCodexObservation(workspace, JSON.stringify(report({ extra: 1 })))).rejects.toThrow(/HTTP 400/);
    } finally {
      await bridge.close();
    }
  });

  test("a revoked lease is refused", async () => {
    const workspace = controlledWorkspace(agentId);
    const port = await freePort();
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    try {
      const installed = installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe", bridgeBase: `http://127.0.0.1:${port}` });
      revokeLeaseForCli({ workspace, leaseId: installed.lease.leaseId!, reason: "test" });
      await expect(forwardCodexObservation(workspace, JSON.stringify(report()))).rejects.toThrow(/HTTP 40[13]/);
      expect(ledgerRow(workspace, "cxpost_")).toBeNull();
    } finally {
      await bridge.close();
    }
  });

  test("without a lease the route refuses", async () => {
    const workspace = controlledWorkspace(agentId);
    const port = await freePort();
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    try {
      const response = await fetch(`http://127.0.0.1:${port}${CODEX_OBSERVE_PATH}`, { method: "POST", body: JSON.stringify(report()) });
      expect(response.status).toBe(401);
    } finally {
      await bridge.close();
    }
  });
});

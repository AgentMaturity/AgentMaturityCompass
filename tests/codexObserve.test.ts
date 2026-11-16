/**
 * P2-17: Codex observe mode. The installer writes a PostToolUse command hook in Codex 0.165.0's HooksFile shape; AMC's
 * forwarder posts what Codex reports to the Bridge's Codex route, which records digests only and claims "observed".
 * No Codex binary runs here (pending): payloads follow Codex's own post-tool-use input schema at the pin.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CODEX_FORWARD_PATH, codexLostObservationsPath, forwardCodexObservation, runCodexObserveForwarder } from "../src/adapters/codex/codexObserveForwarder.js";
import { inspectHookHealth } from "../src/watch/hookHealthDiagnostics.js";
import { codexActionId } from "../src/adapters/codex/codexIdentity.js";
import { registerHookIntegrationCommands } from "../src/adapters/hookIntegrationCli.js";
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

describe("Codex hook CLI output", () => {
  test("install and status print the trust steps Codex requires before anything is observed", async () => {
    const workspace = controlledWorkspace(agentId);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line?: unknown) => { lines.push(String(line)); });
    try {
      const run = async (...args: string[]) => {
        const connect = new Command("connect").exitOverride();
        registerHookIntegrationCommands(connect, () => agentId);
        await connect.parseAsync(["node", "connect", "hooks", ...args]);
      };
      await run("install", "--provider", "codex", "--agent", agentId, "--mode", "observe", "--bridge-url", "http://127.0.0.1:3212");
      const installed = lines.splice(0).join("\n");
      expect(installed).toContain("AMC hook installed");
      expect(installed).toContain("Limit: Codex runs this project hook only after you trust it in Codex");
      expect(installed).toMatch(/Next \(in Codex, not in AMC\):\n {2}1\. sign in to Codex[\s\S]*trust the folder[\s\S]*\/hooks/);
      await run("status", "--provider", "codex");
      const status = lines.splice(0).join("\n");
      expect(status).toContain("AMC hook: installed");
      expect(status).toContain("Next (in Codex, not in AMC):");
      await run("install", "--provider", "codex", "--agent", agentId, "--mode", "observe", "--dry-run", "--bridge-url", "http://127.0.0.1:3212");
      expect(lines.join("\n")).not.toContain("Next (in Codex");
    } finally {
      log.mockRestore();
      cwd.mockRestore();
    }
  });
});

describe("Codex observe installation", () => {
  test("install writes a PostToolUse and the session command hooks running AMC's forwarder, with single-quoted paths", () => {
    const workspace = controlledWorkspace(agentId);
    const result = installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" });
    expect(result).toMatchObject({ applied: true, provider: "codex", mode: "observe" });
    const file = JSON.parse(readFileSync(join(workspace, ".codex", "hooks.json"), "utf8")) as { hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>> };
    // PostToolUse plus every session hook Codex documents (whole-session observation; never blocks).
    expect(Object.keys(file.hooks)).toEqual(["PostToolUse", "SessionStart", "SessionEnd", "UserPromptSubmit", "Stop", "SubagentStart", "SubagentStop", "PreCompact",
      "PostCompact", "Interrupt"]);
    expect(file.hooks.SessionEnd![0]!.hooks[0]!.timeout).toBe(3);
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

  test("remove revokes the lease and removes AMC's hook file, and the .codex folder only when AMC made it and it is empty", () => {
    const workspace = controlledWorkspace(agentId);
    installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" });
    expect(removeHookIntegration({ workspace, provider: "codex" }).applied).toBe(true);
    expect(existsSync(join(workspace, ".codex", "hooks.json"))).toBe(false);
    expect(existsSync(join(workspace, ".codex"))).toBe(false);
    expect(getHookIntegrationStatus({ workspace, provider: "codex" }).state).toBe("not-installed");
    // A folder AMC made but that now holds the person's own file stays, and so does a folder that was there before.
    installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" });
    writeFileSync(join(workspace, ".codex", "config.toml"), "# mine\n");
    removeHookIntegration({ workspace, provider: "codex" });
    expect(readFileSync(join(workspace, ".codex", "config.toml"), "utf8")).toBe("# mine\n");
    rmSync(join(workspace, ".codex", "config.toml"));
    installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" });
    removeHookIntegration({ workspace, provider: "codex" });
    expect(existsSync(join(workspace, ".codex"))).toBe(true);
  });

  test("health accepts codex and counts its observations", () => {
    const workspace = controlledWorkspace(agentId);
    installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe" });
    expect(inspectHookHealth({ workspace, provider: "codex" })).toMatchObject({ provider: "codex", status: "awaiting_first_event" });
    recordCodexPostToolUse({ workspace, authenticatedAgentId: agentId, rawInput: JSON.stringify(report()) });
    const health = inspectHookHealth({ workspace, provider: "codex" });
    expect(health.evidence.eventCount).toBe(1);
    expect(health.evidence.lastEvent?.actionId).toBe(codexActionId("codex-session", "call-1"));
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

  // These two were refused before: a field or mode a newer Codex adds must not lose the observation (H-08).
  test.each([
    ["an unknown extra field", report({ extra: 1, tool_use_id: "call-extra" })],
    ["a permission mode AMC does not know yet", report({ permission_mode: "autoReview", tool_use_id: "call-mode" })],
  ])("a report with %s is recorded", (_label, body) => {
    const workspace = controlledWorkspace(agentId);
    expect(recordCodexPostToolUse({ workspace, authenticatedAgentId: agentId, rawInput: JSON.stringify(body) }).idempotentReplay).toBe(false);
    expect(Object.keys(ledgerRow(workspace, "cxpost_") ?? {})).not.toContain("extra");
  });

  test.each([
    ["another event", report({ hook_event_name: "PreToolUse" })],
    ["a missing tool_use_id", (({ tool_use_id: _omit, ...rest }) => rest)(report())],
    ["a permission mode that is not a word", report({ permission_mode: "\u001b[2J" })],
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
      const missing = JSON.stringify((({ tool_use_id: _omit, ...rest }) => rest)(report()));
      await expect(forwardCodexObservation(workspace, missing)).rejects.toThrow(/HTTP 400/);
      // The hook run itself: exit 1 with a line on stderr and a lost-report note that status and health show (H-08).
      const stderr: string[] = [];
      expect(await runCodexObserveForwarder(workspace, async () => missing, (text) => stderr.push(text))).toBe(1);
      expect(stderr.join("")).toMatch(/AMC did not record this Codex tool call: .*HTTP 400.*amc connect hooks status --provider codex/);
      expect(readFileSync(codexLostObservationsPath(workspace), "utf8")).not.toContain("codex-session");
      const status = getHookIntegrationStatus({ workspace, provider: "codex" });
      expect(status.lostObservations).toMatchObject({ count: 1, lastReason: expect.stringMatching(/HTTP 400/) });
      expect(status.issues.join("\n")).toMatch(/1 Codex tool call report was not recorded by AMC/);
      expect(await runCodexObserveForwarder(workspace, async () => JSON.stringify(report({ tool_use_id: "call-ok" })), () => {})).toBe(0);
      removeHookIntegration({ workspace, provider: "codex" });
      expect(existsSync(codexLostObservationsPath(workspace))).toBe(false);
    } finally {
      await bridge.close();
    }
  });

  test("a lost-report reason planted in the workspace reaches status escaped, never as terminal control", () => {
    const workspace = controlledWorkspace(agentId);
    installHookIntegration({ workspace, provider: "codex", agentId, mode: "observe", bridgeBase: "http://127.0.0.1:1" });
    writeFileSync(codexLostObservationsPath(workspace), `${JSON.stringify({ ts: 1, reason: "x\u001b[2J\u001b]0;pwned\u0007\u001b[32mAll reports recorded\n‮ok" })}\n`);
    const status = getHookIntegrationStatus({ workspace, provider: "codex" });
    const shown = status.issues.join("\n");
    expect(shown).toContain("\\u001b[2J");
    expect(shown).not.toMatch(/[\u001b\u0007‮]/);
    expect(status.lostObservations?.lastReason).not.toContain("\n");
    removeHookIntegration({ workspace, provider: "codex" });
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

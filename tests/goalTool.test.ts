import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { initSchedules, saveSchedules } from "../src/autonomy/scheduleStore.js";
import { runDueSchedules } from "../src/autonomy/scheduleRunner.js";
import { goalTool } from "../src/autonomy/goalTool.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";
import type { AgentToolset } from "../src/agent/agentToolset.js";

const dirs: string[] = [];
const toolsets: AgentToolset[] = [];
afterEach(() => {
  for (const toolset of toolsets.splice(0)) toolset.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "goal-tool-fixture-only");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-goal-tool-")));
  dirs.push(dir);
  const checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-goal-tool-checkpoints-")));
  dirs.push(checkpoints);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "goal-tool-session", runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  return dir;
}

function grant(dir: string, actionClass: "READ_ONLY" | "WRITE_HIGH" | null = "READ_ONLY"): void {
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, { ...config, tools: { ...config.tools,
    allowedTools: [...config.tools.allowedTools.filter((tool) => tool.name !== "get_goal"),
      ...(actionClass === null ? [] : [{ name: "get_goal", actionClass }])] } });
}

function tools(dir: string, getGoal?: () => unknown): AgentToolset {
  const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "goal-tool-session",
    ...(getGoal === undefined ? {} : { getGoal }) });
  toolsets.push(toolset);
  return toolset;
}

let calls = 0;
const call = (args: unknown = {}) => ({ callId: `goal-query-${++calls}`, toolName: "get_goal",
  rawArguments: JSON.stringify(args), sessionId: "goal-tool-session", turn: 1, step: 1, parentToken: null,
  dispatch: "native" as const, signal: new AbortController().signal });

const progress = { scheduleId: "review", claimId: "owned-claim", round: 2, maxRounds: 8,
  status: "active", stopReason: null, revision: 4, sessionId: "round-session" };

describe("get_goal is a signed, read-only view of owner-composed progress", () => {
  it("requires the current signed grant before reading the getter", async () => {
    const dir = workspace();
    const getGoal = vi.fn(() => progress);
    const toolset = tools(dir, getGoal);
    expect(toolset.seam.schemas()?.map((schema) => schema.name)).not.toContain("get_goal");
    expect((await toolset.seam.execute(call())).outcome).toBe("DENIED");
    expect(getGoal).not.toHaveBeenCalled();

    grant(dir);
    expect(toolset.seam.schemas()?.map((schema) => schema.name)).toContain("get_goal");
    expect(toolset.registry.visible("default").get("get_goal")?.actionClass).toBe("READ_ONLY");
    expect(toolset.seam.executionMode(call())).toBe("parallel");
    const result = await toolset.seam.execute(call());
    expect(result.outcome).toBe("OK");
    expect(JSON.parse(result.content.toString())).toEqual(progress);

    grant(dir, null);
    expect((await toolset.seam.execute(call())).outcome).toBe("DENIED");
    expect(getGoal).toHaveBeenCalledTimes(1);
  });

  it("refuses a signed action-class mismatch before reading the getter", async () => {
    const dir = workspace();
    grant(dir, "WRITE_HIGH");
    const getGoal = vi.fn(() => progress);
    const toolset = tools(dir, getGoal);

    expect(toolset.seam.schemas()?.map((schema) => schema.name)).not.toContain("get_goal");
    expect((await toolset.seam.execute(call())).outcome).toBe("DENIED");
    expect(getGoal).not.toHaveBeenCalled();
  });

  it("accepts only empty arguments and never accepts a requested transition", async () => {
    const dir = workspace();
    grant(dir);
    const getGoal = vi.fn(() => progress);
    const toolset = tools(dir, getGoal);
    const schema = toolset.seam.schemas()?.find((item) => item.name === "get_goal");
    expect(schema?.parameters).toEqual({ type: "object", properties: {}, additionalProperties: false });

    for (const args of [{ status: "complete" }, { round: 999 }, { revision: 99 }, { claimId: "forged" }, []]) {
      const result = await toolset.seam.execute(call(args));
      expect(result.outcome).toBe("ERROR");
    }
    expect(getGoal).not.toHaveBeenCalled();
  });

  it("validates empty arguments inside its body before reading owner state", async () => {
    const getGoal = vi.fn(() => progress);
    const tool = goalTool(getGoal);
    await expect(Promise.resolve().then(() => tool.body({ token: "goal-body", callId: "goal-body",
      rootCallId: "goal-body", name: "get_goal", agentId: "default", workspace: tmpdir(), actionClass: "READ_ONLY",
      requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { status: "complete" }, parentToken: null })))
      .rejects.toThrow();
    expect(getGoal).not.toHaveBeenCalled();
  });

  it("reports unavailable when no goal getter is bound", async () => {
    const dir = workspace();
    grant(dir);
    const result = await tools(dir).seam.execute(call());

    expect(result.outcome).toBe("ERROR");
    expect(result.content.toString()).toContain('"status":"unavailable"');
    expect(JSON.parse(result.content.toString())).toMatchObject({ status: "unavailable" });
  });

  it.each([undefined, null])("reports unavailable for an absent owner snapshot: %s", async (snapshot) => {
    const dir = workspace();
    grant(dir);
    const result = await tools(dir, () => snapshot).seam.execute(call());

    expect(result.outcome).toBe("ERROR");
    expect(result.content.toString()).toContain('"status":"unavailable"');
    expect(JSON.parse(result.content.toString())).toMatchObject({ status: "unavailable" });
  });

  it("reads the current owner snapshot on every call", async () => {
    const dir = workspace();
    grant(dir);
    let current = progress;
    const toolset = tools(dir, () => current);
    expect(JSON.parse((await toolset.seam.execute(call())).content.toString())).toEqual(progress);
    current = { ...progress, round: 3, revision: 5 };
    expect(JSON.parse((await toolset.seam.execute(call())).content.toString())).toEqual(current);
  });

  it("forwards scheduled round n of maxRounds through the native child driver", async () => {
    const dir = workspace();
    grant(dir);
    initSchedules(dir);
    saveSchedules(dir, [{ id: "review", runAs: "reader", goal: "review progress", maxRounds: 2,
      everyMs: 60_000, enabled: true, scope: ["READ_ONLY"] }]);
    const runner = createDriverRunner({ workspace: dir,
      makeLlm: (session) => {
        const registry = new AdapterRegistry();
        registry.register({ providerId: LOOP_PROVIDER,
          adapter: scriptedAdapter([toolStep("goal-state", "get_goal", "{}"), textStep("round finished")]),
          baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
        return new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport });
      },
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      systemPrompt: "Read the current goal progress.", harnessVersion: "goal-tool-test", compositionDigest: "c", policyDigest: "p" });
    let child = 0;
    const result = await runDueSchedules({ workspace: dir, parent: rootIdentity("default"), now: 1_000_000,
      session: { recordLoopEvent: () => null, recordProjectedEvidence: () => null },
      mintSessionId: () => `goal-child-${++child}`, runner });
    expect(result[0]).toMatchObject({ rounds: 2, stoppedBy: "max-rounds", ok: false });

    const ledger = openLedger(dir);
    try {
      for (const round of [1, 2]) {
        const event = ledger.getAllEvents().find((item) => item.session_id === `goal-child-${round}` && item.event_type === "tool/result");
        expect(event, `round ${round} queried its goal`).toBeDefined();
        expect(JSON.parse(event!.meta_json)).toMatchObject({ outcome: "OK" });
        const payload = readEventPayload(dir, event!);
        expect(payload.status).toBe("ok");
        if (payload.status !== "ok") throw new Error("goal tool output unavailable");
        expect(JSON.parse(payload.bytes.toString("utf8"))).toMatchObject({ scheduleId: "review", round,
          maxRounds: 2, status: "active", stopReason: null, sessionId: `goal-child-${round}` });
      }
    } finally { ledger.close(); }
  });
});

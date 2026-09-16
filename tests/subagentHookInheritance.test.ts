import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { createDriverRunner, type DriverRunnerInit } from "../src/agent/subagentRunner.js";
import { delegateTool } from "../src/agent/delegateTool.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { runComposedTurn, type ComposedToolSession } from "../src/kernel/agentLoopRunner.js";
import { UNSIGNED } from "../src/agent/runReport.js";
import type { LoopHookControl, PreStepDecision, TurnStoppingInput } from "../src/agent/loopTypes.js";
import type { SubagentRunContext } from "../src/agent/subagentSpawn.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import type { HttpTransport } from "../src/llm/adapter/transport.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * IMPL-3: a spawned child inherits the parent's hook CONTROL — the pre-step
 * waterfall (vetoes) and the turn-stopping hook — and records, in its own
 * signed session, which controls governed it. A child built with no control
 * records the absence; it never claims a control it does not have.
 */

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function setup(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "hook-inheritance-synthetic-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-hook-inheritance-"))); dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default"); writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, { ...config, tools: { ...config.tools,
    allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
  return dir;
}
function rows(workspace: string, sessionId?: string) {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(row => sessionId === undefined || row.session_id === sessionId); }
  finally { ledger.close(); }
}
function hookControlRows(workspace: string, sessionId: string) {
  return rows(workspace, sessionId).filter(row => row.event_type === "audit"
    && (JSON.parse(row.meta_json) as { kind?: unknown }).kind === "delegation/hook-control");
}
function context(extra: Partial<SubagentRunContext> = {}): SubagentRunContext {
  return { childSessionId: "hook-child", toolsetAgentId: "default", continuable: false, goal: "Inspect the workspace.",
    identity: { governedAs: "default", runAs: "child", parent: "default", depth: 1 }, ...extra };
}
function llmFor(session: SessionService, scripts: ReturnType<typeof textStep>[], transport: HttpTransport = silentTransport) {
  const scripted = scriptedAdapter(scripts);
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
    adapter: { ...scripted, capabilities: ANTHROPIC_CAPABILITIES,
      envelope: input => ({ ...scripted.envelope(input), signal: input.signal }) } });
  return new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport });
}
function init(workspace: string, extra: Partial<DriverRunnerInit> = {}): DriverRunnerInit {
  return { workspace, makeLlm: session => llmFor(session, [textStep("done")]),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "Respect inherited controls.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture", ...extra };
}
const passThrough: LoopHookControl = {
  preStep: (_input, next) => next(),
  turnStopping: () => Promise.resolve()
};

describe("spawned children inherit the parent's hook control", () => {
  test("a parent pre-step veto governs the child: no model call, and the child's own loop/veto names the vetoing party", async () => {
    const workspace = setup();
    const veto: LoopHookControl = { ...passThrough,
      preStep: async (): Promise<PreStepDecision> => ({ kind: "reject", by: "fixture-parent-guard" }) };
    const outcome = await createDriverRunner(init(workspace, { hookControl: veto,
      makeLlm: session => llmFor(session, [textStep("must never be requested")]) }))(context());
    expect(outcome).toMatchObject({ ok: false, text: "" });
    const child = rows(workspace, "hook-child");
    expect(child.filter(row => row.event_type === "request/header")).toHaveLength(0);
    const vetoRow = child.find(row => row.event_type === "loop/veto");
    expect(vetoRow).toBeDefined();
    expect(JSON.parse(vetoRow!.meta_json)).toMatchObject({ by: "fixture-parent-guard", turn: 1, step: 1 });
    expect(vetoRow!.writer_sig).not.toBe(UNSIGNED);
  });

  test("the parent's turn-stopping hook runs on the child's turn, under the child's turn number", async () => {
    const workspace = setup();
    const turnStopping = vi.fn(async (_input: TurnStoppingInput) => { /* observed only */ });
    const outcome = await createDriverRunner(init(workspace, { hookControl: { ...passThrough, turnStopping } }))(context());
    expect(outcome).toMatchObject({ ok: true, text: "done" });
    expect(turnStopping).toHaveBeenCalledTimes(1);
    expect(turnStopping.mock.calls[0]![0]).toMatchObject({ turn: 1 });
  });

  test("the inheritance is recorded in the child's signed session before its first turn, naming every control that governed it", async () => {
    const workspace = setup();
    const outcome = await createDriverRunner(init(workspace, { hookControl: passThrough,
      approvalGate: { actionClass: "READ_ONLY", riskTier: "low", toolNames: ["fs.read"],
        answerers: [{ name: "fixture-reviewer", answer: async () => "allow" }] },
      grantDelegation: { runner: async () => ({ ok: true, text: "unused" }), stopConditions: ["max-turns:8", "timeout-ms:30000"],
        delegationScope: ["READ_ONLY", "WRITE_LOW"] }
    }))(context({ stopConditions: ["max-turns:2", "timeout-ms:60000"], delegationScope: ["READ_ONLY"] }));
    expect(outcome).toMatchObject({ ok: true });
    const child = rows(workspace, "hook-child");
    const record = hookControlRows(workspace, "hook-child");
    expect(record).toHaveLength(1);
    expect(record[0]!.writer_sig).not.toBe(UNSIGNED);
    const firstTurn = child.findIndex(row => row.event_type === "turn/start");
    expect(child.indexOf(record[0]!)).toBeLessThan(firstTurn);
    // toMatchObject: the spine adds its own session envelope fields to every row's meta.
    expect(JSON.parse(record[0]!.meta_json)).toMatchObject({
      kind: "delegation/hook-control", version: 1,
      source: "parent-loop", inherited: ["preStep", "turnStopping"],
      approvalGate: { actionClass: "READ_ONLY", riskTier: "low", toolNames: ["fs.read"] },
      stopConditions: ["max-turns:2", "timeout-ms:60000"],
      descendantStopConditions: ["max-turns:2", "timeout-ms:30000"],
      delegationScope: ["READ_ONLY"],
      descendantDelegationScope: ["READ_ONLY"],
      governedAs: "default", runAs: "child", depth: 1
    });
  });

  test("a child built with no hook control records the absence instead of claiming a control it does not have", async () => {
    const workspace = setup();
    const outcome = await createDriverRunner(init(workspace))(context());
    expect(outcome).toMatchObject({ ok: true });
    const record = hookControlRows(workspace, "hook-child");
    expect(record).toHaveLength(1);
    expect(JSON.parse(record[0]!.meta_json)).toMatchObject({
      source: "none", inherited: [], approvalGate: null,
      stopConditions: null, descendantStopConditions: null, delegationScope: null, descendantDelegationScope: null
    });
  });

  test("a continued child records its controls once, at spawn, not once per turn", async () => {
    const workspace = setup();
    const first = await createDriverRunner(init(workspace, { hookControl: passThrough,
      makeLlm: session => llmFor(session, [textStep("first"), textStep("second")]) }))(context({ continuable: true }));
    expect(first.ok).toBe(true);
    expect(await first.continuation!.continue("again")).toMatchObject({ ok: true, text: "second" });
    first.continuation!.close();
    expect(hookControlRows(workspace, "hook-child")).toHaveLength(1);
    expect(rows(workspace, "hook-child").filter(row => row.event_type === "turn/start")).toHaveLength(2);
  });

  test("the production kernel hands its composed control to every native child, and a grandchild inherits the same control", async () => {
    const workspace = setup(); let writer: ComposedToolSession | undefined;
    const tools = agentToolset({ workspace, agentId: "default", sessionId: "hook-root",
      recorder: { recordProjectedEvidence: row => writer!.recordProjectedEvidence(row) } });
    const scripted = scriptedAdapter([
      toolStep("root_delegate", "delegate", '{"runAs":"child","goal":"Delegate a small subtask."}'),
      toolStep("child_delegate", "delegate", '{"runAs":"grandchild","goal":"Answer briefly."}'),
      textStep("grandchild answer"), textStep("child answer"), textStep("root answer")
    ]);
    try {
      await runComposedTurn({ workspace, agentId: "default", sessionId: "hook-root", prompt: "Delegate the work.",
        systemPrompt: "Use only approved tools.", tools: tools.seam, bindToolSession: selected => { writer = selected; },
        route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
        routes: [{ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
          adapter: { ...scripted, capabilities: ANTHROPIC_CAPABILITIES } }], transport: silentTransport,
        config: { maxStepsPerTurn: 2, maxParallelToolCalls: 1 },
        credentials: { homeDir: join(workspace, "fixture-credentials"), env: {}, watch: false, projectDir: null },
        approvalGate: { actionClass: "READ_ONLY", riskTier: "low", answerers: [{ name: "fixture-reviewer", answer: async () => "allow" }] },
        delegation: { maxDepth: 2, scope: ["READ_ONLY"], stopConditions: ["max-turns:1", "timeout-ms:30000"],
          grant: capability => { tools.registry.define(delegateTool(capability)); } }
      });
      const events = rows(workspace);
      const starts = events.filter(row => row.event_type === "agent_delegation_started");
      expect(starts).toHaveLength(2);
      for (const start of starts) {
        const meta = JSON.parse(start.meta_json) as { childSessionId: string; depth: number };
        const record = hookControlRows(workspace, meta.childSessionId);
        expect(record, `child session ${meta.childSessionId} at depth ${meta.depth}`).toHaveLength(1);
        expect(record[0]!.writer_sig).not.toBe(UNSIGNED);
        expect(JSON.parse(record[0]!.meta_json)).toMatchObject({
          source: "parent-loop", inherited: ["preStep", "turnStopping"], depth: meta.depth,
          approvalGate: { actionClass: "READ_ONLY", riskTier: "low", toolNames: null },
          stopConditions: ["max-turns:1", "timeout-ms:30000"], delegationScope: ["READ_ONLY"]
        });
      }
    } finally { tools.close(); }
  });
});

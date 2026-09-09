import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { createDriverRunner, type DriverRunnerInit } from "../src/agent/subagentRunner.js";
import { delegateTool } from "../src/agent/delegateTool.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { runComposedTurn, type ComposedToolSession } from "../src/kernel/agentLoopRunner.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { loadHandoffPacket } from "../src/fleet/handoffPacket.js";
import { intersectDelegationScopes } from "../src/agent/delegationScope.js";
import type { SubagentRunContext, SubagentRunner } from "../src/agent/subagentSpawn.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import type { HttpTransport } from "../src/llm/adapter/transport.js";
import type { ApprovalAnswerer } from "../src/approvals/seam/approvalSeamTypes.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

// Regression fixtures authored now; all execution deferred to the combined phase.
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });
function setup(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-delegation-synthetic-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-delegation-"))); dirs.push(dir);
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
function context(signal?: AbortSignal): SubagentRunContext {
  return { childSessionId: "native-child", toolsetAgentId: "default", continuable: false, goal: "Inspect the workspace.",
    identity: { governedAs: "default", runAs: "child", parent: "default", depth: 1 }, ...(signal ? { signal } : {}) };
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
    systemPrompt: "Respect inherited permissions.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture", ...extra };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("native child cancellation and inherited governance", () => {
  test("parent abort reaches the actual request, records parent cause, and removes the listener", async () => {
    const workspace = setup(), controller = new AbortController(), entered = deferred();
    const add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener");
    let requestSignal: AbortSignal | undefined;
    const transport: HttpTransport = async envelope => {
      requestSignal = envelope.signal; entered.resolve();
      return await new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException("fixture aborted", "AbortError"));
        if (envelope.signal?.aborted) abort(); else envelope.signal?.addEventListener("abort", abort, { once: true });
      });
    };
    const runner = createDriverRunner(init(workspace, { makeLlm: session => llmFor(session, [textStep("unreachable")], transport) }));
    const running = runner(context(controller.signal));
    await entered.promise; controller.abort({ kind: "user" });
    const outcome = await running;
    expect(requestSignal?.aborted).toBe(true); expect(outcome).toMatchObject({ ok: false, text: "" });
    const end = rows(workspace, "native-child").find(row => row.event_type === "turn/end");
    expect(JSON.parse(end!.meta_json)).toMatchObject({ reason: "cancelled", cancelCause: { kind: "parent" } });
    expect(rows(workspace, "native-child").filter(row => row.event_type === "session/close")).toHaveLength(1);
    const subscribed = add.mock.calls.find(([event]) => event === "abort")?.[1];
    expect(remove.mock.calls.some(([event, listener]) => event === "abort" && listener === subscribed)).toBe(true);
  });

  test("aborting an idle continued child prevents later inbox insertion and closes it once", async () => {
    const workspace = setup(), controller = new AbortController();
    const runner = createDriverRunner(init(workspace));
    const first = await runner({ ...context(controller.signal), continuable: true });
    expect(first.ok).toBe(true); expect(first.continuation).toBeDefined();
    controller.abort(); const before = rows(workspace, "native-child").length;
    expect(await first.continuation!.continue("must not start")).toMatchObject({ ok: false, text: "" });
    first.continuation!.close();
    expect(rows(workspace, "native-child")).toHaveLength(before);
    expect(rows(workspace, "native-child").filter(row => row.event_type === "session/close")).toHaveLength(1);
  });

  test("close during a continuation cancels before disposal and never returns partial success", async () => {
    const workspace = setup(), entered = deferred(); let dispatches = 0;
    const transport: HttpTransport = async envelope => {
      if (++dispatches === 1) return silentTransport(envelope);
      entered.resolve();
      return await new Promise((_resolve, reject) => envelope.signal!.addEventListener("abort", () => reject(new DOMException("disposed", "AbortError")), { once: true }));
    };
    const runner = createDriverRunner(init(workspace, { makeLlm: session => llmFor(session, [textStep("first")], transport) }));
    const first = await runner({ ...context(), continuable: true });
    const pending = first.continuation!.continue("second"); await entered.promise;
    first.continuation!.close();
    expect(await pending).toMatchObject({ ok: false, text: "" });
    const events = rows(workspace, "native-child");
    expect(JSON.parse(events.filter(row => row.event_type === "turn/end").at(-1)!.meta_json))
      .toMatchObject({ reason: "cancelled", cancelCause: { kind: "disposed" } });
    expect(events.at(-1)?.event_type).toBe("session/close");
  });

  test("the inherited turn ceiling stops a child before a second model request", async () => {
    const workspace = setup();
    const outcome = await createDriverRunner(init(workspace, {
      config: { maxStepsPerTurn: 1, maxParallelToolCalls: 1, toolAbandonGraceMs: 20 },
      makeLlm: session => llmFor(session, [toolStep("read_a", "fs.read", '{"path":"missing"}'), textStep("unreachable")])
    }))(context());
    expect(outcome).toMatchObject({ ok: false, text: "" });
    expect(outcome.reason).toContain("max_steps");
    expect(rows(workspace, "native-child").filter(row => row.event_type === "request/header")).toHaveLength(1);
  });

  test("grandchildren retain approval gates and a narrowed scope, and depth three is refused", async () => {
    const workspace = setup(), asked: string[] = []; let factories = 0;
    const answerer: ApprovalAnswerer = { name: "fixture-reviewer", answer: async question => {
      asked.push(question.toolName); return question.toolName === "fs.read" ? "deny" : "allow";
    } };
    let runner!: SubagentRunner;
    runner = createDriverRunner(init(workspace, {
      config: { maxStepsPerTurn: 8, maxParallelToolCalls: 1 },
      approvalGate: { actionClass: "READ_ONLY", riskTier: "low", toolNames: ["delegate", "fs.read"], answerers: [answerer] },
      grantDelegation: { runner: child => runner(child), maxDepth: 2, mintSessionId: () => "native-grandchild", delegationScope: ["READ_ONLY", "WRITE_LOW"] },
      makeLlm: session => llmFor(session, ++factories === 1 ? [
        toolStep("delegate_a", "delegate", '{"runAs":"grandchild","goal":"Inspect only."}'), textStep("child done")
      ] : [
        toolStep("read_b", "fs.read", '{"path":"package.json"}'),
        toolStep("write_b", "fs.write", '{"path":"must-not-exist.txt","content":"forbidden"}'),
        toolStep("delegate_b", "delegate", '{"runAs":"great-grandchild","goal":"Do more."}'), textStep("grandchild done")
      ])
    }));
    const result = await runner({ ...context(), delegationScope: ["READ_ONLY"] });
    expect(result.ok).toBe(true); expect(factories).toBe(2);
    expect(asked).toEqual(["delegate", "fs.read", "delegate"]);
    const childRows = rows(workspace, "native-child"), grandRows = rows(workspace, "native-grandchild");
    expect(childRows.filter(row => row.event_type === "approval/request")).toHaveLength(1);
    expect(grandRows.filter(row => row.event_type === "approval/request")).toHaveLength(2);
    expect(JSON.parse(childRows.find(row => row.event_type === "agent_delegation_started")!.meta_json)).toMatchObject({ depth: 2 });
    expect(grandRows.some(row => row.event_type === "agent_delegation_started")).toBe(false);
    const writeResult = grandRows.find(row => row.event_type === "tool/result" && JSON.parse(row.meta_json).toolCallId === "write_b");
    expect(JSON.parse(writeResult!.meta_json).denied).toBe(true);
    const depthResult = grandRows.find(row => row.event_type === "tool/result" && JSON.parse(row.meta_json).toolCallId === "delegate_b");
    const payload = readEventPayload(workspace, depthResult!);
    expect(payload.status === "ok" ? payload.bytes.toString() : "missing").toContain("depth 3 exceeds maxDepth 2");
    expect(existsSync(join(workspace, "must-not-exist.txt"))).toBe(false);
  });

  test("scope intersection never interprets an empty restriction as unrestricted", () => {
    expect(intersectDelegationScopes(["READ_ONLY"], ["READ_ONLY", "WRITE_HIGH"])).toEqual(["READ_ONLY"]);
    expect(intersectDelegationScopes(["READ_ONLY"], undefined)).toEqual(["READ_ONLY"]);
    expect(intersectDelegationScopes(["READ_ONLY"], ["WRITE_HIGH"])).toEqual([]);
  });

  test("nested delegation receives numeric minima and snapshots the configured stops", async () => {
    const workspace = setup(), seen: SubagentRunContext[] = [];
    const configured = ["max-turns:8", "timeout-ms:30000"];
    const runner = createDriverRunner(init(workspace, {
      grantDelegation: { runner: async child => { seen.push(child); return { ok: true, text: "grandchild done" }; },
        stopConditions: configured, mintSessionId: () => "bounded-grandchild" },
      makeLlm: session => llmFor(session, [
        toolStep("bounded_delegate", "delegate", '{"runAs":"grandchild","goal":"Answer briefly.","stopConditions":[]}'),
        textStep("child done")
      ])
    }));
    configured.splice(0, configured.length, "max-turns:999", "timeout-ms:999999");
    const parent = new AbortController();
    const result = await runner({ ...context(parent.signal), stopConditions: ["max-turns:2", "timeout-ms:60000"] });
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.stopConditions).toEqual(["max-turns:2", "timeout-ms:30000"]);
    expect(seen[0]!.signal).toBeDefined();
  });

  test("the production kernel grants actual recursive children with child-bound approval rows", async () => {
    const workspace = setup(); let writer: ComposedToolSession | undefined;
    const tools = agentToolset({ workspace, agentId: "default", sessionId: "native-root",
      recorder: { recordProjectedEvidence: row => writer!.recordProjectedEvidence(row) } });
    const scripted = scriptedAdapter([
      toolStep("root_delegate", "delegate", '{"runAs":"child","goal":"Delegate a small subtask."}'),
      toolStep("child_delegate", "delegate", '{"runAs":"grandchild","goal":"Answer briefly."}'),
      textStep("grandchild answer"), textStep("child answer"), textStep("root answer")
    ]);
    try {
      await runComposedTurn({ workspace, agentId: "default", sessionId: "native-root", prompt: "Delegate the work.",
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
      expect(starts.map(row => JSON.parse(row.meta_json).depth).sort()).toEqual([1, 2]);
      const approvalSessions = new Set(events.filter(row => row.event_type === "approval/request").map(row => row.session_id));
      expect(approvalSessions.size).toBe(2); expect(approvalSessions.has("native-root")).toBe(true);
      for (const start of starts) {
        const meta = JSON.parse(start.meta_json);
        const child = meta.childSessionId;
        expect(loadHandoffPacket(workspace, meta.packetId).stopConditions).toEqual(["max-turns:1", "timeout-ms:30000"]);
        expect(events.filter(row => row.session_id === child && row.event_type === "session/close")).toHaveLength(1);
      }
    } finally { tools.close(); }
  });

  test("delegate passes the actual execution abort signal before authorization", async () => {
    const workspace = setup(), controller = new AbortController(); controller.abort();
    const runner = vi.fn(async () => ({ ok: true, text: "must not execute" }));
    const recordLoopEvent = vi.fn(), recordProjectedEvidence = vi.fn();
    const tool = delegateTool({ identity: rootIdentity("default"), runner, session: { recordLoopEvent, recordProjectedEvidence } });
    await tool.body({ workspace, agentId: "default", name: "delegate", actionClass: "READ_ONLY", arguments: { runAs: "child", goal: "g" },
      token: "fixture", callId: "fixture", rootCallId: "fixture", parentToken: null, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", signal: controller.signal });
    expect(runner).not.toHaveBeenCalled(); expect(recordLoopEvent).not.toHaveBeenCalled();
  });
});

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import type { SessionService } from "../src/session/sessionService.js";
import type { EvidenceEvent } from "../src/types.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import type { ApprovalAnswerer } from "../src/approvals/seam/approvalSeamTypes.js";
import {
  createDriverRunner,
  DELEGATION_HOOK_CONTROL_AUDIT,
  readDelegationHookControl,
  type DriverRunnerInit
} from "../src/agent/subagentRunner.js";
import type { LoopHooks } from "../src/agent/loopTypes.js";
import type { SubagentRunContext } from "../src/agent/subagentSpawn.js";
import { delegateTool } from "../src/agent/delegateTool.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { runComposedTurn, type ComposedToolSession } from "../src/kernel/agentLoopRunner.js";
import type { ContextPlugin } from "../src/prompt/context/contextTypes.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * Hook control is inherited by a spawned child, and the child's own signed
 * session says which controls governed it (brief §5 known-open: "Hook control is
 * not inherited by a spawned child; no spawn path installs it").
 *
 * Scripted transport throughout: these are implementation regressions about
 * what AMC RECORDS and REFUSES, never provider evidence.
 */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function setup(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "hook-inheritance-fixture-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-hook-inheritance-"))); dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default"); writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, { ...config, tools: { ...config.tools,
    allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
  return dir;
}
function rows(workspace: string, sessionId?: string): EvidenceEvent[] {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(row => sessionId === undefined || row.session_id === sessionId); }
  finally { ledger.close(); }
}
function payloadOf(workspace: string, row: EvidenceEvent): string {
  const read = readEventPayload(workspace, row);
  return read.status === "ok" ? read.bytes.toString("utf8") : `<${read.status}>`;
}
function userMessages(workspace: string, sessionId: string): string[] {
  return rows(workspace, sessionId).filter(row => row.event_type === "user/message").map(row => payloadOf(workspace, row));
}
function context(over: Partial<SubagentRunContext> = {}): SubagentRunContext {
  return { childSessionId: "native-child", toolsetAgentId: "default", continuable: false, goal: "Inspect the workspace.",
    identity: { governedAs: "default", runAs: "child", parent: "default", depth: 1 }, ...over };
}
function llmFor(session: SessionService, scripts: ReturnType<typeof textStep>[]) {
  const scripted = scriptedAdapter(scripts);
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
    adapter: { ...scripted, capabilities: ANTHROPIC_CAPABILITIES } });
  return new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport });
}
function init(workspace: string, extra: Partial<DriverRunnerInit> = {}): DriverRunnerInit {
  return { workspace, makeLlm: session => llmFor(session, [textStep("child done")]),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "Respect inherited hook control.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture", ...extra };
}
const vetoing: Pick<LoopHooks, "preStep"> = { preStep: async () => ({ kind: "reject", by: "parent-guard" }) };
const passing: Pick<LoopHooks, "preStep"> = { preStep: (_input, next) => next() };
/** A parent waterfall that appends context, the way the kernel's context pre-step does. */
const appending: Pick<LoopHooks, "preStep"> = { preStep: async (input, next) => {
  const decision = await next();
  if (decision.kind === "reject") return decision;
  return { kind: "enter", messages: [...decision.messages,
    { messageId: `parent-context-${input.turn}-${input.step}`, text: "PARENT-CONTEXT-MARK", origin: "inject" }] };
} };

describe("a spawned child runs under its parent's hook control", () => {
  it("lets a parent pre-step veto block the child's first step before any model request", async () => {
    const workspace = setup();
    const outcome = await createDriverRunner(init(workspace, { hooks: vetoing }))(context());
    expect(outcome).toMatchObject({ ok: false, text: "" });
    expect(outcome.reason).toContain("blocked");
    const child = rows(workspace, "native-child");
    expect(child.filter(row => row.event_type === "request/header")).toHaveLength(0);
    expect(child.filter(row => row.event_type === "step/start")).toHaveLength(0);
    const veto = child.find(row => row.event_type === "loop/veto");
    expect(JSON.parse(veto!.meta_json)).toMatchObject({ by: "parent-guard", turn: 1, step: 1 });
    // The record of what governs the child precedes the child's first turn.
    const audit = child.findIndex(row => row.event_type === "audit" && JSON.parse(row.meta_json).auditType === DELEGATION_HOOK_CONTROL_AUDIT);
    const firstTurn = child.findIndex(row => row.event_type === "turn/start");
    expect(audit).toBeGreaterThanOrEqual(0); expect(firstTurn).toBeGreaterThan(audit);
    expect(readDelegationHookControl(child)).toMatchObject({ hookControl: "inherited", preStep: "inherited" });
    expect(child.at(-1)?.event_type).toBe("session/close");
  });

  it("delivers context appended by the parent's waterfall as the child's own signed user/message, after the goal", async () => {
    const workspace = setup();
    const outcome = await createDriverRunner(init(workspace, { hooks: appending }))(context());
    expect(outcome).toMatchObject({ ok: true, text: expect.stringContaining("child done") });
    expect(userMessages(workspace, "native-child")).toEqual(["Inspect the workspace.", "PARENT-CONTEXT-MARK"]);
    expect(readDelegationHookControl(rows(workspace, "native-child"))).toMatchObject({ hookControl: "inherited" });
    const verified = await verifyLedgerIntegrity(workspace);
    expect(verified.chain.errors, verified.chain.errors.join("; ")).toEqual([]);
  });

  it("snapshots the inherited waterfall at composition, so a later caller mutation cannot loosen it", async () => {
    const workspace = setup();
    const hooks: { preStep: LoopHooks["preStep"] } = { preStep: vetoing.preStep };
    const runner = createDriverRunner(init(workspace, { hooks }));
    hooks.preStep = passing.preStep;
    const outcome = await runner(context());
    expect(outcome).toMatchObject({ ok: false });
    expect(rows(workspace, "native-child").filter(row => row.event_type === "loop/veto")).toHaveLength(1);
    expect(rows(workspace, "native-child").filter(row => row.event_type === "request/header")).toHaveLength(0);
  });

  it("governs every continued turn of a continuable child, not only the first", async () => {
    const workspace = setup(); let steps = 0;
    const laterVeto: Pick<LoopHooks, "preStep"> = { preStep: async (_input, next) => (++steps >= 2 ? { kind: "reject", by: "parent-guard" } : next()) };
    const first = await createDriverRunner(init(workspace, { hooks: laterVeto,
      makeLlm: session => llmFor(session, [textStep("first"), textStep("unreachable")]) }))({ ...context(), continuable: true });
    expect(first).toMatchObject({ ok: true, text: expect.stringContaining("first") });
    const second = await first.continuation!.continue("again");
    expect(second).toMatchObject({ ok: false }); expect(second.reason).toContain("blocked");
    first.continuation!.close();
    const child = rows(workspace, "native-child");
    expect(child.filter(row => row.event_type === "request/header")).toHaveLength(1);
    expect(child.filter(row => row.event_type === "loop/veto")).toHaveLength(1);
    expect(child.filter(row => row.event_type === "audit" && JSON.parse(row.meta_json).auditType === DELEGATION_HOOK_CONTROL_AUDIT)).toHaveLength(1);
  });
});

describe("the child's signed session records which controls governed it", () => {
  it("records the absence when the runner was composed without hook control, and still runs the child", async () => {
    const workspace = setup();
    const outcome = await createDriverRunner(init(workspace))(context());
    expect(outcome).toMatchObject({ ok: true, text: expect.stringContaining("child done") });
    const child = rows(workspace, "native-child");
    const audits = child.filter(row => row.event_type === "audit" && JSON.parse(row.meta_json).auditType === DELEGATION_HOOK_CONTROL_AUDIT);
    expect(audits).toHaveLength(1);
    expect(readDelegationHookControl(child)).toMatchObject({ hookControl: "absent", preStep: "none" });
    expect(child.findIndex(row => row === audits[0])).toBeLessThan(child.findIndex(row => row.event_type === "turn/start"));
  });

  it("names the gate, the signed stop conditions and scope, and the loop ceilings alongside hook control", async () => {
    const workspace = setup();
    const answerer: ApprovalAnswerer = { name: "fixture-reviewer", answer: async () => "allow" };
    const governed = createDriverRunner(init(workspace, { hooks: passing, config: { maxStepsPerTurn: 3 },
      approvalGate: { actionClass: "READ_ONLY", riskTier: "low", toolNames: ["fs.read"], answerers: [answerer] } }));
    expect((await governed({ ...context(), stopConditions: ["max-turns:2", "timeout-ms:30000"], delegationScope: ["READ_ONLY"] })).ok).toBe(true);
    const record = readDelegationHookControl(rows(workspace, "native-child"));
    expect(record).toEqual({
      governedAs: "default", childRunAs: "child", childSessionId: "native-child", depth: 1,
      hookControl: "inherited", preStep: "inherited", turnStopping: "child-local", notify: "child-local",
      approvalGate: { actionClass: "READ_ONLY", riskTier: "low", toolNames: ["fs.read"], answerers: ["fixture-reviewer"] },
      stopConditions: ["max-turns:2", "timeout-ms:30000"], delegationScope: ["READ_ONLY"],
      loopConfig: { maxStepsPerTurn: 3, maxParallelToolCalls: 10, toolAbandonGraceMs: 5000 }
    });
    // The payload commits to the same facts the meta carries.
    const audit = rows(workspace, "native-child").find(row => row.event_type === "audit" && JSON.parse(row.meta_json).auditType === DELEGATION_HOOK_CONTROL_AUDIT)!;
    expect(JSON.parse(payloadOf(workspace, audit))).toEqual({ auditType: DELEGATION_HOOK_CONTROL_AUDIT, ...record });

    const ungoverned = createDriverRunner(init(workspace));
    expect((await ungoverned(context({ childSessionId: "native-child-bare" }))).ok).toBe(true);
    expect(readDelegationHookControl(rows(workspace, "native-child-bare"))).toEqual({
      governedAs: "default", childRunAs: "child", childSessionId: "native-child-bare", depth: 1,
      hookControl: "absent", preStep: "none", turnStopping: "child-local", notify: "child-local",
      approvalGate: null, stopConditions: null, delegationScope: null,
      loopConfig: { maxStepsPerTurn: 64, maxParallelToolCalls: 10, toolAbandonGraceMs: 5000 }
    });
  });

  it("reads back null from a session that carries no such record, never a guessed default", () => {
    const workspace = setup();
    expect(readDelegationHookControl(rows(workspace))).toBeNull();
  });
});

describe("the production kernel installs the root's hook control into every descendant", () => {
  it("delivers the root's context pre-step to the child and the grandchild, and both record the inheritance", async () => {
    const workspace = setup(); let writer: ComposedToolSession | undefined;
    const mark: ContextPlugin = { name: "fixture-mark", order: 0, collect: async () => "PARENT-CONTEXT-MARK" };
    const tools = agentToolset({ workspace, agentId: "default", sessionId: "native-root",
      recorder: { recordProjectedEvidence: row => writer!.recordProjectedEvidence(row) } });
    const scripted = scriptedAdapter([
      toolStep("root_delegate", "delegate", '{"runAs":"child","goal":"Delegate a small subtask."}'),
      toolStep("child_delegate", "delegate", '{"runAs":"grandchild","goal":"Answer briefly."}'),
      textStep("grandchild answer"), textStep("child answer"), textStep("root answer")
    ]);
    const minted: string[] = [];
    try {
      await runComposedTurn({ workspace, agentId: "default", sessionId: "native-root", prompt: "Delegate the work.",
        systemPrompt: "Use only approved tools.", promptProfile: { contextPlugins: [mark] },
        tools: tools.seam, bindToolSession: selected => { writer = selected; },
        route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
        routes: [{ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
          adapter: { ...scripted, capabilities: ANTHROPIC_CAPABILITIES } }], transport: silentTransport,
        config: { maxStepsPerTurn: 2, maxParallelToolCalls: 1 },
        credentials: { homeDir: join(workspace, "fixture-credentials"), env: {}, watch: false, projectDir: null },
        delegation: { maxDepth: 2, scope: ["READ_ONLY"], stopConditions: ["max-turns:1"],
          grant: capability => { tools.registry.define(delegateTool({ ...capability, mintSessionId: () => {
            const id = `native-descendant-${minted.length + 1}`; minted.push(id); return id; } })); } }
      });
    } finally { tools.close(); }
    const events = rows(workspace);
    const starts = events.filter(row => row.event_type === "agent_delegation_started").map(row => JSON.parse(row.meta_json) as { childSessionId: string; depth: number });
    expect(starts.map(start => start.depth).sort()).toEqual([1, 2]);
    // The root's own step carries the snapshot, so the claim below is about the
    // SAME waterfall reaching three sessions, not about a plugin that only runs once.
    expect(userMessages(workspace, "native-root").filter(text => text.includes("PARENT-CONTEXT-MARK")).length).toBeGreaterThan(0);
    for (const start of starts) {
      const child = rows(workspace, start.childSessionId);
      expect(readDelegationHookControl(child)).toMatchObject({ hookControl: "inherited", preStep: "inherited", depth: start.depth,
        stopConditions: ["max-turns:1"], delegationScope: ["READ_ONLY"], loopConfig: { maxStepsPerTurn: 2, maxParallelToolCalls: 1 } });
      const texts = userMessages(workspace, start.childSessionId);
      expect(texts[0], `${start.childSessionId} sees its goal first`).not.toContain("PARENT-CONTEXT-MARK");
      expect(texts.filter(text => text.includes("PARENT-CONTEXT-MARK")).length, `${start.childSessionId} received the root's context`).toBeGreaterThan(0);
      expect(child.filter(row => row.event_type === "session/close")).toHaveLength(1);
    }
    const verified = await verifyLedgerIntegrity(workspace);
    expect(verified.chain.errors, verified.chain.errors.join("; ")).toEqual([]);
  });
});

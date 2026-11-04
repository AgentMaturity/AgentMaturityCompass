import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { reserveNativeModelBudget } from "../src/budgets/nativeBudgetAdmission.js";
import * as envelope from "../src/budgets/experimentBudget.js";

let workspace: string;
const sessions: SessionService[] = [];
const endpoint = "https://api.openai.com/v1/chat/completions";
const stamp = { agentId: "default", caseExecution: { v: 1 as const, casebookId: "book", caseId: "case_1", caseSha256: "a".repeat(64), trialId: "trial_baseline", configDigest: "b".repeat(64) } };
const plan = { executions: 2, caseIds: ["case_1"], arms: [{ side: "baseline" as const, configDigest: "b".repeat(64), trialId: "trial_baseline" },
  { side: "candidate" as const, configDigest: "c".repeat(64), trialId: "trial_candidate" }] };
function policy(cap = 0.1, destinationWorkspace = workspace) {
  const config = loadBudgetsConfig(destinationWorkspace);
  const agent = config.budgets.perAgent.default!;
  agent.daily.maxCostUsd = null;
  agent.unknownTokenUsage = "ALLOW_WITH_WARNING";
  agent.nativeUsdBounds = [{ providerId: "openai", model: "gpt-4o", encoderId: "openai-chat", encoderVersion: 3,
    endpoint, maxRequestBytes: 10000, maxOutputTokens: 20, maxCostUsd: cap,
    source: "auditor-attested test ceiling", expiresAt: new Date(Date.now() + 3600000).toISOString() }];
  writeFileSync(budgetsPath(destinationWorkspace), YAML.stringify(config)); signBudgetsConfig(destinationWorkspace);
}
function request(cost?: number | "estimate", agentId = "default", destinationWorkspace = workspace, leaveOpen = false, partial = false) {
  const session = new SessionService(destinationWorkspace);
  session.stampEveryRow({ ...stamp, agentId });
  session.open({ agentId, harnessVersion: "test", compositionDigest: "test", policyDigest: "test" });
  sessions.push(session);
  const body = Buffer.from(JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }], max_tokens: 20 }));
  const prepared = session.recordRequestHeader({ providerId: "openai", model: "gpt-4o", encoderId: "openai-chat", encoderVersion: 3,
    params: { max_tokens: 20 }, systemPromptEventId: "prompt", toolSchema: null, projectionCutoffEventId: "message", projectionDigest: "projection",
    sourceEventIds: [], requestBytes: body });
  reserveNativeModelBudget(session, prepared.headerEventId, { url: endpoint, body });
  if (cost !== undefined) {
    const usage = { reported: true, complete: !partial, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: null, ...(typeof cost === "number" ? { cost_usd: cost } : {}) };
    session.recordRequestOutcome({ headerEventId: prepared.headerEventId, requestDigest: prepared.requestDigest,
    providerId: "openai", adapterId: "openai-chat", adapterVersion: 1, outcome: "completed", dispatchAttempted: true,
      httpStatus: 200, durationMs: 1, blocks: [], finishReason: "stop", usage });
  }
  if (!leaveOpen) { session.close({ reason: "completed" }); sessions.pop(); }
}
const make = (maxCostUsd = 0.4, judge = 2) => envelope.createExperimentBudget({ workspace, agentId: "default", maxCostUsd,
  maxRequestsPerExecution: { baseline: 1, candidate: 1 }, auxiliaryRequests: { judge } });
describe("whole native experiment USD envelope", () => {
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-experiment-budget-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); policy();
  });
  afterEach(() => {
    for (const session of sessions.splice(0)) session.close({ reason: "completed" });
    rmSync(workspace, { recursive: true, force: true });
  });
  it("refuses the combined baseline, candidate and judge worst case before any callback", () => {
    const budget = make(0.39999999999999997);
    expect(() => budget.admit(plan)).toThrow(/whole experiment envelope/);
    expect(budget.snapshot().admitted).toBe(false);
  });
  it("does not round decimal reservations into extra capacity", () => {
    const budget = make(0.3, 1); budget.admit(plan);
    expect(budget.snapshot()).toMatchObject({ admitted: true, plannedRequests: 3, worstCaseCostUsd: 0.3, measuredCostUsd: null });
  });
  it("enforces stage request limits even when daily USD policy is token-only", async () => {
    const budget = make(); budget.admit(plan);
    await expect(envelope.withTrialBudget(budget, stamp, async () => { request(); request(); })).rejects.toThrow(/request limit/);
    expect(budget.snapshot().reservedCostUsd).toBe(0.1);
  });
  it("shares auxiliary judge spend with both trial arms and refuses later unplanned requests", async () => {
    const budget = make(); budget.admit(plan);
    await expect(budget.runStage("judge", async () => { request(); request(); request(); })).rejects.toThrow(/request limit/);
    expect(budget.snapshot()).toMatchObject({ plannedRequests: 4, reservedCostUsd: 0.2, measuredCostUsd: null });
  });
  it("rejects new bounds after admission rather than increasing its predeclared worst case", async () => {
    const budget = make(); budget.admit(plan); policy(0.2);
    await expect(envelope.withTrialBudget(budget, stamp, async () => request())).rejects.toThrow(/admitted.*bound/);
  });
  it("settles provider-reported measured spend only and keeps missing USD unknown", async () => {
    const budget = make(); budget.admit(plan);
    await envelope.withTrialBudget(budget, stamp, async () => request(0.04));
    budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "completed", reason: null, durationMs: 1 });
    expect(budget.snapshot()).toMatchObject({ measuredCostUsd: 0.04, reservedCostUsd: 0.1, measuredRequests: 1 });
    const candidate = { ...stamp, caseExecution: { ...stamp.caseExecution, trialId: "trial_candidate", configDigest: "c".repeat(64) } };
    await envelope.withTrialBudget(budget, candidate, async () => request());
    budget.settle({ side: "candidate", trialId: "trial_candidate", caseId: "case_1", outcome: "completed", reason: null, durationMs: 1 });
    expect(budget.snapshot()).toMatchObject({ measuredCostUsd: 0.04, reservedCostUsd: 0.2, measuredRequests: 1, settlementComplete: false });
  });
  it("refuses an auxiliary stage opened by a revoked trial continuation", async () => {
    const budget = make(); budget.admit(plan);
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const delayed = envelope.withTrialBudget(budget, stamp, async () => { await gate; await budget.runStage("judge", async () => request()); });
    budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "unavailable", reason: "timeout", durationMs: 1 });
    resume();
    await expect(delayed).rejects.toThrow(/closed/);
  });
  it("attributes measured proposer and judge spend separately and leaves executor cost unknown", async () => {
    const budget = envelope.createExperimentBudget({ workspace, agentId: "default", maxCostUsd: 0.4,
      maxRequestsPerExecution: { baseline: 1, candidate: 1 }, auxiliaryRequests: { proposer: 1, judge: 1 } });
    budget.admit(plan);
    await budget.runStage("proposer", async () => request(0.03));
    await budget.runStage("judge", async () => request(0));
    const roles = budget.snapshot().roleCosts.roles;
    expect(roles.find(role => role.role === "proposer")).toMatchObject({ totalCostUsd: 0.03, complete: true, cost: { reportedSubtotalUsd: 0.03 } });
    expect(roles.find(role => role.role === "judge")).toMatchObject({ totalCostUsd: 0, complete: true });
    expect(roles.find(role => role.role === "executor")).toMatchObject({ totalCostUsd: null, complete: false });
    expect(budget.snapshot().settlementComplete).toBe(false);
  });
  it("refuses invalid, duplicate, missing-bound and foreign plans", async () => {
    expect(() => make().admit({ ...plan, executions: 1 })).toThrow(/complete.*plan/);
    const budget = make(); budget.admit(plan);
    expect(() => budget.admit(plan)).toThrow(/exactly one/);
    await expect(budget.runStage("repair" as "judge", async () => undefined)).rejects.toThrow(/Invalid.*stage/);
    await expect(envelope.withTrialBudget(budget, { ...stamp, agentId: "other" }, async () => undefined)).rejects.toThrow(/admitted.*plan/);
    await envelope.withTrialBudget(budget, stamp, async () => undefined);
    await expect(envelope.withTrialBudget(budget, stamp, async () => undefined)).rejects.toThrow(/already started/);
    budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "unavailable", reason: "no native run", durationMs: 1 });
    expect(() => budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "unavailable", reason: "no native run", durationMs: 1 })).toThrow(/unique.*execution/);
    const config = loadBudgetsConfig(workspace); config.budgets.perAgent.default!.nativeUsdBounds = [];
    writeFileSync(budgetsPath(workspace), YAML.stringify(config)); signBudgetsConfig(workspace);
    expect(() => make().admit(plan)).toThrow(/known signed USD/);
  });
  it("stops after measured provider spend exceeds its admitted bound", async () => {
    const budget = make(); budget.admit(plan);
    await envelope.withTrialBudget(budget, stamp, async () => request(0.11));
    expect(() => budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "completed", reason: null, durationMs: 1 })).toThrow(/Measured native spend/);
    await expect(budget.runStage("judge", async () => request())).rejects.toThrow(/closed/);
  });
  it("refuses invalid limits, unadmitted stages and nested envelopes", async () => {
    expect(() => envelope.createExperimentBudget({ workspace, agentId: "default", maxCostUsd: 1,
      maxRequestsPerExecution: { baseline: -1, candidate: 1 } })).toThrow(/request limits/);
    const budget = make();
    await expect(budget.runStage("judge", async () => undefined)).rejects.toThrow(/not admitted/);
    budget.admit(plan);
    const nested = make(); nested.admit(plan);
    await envelope.withTrialBudget(budget, stamp, async () => {
      await expect(envelope.withTrialBudget(nested, stamp, async () => undefined)).rejects.toThrow(/Nested trial/);
      await expect(nested.runStage("judge", async () => undefined)).rejects.toThrow(/Nested experiment/);
    });
  });
  it("refuses native requests that change workspace or signed agent owner", async () => {
    const config = loadBudgetsConfig(workspace); config.budgets.perAgent.other = structuredClone(config.budgets.perAgent.default!);
    writeFileSync(budgetsPath(workspace), YAML.stringify(config)); signBudgetsConfig(workspace);
    const budget = make(); budget.admit(plan);
    await expect(envelope.withTrialBudget(budget, stamp, async () => request(undefined, "other"))).rejects.toThrow(/workspace or agent/);
    const foreign = mkdtempSync(join(tmpdir(), "amc-foreign-trial-"));
    try {
      initWorkspace({ workspacePath: foreign, trustBoundaryMode: "isolated" }); policy(0.1, foreign);
      await expect(budget.runStage("judge", async () => request(undefined, "default", foreign))).rejects.toThrow(/workspace or agent/);
    } finally {
      for (const session of sessions.splice(0)) session.close({ reason: "completed" });
      rmSync(foreign, { recursive: true, force: true });
    }
  });
  it("cannot settle an unclosed native session as complete measured spend", async () => {
    const budget = make(); budget.admit(plan);
    await envelope.withTrialBudget(budget, stamp, async () => request(0.02, "default", workspace, true));
    budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "completed", reason: null, durationMs: 1 });
    const snapshot = budget.snapshot();
    expect(snapshot).toMatchObject({ measuredCostUsd: null, measuredRequests: 0, settlementComplete: false });
    expect(snapshot.roleCosts.roles.find(role => role.role === "executor")?.totalCostUsd).toBeNull();
  });
  it("never settles catalog estimates or partial provider reports as final measured cost", async () => {
    for (const amount of ["estimate", 0.02] as const) {
      const budget = make(); budget.admit(plan);
      await envelope.withTrialBudget(budget, stamp, async () => request(amount, "default", workspace, false, amount !== "estimate"));
      budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "completed", reason: null, durationMs: 1 });
      expect(budget.snapshot()).toMatchObject({ measuredCostUsd: null, measuredRequests: 0, settlementComplete: false });
      expect(budget.snapshot().roleCosts.roles.find(role => role.role === "executor")?.cost?.estimatedSubtotalUsd).toBeGreaterThan(0);
    }
  });
  it("refuses completed callbacks without native evidence", async () => {
    const budget = make(); budget.admit(plan);
    await envelope.withTrialBudget(budget, stamp, async () => undefined);
    expect(() => budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "completed", reason: null, durationMs: 1 })).toThrow(/no admitted native request evidence/);
  });
  it("revokes late async dispatches as soon as a trial scope ends", async () => {
    const budget = make(); budget.admit(plan);
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const delayed = envelope.withTrialBudget(budget, stamp, async () => { await gate; request(); });
    budget.settle({ side: "baseline", trialId: "trial_baseline", caseId: "case_1", outcome: "unavailable", reason: "timeout", durationMs: 1 });
    resume();
    await expect(delayed).rejects.toThrow(/closed/);
  });
});

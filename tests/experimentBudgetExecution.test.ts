import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { createExperimentBudget } from "../src/budgets/experimentBudget.js";
import { initCasebook } from "../src/casebooks/casebookStore.js";
import { executeCaseTrials, type TrialRunner } from "../src/experiments/trialExecutor.js";
import { nativeTrialRunner } from "../src/experiments/nativeTrialRunner.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { scriptedAdapter, textStep, FixedCredentials, silentTransport, LOOP_PROVIDER, LOOP_MODEL } from "./helpers/agentLoopHarness.js";
import { sha256Hex } from "../src/utils/hash.js";
import { openLedger } from "../src/ledger/ledger.js";

let workspace: string;
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-budget-executions-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initCasebook(workspace, "default", "book");
  const config = loadBudgetsConfig(workspace);
  config.budgets.perAgent.default!.unknownTokenUsage = "ALLOW_WITH_WARNING";
  config.budgets.perAgent.default!.nativeUsdBounds = [{ providerId: LOOP_PROVIDER, model: LOOP_MODEL,
    encoderId: "anthropic-messages", encoderVersion: 1, endpoint: "https://fixture.invalid/v1/messages",
    maxRequestBytes: 100000, maxOutputTokens: 64, maxCostUsd: 0.1, source: "fixture worst case", expiresAt: new Date(Date.now() + 3600000).toISOString() }];
  writeFileSync(budgetsPath(workspace), YAML.stringify(config)); signBudgetsConfig(workspace);
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));
function execute(runTrial: TrialRunner, budget?: Parameters<typeof executeCaseTrials>[0]["budget"], concurrency = 1) {
  const configPath = join(workspace, "persona.txt");
  writeFileSync(configPath, "Answer briefly.");
  const configDigest = sha256Hex("Answer briefly.");
  return executeCaseTrials({ workspace, casebookId: "book", caseIds: ["case_1"], mode: "supervise", runTrial,
    arms: [{ side: "baseline", configPath, configDigest }, { side: "candidate", configPath, configDigest }], budget, limits: { concurrency } });
}
function runner(): TrialRunner {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
    adapter: scriptedAdapter([textStep("done"), textStep("done"), textStep("done")]) });
  return nativeTrialRunner({ workspace, agentId: "default", harnessVersion: "test", tools: "none", maxSteps: 2,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 64 } },
    makeLlm: session => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport }) });
}
describe("budget and effective-config integration through WP04's execution seam", () => {
  it("refuses the full experiment before any trial runs", async () => {
    let calls = 0;
    const budget = createExperimentBudget({ workspace, agentId: "default", maxCostUsd: 0.29,
      maxRequestsPerExecution: { baseline: 1, candidate: 1 }, auxiliaryRequests: { judge: 1 } });
    await expect(execute(async () => { calls++; return { ok: true }; }, budget)).rejects.toThrow(/whole experiment envelope/);
    expect(calls).toBe(0);
  });
  it("records actual native request config and labelled role costs in every signed settlement", async () => {
    const budget = createExperimentBudget({ workspace, agentId: "default", maxCostUsd: 0.3,
      maxRequestsPerExecution: { baseline: 1, candidate: 1 }, auxiliaryRequests: { judge: 1 } });
    const result = await execute(runner(), budget);
    expect(result.executions).toHaveLength(2);
    for (const execution of result.executions) {
      expect(execution.outcome).toBe("completed");
      expect(execution.resources?.receiptState).toBe("recorded");
      expect(execution.resources?.sessions[0]?.requests[0]).toMatchObject({ providerId: LOOP_PROVIDER, model: LOOP_MODEL });
      expect(execution.resources?.sessions[0]?.requests[0]?.effectiveConfigDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(execution.resources?.reportedCostUsd).toBeNull(); // scripted usage is never billed usage
      expect(execution.roleCosts).toBeDefined();
    }
    expect(budget.snapshot()).toMatchObject({ reservedCostUsd: 0.2, measuredCostUsd: null, settlementComplete: false });
    const ledger = openLedger(workspace);
    try {
      const settlements = ledger.getAllEvents().filter(row => row.event_type === "audit")
        .map(row => JSON.parse(row.meta_json) as Record<string, unknown>)
        .filter(meta => meta.auditType === "EXPERIMENT_CASE_TRIAL" && meta.phase === "settled");
      expect(settlements).toHaveLength(2);
      for (const row of settlements) { expect(row.resources).toBeDefined(); expect(row.roleCosts).toBeDefined(); }
    } finally { ledger.close(); }
  });
  it("refuses a completed foreign callback without admitted native request evidence", async () => {
    const budget = createExperimentBudget({ workspace, agentId: "default", maxCostUsd: 0.2,
      maxRequestsPerExecution: { baseline: 1, candidate: 1 } });
    await expect(execute(async () => ({ ok: true }), budget)).rejects.toThrow(/no admitted native request evidence/);
    expect(budget.snapshot().measuredCostUsd).toBeNull();
  });
  it("attributes auxiliary judge requests separately from executor requests in the same trial", async () => {
    const budget = createExperimentBudget({ workspace, agentId: "default", maxCostUsd: 0.3,
      maxRequestsPerExecution: { baseline: 1, candidate: 1 }, auxiliaryRequests: { judge: 1 } });
    let first = true;
    const native = runner();
    const result = await execute(async input => {
      if (first) { first = false; await budget.runStage("judge", async () => native(input)); }
      return await native(input);
    }, budget);
    const roles = result.executions[0]!.roleCosts!.roles;
    expect(roles.find(role => role.role === "judge")?.cost?.requests).toHaveLength(1);
    expect(roles.find(role => role.role === "executor")?.cost?.requests).toHaveLength(1);
    expect(budget.snapshot().reservedCostUsd).toBe(0.3);
  });
  it("awaits concurrent workers and stops scheduling after a settlement refusal", async () => {
    let calls = 0, finished = 0;
    const runTrial: TrialRunner = async () => {
      const index = calls++;
      if (index === 1) await new Promise(resolve => setTimeout(resolve, 30));
      finished++;
      return { ok: true };
    };
    await expect(execute(runTrial, { admit: () => undefined, settle: () => { throw new Error("settlement refused"); } }, 2)).rejects.toThrow(/settlement refused/);
    const finishedAtRejection = finished;
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(calls).toBe(2); expect(finishedAtRejection).toBe(2);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import YAML from "yaml";
import { gateToolCallsOnApproval } from "../src/agent/approvalGate.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import type { ApprovalDecision } from "../src/approvals/seam/approvalSeamTypes.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { NATIVE_BUDGET_RESERVATION } from "../src/budgets/nativeBudgetUsage.js";
import { openLedger } from "../src/ledger/ledger.js";
import { budgetGuard } from "../src/tools/guards/policyGuards.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import type { ToolMode } from "../src/tools/toolTypes.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * UX-03 with a spent budget: the guards' early look refuses an EXECUTE whose daily tool budget is used up before any
 * person is asked, in the budget guard's own words, and the look reserves nothing. A call that really runs as SIMULATE
 * is never refused for budget.
 */
let workspace: string;
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-budget-before-approval-"));
  initWorkspaceWithoutActionPolicy({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); });

function writeLowLimit(limit: number): void {
  const config = loadBudgetsConfig(workspace);
  config.budgets.perAgent.default!.daily.maxToolExecutes.WRITE_LOW = limit;
  writeFileSync(budgetsPath(workspace), YAML.stringify(config)); signBudgetsConfig(workspace);
}

function reservations(): number {
  const ledger = openLedger(workspace);
  try { return ledger.getAllEvents().filter(row => JSON.parse(row.meta_json).auditType === NATIVE_BUDGET_RESERVATION).length; }
  finally { ledger.close(); }
}

function compose(narrowTo?: ToolMode) {
  const registry = new ToolRegistry();
  const body = vi.fn(() => ({ ok: true, output: "ran" }));
  registry.define({ name: "write", actionClass: "WRITE_LOW", description: "fixture", parameters: { type: "object", properties: {}, additionalProperties: false }, body });
  registry.guard("budgets", budgetGuard(workspace));
  const approve = vi.fn(async () => "allow" as const);
  const pipeline = new ToolPipeline({ workspace, registry, approvalRequiredFor: new Set(["WRITE_LOW"]), approve,
    ...(narrowTo === undefined ? {} : { narrowMode: () => narrowTo }) });
  const run = () => pipeline.execute({ name: "write", agentId: "default", arguments: {}, requestedMode: "EXECUTE" });
  return { body, approve, pipeline, registry, run };
}

describe("UX-03: a spent budget refuses before anyone is asked", () => {
  test("the pipeline's own approval is not asked, the budget names the refusal and nothing is reserved", async () => {
    writeLowLimit(0);
    const { body, approve, run } = compose();
    const outcome = await run();
    expect(approve).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(outcome.denied).toMatchObject({ stage: "guard", guardLabel: "budgets" });
    expect(outcome.denied?.reason).toContain("daily tool budget exhausted for WRITE_LOW");
    expect(reservations()).toBe(0);
  });

  test("a gate's question is not put to a person either", async () => {
    writeLowLimit(0);
    const { body, pipeline, registry } = compose();
    const request = vi.fn(async () => ({ proceed: true, answer: "allow", answeredBy: "tester", reason: "ok", approvalId: "apr_1", approvalRequestId: null }) as unknown as ApprovalDecision);
    const gated = gateToolCallsOnApproval(pipelineToolSeam({ registry, pipeline, agentId: "default" }), { request }, { actionClass: "WRITE_LOW", riskTier: "low" });
    const result = await gated.execute({ callId: "c1", toolName: "write", rawArguments: "{}", sessionId: "s", turn: 1, step: 1, parentToken: null,
      dispatch: "native", signal: new AbortController().signal });
    expect(request).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(result.outcome).toBe("DENIED");
    expect(result.content).toContain("daily tool budget exhausted for WRITE_LOW");
    expect(reservations()).toBe(0);
  });

  test("with budget left the call is asked, runs, and is reserved exactly once", async () => {
    writeLowLimit(1);
    const { body, approve, run } = compose();
    const outcome = await run();
    expect(approve).toHaveBeenCalledTimes(1);
    expect(body).toHaveBeenCalledTimes(1);
    expect(outcome.denied).toBeNull();
    expect(reservations()).toBe(1);
  });

  test("a call that really runs as SIMULATE is never refused for budget", async () => {
    writeLowLimit(0);
    const { approve, run } = compose("SIMULATE");
    const outcome = await run();
    expect(approve).toHaveBeenCalledTimes(1);
    expect(outcome.denied).toBeNull();
    expect(reservations()).toBe(0);
  });
});

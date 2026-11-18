import { describe, expect, test, vi } from "vitest";
import { gateToolCallsOnApproval } from "../src/agent/approvalGate.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import type { ApprovalDecision } from "../src/approvals/seam/approvalSeamTypes.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import type { ToolOutcome, ToolExecution } from "../src/tools/toolTypes.js";

/**
 * UX-03: an automatic refuser (a guard, a hook) decides before a person is asked. A call the guards refuse is never put
 * to a person, so no approval is recorded for a call that did not run; the guards still run again after any approval.
 */
const workspace = "/tmp/amc-guard-before-approval";
const parameters = { type: "object", properties: {}, additionalProperties: false };
const granted: ApprovalDecision = { proceed: true, answer: "allow", answeredBy: "tester", reason: "ok", approvalId: "apr_1", approvalRequestId: null } as unknown as ApprovalDecision;

function compose(guard: (execution: ToolExecution) => string | undefined, prepare?: (execution: ToolExecution) => Promise<void>) {
  const registry = new ToolRegistry();
  const body = vi.fn(() => ({ ok: true, output: "ran" }));
  registry.define({ name: "bash", actionClass: "WRITE_LOW", description: "fixture", parameters, body });
  registry.guard("hook", guard);
  const records: ToolOutcome[] = [];
  const pipeline = new ToolPipeline({ registry, workspace, record: (_call, outcome) => { records.push(outcome); },
    ...(prepare === undefined ? {} : { prepareGuards: prepare }) });
  const seam = pipelineToolSeam({ registry, pipeline, agentId: "agent" });
  const request = vi.fn(async () => granted);
  const gated = gateToolCallsOnApproval(seam, { request }, { actionClass: "WRITE_LOW", riskTier: "low" });
  const run = () => gated.execute({ callId: "c1", toolName: "bash", rawArguments: "{}", sessionId: "s", turn: 1, step: 1, parentToken: null,
    dispatch: "native", signal: new AbortController().signal });
  return { body, records, request, run, pipeline };
}

describe("UX-03 automatic checks decide before a person is asked", () => {
  test("a call a guard refuses is never put to a person and is recorded as the guard's denial", async () => {
    const { body, records, request, run } = compose(() => "PreToolUse #1: QA guard: shell is blocked in this folder");
    const result = await run();
    expect(request).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(result.outcome).toBe("DENIED");
    expect(result.content).toContain("QA guard: shell is blocked in this folder");
    expect(records).toHaveLength(1);
    expect(records[0]!.denied?.stage).toBe("guard");
  });

  test("a call the guards let through is still asked, and runs once approved", async () => {
    const { body, request, run } = compose(() => undefined);
    const result = await run();
    expect(request).toHaveBeenCalledTimes(1);
    expect(body).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("OK");
  });

  test("the guards run again after the approval: a guard that refuses only then still stops the call", async () => {
    let calls = 0;
    const { body, request, run } = compose(() => (calls++ === 0 ? undefined : "refused after approval"));
    const result = await run();
    expect(request).toHaveBeenCalledTimes(1);
    expect(body).not.toHaveBeenCalled();
    expect(result.content).toContain("refused after approval");
  });

  test("a call refused before asking cannot run even if the guard lets it through on the second look", async () => {
    let calls = 0;
    const { body, request, run } = compose(() => (calls++ === 0 ? "first look refuses" : undefined));
    const result = await run();
    expect(request).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(result.outcome).toBe("DENIED");
  });

  test("an asynchronously prepared hook decision is made before asking", async () => {
    const decisions = new WeakMap<ToolExecution, string>();
    const { request, body, run } = compose((execution) => decisions.get(execution) ?? "not prepared",
      async (execution) => { decisions.set(execution, "hook says no"); });
    const result = await run();
    expect(request).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(result.content).toContain("hook says no");
  });

  test("the pipeline's own approval stage is not asked about a call a guard refuses", async () => {
    const registry = new ToolRegistry();
    const body = vi.fn(() => ({ ok: true, output: "ran" }));
    registry.define({ name: "pay", actionClass: "WRITE_LOW", description: "fixture", parameters, body });
    registry.guard("policy", () => "policy forbids it");
    const approve = vi.fn(async () => "allow" as const);
    const pipeline = new ToolPipeline({ registry, workspace, approve, approvalRequiredFor: new Set(["WRITE_LOW"]) });
    const outcome = await pipeline.execute({ name: "pay", agentId: "agent", arguments: {}, requestedMode: "EXECUTE" });
    expect(approve).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(outcome.denied).toEqual({ stage: "guard", reason: "policy forbids it", guardLabel: "policy" });
  });

  test("a Code Mode sub-call the guards refuse is not put to a person through the bound gate", async () => {
    const registry = new ToolRegistry();
    const body = vi.fn(() => ({ ok: true, output: "ran" }));
    registry.define({ name: "bash", actionClass: "WRITE_LOW", description: "fixture", parameters, body });
    registry.guard("hook", () => "hook refuses the sub-call");
    const pipeline = new ToolPipeline({ registry, workspace });
    const ask = vi.fn(async () => ({ approvalRequestIds: ["apr"] }));
    pipeline.bindApprovalGate({ gates: () => true, ask });
    const outcome = await pipeline.execute({ name: "bash", agentId: "agent", arguments: {}, requestedMode: "EXECUTE", parentToken: "program" });
    expect(ask).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(outcome.denied?.reason).toBe("hook refuses the sub-call");
  });

  test("a guard that refuses never sees an EXECUTE mode before approval, so no budget is reserved by the early look", async () => {
    const modes: string[] = [];
    const { run } = compose((execution) => { modes.push(execution.effectiveMode); return undefined; });
    await run();
    expect(modes[0]).toBe("SIMULATE");
    expect(modes[1]).toBe("EXECUTE");
  });
});

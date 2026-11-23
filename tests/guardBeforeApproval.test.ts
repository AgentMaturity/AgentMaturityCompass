import { describe, expect, test, vi } from "vitest";
import { gateToolCallsOnApproval } from "../src/agent/approvalGate.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import type { ApprovalDecision } from "../src/approvals/seam/approvalSeamTypes.js";
import type { ToolApprovalSeam } from "../src/agent/approvalGate.js";
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
  return { body, records, request, run, pipeline, seam };
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

describe("the approval gate over a real pipeline seam", () => {
  const refused: ApprovalDecision = { proceed: false, answer: "deny", answeredBy: "tester", reason: "no", approvalId: "apr_2", approvalRequestId: null } as unknown as ApprovalDecision;

  function composeReadOnly(decision: ApprovalDecision) {
    const registry = new ToolRegistry();
    const body = vi.fn(() => ({ ok: true, output: "ran" }));
    registry.define({ name: "peek", actionClass: "READ_ONLY", description: "fixture", parameters, body });
    const pipeline = new ToolPipeline({ registry, workspace });
    const seam = pipelineToolSeam({ registry, pipeline, agentId: "agent" });
    const request = vi.fn(async (_ask: Parameters<ToolApprovalSeam["request"]>[0]) => decision);
    const gated = gateToolCallsOnApproval(seam, { request }, { actionClass: "WRITE_LOW", riskTier: "low", exemptToolNames: ["ask_user"] });
    return { body, pipeline, request, gated, seam };
  }

  test("a Code Mode sub-call is asked through the bound gate, naming the program's call, and runs once granted", async () => {
    const { body, pipeline, request } = composeReadOnly(granted);
    const outcome = await pipeline.execute({ name: "peek", agentId: "agent", arguments: {}, requestedMode: "EXECUTE", parentToken: "program", callId: "sub-1", rootCallId: "root-7" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toMatchObject({ toolCallId: "sub-1", toolName: "peek", question: 'The agent wants to call "peek" from inside the program of call root-7.',
      intentPayload: { toolName: "peek", arguments: {} }, display: { arguments: {} } });
    expect(body).toHaveBeenCalledTimes(1);
    expect(outcome.denied).toBeNull();
  });

  test("a Code Mode sub-call the person refuses is denied at the approval stage and never runs", async () => {
    const { body, pipeline, request } = composeReadOnly(refused);
    const outcome = await pipeline.execute({ name: "peek", agentId: "agent", arguments: {}, requestedMode: "EXECUTE", parentToken: "program" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(body).not.toHaveBeenCalled();
    expect(outcome.denied).toEqual({ stage: "approval", reason: "approval not granted for this sub-call", guardLabel: null });
  });

  test("a refused top-level call tells the model who refused it and why, and never runs", async () => {
    const { body, gated } = composeReadOnly(refused);
    const result = await gated.execute({ callId: "c2", toolName: "peek", rawArguments: "{}", sessionId: "s", turn: 3, step: 2, parentToken: null,
      dispatch: "native", signal: new AbortController().signal });
    expect(body).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: "DENIED", denied: true, exitCode: null, timedOut: false,
      content: '[amc:approval] "peek" was not approved (answer: deny, decided by: tester). Reason: no Approval id: apr_2.' });
  });

  test("the gated seam says which tools it asks about and passes the inner seam's checks through", async () => {
    const { gated, seam } = composeReadOnly(granted);
    expect(gated.asksBeforeRunning?.("peek")).toBe(true);
    expect(gated.asksBeforeRunning?.("ask_user")).toBe(false);
    expect(gated.actionClassOf?.("peek")).toBe("READ_ONLY");
    const request = { callId: "c3", toolName: "peek", rawArguments: "{}", sessionId: "s", turn: 1, step: 1, parentToken: null, dispatch: "native" as const,
      signal: new AbortController().signal };
    expect(await gated.denialBeforeApproval?.(request)).toBeNull();
    const shutdown = vi.fn(async () => true);
    const owned = gateToolCallsOnApproval({ ...seam, shutdown, hasOwnedWork: () => true }, { request: vi.fn(async () => granted) }, { actionClass: "WRITE_LOW", riskTier: "low" });
    expect(owned.hasOwnedWork?.()).toBe(true);
    expect(await owned.shutdown?.()).toBe(true);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  test("the effect guard backstop: a wrapper that drops the early refusal still cannot run the call, and says why", async () => {
    let looks = 0;
    const { body, records, request, seam } = compose(() => (looks++ === 0 ? "first look refuses" : undefined));
    const dropping: typeof seam = { ...seam, execute: (call) => { const { refusedBeforeApproval: _dropped, ...rest } = call; return seam.execute(rest); } };
    const gated = gateToolCallsOnApproval(dropping, { request }, { actionClass: "WRITE_LOW", riskTier: "low" });
    const result = await gated.execute({ callId: "c4", toolName: "bash", rawArguments: "{}", sessionId: "s", turn: 1, step: 1, parentToken: null,
      dispatch: "native", signal: new AbortController().signal });
    expect(request).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(result.outcome).toBe("DENIED");
    expect(result.content).toContain("not run: the automatic checks refused it before anyone was asked (first look refuses)");
    expect(records.at(-1)?.denied?.reason).toContain("first look refuses");
  });
});

describe("the early look (denialBeforeApproval) only refuses what the guards refuse", () => {
  function pipelineWith(guard: () => string | undefined, extra: { exposure?: "code-only"; prepareGuards?: () => Promise<void> } = {}) {
    const registry = new ToolRegistry();
    const strict = { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false };
    registry.define({ name: "edit", actionClass: "WRITE_LOW", description: "fixture", parameters: strict, body: () => ({ ok: true, output: "ran" }),
      ...(extra.exposure === undefined ? {} : { exposure: extra.exposure }) });
    registry.guard("hook", guard);
    return new ToolPipeline({ registry, workspace, ...(extra.prepareGuards === undefined ? {} : { prepareGuards: extra.prepareGuards }) });
  }
  const look = (pipeline: ToolPipeline, args: Record<string, unknown>) =>
    pipeline.denialBeforeApproval({ name: "edit", agentId: "agent", arguments: args, requestedMode: "EXECUTE" });

  test("without a turn signal the guard's refusal is returned with its label", async () => {
    expect(await look(pipelineWith(() => "no edits here"), { path: "a.txt" })).toEqual({ stage: "guard", reason: "no edits here", guardLabel: "hook" });
  });

  test("a call the route or the schema refuses is left to the call itself, not refused early", async () => {
    const guard = vi.fn(() => "would refuse");
    expect(await look(pipelineWith(guard), { wrong: true })).toBeNull();
    expect(await look(pipelineWith(guard, { exposure: "code-only" }), { path: "a.txt" })).toBeNull();
    expect(await pipelineWith(guard).denialBeforeApproval({ name: "missing", agentId: "agent", arguments: {}, requestedMode: "EXECUTE" })).toBeNull();
    expect(guard).not.toHaveBeenCalled();
  });

  test("a look whose guard preparation fails only asks: the later stage decides", async () => {
    const guard = vi.fn(() => "refused");
    expect(await look(pipelineWith(guard, { prepareGuards: async () => { throw new Error("hook runner down"); } }), { path: "a.txt" })).toBeNull();
    expect(guard).not.toHaveBeenCalled();
  });
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { EMPTY_TOOL_SEAM, type AgentToolSeam } from "../src/agent/toolSeam.js";
import { freezeNativeValidationPlan, type NativeValidationPlan } from "../src/agent/nativeValidation.js";
import { projectNativeValidation } from "../src/agent/nativeValidationProjection.js";
import { parseNativeValidationResult } from "../src/agent/nativeValidationResult.js";
import { readAgentRunSummary, verifyAgentRun } from "../src/agent/runReport.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { bashTool } from "../src/tools/builtin/bashTool.js";
import type { SandboxOutcome } from "../src/sandbox/sandboxTypes.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { loopHarness, textStep, maxTokensStep, LOOP_PROVIDER, LOOP_MODEL, type LoopHarness } from "./helpers/agentLoopHarness.js";

const opened: LoopHarness[] = [];
afterEach(() => {
  for (const harness of opened.splice(0)) { try { harness.finish(); } finally { harness.session.disposeWithoutClosing(); rmSync(harness.dir, { recursive: true, force: true }); } }
  vi.unstubAllEnvs();
});
const plan = (...commands: string[]): NativeValidationPlan => ({ configSha256: "a".repeat(64), checks: commands.map((command, index) => ({ id: `check_${index}`, title: `Public check ${index}`, command, timeoutMs: 5000 })) });
function fixture(scripts = [textStep("The model says everything passes.")]) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-native-validation-fixture");
  const harness = loopHarness({ scripts }); opened.push(harness); return harness;
}
/** Real bounded local processes behind an explicitly fixture-trusted pipeline; no native confinement claim. */
function processTools(workspace: string): AgentToolSeam {
  const registry = new ToolRegistry(); registry.define(bashTool());
  return pipelineToolSeam({ registry, pipeline: new ToolPipeline({ workspace, registry }), agentId: "default" });
}
function driver(harness: LoopHarness, validation: NativeValidationPlan, tools: AgentToolSeam = processTools(harness.dir)): AgentDriver {
  return new AgentDriver({ session: harness.session, llm: harness.llm, systemPromptEventId: harness.systemPromptEventId,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } }, tools, validation,
    config: { toolAbandonGraceMs: 20 } });
}
function validationRows(harness: LoopHarness) { return harness.events().filter(row => JSON.parse(row.meta_json).kind === "native-validation"); }

describe("native public validation is independent of model completion", () => {
  test("an unrequested model claim is not a validation pass and dispatches no check", async () => {
    const f = fixture(); f.driver.followup("review"); await f.driver.whenIdle();
    expect(readAgentRunSummary(f.dir, f.sessionId, f.driver.status).validation).toMatchObject({ status: "not-requested", turn: 1, checks: [] });
    expect(validationRows(f)).toEqual([]); expect(f.tools.calls).toEqual([]);
  });

  test("executes only selected public commands, retains actual exits, and leaves requests reconstructable", async () => {
    const f = fixture(); const d = driver(f, plan("printf 'public pass'; printf 'effect' > validation-marker", "printf 'public failure'; exit 7"));
    d.followup("review"); await d.whenIdle(); f.finish();
    const summary = readAgentRunSummary(f.dir, f.sessionId, d.status);
    expect(summary.endings.map(row => row.reason)).toEqual(["complete"]);
    expect(summary.requests).toBe(1); expect(summary.toolCalls).toBe(0);
    expect(summary.validation).toMatchObject({ status: "failed", turn: 1, configSha256: "a".repeat(64), checks: [
      { id: "check_0", status: "passed", exitCode: 0 }, { id: "check_1", status: "failed", exitCode: 7, reason: "nonzero-exit" }
    ] });
    expect(parseNativeValidationResult(summary.validation)).toEqual(summary.validation);
    expect(readFileSync(join(f.dir, "validation-marker"), "utf8")).toBe("effect");
    for (const [index, check] of summary.validation.checks.entries()) {
      const row = f.events().find(event => event.id === check.outputEventId)!;
      const payload = readEventPayload(f.dir, row); expect(payload.status).toBe("ok");
      if (payload.status === "ok") expect(payload.bytes.toString("utf8")).toBe(index === 0 ? "public pass" : "public failure");
      expect(extractEnvelope(row.meta_json)?.sessionId).toBe(f.sessionId); expect(row.writer_sig).not.toBe("unsigned");
    }
    // Operator checks are non-conversation evidence, never fabricated assistant/tool turns.
    expect(f.events().filter(row => row.event_type === "tool/call" || row.event_type === "tool/result")).toHaveLength(0);
    const verified = await verifyAgentRun(f.dir, f.sessionId);
    expect(verified.ok, JSON.stringify(verified)).toBe(true); expect(verified.requests).toHaveLength(1);
  });

  test("a later truncated turn cannot inherit a prior passed check", async () => {
    const f = fixture([textStep("complete"), maxTokensStep("incomplete")]); const d = driver(f, plan("printf checked >> count.txt"));
    d.followup("first"); await d.whenIdle(); expect(projectNativeValidation(f.dir, f.events()).status).toBe("passed");
    d.followup("second"); await d.whenIdle();
    expect(projectNativeValidation(f.dir, f.events())).toMatchObject({ status: "unavailable", turn: 2, checks: [{ status: "unavailable", reason: "turn-max_tokens" }] });
    expect(readFileSync(join(f.dir, "count.txt"), "utf8")).toBe("checked");
  });

  test("tools none cannot run checks or silently count as passed", async () => {
    const f = fixture(); const d = driver(f, plan("touch forbidden", "touch second"), EMPTY_TOOL_SEAM);
    d.followup("review"); await d.whenIdle();
    expect(projectNativeValidation(f.dir, f.events())).toMatchObject({ status: "unavailable", checks: [
      { status: "unavailable", reason: "execution-unavailable" }, { status: "unavailable", reason: "prior-check-unavailable" }
    ] });
    expect(existsSync(join(f.dir, "forbidden"))).toBe(false); expect(existsSync(join(f.dir, "second"))).toBe(false);
  });

  test("permission refusal stays unavailable with actual denial output and no command side effect", async () => {
    const f = fixture(); const execute = vi.fn(async () => ({ outcome: "DENIED" as const, content: "Signed policy refuses bash", exitCode: null, timedOut: false, denied: true }));
    const d = driver(f, plan("touch forbidden"), { ...EMPTY_TOOL_SEAM, execute }); d.followup("review"); await d.whenIdle();
    expect(execute).toHaveBeenCalledTimes(1); expect(execute.mock.calls[0]).toBeDefined();
    expect(projectNativeValidation(f.dir, f.events())).toMatchObject({ status: "unavailable", checks: [{ reason: "execution-denied", exitCode: null }] });
    expect(existsSync(join(f.dir, "forbidden"))).toBe(false);
  });

  test("cancellation settles an uncooperative check, records unknown, and never starts the next check", async () => {
    const f = fixture(); const observed: { signal?: AbortSignal } = {}; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const execute = vi.fn((request: Parameters<AgentToolSeam["execute"]>[0]) => { observed.signal = request.signal; entered(); return new Promise<Awaited<ReturnType<AgentToolSeam["execute"]>>>(() => {}); });
    const d = driver(f, plan("never returns", "must not run"), { ...EMPTY_TOOL_SEAM, execute });
    d.followup("review"); await started;
    expect(projectNativeValidation(f.dir, f.events())).toMatchObject({ status: "pending", checks: [{ status: "pending" }, { status: "pending" }] });
    d.cancel({ kind: "user" }); await d.whenIdle();
    expect(observed.signal?.aborted).toBe(true); expect(execute).toHaveBeenCalledTimes(1);
    const summary = readAgentRunSummary(f.dir, f.sessionId, d.status);
    expect(summary.endings[0]).toMatchObject({ reason: "cancelled", cancelCause: "user" });
    expect(summary.validation).toMatchObject({ status: "unavailable", checks: [{ reason: "cancelled" }, { reason: "cancelled" }] });
    expect(summary.validation.checks[0]?.callId).toMatch(/^validation-/);
    expect(parseNativeValidationResult(summary.validation)).toEqual(summary.validation);
  });

  test("the reviewed plan is immutable after driver construction", async () => {
    const f = fixture(); const check = { id: "_check", title: "Public", command: "printf original > marker", timeoutMs: 5000 };
    const d = driver(f, { configSha256: "b".repeat(64), checks: [check] }); check.command = "touch forbidden";
    d.followup("review"); await d.whenIdle(); expect(readFileSync(join(f.dir, "marker"), "utf8")).toBe("original");
    expect(existsSync(join(f.dir, "forbidden"))).toBe(false); expect(projectNativeValidation(f.dir, f.events()).status).toBe("passed");
  });

  test("a check deadline cannot become a successful pass when the seam ignores cancellation", async () => {
    const f = fixture(); const execute = vi.fn(() => new Promise<Awaited<ReturnType<AgentToolSeam["execute"]>>>(() => {}));
    const d = driver(f, { configSha256: "a".repeat(64), checks: [{ id: "deadline", title: "Deadline", command: "never returns", timeoutMs: 20 }] }, { ...EMPTY_TOOL_SEAM, execute });
    d.followup("review"); await d.whenIdle();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(projectNativeValidation(f.dir, f.events())).toMatchObject({ status: "unavailable", checks: [{ timedOut: true, reason: "deadline-exceeded", exitCode: null }] });
    expect(readAgentRunSummary(f.dir, f.sessionId, d.status).endings[0]?.reason).toBe("complete");
  });

  test("invalid signatures or removed result rows cannot project passed", async () => {
    const f = fixture(); const d = driver(f, plan("exit 0")); d.followup("review"); await d.whenIdle();
    const rows = f.events(); expect(projectNativeValidation(f.dir, rows).status).toBe("passed");
    const resultId = projectNativeValidation(f.dir, rows).checks[0]!.outputEventId;
    expect(projectNativeValidation(f.dir, rows.map(row => row.id === resultId ? { ...row, writer_sig: "unsigned" } : row)).status).toBe("unavailable");
    expect(projectNativeValidation(f.dir, rows.filter(row => row.id !== resultId)).status).toBe("unavailable");
    expect(projectNativeValidation(f.dir, rows.filter(row => JSON.parse(row.meta_json).phase !== "finished")).status).toBe("unavailable");
  });

  test("a signed fabricated final claim without matching execution cannot project passed", () => {
    const f = fixture(); f.session.startTurn({ trigger: "user" });
    f.session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: { kind: "native-validation", version: 1, phase: "finished", turn: 1,
      configSha256: "a".repeat(64), status: "passed", checks: [] } });
    expect(projectNativeValidation(f.dir, f.events()).status).toBe("unavailable");
    f.session.endTurn({ reason: "complete" }); f.session.sealTurn();
  });
});

test("validation wire parser rejects empty passes, unknown fields and impossible check outcomes", () => {
  expect(parseNativeValidationResult({ status: "passed", turn: 1, configSha256: "a".repeat(64), checks: [] })).toBeNull();
  expect(parseNativeValidationResult({ status: "not-requested", turn: 1, configSha256: null, checks: [], fabricated: true })).toBeNull();
  expect(parseNativeValidationResult({ status: "passed", turn: 1, configSha256: "a".repeat(64), checks: [{ id: "x", title: "x", status: "passed", callId: "x", exitCode: 9, timedOut: false, reason: null, outputEventId: "row" }] })).toBeNull();
  expect(parseNativeValidationResult({ status: "not-requested", turn: null, configSha256: null, checks: [] })).not.toBeNull();
});

test.each(["dot.name", "", "x".repeat(65)])("invalid check ID %s refuses before execution", id => {
  expect(() => freezeNativeValidationPlan({ configSha256: "a".repeat(64), checks: [{ id, title: "Check", command: "exit 0", timeoutMs: 100 }] })).toThrow();
});

describe("confined shell outcome mapping (synthetic backend receipts, no OS qualification)", () => {
  const completed: SandboxOutcome = { confined: true, backend: "bwrap", failure: null, exitCode: 0, timedOut: false,
    stdout: "fixture output", stderr: "", writableRoots: [], treeExitProven: true, cancelled: false };
  test.each([
    { label: "passed", changes: {}, ok: true, exitCode: 0, timedOut: false },
    { label: "nonzero", changes: { exitCode: 7 }, ok: false, exitCode: 7, timedOut: false },
    { label: "deadline", changes: { exitCode: 137, timedOut: true }, ok: false, exitCode: 137, timedOut: true },
    { label: "unproven cleanup", changes: { treeExitProven: false }, ok: false, exitCode: null, timedOut: false },
    { label: "cancelled", changes: { cancelled: true }, ok: false, exitCode: null, timedOut: false },
    { label: "unavailable", changes: { confined: false, failure: { kind: "unavailable", reason: "Fixture backend unavailable" } }, ok: false, exitCode: null, timedOut: false }
  ] satisfies Array<{ label: string; changes: Partial<SandboxOutcome>; ok: boolean; exitCode: number | null; timedOut: boolean }>) ("$label preserves known facts and never labels unavailable as command success", async expected => {
    const f = fixture(); const registry = new ToolRegistry();
    registry.define(bashTool({ runConfined: async () => ({ ...completed, ...expected.changes }) }));
    const outcome = await new ToolPipeline({ registry, workspace: f.dir }).execute({ name: "bash", agentId: "default", arguments: { command: "unused fixture", timeoutMs: 50 }, requestedMode: "EXECUTE" });
    expect(outcome).toMatchObject({ ok: expected.ok, exitCode: expected.exitCode, timedOut: expected.timedOut, denied: null });
  });
});

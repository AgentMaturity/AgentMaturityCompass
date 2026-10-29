/**
 * GAP-WP31: public failures may drive bounded, operator-selected repair. These
 * fixtures use real local files and processes behind an explicitly trusted
 * test pipeline; they do not claim operating-system confinement or an oracle.
 */
import { existsSync, linkSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { NO_HOOKS } from "../src/agent/loopTypes.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { freezeNativeValidationRepairPolicy, type NativeValidationPlan, type NativeValidationRepairPolicy } from "../src/agent/nativeValidation.js";
import { projectNativeValidation } from "../src/agent/nativeValidationProjection.js";
import { parseNativeValidationResult } from "../src/agent/nativeValidationResult.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import { readAgentRunSummary, verifyAgentRun } from "../src/agent/runReport.js";
import type { AgentToolSeam, ToolCallOutcome, ToolCallRequest } from "../src/agent/toolSeam.js";
import { bashTool } from "../src/tools/builtin/bashTool.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";
import { ToolPipeline, type ToolApprovalAsker } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { openActionJournal } from "../src/actions/actionJournal.js";
import { bodyFromChunks, type HttpTransport, type HttpResponse } from "../src/llm/adapter/transport.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  loopHarness, textStep, toolStep, LOOP_MODEL, LOOP_PROVIDER,
  type LoopHarness, type ScriptedStream
} from "./helpers/agentLoopHarness.js";

interface RepairPolicy {
  maxRounds: number;
  maxRequests: number;
  maxTokens: number;
  timeoutMs: number;
  allowedEditPaths: string[];
  maxCostUsd?: number;
}
type RepairPlan = Omit<NativeValidationPlan, "checks"> & { checks: NativeValidationPlan["checks"]; repair?: RepairPolicy };
const opened: LoopHarness[] = [];
afterEach(() => {
  for (const harness of opened.splice(0)) {
    try { harness.finish(); }
    finally { harness.session.disposeWithoutClosing(); rmSync(harness.dir, { recursive: true, force: true }); }
  }
  vi.unstubAllEnvs();
});

const PUBLIC_COMMAND = "cat calculation.txt; grep -qx fixed calculation.txt";
const read = () => toolStep("repair-read", "fs.read", JSON.stringify({ path: "calculation.txt" }));
const edit = (find = "broken", replace = "fixed") =>
  toolStep("repair-edit", "fs.edit", JSON.stringify({ path: "calculation.txt", find, replace }));
const successScripts = (): ScriptedStream[] => [textStep("Initial completion."), read(), edit(), textStep("Repair completion.")];
const policy = (overrides: Partial<RepairPolicy> = {}): RepairPolicy => ({
  maxRounds: 2, maxRequests: 8, maxTokens: 100_000, timeoutMs: 10_000,
  allowedEditPaths: ["calculation.txt"], ...overrides
});
const plan = (repair = policy()): RepairPlan => ({
  configSha256: "a".repeat(64),
  checks: [{ id: "public", title: "Public calculation check", command: PUBLIC_COMMAND, timeoutMs: 5_000 }],
  repair
});

function fixture(scripts = successScripts(), approve?: ToolApprovalAsker, transport?: HttpTransport) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-native-validation-repair-fixture");
  const harness = loopHarness({ scripts, ...(transport === undefined ? {} : { transport }) }); opened.push(harness);
  writeFileSync(join(harness.dir, "calculation.txt"), "broken\n");
  writeFileSync(join(harness.dir, "hidden-fixture.txt"), "HIDDEN_ORACLE_SENTINEL\n");
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
  registry.define(bashTool());
  const governed = pipelineToolSeam({ registry, pipeline: new ToolPipeline({ workspace: harness.dir, registry,
    ...(approve === undefined ? {} : { approve, approvalRequiredFor: new Set(["READ_ONLY"]) }) }), agentId: "default" });
  const calls: ToolCallRequest[] = [];
  const tools: AgentToolSeam = {
    ...governed,
    execute(request) { calls.push(request); return governed.execute(request); }
  };
  return { harness, calls, tools };
}
function driver(f: ReturnType<typeof fixture>, validation = plan(), tools = f.tools, maxStepsPerTurn = 20,
  params: Record<string, unknown> = { max_tokens: 256 }) {
  return new AgentDriver({ session: f.harness.session, llm: f.harness.llm,
    systemPromptEventId: f.harness.systemPromptEventId,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params },
    tools, validation, config: { toolAbandonGraceMs: 20, maxStepsPerTurn } });
}
async function run(f: ReturnType<typeof fixture>, validation = plan(), tools = f.tools) {
  const instance = driver(f, validation, tools);
  instance.followup("Repair only the explicitly selected public failure within the operator policy.");
  await instance.whenIdle();
  return instance;
}
function meta(row: EvidenceEvent): Record<string, unknown> { return JSON.parse(row.meta_json); }
function validationRows(f: ReturnType<typeof fixture>) {
  return f.harness.events().filter(row => meta(row).kind === "native-validation");
}
function repairRows(f: ReturnType<typeof fixture>) {
  return f.harness.events().filter(row => meta(row).kind === "native-validation-repair");
}
function starts(f: ReturnType<typeof fixture>) {
  return validationRows(f).filter(row => meta(row).phase === "check-start");
}
function payload(row: EvidenceEvent, harness: LoopHarness): string {
  const content = readEventPayload(harness.dir, row);
  expect(content.status).toBe("ok");
  return content.status === "ok" ? content.bytes.toString("utf8") : "";
}

describe("bounded native public validation repair", () => {
  test("repairs a real public failure through governed edits and re-runs the same frozen command", async () => {
    const f = fixture(); const d = await run(f);
    expect(new LoopInbox(f.harness.session, NO_HOOKS.notify).hasPending).toBe(false);
    f.harness.finish();
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.endings.map(ending => ending.reason)).toEqual(["complete"]);
    expect(summary.requests).toBe(4);
    expect(summary.toolCalls).toBe(2);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("fixed\n");
    expect(summary.validation).toMatchObject({ status: "passed", configSha256: "a".repeat(64), checks: [{ id: "public", status: "passed", exitCode: 0 }] });
    expect(parseNativeValidationResult(summary.validation)).toEqual(summary.validation);
    const checks = f.calls.filter(call => call.callId.startsWith("validation-"));
    expect(checks).toHaveLength(2);
    expect(checks.map(call => JSON.parse(call.rawArguments).command)).toEqual([PUBLIC_COMMAND, PUBLIC_COMMAND]);
    const results = validationRows(f).filter(row => meta(row).phase === "check-result");
    expect(results.map(row => ({ round: meta(row).round, status: meta(row).status }))).toEqual([
      { round: 0, status: "failed" }, { round: 1, status: "passed" }
    ]);
    expect(payload(results[0]!, f.harness)).toContain("broken");
    expect(payload(results[1]!, f.harness)).toContain("fixed");
    const rows = repairRows(f);
    expect(new Set(rows.map(row => meta(row).phase))).toEqual(new Set(["requested", "round-start", "reservation", "round-result", "stopped"]));
    expect(rows.every(row => row.writer_sig !== "unsigned")).toBe(true);
    expect(rows.every(row => meta(row).configSha256 === "a".repeat(64))).toBe(true);
    expect((await verifyAgentRun(f.harness.dir, f.harness.sessionId)).ok).toBe(true);
    // No oracle verdict or hidden material is needed to improve a public check.
    const conversation = f.harness.events().filter(row => ["message/user", "message/assistant", "tool/result"].includes(row.event_type));
    expect(conversation.map(row => payload(row, f.harness)).join("\n")).not.toContain("HIDDEN_ORACLE_SENTINEL");
  });

  test("repairs a reproducible arithmetic bug against the same public assertion", async () => {
    const scripts = [textStep("Initial completion."),
      toolStep("read-arithmetic", "fs.read", JSON.stringify({ path: "calculator.cjs" })),
      toolStep("edit-arithmetic", "fs.edit", JSON.stringify({ path: "calculator.cjs", find: "a - b", replace: "a + b" })),
      textStep("Arithmetic repair complete.")];
    const f = fixture(scripts);
    writeFileSync(join(f.harness.dir, "calculator.cjs"), "module.exports = (a, b) => a - b;\n");
    const command = `node -e "require('node:assert/strict').equal(require('./calculator.cjs')(2, 3), 5)"`;
    const selected = plan(policy({ maxRounds: 1, maxRequests: 3, timeoutMs: 30000, allowedEditPaths: ["calculator.cjs"] }));
    selected.checks = [{ id: "arithmetic", title: "Public arithmetic assertion", command, timeoutMs: 5000 }];
    const d = await run(f, selected); f.harness.finish();
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.validation.status).toBe("passed"); expect(summary.requests).toBe(4);
    expect(readFileSync(join(f.harness.dir, "calculator.cjs"), "utf8")).toBe("module.exports = (a, b) => a + b;\n");
    const results = validationRows(f).filter(row => meta(row).phase === "check-result");
    expect(results.map(row => meta(row).status)).toEqual(["failed", "passed"]);
    expect(results.map(row => meta(row).exitCode)).toEqual([1, 0]);
    expect(f.calls.filter(call => call.callId.startsWith("validation-")).map(call => JSON.parse(call.rawArguments).command)).toEqual([command, command]);
    expect((await verifyAgentRun(f.harness.dir, f.harness.sessionId)).ok).toBe(true);
  });

  test("a public pass never starts repair or changes the selected files", async () => {
    const f = fixture(); writeFileSync(join(f.harness.dir, "calculation.txt"), "fixed\n");
    const d = await run(f);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1); expect(summary.toolCalls).toBe(0);
    expect(summary.validation.status).toBe("passed"); expect(starts(f)).toHaveLength(1);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("fixed\n");
    expect(repairRows(f).filter(row => meta(row).phase === "round-start")).toHaveLength(0);
  });

  test("a real failed check followed by an unknown check cannot start repair", async () => {
    const f = fixture(); const selected = plan();
    selected.checks = [...selected.checks, { id: "unknown", title: "Unknown check", command: "unused", timeoutMs: 1000 }];
    const tools: AgentToolSeam = { ...f.tools, execute: request => JSON.parse(request.rawArguments).command === "unused"
      ? Promise.resolve({ outcome: "TOOL_OUTCOME_UNKNOWN", content: "unresolved", exitCode: null, timedOut: false, denied: false })
      : f.tools.execute(request) };
    const d = await run(f, selected, tools);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1); expect(summary.toolCalls).toBe(0);
    expect(summary.validation.checks.map(check => check.status)).toEqual(["failed", "unavailable"]);
    expect(repairRows(f).filter(row => meta(row).phase === "round-start")).toHaveLength(0);
    expect(repairRows(f).filter(row => meta(row).phase === "stopped").map(row => meta(row).reason)).toEqual(["validation-unavailable"]);
  });

  test("zero rounds preserves one model completion and one validation execution", async () => {
    const f = fixture(); const d = await run(f, plan(policy({ maxRounds: 0 })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1);
    expect(summary.toolCalls).toBe(0);
    expect(summary.validation.status).toBe("failed");
    expect(starts(f)).toHaveLength(1);
    expect(f.calls.map(call => call.toolName)).toEqual(["bash"]);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
    expect(repairRows(f)).toEqual([]);
  });

  test("a seam without an effect-boundary capability cannot start repair", async () => {
    const f = fixture();
    const tools = { ...f.tools };
    Reflect.deleteProperty(tools, "supportsEffectGuard");
    const d = await run(f, plan(), tools);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1);
    expect(summary.toolCalls).toBe(0);
    expect(summary.validation.status).toBe("failed");
    expect(starts(f)).toHaveLength(1);
    expect(repairRows(f).filter(row => meta(row).phase === "round-start")).toHaveLength(0);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
  });

  test.each(["absolute", "symlink", "hardlink"] as const)("an operator-selected %s alias refuses before the initial model request", async kind => {
    const f = fixture();
    const original = join(f.harness.dir, "calculation.txt");
    const alias = join(f.harness.dir, "alias.txt");
    if (kind === "symlink") symlinkSync("calculation.txt", alias);
    if (kind === "hardlink") linkSync(original, alias);
    const selectedPath = kind === "absolute" ? realpathSync(original) : "alias.txt";
    const d = await run(f, plan(policy({ allowedEditPaths: [selectedPath] })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(0);
    expect(summary.toolCalls).toBe(0);
    expect(summary.endings.map(ending => ending.reason)).toEqual(["error"]);
    expect(f.calls).toEqual([]);
    expect(readFileSync(original, "utf8")).toBe("broken\n");
  });

  test("a missing output-token bound stops before repair dispatch", async () => {
    const f = fixture(); const d = driver(f, plan(), f.tools, 20, {});
    d.followup("Complete, then attempt only bounded public repair."); await d.whenIdle();
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1);
    expect(summary.toolCalls).toBe(0);
    expect(starts(f)).toHaveLength(1);
    expect(summary.validation.status).toBe("failed");
    expect(repairRows(f).filter(row => meta(row).phase === "stopped").map(row => meta(row).reason)).toEqual(["output-bound-unavailable"]);
    expect(f.calls.map(call => call.toolName)).toEqual(["bash"]);
  });

  test("a selected file beyond the digest byte bound stops before repair requests or effects", async () => {
    const f = fixture();
    const large = join(f.harness.dir, "large.txt");
    writeFileSync(large, ""); truncateSync(large, 10_000_001);
    const d = await run(f, plan(policy({ allowedEditPaths: ["calculation.txt", "large.txt"] })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1);
    expect(summary.toolCalls).toBe(0);
    expect(summary.validation.status).toBe("failed");
    expect(starts(f)).toHaveLength(1);
    expect(f.calls.map(call => call.toolName)).toEqual(["bash"]);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
  });

  test("an exhausted step budget creates no extra turn or queued repair feedback", async () => {
    const f = fixture(); const d = driver(f, plan(), f.tools, 1);
    d.followup("Complete one step, then run only the selected public validation."); await d.whenIdle();
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1);
    expect(summary.toolCalls).toBe(0);
    expect(summary.endings).toHaveLength(1);
    expect(f.harness.events().filter(row => row.event_type === "turn/start")).toHaveLength(1);
    expect(d.inbox.hasPending).toBe(false);
    expect(starts(f)).toHaveLength(1);
    expect(summary.validation.status).toBe("failed");
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
  });

  test("unchanged files and repeated failure stop for no progress before another repair", async () => {
    const f = fixture([textStep("Initial completion."), textStep("No edit proposed."), ...successScripts()]);
    const d = await run(f, plan(policy({ maxRounds: 3 })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.validation.status).toBe("failed");
    expect(summary.requests).toBe(2);
    expect(starts(f)).toHaveLength(2);
    expect(repairRows(f).filter(row => meta(row).phase === "round-start")).toHaveLength(1);
    expect(repairRows(f).some(row => meta(row).phase === "stopped")).toBe(true);
  });

  test("maximum rounds stops after a real but insufficient edit", async () => {
    const f = fixture([textStep("Initial completion."), read(), edit("broken", "still-broken"), textStep("Repair complete."), ...successScripts()]);
    const d = await run(f, plan(policy({ maxRounds: 1 })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.validation.status).toBe("failed");
    expect(summary.requests).toBe(4);
    expect(starts(f)).toHaveLength(2);
    expect(repairRows(f).filter(row => meta(row).phase === "round-start")).toHaveLength(1);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("still-broken\n");
  });

  test.each([
    { label: "denied", outcome: { outcome: "DENIED", content: "operator denied", exitCode: null, timedOut: false, denied: true } },
    { label: "unknown", outcome: { outcome: "TOOL_OUTCOME_UNKNOWN", content: "execution unresolved", exitCode: null, timedOut: false, denied: false } },
    { label: "cancelled", outcome: { outcome: "CANCELLED", content: "cancelled", exitCode: null, timedOut: false, denied: false } }
  ] satisfies Array<{ label: string; outcome: ToolCallOutcome }>)("$label validation cannot trigger repair or a later selected check", async ({ outcome }) => {
    const f = fixture();
    const execute = vi.fn(async (_request: ToolCallRequest): Promise<ToolCallOutcome> => outcome);
    const selected = plan();
    selected.checks = [...selected.checks, { id: "later", title: "Later public check", command: "touch must-not-run", timeoutMs: 5_000 }];
    const d = await run(f, selected, { ...f.tools, execute });
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1);
    expect(summary.validation.status).toBe("unavailable");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(repairRows(f).filter(row => meta(row).phase === "round-start")).toHaveLength(0);
    expect(existsSync(join(f.harness.dir, "must-not-run"))).toBe(false);
  });

  test.each([
    { label: "denied", outcome: { outcome: "DENIED", content: "operator denied repair", exitCode: null, timedOut: false, denied: true } },
    { label: "unknown", outcome: { outcome: "TOOL_OUTCOME_UNKNOWN", content: "repair effect unresolved", exitCode: null, timedOut: false, denied: false } }
  ] satisfies Array<{ label: string; outcome: ToolCallOutcome }>)("a $label repair effect stops before another model request or validation", async ({ outcome }) => {
    const f = fixture();
    const calls: ToolCallRequest[] = [];
    const tools: AgentToolSeam = { ...f.tools, async execute(request) {
      calls.push(request);
      return request.toolName === "fs.read" ? outcome : f.tools.execute(request);
    } };
    const d = await run(f, plan(), tools);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(2);
    expect(starts(f)).toHaveLength(1);
    expect(calls.map(call => call.toolName)).toEqual(["bash", "fs.read"]);
    expect(summary.validation.status).not.toBe("passed");
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
  });

  test("an elapsed monotonic deadline stops admission before a delayed timer callback", async () => {
    const f = fixture(); let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const d = new AgentDriver({ session: f.harness.session, llm: f.harness.llm, tools: f.tools,
        systemPromptEventId: f.harness.systemPromptEventId,
        route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
        validation: plan(policy({ timeoutMs: 30000 })), config: { maxStepsPerTurn: 20, toolAbandonGraceMs: 20 },
        hooks: { ...NO_HOOKS, preStep: async (_input, next) => { if (_input.step === 2) now = 30001; return next(); } } });
      d.followup("Complete, then repair only within the declared wall budget."); await d.whenIdle();
      const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
      expect(summary.requests).toBe(1); expect(summary.toolCalls).toBe(0);
      expect(starts(f)).toHaveLength(1); expect(summary.validation.status).toBe("failed");
      expect(f.calls.map(call => call.toolName)).toEqual(["bash"]);
      expect(repairRows(f).filter(row => meta(row).phase === "stopped").map(row => meta(row).reason)).toEqual(["cancelled-or-deadline"]);
    } finally { clock.mockRestore(); }
  });

  test("public revalidation rechecks the monotonic deadline at its effect boundary", async () => {
    const f = fixture(); let now = 0, checks = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const tools: AgentToolSeam = { ...f.tools, execute: request => {
        if (request.callId.startsWith("validation-") && ++checks === 2) now = 30001;
        return f.tools.execute(request);
      } };
      const selected = plan(policy({ timeoutMs: 30000 }));
      selected.checks = [{ id: "public", title: "Public with execution marker",
        command: "printf checked >> check-count; cat calculation.txt; grep -qx fixed calculation.txt", timeoutMs: 5000 }];
      const d = await run(f, selected, tools);
      const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
      expect(summary.requests).toBe(4); expect(summary.validation.status).toBe("unavailable");
      expect(readFileSync(join(f.harness.dir, "check-count"), "utf8")).toBe("checked");
      expect(validationRows(f).filter(row => meta(row).phase === "check-result").map(row => meta(row).status)).toEqual(["failed", "unavailable"]);
    } finally { clock.mockRestore(); }
  });

  test("expired queued repair feedback cannot open a fresh turn or reset its bounds", async () => {
    const f = fixture(); let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const d = new AgentDriver({ session: f.harness.session, llm: f.harness.llm, tools: f.tools,
        systemPromptEventId: f.harness.systemPromptEventId,
        route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
        validation: plan(policy({ timeoutMs: 30000 })), config: { maxStepsPerTurn: 20, toolAbandonGraceMs: 20 },
        hooks: { ...NO_HOOKS, notify: event => {
          if (event.kind === "inbox" && event.op === "insert" && event.target === "next-step") now = 30001;
        } } });
      d.followup("Repair only in this turn and within its original bounds."); await d.whenIdle();
      const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
      expect(summary.requests).toBe(1); expect(summary.validation.status).toBe("failed");
      expect(summary.endings).toHaveLength(1); expect(d.inbox.hasPending).toBe(false);
      expect(f.harness.events().filter(row => row.event_type === "turn/start")).toHaveLength(1);
      expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
    } finally { clock.mockRestore(); }
  });

  test("cancellation keeps operator work but discards turn-scoped repair feedback", async () => {
    const f = fixture();
    const d: AgentDriver = new AgentDriver({ session: f.harness.session, llm: f.harness.llm, tools: f.tools,
      systemPromptEventId: f.harness.systemPromptEventId,
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      validation: plan(), config: { maxStepsPerTurn: 20, toolAbandonGraceMs: 20 },
      hooks: { ...NO_HOOKS, notify: event => {
        if (event.kind === "inbox" && event.op === "insert" && event.target === "next-step")
          d.cancel({ kind: "user" }, { keepInbox: true });
      } } });
    d.followup("Complete and validate this turn."); d.followup("Later operator request."); await d.whenIdle();
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1); expect(summary.endings.map(row => row.reason)).toEqual(["cancelled"]);
    expect(d.inbox.nextStep).toEqual([]);
    expect(d.inbox.nextTurn.map(message => message.text)).toEqual(["Later operator request."]);
    expect(summary.validation.status).toBe("failed");
  });

  test("failed repair context cancellation makes the driver terminal", async () => {
    const f = fixture(); let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const refuse = vi.fn(() => { throw new Error("Synthetic signed inbox cancellation failure."); });
    try {
      const d = new AgentDriver({ session: f.harness.session, llm: f.harness.llm, tools: f.tools,
        systemPromptEventId: f.harness.systemPromptEventId,
        route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
        validation: plan(policy({ timeoutMs: 30000 })), config: { maxStepsPerTurn: 20, toolAbandonGraceMs: 20 },
        hooks: { ...NO_HOOKS, notify: event => {
          if (event.kind === "inbox" && event.op === "insert" && event.target === "next-step") now = 30001;
        } } });
      Object.assign(d.inbox, { cancelNextStep: refuse });
      d.followup("Preserve failed cleanup evidence without opening another turn."); await d.whenIdle();
      const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
      expect(summary.requests).toBe(1); expect(d.status).toBe("failed"); expect(refuse).toHaveBeenCalledTimes(1);
      expect(summary.endings.map(row => row.reason)).toEqual(["error"]);
      expect(d.inbox.nextStep).toHaveLength(1); expect(summary.validation.status).toBe("failed");
      expect(() => d.followup("Cannot resume unsafe pending repair context.")).toThrow("terminal failed state");
    } finally { clock.mockRestore(); }
  });

  test.each(["preStep", "turnStopping"] as const)("repair deadline abandons an uncooperative %s hook", async hook => {
    const f = fixture([textStep("Initial completion."), textStep("Repair completion.")]);
    let stopping = 0, entered = false, settled = false;
    let release = () => {};
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const stall = async () => {
      entered = true;
      await new Promise<void>(resolve => { release = resolve; watchdog = setTimeout(resolve, 3000); });
      settled = true;
    };
    const d = new AgentDriver({ session: f.harness.session, llm: f.harness.llm, tools: f.tools,
      systemPromptEventId: f.harness.systemPromptEventId,
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      validation: plan(policy({ timeoutMs: 1000 })), config: { maxStepsPerTurn: 20, toolAbandonGraceMs: 20 },
      hooks: { ...NO_HOOKS,
        preStep: async (input, next) => { if (hook === "preStep" && input.step === 2) await stall(); return next(); },
        turnStopping: async () => { if (hook === "turnStopping" && ++stopping === 2) await stall(); }
      } });
    try {
      d.followup("Stop repair when its deadline expires, even if a hook ignores cancellation.");
      await d.whenIdle();
      expect(entered).toBe(true); expect(settled).toBe(false);
      const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
      expect(summary.requests).toBe(hook === "preStep" ? 1 : 2);
      expect(summary.validation.status).toBe("failed"); expect(starts(f)).toHaveLength(1);
      expect(repairRows(f).filter(row => meta(row).phase === "stopped").map(row => meta(row).reason)).toEqual(["deadline-exceeded"]);
    } finally { clearTimeout(watchdog); release(); }
  });

  test("a local repair deadline abandons an uncooperative tool and stops later work", async () => {
    const f = fixture();
    const observed: { signal?: AbortSignal } = {};
    const calls: ToolCallRequest[] = [];
    const tools: AgentToolSeam = { ...f.tools, execute(request) {
      calls.push(request);
      if (request.toolName !== "fs.read") return f.tools.execute(request);
      observed.signal = request.signal;
      return new Promise<ToolCallOutcome>(() => {});
    } };
    const d = await run(f, plan(policy({ timeoutMs: 200 })), tools);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(observed.signal?.aborted).toBe(true);
    expect(summary.endings.map(ending => ending.reason)).toEqual(["complete"]);
    expect(summary.requests).toBe(2);
    expect(starts(f)).toHaveLength(1);
    expect(calls.map(call => call.toolName)).toEqual(["bash", "fs.read"]);
    expect(summary.validation.status).not.toBe("passed");
    expect(repairRows(f).some(row => meta(row).phase === "stopped")).toBe(true);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
  });

  test("a retryable repair failure with unknown usage stops before another request reservation", async () => {
    let dispatches = 0;
    const transport: HttpTransport = async (): Promise<HttpResponse> => {
      dispatches++;
      if (dispatches === 2) return { status: 429, headers: { "content-type": "application/json", "retry-after": "0" }, body: bodyFromChunks(["{}"]) };
      return { status: 200, headers: { "content-type": "text/event-stream" }, body: bodyFromChunks([]) };
    };
    const f = fixture([textStep("Initial completion."), read(), edit(), textStep("Must not run.")], undefined, transport);
    const d = await run(f);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(2); expect(summary.toolCalls).toBe(0);
    expect(starts(f)).toHaveLength(1); expect(summary.validation.status).toBe("failed");
    expect(f.harness.events().filter(row => row.event_type === "request/failure")).toHaveLength(1);
    expect(f.harness.events().filter(row => row.event_type === "loop/retry")).toHaveLength(1);
    expect(repairRows(f).filter(row => meta(row).phase === "reservation")).toHaveLength(1);
    const stopped = repairRows(f).find(row => meta(row).phase === "stopped")!;
    expect(meta(stopped).reason).toBe("usage-unavailable");
    expect(meta(stopped).usage).toMatchObject({ requests: 1, unknownTokens: 1, costUsd: null });
    expect(f.calls.map(call => call.toolName)).toEqual(["bash"]);
  });

  test("a settled repair response without usage stops effects and further requests", async () => {
    const noUsage = read().filter(chunk => chunk.type !== "usage");
    const f = fixture([textStep("Initial completion."), noUsage, edit(), textStep("Must not run.")]);
    const d = await run(f);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(2);
    expect(starts(f)).toHaveLength(1);
    expect(f.calls.some(call => call.toolName === "fs.read" || call.toolName === "fs.edit")).toBe(false);
    expect(summary.validation.status).not.toBe("passed");
    expect(repairRows(f).some(row => meta(row).phase === "stopped")).toBe(true);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
  });

  test.each([
    { label: "hidden read", name: "fs.read", args: { path: "hidden-fixture.txt" } },
    { label: "hidden write", name: "fs.write", args: { path: "hidden-fixture.txt", content: "overwritten" } },
    { label: "bash widening", name: "bash", args: { path: "calculation.txt", command: "touch repair-escaped", timeoutMs: 5_000 } }
  ])("repair refuses $label before reaching the governed tool body", async ({ name, args }) => {
    const f = fixture([textStep("Initial completion."), toolStep("repair-forbidden", name, JSON.stringify(args)), ...successScripts()]);
    const d = await run(f);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(2);
    expect(f.calls.some(call => call.callId === "repair-forbidden")).toBe(false);
    expect(starts(f)).toHaveLength(1);
    expect(summary.validation.status).not.toBe("passed");
    expect(existsSync(join(f.harness.dir, "repair-escaped"))).toBe(false);
    expect(readFileSync(join(f.harness.dir, "hidden-fixture.txt"), "utf8")).toBe("HIDDEN_ORACLE_SENTINEL\n");
    const results = f.harness.events().filter(row => row.event_type === "tool/result");
    expect(results).toHaveLength(1);
    expect(payload(results[0]!, f.harness)).not.toContain("HIDDEN_ORACLE_SENTINEL");
  });

  test.each([
    { label: "non-string path", raw: JSON.stringify({ path: 7 }) },
    { label: "missing path", raw: JSON.stringify({}) },
    { label: "nonobject arguments", raw: JSON.stringify(["calculation.txt"]) },
    { label: "invalid JSON", raw: '{"path":' }
  ])("repair refuses $label before the filesystem body", async ({ raw }) => {
    const f = fixture([textStep("Initial completion."), toolStep("repair-malformed", "fs.read", raw), ...successScripts()]);
    const d = await run(f);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(2);
    expect(starts(f)).toHaveLength(1);
    expect(summary.validation.status).not.toBe("passed");
    expect(f.calls.some(call => call.callId === "repair-malformed")).toBe(false);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
  });

  test("a symlink swapped into an allowed surface cannot disclose a hidden fixture", async () => {
    const f = fixture([textStep("Initial completion."), read(), ...successScripts()]);
    let firstCheck = true;
    const tools: AgentToolSeam = { ...f.tools, async execute(request) {
      const outcome = await f.tools.execute(request);
      if (firstCheck && request.callId.startsWith("validation-")) {
        firstCheck = false;
        rmSync(join(f.harness.dir, "calculation.txt"));
        symlinkSync("hidden-fixture.txt", join(f.harness.dir, "calculation.txt"));
      }
      return outcome;
    } };
    const d = await run(f, plan(), tools);
    expect(readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status).validation.status).not.toBe("passed");
    expect(f.calls.filter(call => call.toolName === "fs.read")).toHaveLength(0);
    const results = f.harness.events().filter(row => row.event_type === "tool/result");
    expect(results.map(row => payload(row, f.harness)).join("\n")).not.toContain("HIDDEN_ORACLE_SENTINEL");
  });

  test("rechecks the exact edit surface after an asynchronous approval before reading any hidden bytes", async () => {
    let approvals = 0;
    const f = fixture([textStep("Initial completion."), read(), edit(), textStep("Must not run.")], async execution => {
      approvals++;
      expect(execution.name).toBe("fs.read");
      // The public path was admitted before this await. An operator granting
      // approval cannot authorize the different file substituted while waiting.
      await Promise.resolve();
      rmSync(join(f.harness.dir, "calculation.txt"));
      symlinkSync("hidden-fixture.txt", join(f.harness.dir, "calculation.txt"));
      return "allow";
    });
    const d = await run(f);
    expect(approvals).toBe(1);
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    const results = f.harness.events().filter(row => row.event_type === "tool/result");
    expect(results.map(row => payload(row, f.harness)).join("\n")).not.toContain("HIDDEN_ORACLE_SENTINEL");
    expect(summary.requests).toBe(2);
    expect(starts(f)).toHaveLength(1);
    expect(summary.validation.status).not.toBe("passed");
    expect(results).toHaveLength(1);
    expect(results.map(row => meta(row).outcome)).toEqual(["DENIED"]);
  });

  test("plan and repair policy are captured before the operator's mutable objects change", async () => {
    const f = fixture();
    const selected = plan(policy({ maxRounds: 1 }));
    const check = { ...selected.checks[0]! };
    selected.checks = [check];
    const d = driver(f, selected);
    check.command = "touch frozen-plan-bypassed";
    selected.repair!.maxRounds = 0;
    selected.repair!.allowedEditPaths[0] = "hidden-fixture.txt";
    selected.repair!.maxRequests = 1;
    d.followup("Run the captured public check and repair policy."); await d.whenIdle();
    expect(projectNativeValidation(f.harness.dir, f.harness.events()).status).toBe("passed");
    expect(existsSync(join(f.harness.dir, "frozen-plan-bypassed"))).toBe(false);
    expect(f.calls.filter(call => call.callId.startsWith("validation-")).map(call => JSON.parse(call.rawArguments).command)).toEqual([PUBLIC_COMMAND, PUBLIC_COMMAND]);
  });

  test.each(["prior-result-removed", "repair-start-removed", "round-tampered", "round-reordered"] as const)("%s signed evidence cannot retain a projected pass", async mode => {
    const f = fixture(); await run(f); f.harness.finish();
    const original = f.harness.events();
    expect(projectNativeValidation(f.harness.dir, original).status).toBe("passed");
    const priorResult = original.find(row => meta(row).kind === "native-validation" && meta(row).round === 0 && meta(row).phase === "check-result")!;
    const repairStart = original.find(row => meta(row).kind === "native-validation-repair" && meta(row).phase === "round-start")!;
    const repeatedResult = original.find(row => meta(row).kind === "native-validation" && meta(row).round === 1 && meta(row).phase === "check-result")!;
    expect(priorResult.writer_sig).not.toBe("unsigned");
    expect(repairStart.writer_sig).not.toBe("unsigned");
    expect(repeatedResult.writer_sig).not.toBe("unsigned");
    let changed: EvidenceEvent[];
    if (mode === "prior-result-removed") changed = original.filter(row => row.id !== priorResult.id);
    else if (mode === "repair-start-removed") changed = original.filter(row => row.id !== repairStart.id);
    else if (mode === "round-tampered") changed = original.map(row => row.id === repeatedResult.id
      ? { ...row, meta_json: JSON.stringify({ ...meta(row), round: 2 }) } : row);
    else {
      changed = [...original];
      const start = changed.findIndex(row => row.id === repairStart.id);
      const result = changed.findIndex(row => row.id === repeatedResult.id);
      [changed[start], changed[result]] = [changed[result]!, changed[start]!];
    }
    expect(projectNativeValidation(f.harness.dir, changed).status).toBe("unavailable");
    expect(projectNativeValidation(f.harness.dir, original).status).toBe("passed");
  });

  test("request reservation cap stops before another model attempt", async () => {
    const f = fixture(); const d = await run(f, plan(policy({ maxRequests: 1 })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(2);
    expect(summary.toolCalls).toBe(1);
    expect(starts(f)).toHaveLength(1);
    expect(readFileSync(join(f.harness.dir, "calculation.txt"), "utf8")).toBe("broken\n");
    expect(summary.validation.status).not.toBe("passed");
  });

  test("observed token usage exhausts the repair envelope without inventing zero usage", async () => {
    const f = fixture([textStep("Initial completion."),
      toolStep("repair-read", "fs.read", JSON.stringify({ path: "calculation.txt" }), { inputTokens: 20, outputTokens: 10 }),
      edit(), textStep("Must not run.")]);
    const d = await run(f, plan(policy({ maxTokens: 20 })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBeLessThanOrEqual(2);
    expect(summary.validation.status).not.toBe("passed");
    expect(f.calls.some(call => call.toolName === "fs.read" || call.toolName === "fs.edit")).toBe(false);
    expect(starts(f)).toHaveLength(1);
    expect(repairRows(f).some(row => meta(row).phase === "stopped")).toBe(true);
  });

  test("a hard spend cap refuses repair when no bounded cost reservation exists", async () => {
    const f = fixture(); const d = await run(f, plan(policy({ maxCostUsd: 0.01 })));
    const summary = readAgentRunSummary(f.harness.dir, f.harness.sessionId, d.status);
    expect(summary.requests).toBe(1);
    expect(summary.toolCalls).toBe(0);
    expect(summary.validation.status).toBe("failed");
    expect(starts(f)).toHaveLength(1);
    expect(repairRows(f).some(row => meta(row).phase === "stopped")).toBe(true);
  });
});

describe("repair policy admission", () => {
  const admit = (value: unknown) => freezeNativeValidationRepairPolicy(value as NativeValidationRepairPolicy);
  test.each([
    { label: "null policy", value: null },
    { label: "too many rounds", value: policy({ maxRounds: 9 }) },
    { label: "zero requests", value: policy({ maxRequests: 0 }) },
    { label: "nonfinite tokens", value: policy({ maxTokens: Number.NaN }) },
    { label: "zero deadline", value: policy({ timeoutMs: 0 }) },
    { label: "empty edit surface", value: policy({ allowedEditPaths: [] }) },
    { label: "sparse edit surface", value: policy({ allowedEditPaths: new Array<string>(1) }) },
    { label: "duplicate edit paths", value: policy({ allowedEditPaths: ["calculation.txt", "calculation.txt"] }) },
    { label: "zero spend", value: policy({ maxCostUsd: 0 }) },
    { label: "unknown policy field", value: { ...policy(), widenTools: true } }
  ])("refuses $label before any dispatch", ({ value }) => {
    expect(() => admit(value)).toThrow("Invalid native validation repair policy.");
  });

  test("snapshots each policy field once before validating and freezing", () => {
    let reads = 0;
    const selected = policy();
    Object.defineProperty(selected, "maxRounds", { enumerable: true, get() { reads++; return reads === 1 ? 1 : 9; } });
    const frozen = admit(selected);
    expect(reads).toBe(1);
    expect(frozen.maxRounds).toBe(1);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.allowedEditPaths)).toBe(true);
  });
});

describe("trusted guards at the effect boundary", () => {
  test.each(["deny", "throw", "invalid"] as const)("a %s decision refuses the filesystem body", async mode => {
    const f = fixture();
    const beforeEffect = vi.fn((): string | null => {
      if (mode === "throw") throw new Error("PRIVATE_GUARD_DETAIL");
      if (mode === "invalid") return undefined as unknown as null;
      return "The trusted caller narrowed this effect.";
    });
    const outcome = await f.tools.execute({ callId: "guard-direct", toolName: "fs.read",
      rawArguments: JSON.stringify({ path: "hidden-fixture.txt" }), sessionId: f.harness.sessionId,
      turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal, beforeEffect });
    expect(beforeEffect).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ outcome: "DENIED", denied: true, exitCode: null });
    expect(String(outcome.content)).not.toContain("HIDDEN_ORACLE_SENTINEL");
    expect(String(outcome.content)).not.toContain("PRIVATE_GUARD_DETAIL");
  });

  test("journaled guard denial occurs before journal.start and records no unknown effect", async () => {
    const f = fixture();
    const registry = new ToolRegistry();
    for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
    const journal = openActionJournal(f.harness.dir);
    try {
      const start = vi.spyOn(journal, "start");
      const beforeEffect = vi.fn(() => "The selected repair surface changed.");
      const pipeline = new ToolPipeline({ workspace: f.harness.dir, registry,
        authorizeClasses: new Set(["READ_ONLY"]), journal: () => journal,
        authorizationContext: () => ({ sessionId: f.harness.sessionId }) });
      const outcome = await pipeline.execute({ name: "fs.read", agentId: "default",
        arguments: { path: "hidden-fixture.txt" }, requestedMode: "EXECUTE", callId: "journal-effect-guard", beforeEffect });
      expect(beforeEffect).toHaveBeenCalledTimes(1);
      expect(start).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ denied: { stage: "guard", guardLabel: "trusted-before-effect" }, action: { state: "denied" } });
      expect(outcome.output).not.toContain("HIDDEN_ORACLE_SENTINEL");
      expect(outcome.action).toBeDefined();
      const recorded = journal.get(outcome.action!.executionId)!;
      expect(recorded.receipts.map(receipt => receipt.state)).toEqual(["requested", "authorized", "denied"]);
      expect(journal.verifyReceiptChain(outcome.action!.executionId).ok).toBe(true);
    } finally { journal.close(); }
  });
});

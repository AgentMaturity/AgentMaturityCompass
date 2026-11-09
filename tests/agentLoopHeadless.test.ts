import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { defaultAgentLoopIo } from "../src/cli-agent-options.js";
import { GOAL_STOP_EXIT_CODES, MAX_STDIN_PROMPT_BYTES, RUN_EXIT_CODES, createRunEventSink, notificationEvent, readProcessStdin, runExitCode, runWithOutput } from "../src/cli/agentLoopOutputOptions.js";
import type { RoundStop } from "../src/autonomy/goalRounds.js";
import { deriveExecutionStatus, INTEGRITY_FAILED } from "../src/execution/executionContract.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { SessionService } from "../src/session/sessionService.js";
import type { NativeReceiptRecorder } from "../src/tools/builtin/nativeToolBreadth/nativeReceipt.js";
import { todoTool } from "../src/tools/builtin/todoTool.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * SH-UI-01: `amc agent-loop run` for scripts and CI. The prompt may come from stdin, `--output-format stream-json`
 * writes one JSON event per line, and the exit code follows the execution contract. Stub provider only: nothing here
 * is a real-model result.
 */
describe("amc agent-loop run — headless", () => {
  let dir: string, home: string, cwd: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-headless-"));
    home = mkdtempSync(join(tmpdir(), "amc-headless-home-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    cwd = process.cwd(); process.chdir(dir);
  });
  afterEach(() => { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); vi.restoreAllMocks(); });

  interface Captured { out: string[]; errors: string[]; failures: number[]; exits: number[]; stdinReads: { explicit: boolean }[] }
  function programWith(stdin: string | null | Error = null): { program: Command; captured: Captured } {
    const captured: Captured = { out: [], errors: [], failures: [], exits: [], stdinReads: [] };
    const io: AgentLoopCliIo = {
      log: line => captured.out.push(line), error: line => captured.errors.push(line),
      fail: () => captured.failures.push(1), exit: code => captured.exits.push(code),
      readStdin: async options => { captured.stdinReads.push(options); if (stdin instanceof Error) throw stdin; return stdin; }
    };
    const program = new Command(); program.exitOverride(); registerAgentCommands(program, io);
    return { program, captured };
  }
  const run = (program: Command, argv: string[]) => program.parseAsync(["agent-loop", "run", "--credentials-home", home, ...argv], { from: "user" });
  const events = (captured: Captured) => captured.out.map(line => JSON.parse(line) as Record<string, unknown>);

  it("reads the prompt from stdin for an explicit - and for a piped stdin with no positional prompt", async () => {
    const explicit = programWith("Check the recording path.");
    await run(explicit.program, ["-", "--output-format", "json"]);
    expect(explicit.captured.stdinReads).toEqual([{ explicit: true }]);
    expect(explicit.captured.failures).toEqual([]);
    const piped = programWith("piped prompt");
    await run(piped.program, ["--output-format", "json"]);
    expect(piped.captured.stdinReads).toEqual([{ explicit: false }]);
    expect(piped.captured.failures).toEqual([]);
    const summary = JSON.parse(piped.captured.out.at(-1)!) as AgentRunSummary;
    expect(readNativeSessionEvents(dir, summary.sessionId).some(row => row.event_type === "user/message")).toBe(true);
  });

  it("refuses an empty, terminal, oversize or unavailable stdin prompt before anything durable exists", async () => {
    const terminal = programWith(null);
    await run(terminal.program, []);
    expect(terminal.captured.failures).toEqual([1]);
    expect(terminal.captured.errors.join("\n")).toContain("a prompt is required");
    const oversize = programWith(new Error(`the stdin prompt exceeds ${MAX_STDIN_PROMPT_BYTES} bytes; nothing was sent`));
    await run(oversize.program, ["-"]);
    expect(oversize.captured.failures).toEqual([1]);
    expect(oversize.captured.errors.join("\n")).toContain("exceeds");
    const unavailable = { program: new Command(), captured: { errors: [] as string[], failures: [] as number[] } };
    unavailable.program.exitOverride();
    registerAgentCommands(unavailable.program, { log: () => {}, error: line => unavailable.captured.errors.push(line), fail: () => unavailable.captured.failures.push(1) });
    await unavailable.program.parseAsync(["agent-loop", "run", "-", "--credentials-home", home], { from: "user" });
    expect(unavailable.captured.failures).toEqual([1]);
    expect(unavailable.captured.errors.join("\n")).toContain("no stdin to read");
  });

  it("readProcessStdin honours the terminal rule and refuses over the cap without truncating", async () => {
    const original = Object.getOwnPropertyDescriptor(process, "stdin")!;
    const stdin = (text: string | Buffer, isTTY = false) => Object.defineProperty(process, "stdin", { configurable: true, value: Object.assign(Readable.from([Buffer.from(text)]), { isTTY }) });
    try {
      stdin("hello\n", true);
      expect(await readProcessStdin({ explicit: false })).toBeNull();
      stdin("hello\n", true);
      expect(await readProcessStdin({ explicit: true })).toBe("hello\n");
      stdin(Buffer.alloc(MAX_STDIN_PROMPT_BYTES + 1, 0x61));
      await expect(readProcessStdin({ explicit: false })).rejects.toThrow(/exceeds/);
    } finally { Object.defineProperty(process, "stdin", original); }
  });

  it("stream-json: one event per line, init first, authenticated committed updates in sequence, result last with exit code 0", async () => {
    const { program, captured } = programWith(null);
    await run(program, ["Check the recording path.", "--output-format", "stream-json"]);
    expect(captured.failures).toEqual([]); expect(captured.exits).toEqual([]);
    const lines = events(captured);
    expect(lines[0]).toMatchObject({ type: "system", subtype: "init", schemaVersion: 1, provider: "stub", model: "amc-stub-1", tools: "echo", approvals: null, agentId: "default" });
    const sessionId = lines[0]!.sessionId as string;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines.every(line => line.sessionId === sessionId)).toBe(true);
    expect(lines.at(-1)).toMatchObject({ type: "result", sessionId, exitCode: 0, driverStatus: "idle", execution: { phases: { admission: "succeeded", "model-completion": "succeeded", "side-effect-completion": "succeeded" } } });
    const updates = lines.filter(line => line.type === "update") as Array<{ seq: number; eventId: string; eventHash: string; update: { sessionUpdate: string } }>;
    expect(updates.map(entry => entry.update.sessionUpdate)).toEqual(["tool_call", "tool_call_update", "agent_message_chunk"]);
    expect(updates.map(entry => entry.seq)).toEqual([...updates.map(entry => entry.seq)].sort((a, b) => a - b));
    expect(new Set(updates.map(entry => entry.eventId)).size).toBe(updates.length);
    const committed = readNativeSessionEvents(dir, sessionId);
    for (const entry of updates) expect(committed.find(row => row.id === entry.eventId)?.event_hash).toBe(entry.eventHash);
    const deltas = lines.filter(line => line.type === "text_delta");
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every(delta => delta.trust === "provisional")).toBe(true);
    expect(lines.map(line => line.type)).toEqual(expect.arrayContaining(["turn_start", "step_start", "step_end", "turn_end"]));
  });

  it("stream-json on --session and --fork-from carries only this run's rows: the inherited prefix is authenticated, never re-emitted", async () => {
    const first = programWith(null);
    await run(first.program, ["Check the recording path.", "--keep-open", "--json"]);
    const parent = (JSON.parse(first.captured.out.at(-1)!) as AgentRunSummary).sessionId;
    const prefix = new Set(readNativeSessionEvents(dir, parent).map(row => row.id));
    expect(prefix.size).toBeGreaterThan(0);
    const resumed = programWith(null);
    await run(resumed.program, ["hello again", "--session", parent, "--output-format", "stream-json"]);
    expect(resumed.captured.failures).toEqual([]);
    const resumedLines = events(resumed.captured);
    expect(resumedLines[0]).toMatchObject({ type: "system", subtype: "init", sessionId: parent });
    const resumedUpdates = resumedLines.filter(line => line.type === "update") as Array<{ eventId: string; update: { sessionUpdate: string } }>;
    expect(resumedUpdates.length).toBeGreaterThan(0);
    // Turn 1's tool call and reply were written by the earlier run; none of them is this run's output.
    expect(resumedUpdates.filter(entry => prefix.has(entry.eventId))).toEqual([]);
    expect(resumedUpdates.map(entry => entry.update.sessionUpdate)).not.toContain("tool_call");
    expect(resumedLines.at(-1)).toMatchObject({ type: "result", sessionId: parent, exitCode: 0 });
    const forked = programWith(null);
    await run(forked.program, ["hello again", "--fork-from", parent, "--output-format", "stream-json"]);
    expect(forked.captured.failures).toEqual([]);
    const forkedLines = events(forked.captured);
    const child = forkedLines[0]!.sessionId as string;
    expect(child).not.toBe(parent);
    const forkedUpdates = forkedLines.filter(line => line.type === "update") as Array<{ seq: number; eventId: string; update: { sessionUpdate: string } }>;
    expect(forkedUpdates.length).toBeGreaterThan(0);
    // The copied parent history (its tool call, result and reply) is the child's inherited prefix, not this run's rows.
    expect(forkedUpdates.map(entry => entry.update.sessionUpdate)).not.toContain("tool_call");
    const childRows = readNativeSessionEvents(dir, child);
    const ownTurnStart = childRows.map(row => row.event_type).lastIndexOf("turn/start");
    for (const entry of forkedUpdates) expect(childRows.findIndex(row => row.id === entry.eventId)).toBeGreaterThan(ownTurnStart);
    expect(forkedLines.at(-1)).toMatchObject({ type: "result", sessionId: child, exitCode: 0 });
  });

  it("refuses --list-skills with stream-json before anything reaches stdout", async () => {
    const { program, captured } = programWith(null);
    await run(program, ["--list-skills", "--output-format", "stream-json"]);
    expect(captured.failures).toEqual([1]);
    expect(captured.errors.join("\n")).toContain("--list-skills prints a catalog");
    expect(captured.out).toEqual([]);
  });

  it("stream-json ends a refusal with a terminal error event and exit 1", async () => {
    const { program, captured } = programWith(null);
    await run(program, ["hi", "--provider", "nope", "--output-format", "stream-json"]);
    expect(captured.failures).toEqual([1]);
    expect(events(captured)).toEqual([{ type: "error", message: expect.stringContaining("unknown provider"), exitCode: 1, sessionId: null }]);
  });

  it("refuses a conflicting --json, an unknown format and stream-json without a root turn", async () => {
    for (const [argv, expected] of [
      [["hi", "--json", "--output-format", "text"], "--json means --output-format json"],
      [["hi", "--output-format", "yaml"], "--output-format must be one of"],
      [["hi", "--output-format", "stream-json", "--goal-rounds", "2"], "goal rounds"],
      [["--output-format", "stream-json", "--workflow-plan", "plan.json"], "workflow passes"],
      [["--output-format", "stream-json", "--list-agents"], "prints a catalog"],
      [["hi", "--output-format", "stream-json", "--interactive-steer"], "can queue more turns"]
    ] as const) {
      const { program, captured } = programWith(null);
      await run(program, [...argv]);
      expect(captured.failures, argv.join(" ")).toEqual([1]);
      expect(captured.errors.join("\n")).toContain(expected);
      expect(captured.out).toEqual([]);
    }
  });

  it("--output-format json equals --json plus the exit code, and a cancelled turn exits 3 without failing", async () => {
    const plain = programWith(null);
    await run(plain.program, ["hi", "--json"]);
    const summary = JSON.parse(plain.captured.out.at(-1)!) as AgentRunSummary & { exitCode: number; execution: unknown };
    expect(summary.exitCode).toBe(0); expect(summary.execution).toBeDefined();
    expect(plain.captured.exits).toEqual([]);
    const cancelled = programWith(null);
    await run(cancelled.program, ["hi", "--think-ms", "500", "--cancel-after", "20", "--output-format", "json"]);
    const cancelledSummary = JSON.parse(cancelled.captured.out.at(-1)!) as AgentRunSummary & { exitCode: number };
    expect(cancelledSummary.endings.at(-1)?.reason).toBe("cancelled");
    expect(cancelledSummary.exitCode).toBe(RUN_EXIT_CODES.cancelled);
    expect(cancelled.captured.exits).toEqual([RUN_EXIT_CODES.cancelled]);
    expect(cancelled.captured.failures).toEqual([]);
  });

  it("a bounded turn exits 4 and a driver failure exits 1", async () => {
    const bounded = programWith(null);
    await run(bounded.program, ["hi", "--max-steps", "1", "--output-format", "json"]);
    const summary = JSON.parse(bounded.captured.out.at(-1)!) as AgentRunSummary & { exitCode: number };
    expect(summary.endings.at(-1)?.reason).toBe("max_steps");
    expect(summary.exitCode).toBe(RUN_EXIT_CODES.bounded);
    expect(bounded.captured.exits).toEqual([RUN_EXIT_CODES.bounded]);
    expect(bounded.captured.failures).toEqual([]);
    const failed = programWith(null);
    await run(failed.program, ["hi", "--fail-first", "9", "--output-format", "json"]);
    expect(failed.captured.failures).toEqual([1]);
    expect(failed.captured.exits).toEqual([]);
  });

  it("stream-json error events carry the fixed failure guidance, never the provider's own error text (S9)", async () => {
    const { program, captured } = programWith(null);
    await run(program, ["hi", "--fail-first", "9", "--output-format", "stream-json"]);
    expect(captured.failures).toEqual([1]);
    expect(captured.out.join("\n")).not.toContain("injected rate limit"); // The stub's injected provider message.
    const errors = events(captured).filter(line => line.type === "error" && typeof line.turn === "number");
    expect(errors.length).toBeGreaterThan(0);
    for (const event of errors) {
      expect(Object.keys(event).sort()).toEqual(["code", "httpStatus", "nextAction", "sessionId", "step", "summary", "turn", "type"]);
      expect(typeof event.code).toBe("string");
    }
    expect(events(captured).find(line => line.type === "turn_end")).toMatchObject({ ending: { reason: "error", cancelCause: null } });
    expect(events(captured).at(-1)).toMatchObject({ type: "result", exitCode: 1 });
  });
});

describe("notificationEvent — named fields only (S9)", () => {
  it("projects an error notification to the public guidance and drops the exception", () => {
    const error = Object.assign(new Error("Bearer sk-live-SECRET123 was rejected"), { code: "AUTH", failure: { code: "AUTH", status: 401 } });
    const event = notificationEvent({ kind: "error", turn: 2, step: 3, error });
    expect(event).toMatchObject({ type: "error", turn: 2, step: 3, code: "AUTH", httpStatus: 401 });
    expect(Object.keys(event).sort()).toEqual(["code", "httpStatus", "nextAction", "step", "summary", "turn", "type"]);
    expect(JSON.stringify(event)).not.toContain("SECRET123");
    expect(notificationEvent({ kind: "error", turn: 1, step: 1, error: new Error("x-api-key: SECRET456") })).toMatchObject({ code: "UNKNOWN", httpStatus: null });
    expect(JSON.stringify(notificationEvent({ kind: "error", turn: 1, step: 1, error: new Error("x-api-key: SECRET456") }))).not.toContain("SECRET456");
    expect(notificationEvent({ kind: "retry", turn: 1, step: 2, attempt: 3, decision: "give-up", delayMs: null }))
      .toEqual({ type: "retry", turn: 1, step: 2, attempt: 3, decision: "give-up", delayMs: null });
    expect(notificationEvent({ kind: "context", turn: 2, step: 3, promptTokens: null, contextWindowTokens: 2048, ratio: null }))
      .toEqual({ type: "context", turn: 2, step: 3, promptTokens: null, contextWindowTokens: 2048, ratio: null });
    expect(notificationEvent({ kind: "turn-end", turn: 1, ending: { reason: "error", error } })).toEqual({ type: "turn_end", turn: 1, ending: { reason: "error", cancelCause: null } });
    expect(notificationEvent({ kind: "turn-end", turn: 2, ending: { reason: "cancelled", cause: { kind: "user" } as never } })).toEqual({ type: "turn_end", turn: 2, ending: { reason: "cancelled", cancelCause: "user" } });
  });
});

describe("defaultAgentLoopIo.exit — never downgrades a recorded code (S10)", () => {
  it("keeps a failure over a later table code and the first table code over a second", () => {
    const original = process.exitCode;
    try {
      process.exitCode = undefined;
      defaultAgentLoopIo.fail(); defaultAgentLoopIo.exit!(RUN_EXIT_CODES.bounded);
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
      defaultAgentLoopIo.exit!(RUN_EXIT_CODES.cancelled); defaultAgentLoopIo.exit!(RUN_EXIT_CODES.sideEffectsUnsettled);
      expect(process.exitCode).toBe(RUN_EXIT_CODES.cancelled);
      process.exitCode = undefined;
      defaultAgentLoopIo.exit!(0);
      expect(process.exitCode).toBeUndefined();
      defaultAgentLoopIo.exit!(RUN_EXIT_CODES.blocked); defaultAgentLoopIo.fail();
      expect(process.exitCode).toBe(1); // A failure after a table code still wins.
    } finally { process.exitCode = original; }
  });
});

describe("runExitCode — derived from the execution phases", () => {
  const summary = (driverStatus: "idle" | "failed" = "idle", validation = "not-requested") =>
    ({ driverStatus, validation: { status: validation } } as unknown as AgentRunSummary);
  const execution = (turn: string | null, receiptStates: string[] = []) =>
    deriveExecutionStatus({ sessionId: "s", admission: "admitted", turn, receiptStates, verified: null });
  const code = (reason: string | undefined, states: string[] = [], extra: Partial<{ driverStatus: "idle" | "failed"; validationRequested: boolean; validation: string }> = {}) =>
    runExitCode({ summary: summary(extra.driverStatus, extra.validation), execution: execution(reason ?? null, states),
      ending: reason === undefined ? undefined : { turn: 1, reason, cancelCause: null, interrupted: false }, validationRequested: extra.validationRequested ?? false });
  // As reportRun builds it: goal rounds record no root turn, so the root's own phases stay pending, and the side effects
  // are the goal run's receipts over the root and every session its rounds ran in.
  const goalCode = (stop: RoundStop, goalReceiptStates: readonly string[] | undefined) =>
    runExitCode({ summary: summary(), execution: execution(null), ending: undefined, validationRequested: false, goalStop: stop,
      ...(goalReceiptStates === undefined ? {} : { goalReceiptStates }) });

  it("maps every goal-rounds stop explicitly, and only done with every round's receipts completed is 0", () => {
    const table: Record<RoundStop, number> = { done: 0, failed: 1, refused: 1, "check-failed": 1, "check-unavailable": 1, cancelled: 3, human: 3, "max-rounds": 4, blocked: 5 };
    expect(GOAL_STOP_EXIT_CODES).toEqual(table);
    for (const [stop, expected] of Object.entries(table) as [RoundStop, number][]) expect(goalCode(stop, []), stop).toBe(expected);
    expect(goalCode("done", ["completed", "completed"])).toBe(0);
    expect(goalCode("done", ["completed", "denied"])).toBe(6);
    expect(goalCode("done", ["started"])).toBe(6); // The rounds have ended: an open receipt did not settle.
    expect(goalCode("done", [INTEGRITY_FAILED])).toBe(1);
    expect(goalCode("max-rounds", ["completed", INTEGRITY_FAILED])).toBe(1);
    expect(goalCode("done", undefined)).toBe(1); // Receipts nobody read are not settled ones.
    expect(goalCode("something_new" as RoundStop, [])).toBe(1);
  });

  it("maps every ending to its code and never reads an unknown ending or unsettled receipts as success", () => {
    expect(code("complete")).toBe(0);
    expect(code("complete", ["completed"])).toBe(0);
    expect(code("cancelled")).toBe(3); expect(code("interrupted")).toBe(3);
    expect(code("max_steps")).toBe(4); expect(code("max_tokens")).toBe(4);
    expect(code("blocked")).toBe(5);
    expect(code("complete", ["outcome_unknown"])).toBe(6);
    expect(code("complete", ["denied"])).toBe(6);
    expect(code("complete", ["started"])).toBe(6);
    expect(code("complete", [INTEGRITY_FAILED])).toBe(1);
    expect(code("error")).toBe(1);
    expect(code("complete", [], { driverStatus: "failed" })).toBe(1);
    expect(code("complete", [], { validationRequested: true, validation: "failed" })).toBe(1);
    expect(code("complete", [], { validationRequested: true, validation: "passed" })).toBe(0);
    expect(code(undefined)).toBe(1); // A root turn whose ending was not recorded or could not be read is not success.
    expect(code("something_new")).toBe(1);
  });
});

describe("runWithOutput — the stream and the exit status agree", () => {
  it("a body that ends with neither a result nor a failure gets a terminal error that also fails the run", async () => {
    const out: string[] = [], failures: number[] = [];
    await runWithOutput({ log: line => out.push(line), error: () => {}, fail: () => failures.push(1) }, process.cwd(), { outputFormat: "stream-json" }, async () => {});
    expect(out.map(line => JSON.parse(line) as Record<string, unknown>)).toEqual([{ type: "error", message: "the run ended without a result", exitCode: 1, sessionId: null }]);
    expect(failures).toEqual([1]);
  });
});

describe("createRunEventSink — the signed current plan", () => {
  it("emits a plan update after a todo call, from the same authenticated tail as every other update", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "sh-ui-sink-plan");
    const dir = mkdtempSync(join(tmpdir(), "amc-sink-plan-"));
    const sessionId = "plan-stream";
    const writer = new SessionService(dir);
    try {
      initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
      writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
      writer.startTurn({ trigger: "user" }); writer.startStep();
      const out: string[] = [], failures: number[] = [];
      const sink = createRunEventSink({ log: line => out.push(line), error: () => {}, fail: () => failures.push(1) }, dir);
      sink.ready({ sessionId, cancel: () => {}, readEvents: () => writer.readEvents() }, { agentId: "default", provider: "stub", model: "m", tools: "workspace", approvals: null });
      const record: NativeReceiptRecorder = (execution, receipt) => {
        const meta = { ...receipt, sessionId, agentId: execution.agentId, callId: execution.callId, tool: execution.name };
        writer.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(meta), meta });
      };
      await todoTool({ sessionId, record }).body({ token: "1", callId: "1", rootCallId: "1", parentToken: null, name: "todo", agentId: "default", workspace: dir,
        actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { items: [{ id: "a", content: "Check the recording path", status: "in_progress" }] } });
      sink.notification({ kind: "step-end", turn: 1, step: 1 });
      sink.dispose();
      const plans = out.map(line => JSON.parse(line) as { type: string; update?: { sessionUpdate: string; entries?: unknown } })
        .filter(line => line.type === "update" && line.update!.sessionUpdate === "plan");
      expect(plans).toHaveLength(1);
      expect(plans[0]!.update!.entries).toEqual([{ content: "Check the recording path", priority: "medium", status: "in_progress" }]);
      expect(failures).toEqual([]);
    } finally { writer.disposeWithoutClosing(); rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); }
  });
});

describe("createRunEventSink — projection failure", () => {
  it("ends the stream with an error event, cancels the turn and fails the run when a committed row does not authenticate", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-sink-"));
    try {
      initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
      const out: string[] = [], failures: number[] = [], cancels: unknown[] = [];
      const sink = createRunEventSink({ log: line => out.push(line), error: () => {}, fail: () => failures.push(1) }, dir);
      sink.ready({ sessionId: "ghost", cancel: (cause, options) => cancels.push([cause, options]), readEvents: () => [{ id: "x", ts: 1, session_id: "ghost", runtime: "r", event_type: "assistant/block", payload_path: null, payload_inline: null, payload_sha256: "0".repeat(64),
          prev_event_hash: "0".repeat(64), event_hash: "1".repeat(64), writer_sig: "ab".repeat(64), meta_json: "{}" } as never] },
        { agentId: "default", provider: "stub", model: "m", tools: "none", approvals: null });
      // The row already exists when the stream starts, so the prefix authentication at `ready` refuses it; a later
      // notification adds nothing after the terminal error.
      sink.notification({ kind: "step-end", turn: 1, step: 1 });
      sink.dispose();
      const lines = out.map(line => JSON.parse(line) as Record<string, unknown>);
      expect(lines.map(line => line.type)).toEqual(["system", "error"]);
      expect(lines.at(-1)).toMatchObject({ type: "error", exitCode: 1, sessionId: "ghost" });
      expect(cancels).toEqual([[{ kind: "disposed" }, { by: "stream-json:projection" }]]);
      expect(failures).toEqual([1]);
      sink.result({ summary: {} as never, execution: {} as never, ending: undefined, validationRequested: false, exitCode: 0 });
      expect(out.length).toBe(2); // Nothing after the terminal error, not even a result.
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

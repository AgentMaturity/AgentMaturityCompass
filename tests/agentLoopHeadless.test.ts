import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { MAX_STDIN_PROMPT_BYTES, RUN_EXIT_CODES, createRunEventSink, readProcessStdin, runExitCode } from "../src/cli/agentLoopOutputOptions.js";
import { deriveExecutionStatus, INTEGRITY_FAILED } from "../src/execution/executionContract.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
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

  it("stream-json ends a refusal with a terminal error event and exit 1", async () => {
    const { program, captured } = programWith(null);
    await run(program, ["hi", "--provider", "nope", "--output-format", "stream-json"]);
    expect(captured.failures).toEqual([1]);
    expect(events(captured)).toEqual([{ type: "error", message: expect.stringContaining("unknown provider"), exitCode: 1, sessionId: null }]);
  });

  it("refuses a conflicting --json, an unknown format and stream-json with goal rounds", async () => {
    for (const [argv, expected] of [
      [["hi", "--json", "--output-format", "text"], "--json means --output-format json"],
      [["hi", "--output-format", "yaml"], "--output-format must be one of"],
      [["hi", "--output-format", "stream-json", "--goal-rounds", "2"], "goal rounds"]
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
});

describe("runExitCode — derived from the execution phases", () => {
  const summary = (driverStatus: "idle" | "failed" = "idle", validation = "not-requested") =>
    ({ driverStatus, validation: { status: validation } } as unknown as AgentRunSummary);
  const execution = (turn: string | null, receiptStates: string[] = []) =>
    deriveExecutionStatus({ sessionId: "s", admission: "admitted", turn, receiptStates, verified: null });
  const code = (reason: string | undefined, states: string[] = [], extra: Partial<{ driverStatus: "idle" | "failed"; validationRequested: boolean; validation: string; goalFailed: boolean }> = {}) =>
    runExitCode({ summary: summary(extra.driverStatus, extra.validation), execution: execution(reason ?? null, states),
      ending: reason === undefined ? undefined : { turn: 1, reason, cancelCause: null, interrupted: false }, validationRequested: extra.validationRequested ?? false, goalFailed: extra.goalFailed ?? false });

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
    expect(code(undefined, [], { goalFailed: true })).toBe(1);
    expect(code(undefined)).toBe(0);
    expect(code("something_new")).toBe(1);
  });
});

describe("createRunEventSink — projection failure", () => {
  it("ends the stream with an error event, cancels the turn and fails the run when a committed row does not authenticate", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-sink-"));
    try {
      initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
      const out: string[] = [], failures: number[] = [], cancels: unknown[] = [];
      const sink = createRunEventSink({ log: line => out.push(line), error: () => {}, fail: () => failures.push(1) }, dir);
      sink.ready({ sessionId: "ghost", resourceStatus: () => ({ mcp: [], skills: [], extensions: null }) as never,
        cancel: (cause, options) => cancels.push([cause, options]), shutdown: async () => true,
        readEvents: () => [{ id: "x", ts: 1, session_id: "ghost", runtime: "r", event_type: "assistant/block", payload_path: null, payload_inline: null, payload_sha256: "0".repeat(64),
          prev_event_hash: "0".repeat(64), event_hash: "1".repeat(64), writer_sig: "ab".repeat(64), meta_json: "{}" } as never] },
        { agentId: "default", provider: "stub", model: "m", tools: "none", approvals: null });
      sink.notification({ kind: "step-end", turn: 1, step: 1 });
      sink.dispose();
      const lines = out.map(line => JSON.parse(line) as Record<string, unknown>);
      expect(lines.map(line => line.type)).toEqual(["system", "step_end", "error"]);
      expect(lines.at(-1)).toMatchObject({ type: "error", exitCode: 1, sessionId: "ghost" });
      expect(cancels).toEqual([[{ kind: "disposed" }, { by: "stream-json:projection" }]]);
      expect(failures).toEqual([1]);
      sink.result({ summary: {} as never, execution: {} as never, ending: undefined, validationRequested: false, goalFailed: false, exitCode: 0 });
      expect(out.length).toBe(3); // Nothing after the terminal error, not even a result.
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

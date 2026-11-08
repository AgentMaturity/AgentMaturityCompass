import chalk from "chalk";
import type { Command } from "commander";
import type { LoopNotification } from "../agent/loopTypes.js";
import type { AgentRunSummary } from "../agent/runReport.js";
import type { LiveTextPreviewEvent } from "../llm/adapter/liveTextPreview.js";
import { COMMITTED_CURSOR_START, chargeUpdateBudget, projectCommittedTail, type CommittedCursor } from "../acp/acpCommittedStream.js";
import { liveNativeFailureGuidance } from "../agent/nativeFailureGuidance.js";
import { INTEGRITY_FAILED, type ExecutionStatus } from "../execution/executionContract.js";
import type { AgentLoopCliIo } from "../cli-agent-options.js";
import type { ComposedTurnHandle } from "../kernel/agentLoopRunner.js";
import { readNativeSessionEvents } from "../session/readNativeSessionEvents.js";
import type { EvidenceEvent } from "../types.js";

/**
 * Headless `agent-loop run` (SH-UI-01): the prompt from stdin, `--output-format text|json|stream-json`, and the exit
 * code table. `stream-json` writes one JSON event per line on stdout and nothing else there; human progress keeps
 * going to stderr exactly as `--json` sends it. Committed updates go through the same authenticated projection ACP
 * uses (src/acp/acpCommittedStream.ts), so what a script reads here is what an editor would read over ACP.
 */

export const OUTPUT_FORMATS = ["text", "json", "stream-json"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export const RUN_EVENT_SCHEMA_VERSION = 1;
/** The same bound Claude Code applies to a piped prompt; refused, never truncated. */
export const MAX_STDIN_PROMPT_BYTES = 10 * 1024 * 1024;
const FLUSH_INTERVAL_MS = 100;

/**
 * Derived from the execution contract's phases (docs/sdk/EXECUTION_API.md), not restated beside it:
 * 0 admission, model completion and side effects all succeeded; 1 the run failed (driver, `error` ending, requested
 * validation not passed, goal rounds failed, or a refusal before dispatch); 3 cancelled or interrupted; 4 a bounded
 * ending (`max_steps`, `max_tokens`); 5 `blocked` (a guard refused the turn); 6 the turn completed but its side effects
 * did not all settle as completed (a refused, unknown, pending or integrity-failed receipt chain). 2 is `agent-loop
 * verify`'s integrity-only exit and is never produced by `run`.
 */
export const RUN_EXIT_CODES = Object.freeze({ ok: 0, failed: 1, cancelled: 3, bounded: 4, blocked: 5, sideEffectsUnsettled: 6 });

export function withOutputFormatOption(command: Command): Command {
  return command.option("--output-format <format>", `${OUTPUT_FORMATS.join("|")}: the final summary as text (default) or one JSON object, or one JSON event per line on stdout (exit codes 0/1/3/4/5/6; see docs/NATIVE_HEADLESS.md)`);
}

/** `--json` stays the alias of `--output-format json`; a format and a conflicting `--json` is refused. Null after a reported refusal. */
export function resolveOutputFormat(io: AgentLoopCliIo, opts: { readonly json?: boolean; readonly outputFormat?: string; readonly goalRounds?: string }): OutputFormat | null {
  const refuse = (message: string): null => { io.error(chalk.red(message)); io.fail(); return null; };
  if (opts.outputFormat === undefined) return opts.json ? "json" : "text";
  if (!(OUTPUT_FORMATS as readonly string[]).includes(opts.outputFormat)) return refuse(`--output-format must be one of ${OUTPUT_FORMATS.join(", ")}`);
  if (opts.json && opts.outputFormat !== "json") return refuse("--json means --output-format json; drop one of them.");
  if (opts.outputFormat === "stream-json" && opts.goalRounds !== undefined) return refuse("--output-format stream-json follows one root turn; goal rounds run child sessions with no root turn to stream. Use --output-format json.");
  return opts.outputFormat as OutputFormat;
}

/**
 * The prompt a headless run opens with. An explicit `-` reads stdin to EOF; with no positional prompt, no
 * `--audio-input` and a stdin that is not a terminal, stdin is read as well (a never-closed stdin, e.g. `docker run -i`,
 * waits for EOF: pass the prompt positionally there). Over MAX_STDIN_PROMPT_BYTES is refused, never cut.
 */
export async function readHeadlessPrompt(io: AgentLoopCliIo, input: { readonly promptParts: readonly string[]; readonly audioInput?: string }): Promise<string | null> {
  const explicit = input.promptParts.length === 1 && input.promptParts[0] === "-";
  const positional = explicit ? "" : input.promptParts.join(" ").trim();
  if (!explicit && (positional.length > 0 || input.audioInput !== undefined)) return positional;
  if (io.readStdin === undefined) {
    if (!explicit) return positional;
    io.error(chalk.red("a prompt of \"-\" reads stdin, and this invocation has no stdin to read")); io.fail(); return null;
  }
  let text: string | null;
  try { text = await io.readStdin({ explicit }); }
  catch (error) { io.error(chalk.red(error instanceof Error ? error.message : "stdin could not be read")); io.fail(); return null; }
  return text === null ? positional : text.trim();
}

/** The real CLI's stdin: null when it is a terminal and no `-` asked for it. */
export async function readProcessStdin(options: { readonly explicit: boolean }): Promise<string | null> {
  if (!options.explicit && process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = chunk as Buffer;
    bytes += buffer.byteLength;
    if (bytes > MAX_STDIN_PROMPT_BYTES) throw new Error(`the stdin prompt exceeds ${MAX_STDIN_PROMPT_BYTES} bytes; nothing was sent`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface RunReport {
  readonly summary: AgentRunSummary;
  readonly execution: ExecutionStatus;
  readonly ending: AgentRunSummary["endings"][number] | undefined;
  readonly validationRequested: boolean;
  readonly goalFailed: boolean;
}

/** The exit code of a run that reached a result; see RUN_EXIT_CODES. */
export function runExitCode(report: RunReport): number {
  const { summary, execution, ending } = report;
  if (summary.driverStatus === "failed" || ending?.reason === "error" || report.goalFailed
    || (report.validationRequested && summary.validation.status !== "passed") || execution.receiptStates.includes(INTEGRITY_FAILED)) return RUN_EXIT_CODES.failed;
  switch (ending?.reason) {
    case "cancelled": case "interrupted": return RUN_EXIT_CODES.cancelled;
    case "max_steps": case "max_tokens": return RUN_EXIT_CODES.bounded;
    case "blocked": return RUN_EXIT_CODES.blocked;
    case "complete": return execution.phases["side-effect-completion"] === "succeeded" ? RUN_EXIT_CODES.ok : RUN_EXIT_CODES.sideEffectsUnsettled;
    case undefined: return RUN_EXIT_CODES.ok; // No root turn (goal rounds, schedule pass) and nothing above failed.
    default: return RUN_EXIT_CODES.failed; // An ending this version does not know is not success.
  }
}

/** Code 1 is `fail()` (every fake IO sees it); the other codes reach an IO that offers `exit`. */
export function reportExitCode(io: AgentLoopCliIo, code: number): void {
  if (code === RUN_EXIT_CODES.failed) io.fail();
  else if (code !== RUN_EXIT_CODES.ok) io.exit?.(code);
}

export interface RunEventSink {
  /** `system/init` once the session exists (the only point a fork's id is known); starts the committed-row poll. */
  ready(handle: ComposedTurnHandle, facts: { readonly agentId: string; readonly provider: string; readonly model: string; readonly tools: string; readonly approvals: string | null }): void;
  notification(notification: LoopNotification): void;
  liveText(event: LiveTextPreviewEvent): void;
  /** The terminal line: a final authenticated flush, then `result`. */
  result(report: RunReport & { readonly exitCode: number; readonly goalRounds?: unknown }): void;
  /** A terminal `error` line when no result will follow (refusal before dispatch, projection failure). Idempotent. */
  error(message: string, exitCode: number): void;
  /** The last human-facing error line, so a refusal's terminal event can name it. */
  noteError(line: string): void;
  dispose(): void;
}

/** The IO a `stream-json` run sees: `fail()` also ends the stream with a terminal `error` event naming the last error line. */
export function streamJsonIo(io: AgentLoopCliIo, sink: RunEventSink): AgentLoopCliIo {
  return { ...io, error: line => { sink.noteError(line); io.error(line); }, fail: () => { sink.error("", RUN_EXIT_CODES.failed); io.fail(); } };
}

export interface RunOutput { readonly format: OutputFormat; readonly sink: RunEventSink | null }

/** Resolve the format, build the sink for `stream-json`, run the command body under the matching IO, and always end the stream. */
export async function runWithOutput(io: AgentLoopCliIo, workspace: string, opts: { json?: boolean; readonly outputFormat?: string; readonly goalRounds?: string },
  body: (io: AgentLoopCliIo, output: RunOutput) => Promise<void>): Promise<void> {
  const format = resolveOutputFormat(io, opts);
  if (format === null) return;
  opts.json = format !== "text"; // Every `opts.json` site (progress to stderr, JSON summary) follows the format.
  if (format !== "stream-json") { await body(io, { format, sink: null }); return; }
  const sink = createRunEventSink(io, workspace);
  try { await body(streamJsonIo(io, sink), { format, sink }); }
  // The exception's own text stays on the stderr path (the CLI prints it there); stdout gets a fixed line (S9).
  catch (error) { sink.error("the run ended with an unhandled error; see stderr", RUN_EXIT_CODES.failed); throw error; }
  finally { sink.error("the run ended without a result", RUN_EXIT_CODES.failed); sink.dispose(); }
}

/**
 * A live notification as a stream event, its fields named per kind (S9): nothing a notification carries reaches
 * stdout unnamed, and the `error` kind projects only the fixed public guidance the text path prints
 * (`liveNativeFailureGuidance`), never the provider's or exception's own text, which can hold request details or
 * credentials.
 */
export function notificationEvent(notification: LoopNotification): Record<string, unknown> {
  switch (notification.kind) {
    case "status": return { type: "status", status: notification.status };
    case "turn-start": return { type: "turn_start", turn: notification.turn };
    case "turn-end": {
      // The ending as the recorded summary spells it: `reason` and the cancel cause's kind. An `error` ending's exception
      // (a provider failure with its message) is projected through the `error` event above, never carried here.
      const { ending } = notification;
      return { type: "turn_end", turn: notification.turn, ending: { reason: ending.reason, cancelCause: ending.reason === "cancelled" ? ending.cause.kind : null } };
    }
    case "step-start": return { type: "step_start", turn: notification.turn, step: notification.step };
    case "step-end": return { type: "step_end", turn: notification.turn, step: notification.step };
    case "inbox": return { type: "inbox", op: notification.op, target: notification.target, messageIds: notification.messageIds };
    case "retry": return { type: "retry", turn: notification.turn, step: notification.step, attempt: notification.attempt, decision: notification.decision, delayMs: notification.delayMs };
    case "compaction": return { type: "compaction", turn: notification.turn, step: notification.step, message: notification.message, eventIds: notification.eventIds };
    case "error": {
      const { code, httpStatus, summary, nextAction } = liveNativeFailureGuidance(notification.error);
      return { type: "error", turn: notification.turn, step: notification.step, code, httpStatus, summary, nextAction };
    }
  }
}

/**
 * One event per line on `io.log`. Every event carries `type` and `sessionId` (null before admission). Committed
 * updates are `{"type":"update",seq,eventId,eventHash,update}` in ACP's `session/update` shape; `text_delta` is the
 * provisional live preview and says so. A projection failure (tamper, unsigned row, frame or turn bound) ends the
 * stream with `error`, cancels the turn and exits 1: a quietly shorter stream would read as a faithful one.
 */
export function createRunEventSink(io: AgentLoopCliIo, workspace: string): RunEventSink {
  let handle: ComposedTurnHandle | null = null;
  let sessionId: string | null = null;
  let cursor: CommittedCursor = COMMITTED_CURSOR_START;
  const budget = { bytes: 0 };
  let timer: ReturnType<typeof setInterval> | null = null;
  let terminal = false, failed = false, settled = false, lastError: string | null = null;
  const emit = (event: Record<string, unknown>): void => { if (!terminal) io.log(JSON.stringify({ ...event, sessionId })); };
  const onStdoutError = (): void => { fail("stdout closed while streaming; the turn was cancelled", "stdout"); };
  const fail = (message: string, by: string): void => {
    if (failed) return;
    failed = true;
    emit({ type: "error", message, exitCode: RUN_EXIT_CODES.failed });
    terminal = true;
    try { handle?.cancel({ kind: "disposed" }, { by: `stream-json:${by}` }); } catch { /* the recorded outcome is authoritative */ }
    io.fail();
  };
  const stopPolling = (): void => { if (timer !== null) clearInterval(timer); timer = null; };
  // Live reads go through the open session; after `turn-end` the runner closes it, so the rows it wrote while settling
  // (validation, the seal) are read cold from the store under the same prefix-hash continuity check.
  const flush = (read: () => readonly EvidenceEvent[] = () => handle!.readEvents()): void => {
    if (handle === null || failed) return;
    try {
      const tail = projectCommittedTail({ workspace, sessionId: handle.sessionId, events: read(), cursor, emit: true });
      cursor = tail.cursor;
      for (const entry of tail.updates) {
        const event = { type: "update", seq: entry.seq, eventId: entry.eventId, eventHash: entry.eventHash, update: entry.update };
        chargeUpdateBudget(budget, event);
        emit(event);
      }
    } catch (error) { fail(error instanceof Error ? error.message : "committed update projection failed", "projection"); }
  };
  return {
    ready(turn, facts) {
      handle = turn; sessionId = turn.sessionId;
      emit({ type: "system", subtype: "init", schemaVersion: RUN_EVENT_SCHEMA_VERSION, ...facts });
      timer = setInterval(() => flush(), FLUSH_INTERVAL_MS); timer.unref();
      process.stdout.on("error", onStdoutError);
    },
    notification(notification) {
      const { kind } = notification;
      emit(notificationEvent(notification));
      if (settled) return;
      if (kind === "step-end" || kind === "turn-end") flush();
      if (kind === "turn-end") { settled = true; stopPolling(); }
    },
    liveText(event) {
      emit(event.kind === "text" ? { type: "text_delta", trust: event.trust, headerEventId: event.headerEventId, text: event.text }
        : { type: "text_end", trust: event.trust, headerEventId: event.headerEventId, truncated: event.truncated });
    },
    result(report) {
      stopPolling(); settled = true;
      if (handle !== null) flush(() => readNativeSessionEvents(workspace, handle!.sessionId));
      if (failed) return;
      const { summary, execution, exitCode, goalRounds } = report;
      emit({ type: "result", ...summary, ...(goalRounds === undefined ? {} : { goalRounds }), execution, exitCode });
      terminal = true;
    },
    error(message, exitCode) {
      if (terminal) return;
      emit({ type: "error", message: message || lastError || "the run was refused", exitCode });
      terminal = true;
    },
    noteError(line) { lastError = line.replace(/\x1b\[[0-9;]*m/g, ""); },
    dispose() {
      stopPolling();
      process.stdout.removeListener("error", onStdoutError);
    }
  };
}

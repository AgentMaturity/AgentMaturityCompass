import type { ToolExecution } from "../tools/toolTypes.js";
import { runProcess } from "../exec/runProcess.js";
import type { ProcessOutcome } from "../exec/processTypes.js";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { sha256Hex } from "../utils/hash.js";
import type { NativeExtensionHookFailure } from "./nativeExtensionHooks.js";
import type { NativeExtensionHookEvent } from "./nativeExtensionHookSchema.js";
import type { NativeHookRuntime } from "./nativeHookRuntime.js";
import {
  commandHookMatches, loadNativeCommandHooks, NATIVE_COMMAND_HOOK_LIMITS, resolveHookProgram, staleCommandHookReferences,
  type NativeCommandHookEvent, type NativeCommandHookHandler, type NativeCommandHookLoad
} from "./nativeCommandHookConfig.js";

/**
 * Runs the operator's `hooks.json` commands (SH-EXT-01).
 *
 * WHAT A HOOK SEES. JSON on stdin with Claude Code's field names. PreToolUse carries the exact frozen arguments
 * (`tool_input`) up to 32 KiB: a guard that decides on bytes other than the ones that run is no guard, so the
 * arguments are neither redacted nor summarised; an input over the cap is DENIED unless the handler declared
 * `acceptTruncatedInput`, in which case it sees `tool_input: null` and the digest. PostToolUse carries the result's
 * digest and size, never its text. UserPromptSubmit carries the operator's own prompt. The process gets PATH and HOME
 * only: no provider keys, no lease, no credentials.
 *
 * WHAT A HOOK MAY SAY. Exit 2, `{"decision":"deny"}` or `{"hookSpecificOutput":{"permissionDecision":"deny"}}` deny a
 * PreToolUse or UserPromptSubmit. `allow` and `approve` are abstentions (D55: a hook grants nothing). `ask`,
 * `updatedInput`, `additionalContext`, `continue:false` and `systemMessage` are authority AMC does not hand a hook, so
 * on a deny-capable event they deny and on an observe event they are reported. Plain stdout on exit 0 is ignored.
 * Any other exit, a timeout, a spawn failure or a cancellation denies on deny-capable events and is reported otherwise.
 * Stdout over the 64 KiB capture is a denial too: the collector keeps head and tail, so a JSON deny written past the
 * cap would otherwise fail to parse and read as an abstention (fail-open on a guard).
 *
 * THE BOUND FILES ARE RE-CHECKED BEFORE EVERY SPAWN, not once per decision: handlers run one after another for up to
 * 60 s each, and an interpreter re-opens its script by path after spawn. ponytail: a concurrent writer can still swap a
 * script between this check and the interpreter's open; executing the verified bytes from a private copy closes that.
 */

type Decision = { readonly deny: string } | { readonly abstain: true };
const safeText = (text: string): string => redactSecrets(text, () => "<AMC_REDACTED>").redacted.replace(/[\x00-\x1f\x7f]/g, " ").trim()
  .slice(0, NATIVE_COMMAND_HOOK_LIMITS.reasonBytes);
const FORBIDDEN_OUTPUT = ["updatedInput", "additionalContext", "systemMessage", "updatedPermissions"] as const;

function decisionOf(outcome: ProcessOutcome): Decision {
  if (outcome.terminatedBy === "timeout") return { deny: "hook timed out" };
  if (outcome.terminatedBy === "cancel") return { deny: "hook cancelled" };
  if (outcome.exitCode === 2) return { deny: safeText(outcome.stderr.text.split(/\r?\n/)[0] ?? "") || "hook denied (exit 2)" };
  if (outcome.exitCode !== 0) return { deny: `hook exited ${outcome.exitCode ?? outcome.signal ?? "abnormally"}` };
  if (outcome.stdout.droppedBytes > 0) return { deny: `hook output exceeded ${NATIVE_COMMAND_HOOK_LIMITS.outputBytes} bytes; its decision could not be read` };
  const text = outcome.stdout.text.trim();
  if (text.length === 0) return { abstain: true };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { abstain: true }; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { abstain: true };
  const output = parsed as Record<string, unknown>;
  const specific = output.hookSpecificOutput !== null && typeof output.hookSpecificOutput === "object" ? output.hookSpecificOutput as Record<string, unknown> : {};
  const forbidden = FORBIDDEN_OUTPUT.find(field => Object.hasOwn(output, field) || Object.hasOwn(specific, field));
  if (forbidden !== undefined) return { deny: `hook output asked for authority AMC does not grant (${forbidden})` };
  if (output.continue === false) return { deny: safeText(typeof output.stopReason === "string" ? output.stopReason : "") || "hook asked to stop (continue: false)" };
  const decision = typeof output.decision === "string" ? output.decision : typeof specific.permissionDecision === "string" ? specific.permissionDecision : undefined;
  if (decision === "deny" || decision === "block") {
    const reason = typeof output.reason === "string" ? output.reason : typeof specific.permissionDecisionReason === "string" ? specific.permissionDecisionReason : "";
    return { deny: safeText(reason) || "hook denied" };
  }
  if (decision === "ask") return { deny: "hook asked for a human decision; AMC's signed approval gate already decided this call" };
  return { abstain: true };
}

export interface NativeCommandHookRun {
  readonly handler: NativeCommandHookHandler;
  readonly decision: "deny" | "abstain";
  readonly reason?: string;
  readonly exitCode: number | null;
  readonly terminatedBy: string | null;
  readonly stderr: string;
}

/** Run one handler with one input. Exported for `hooks test`; nothing else calls it directly. */
export async function runNativeCommandHook(handler: NativeCommandHookHandler, input: Record<string, unknown>, workspace: string, signal?: AbortSignal): Promise<NativeCommandHookRun> {
  let outcome: ProcessOutcome;
  let program: string;
  try { program = resolveHookProgram(handler.argv[0]!, workspace); }
  catch (error) { return { handler, decision: "deny", reason: error instanceof Error ? error.message : "hook program could not be resolved", exitCode: null, terminatedBy: null, stderr: "" }; }
  try {
    const running = runProcess({ argv: [program, ...handler.argv.slice(1)], cwd: workspace,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", AMC_HOOK_EVENT: handler.event, AMC_WORKSPACE: workspace },
      stdin: "pipe", stdout: "capture", stderr: "capture", maxCaptureBytes: NATIVE_COMMAND_HOOK_LIMITS.outputBytes, scrubValues: [],
      graceMs: 500, timeoutMs: handler.timeoutMs, ...(signal === undefined ? {} : { signal }) });
    try { await running.write(Buffer.from(JSON.stringify(input), "utf8")); } catch { /* a child that exited first still answers through its exit code */ }
    running.endStdin();
    outcome = await running.done;
  } catch (error) {
    return { handler, decision: "deny", reason: `hook could not be started (${error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "spawn failed"})`, exitCode: null, terminatedBy: null, stderr: "" };
  }
  const decided = decisionOf(outcome);
  const stderr = safeText(outcome.stderr.text);
  return "deny" in decided ? { handler, decision: "deny", reason: decided.deny, exitCode: outcome.exitCode, terminatedBy: outcome.terminatedBy, stderr }
    : { handler, decision: "abstain", exitCode: outcome.exitCode, terminatedBy: outcome.terminatedBy, stderr };
}

/** The stdin JSON for one event. `tool_input` is the frozen arguments or null when they exceed the cap. */
export function nativeCommandHookInput(event: NativeCommandHookEvent, base: { readonly sessionId: string | null; readonly cwd: string }, detail: Record<string, unknown>): Record<string, unknown> {
  return { hook_event_name: event, session_id: base.sessionId, cwd: base.cwd, ...detail };
}

const EVENT_OF: Partial<Record<NativeExtensionHookEvent["kind"], NativeCommandHookEvent>> = { "tool-end": "PostToolUse", "turn-end": "Stop" };

export class NativeCommandHooks implements NativeHookRuntime {
  private readonly failures: NativeExtensionHookFailure[] = [];
  private readonly prepared = new WeakMap<ToolExecution, string | undefined>();
  constructor(private readonly load: Exclude<NativeCommandHookLoad, { status: "absent" }>,
    private readonly context: { readonly workspace: string; readonly sessionId: () => string | null }) {}
  get active(): boolean { return true; }
  get sha256(): string | null { return this.load.sha256; }
  reports(): readonly NativeExtensionHookFailure[] { return this.failures.map(report => ({ ...report })); }

  private identity(handler?: NativeCommandHookHandler): string {
    return `hooks.json sha256 ${this.sha256 ?? "unreadable"}${handler === undefined ? "" : ` ${handler.event} #${handler.index}`}`;
  }
  /** `manifestDigest` is null, never a made-up digest, when the file could not be read. */
  private report(kind: NativeExtensionHookEvent["kind"], code: string): NativeExtensionHookFailure {
    const report = Object.freeze({ extensionId: "hooks.json", manifestDigest: this.sha256, kind, code });
    this.failures.push(report);
    if (this.failures.length > 128) this.failures.shift();
    return report;
  }
  private handlers(event: NativeCommandHookEvent, toolName?: string): readonly NativeCommandHookHandler[] {
    if (this.load.status !== "trusted") return [];
    return this.load.handlers.filter(handler => handler.event === event && (toolName === undefined || commandHookMatches(handler.matcher, toolName)));
  }
  private base() {
    let sessionId: string | null = null;
    try { sessionId = this.context.sessionId(); } catch { /* a root toolset before its session is bound */ }
    return { sessionId, cwd: this.context.workspace };
  }
  /** Not-trusted and invalid files, and a bound workspace script that changed since trust, fail closed on every deny-capable event. */
  private refusal(): string | undefined {
    if (this.load.status !== "trusted") return `${this.identity()}: ${this.load.reason}`;
    const stale = staleCommandHookReferences(this.context.workspace, this.load);
    return stale === undefined ? undefined : `${this.identity()}: ${stale}`;
  }

  async observe(event: NativeExtensionHookEvent, signal?: AbortSignal): Promise<readonly NativeExtensionHookFailure[]> {
    const mapped = EVENT_OF[event.kind];
    if (mapped === undefined) return [];
    if (this.load.status !== "trusted") return this.load.status === "untrusted" ? [this.report(event.kind, "HOOKS_UNTRUSTED")] : [this.report(event.kind, "HOOKS_INVALID")];
    if (staleCommandHookReferences(this.context.workspace, this.load) !== undefined) return [this.report(event.kind, "HOOKS_UNTRUSTED")];
    const detail = mapped === "PostToolUse"
      ? { tool_name: event.toolName ?? null, tool_use_id: event.callId ?? null, turn: event.turn ?? null, step: event.step ?? null,
        tool_response: { ok: event.ok ?? null, output_sha256: event.outputSha256 ?? null, output_bytes: event.outputBytes ?? null } }
      : { turn: event.turn ?? null };
    const reports: NativeExtensionHookFailure[] = [];
    for (const handler of this.handlers(mapped, mapped === "PostToolUse" ? event.toolName ?? "" : undefined)) {
      if (staleCommandHookReferences(this.context.workspace, this.load) !== undefined) { reports.push(this.report(event.kind, "HOOKS_UNTRUSTED")); break; }
      const run = await runNativeCommandHook(handler, nativeCommandHookInput(mapped, this.base(), detail), this.context.workspace, signal);
      if (run.decision === "deny") reports.push(this.report(event.kind, run.terminatedBy === "timeout" ? "HOOK_TIMEOUT" : run.exitCode === null ? "HOOK_SPAWN_FAILED" : "HOOK_FAILED"));
    }
    return reports;
  }

  /** Deny-capable chain: the first denial wins; a handler failure is a denial (fail closed). */
  private async decide(event: NativeCommandHookEvent, toolName: string | undefined, detail: Record<string, unknown>, truncated: boolean, signal?: AbortSignal): Promise<string | undefined> {
    const refused = this.refusal();
    if (refused !== undefined) return refused;
    for (const handler of this.handlers(event, toolName)) {
      if (truncated && !handler.acceptTruncatedInput) return `${this.identity(handler)}: the input exceeds ${NATIVE_COMMAND_HOOK_LIMITS.inputBytes} bytes and the hook did not declare acceptTruncatedInput`;
      const stale = this.refusal(); // immediately before each spawn, not once per decision
      if (stale !== undefined) return stale;
      const run = await runNativeCommandHook(handler, nativeCommandHookInput(event, this.base(), detail), this.context.workspace, signal);
      if (run.decision === "deny") return `${this.identity(handler)}: ${run.reason ?? "hook denied"}`;
    }
    return undefined;
  }

  /** Awaited after approvals in every pipeline path, including journaled and Code Mode sub-calls. */
  readonly prepare = async (execution: ToolExecution): Promise<void> => {
    if (this.load.status === "trusted" && this.handlers("PreToolUse", execution.name).length === 0) { this.prepared.set(execution, undefined); return; }
    const serialized = JSON.stringify(execution.arguments);
    const truncated = Buffer.byteLength(serialized) > NATIVE_COMMAND_HOOK_LIMITS.inputBytes;
    const detail = { tool_name: execution.name, tool_use_id: execution.callId, action_class: execution.actionClass, requested_mode: execution.requestedMode,
      tool_input: truncated ? null : execution.arguments, tool_input_truncated: truncated, tool_input_sha256: sha256Hex(serialized), tool_input_bytes: Buffer.byteLength(serialized) };
    this.prepared.set(execution, await this.decide("PreToolUse", execution.name, detail, truncated, execution.signal));
  };

  /** Synchronous: nothing separates the prepared decision from the tool effect. An unprepared call is denied. */
  readonly guard = (execution: ToolExecution): string | undefined => {
    if (!this.prepared.has(execution)) return `${this.identity()}: PreToolUse hooks were not evaluated for this call`;
    return this.prepared.get(execution);
  };

  /**
   * UserPromptSubmit: a denial stops the turn before composition. `prompt` is the line as the operator typed it (so a
   * hook can deny `/deploy` by name), capped at 32 KiB; `skill` is the resolved skill or command name, or null.
   */
  async promptSubmit(prompt: string, signal?: AbortSignal, skill?: string): Promise<string | undefined> {
    const bytes = Buffer.byteLength(prompt);
    const truncated = bytes > NATIVE_COMMAND_HOOK_LIMITS.inputBytes;
    const detail = { prompt: truncated ? null : prompt, prompt_truncated: truncated, prompt_sha256: sha256Hex(prompt), prompt_bytes: bytes, skill: skill ?? null };
    return this.decide("UserPromptSubmit", undefined, detail, truncated, signal);
  }
}

/** For the run path: the workspace's UserPromptSubmit denial, or undefined when there is no hooks.json or no denial. */
export async function denyPromptByCommandHooks(init: { readonly workspace: string; readonly prompt: string; readonly signal?: AbortSignal; readonly skill?: string }): Promise<string | undefined> {
  const load = loadNativeCommandHooks(init.workspace);
  if (load.status === "absent") return undefined;
  return new NativeCommandHooks(load, { workspace: init.workspace, sessionId: () => null }).promptSubmit(init.prompt, init.signal, init.skill);
}

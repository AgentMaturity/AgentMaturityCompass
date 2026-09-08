import { randomUUID, createHash } from "node:crypto";
import type { SessionService } from "../session/sessionService.js";
import type { AgentToolSeam, ToolCallOutcome } from "./toolSeam.js";

/** Operator-selected public checks; not instructions or tools selected by a model. */
export interface NativeValidationCheck {
  readonly id: string;
  readonly title: string;
  readonly command: string;
  readonly timeoutMs: number;
}
export interface NativeValidationPlan {
  readonly configSha256: string;
  readonly checks: readonly NativeValidationCheck[];
}
export type NativeValidationStatus = "not-requested" | "pending" | "passed" | "failed" | "unavailable";
export interface NativeValidationCheckResult {
  readonly id: string;
  readonly title: string;
  readonly status: Exclude<NativeValidationStatus, "not-requested">;
  readonly callId: string | null;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly reason: string | null;
  readonly outputEventId: string | null;
}
export interface NativeValidationResult {
  readonly status: NativeValidationStatus;
  readonly turn: number | null;
  readonly configSha256: string | null;
  readonly checks: readonly NativeValidationCheckResult[];
}

/** Snapshot the reviewed plan before any prompt executes. No file discovery or grants. */
export function freezeNativeValidationPlan(plan: NativeValidationPlan): NativeValidationPlan {
  if (!/^[a-f0-9]{64}$/.test(plan.configSha256) || !Array.isArray(plan.checks) || plan.checks.length < 1 || plan.checks.length > 8) throw new Error("Invalid native validation plan.");
  const ids = new Set<string>();
  const checks = plan.checks.map(check => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(check.id) || ids.has(check.id)
      || typeof check.title !== "string" || !check.title.trim() || check.title.length > 160 || /[\x00-\x1f\x7f]/.test(check.title)
      || typeof check.command !== "string" || !check.command.trim() || Buffer.byteLength(check.command) > 8192 || check.command.includes("\0")
      || !Number.isSafeInteger(check.timeoutMs) || check.timeoutMs < 1 || check.timeoutMs > 600_000) throw new Error("Invalid native validation check.");
    ids.add(check.id);
    return Object.freeze({ id: check.id, title: check.title, command: check.command, timeoutMs: check.timeoutMs });
  });
  return Object.freeze({ configSha256: plan.configSha256, checks: Object.freeze(checks) });
}

export function validationCheckPending(check: Pick<NativeValidationCheck, "id" | "title">): NativeValidationCheckResult {
  return { id: check.id, title: check.title, status: "pending", callId: null, exitCode: null, timedOut: false, reason: null, outputEventId: null };
}
export function validationAggregate(checks: readonly NativeValidationCheckResult[]): Exclude<NativeValidationStatus, "not-requested"> {
  if (checks.some(check => check.status === "failed")) return "failed";
  if (checks.some(check => check.status === "pending")) return "pending";
  if (checks.some(check => check.status === "unavailable") || checks.length === 0) return "unavailable";
  return "passed";
}

interface ValidationTurnInput {
  readonly session: SessionService;
  readonly tools: AgentToolSeam;
  readonly plan: NativeValidationPlan;
  readonly turn: number;
  readonly signal: AbortSignal;
  readonly abandonGraceMs: number;
}

/** Evidence-only validation: never adds an invented assistant call to the conversation. */
export class NativeValidationTurn {
  private readonly checks: NativeValidationCheckResult[];
  private finished = false;
  constructor(private readonly input: ValidationTurnInput) {
    this.checks = input.plan.checks.map(validationCheckPending);
    this.record("requested", { checks: this.checks.map(({ id, title }) => ({ id, title })) });
  }

  private record(phase: string, meta: Record<string, unknown>, payload = ""): string {
    return this.input.session.recordProjectedEvidence({ eventType: "audit", payload, meta: {
      kind: "native-validation", version: 1, phase, turn: this.input.turn, configSha256: this.input.plan.configSha256, ...meta
    } }).eventId;
  }

  /** Only a normal completed model turn reaches this method. No automatic repair/retry. */
  async run(step: number): Promise<void> {
    for (let index = 0; index < this.input.plan.checks.length; index++) {
      this.input.signal.throwIfAborted();
      const check = this.input.plan.checks[index]!;
      const callId = `validation-${randomUUID()}`;
      this.checks[index] = { ...this.checks[index]!, callId };
      const rawArguments = JSON.stringify({ command: check.command, timeoutMs: check.timeoutMs });
      this.record("check-start", { checkId: check.id, callId, toolName: "bash", argumentsSha256: createHash("sha256").update(rawArguments).digest("hex") });
      const outcome = await boundedCheck(this.input, callId, rawArguments, step, check.timeoutMs);
      const cancelled = this.input.signal.aborted || outcome.outcome === "CANCELLED";
      const knownExit = typeof outcome.exitCode === "number" && Number.isInteger(outcome.exitCode);
      const status = cancelled || outcome.denied || outcome.timedOut || !knownExit || outcome.outcome === "TOOL_OUTCOME_UNKNOWN"
        ? "unavailable" : outcome.exitCode !== 0 ? "failed" : outcome.outcome === "OK" ? "passed" : "unavailable";
      const reason = cancelled ? "cancelled" : outcome.denied ? "execution-denied" : outcome.timedOut ? "deadline-exceeded"
        : !knownExit || outcome.outcome === "TOOL_OUTCOME_UNKNOWN" ? "execution-unavailable" : status === "failed" ? "nonzero-exit" : status === "passed" ? null : "execution-unavailable";
      const result: NativeValidationCheckResult = { id: check.id, title: check.title, status, callId,
        exitCode: knownExit ? outcome.exitCode : null, timedOut: outcome.timedOut, reason, outputEventId: null };
      const outputEventId = this.record("check-result", { checkId: check.id, callId, status, exitCode: result.exitCode,
        timedOut: result.timedOut, reason, toolOutcome: outcome.outcome }, typeof outcome.content === "string" ? outcome.content : outcome.content.toString("utf8"));
      this.checks[index] = { ...result, outputEventId };
      this.input.signal.throwIfAborted();
      // An unresolved/cancelled process must not overlap a later check.
      if (status === "unavailable") break;
    }
    this.finish("prior-check-unavailable");
  }

  /** Also called from the turn's finally, so unexecuted selected checks never look passed. */
  finish(reason: string): void {
    if (this.finished) return;
    for (let index = 0; index < this.checks.length; index++) {
      const check = this.checks[index]!;
      if (check.status === "pending") this.checks[index] = { ...check, status: "unavailable", reason };
    }
    this.record("finished", { status: validationAggregate(this.checks), checks: this.checks });
    this.finished = true;
  }
}

/** Bound approval+execution and cancellation waiting without claiming an unobserved outcome. */
async function boundedCheck(input: ValidationTurnInput, callId: string, rawArguments: string, step: number, timeoutMs: number): Promise<ToolCallOutcome> {
  const abort = new AbortController();
  let timeout = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let abandon!: (outcome: ToolCallOutcome) => void;
  const abandoned = new Promise<ToolCallOutcome>(resolve => { abandon = resolve; });
  const stop = (): void => {
    if (abort.signal.aborted) return;
    abort.abort(input.signal.reason ?? new Error("Native validation deadline exceeded."));
    grace = setTimeout(() => abandon({ outcome: "TOOL_OUTCOME_UNKNOWN", content: "Validation stopped waiting; execution outcome is unknown.", exitCode: null, timedOut: timeout, denied: false }), Math.max(0, input.abandonGraceMs));
  };
  input.signal.addEventListener("abort", stop, { once: true });
  if (input.signal.aborted) stop();
  else deadline = setTimeout(() => { timeout = true; stop(); }, timeoutMs);
  try {
    const execution = Promise.resolve().then(() => {
      if (abort.signal.aborted) return { outcome: "CANCELLED", content: "Validation was cancelled before dispatch.", exitCode: null, timedOut: timeout, denied: false } as const;
      return input.tools.execute({ callId, toolName: "bash", rawArguments, sessionId: input.session.sessionId,
        turn: input.turn, step, parentToken: null, dispatch: "native", signal: abort.signal });
    }).catch((): ToolCallOutcome => ({ outcome: "TOOL_OUTCOME_UNKNOWN", content: "The validation execution seam failed; no outcome can be established.", exitCode: null, timedOut: timeout, denied: false }));
    const result = await Promise.race([execution, abandoned]);
    return timeout ? { ...result, timedOut: true } : result;
  } finally {
    input.signal.removeEventListener("abort", stop);
    clearTimeout(deadline); clearTimeout(grace);
  }
}

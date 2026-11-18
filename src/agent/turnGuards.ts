/**
 * Cheap loop guards (HP-01, HP-23) and the ordered turn-policy list (HP-03).
 *
 * Three per-turn guards, each a count the driver checks after `step/end`:
 *   - repeated call: the same tool with the same arguments (keys sorted, text NFC) called again within one turn, in
 *     any order. From the `refuseAt`-th identical call the call is NOT run and the model is told why; at `stopAt` the
 *     turn ends. A write-class call that succeeds clears the counts of every other call (the workspace may have
 *     changed), never its own; a steer clears them all. Polling tools (`polls` in nativeToolCapabilities) are not counted.
 *   - malformed responses: consecutive steps whose tool calls could not be used (arguments that are not a JSON
 *     object, or a tool the request never offered). A step whose calls are all well formed clears the streak.
 *   - denials: calls refused by a guard, a policy or an approver in one turn. The loop's own refusals (unoffered
 *     names, repeated calls) are not counted here: they are counted above.
 * A stop is a signed `loop/cancel` with a `limit` cause that names the condition and the tools; the turn's `turn/end`
 * carries the same cause. Nothing here runs a call the seam would refuse, approves anything, or changes a mode.
 *
 * State is per driver and reset at each turn start, so a delegated child (its own driver) starts fresh.
 */
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import type { ActionClass, EvidenceEvent } from "../types.js";
import { readTurnEndMeta } from "../session/turnLifecycleMeta.js";
import type { RunLimitBreach, RunLimits, RunLimitTracker } from "./runLimits.js";
import type { ToolCallOutcome } from "./toolSeam.js";
import { isPollingNativeTool } from "./nativeToolCapabilities.js";

/** The defaults. `--stop` may only lower them (src/agent/runLimits.ts). */
export const TURN_GUARD_DEFAULTS = Object.freeze({ repeatRefuseAt: 3, repeatedCalls: 5, malformedResponses: 3, denials: 5 });

const MAX_NAME = 128;

/** One call as the model produced it. */
export interface GuardedCall {
  readonly name: string;
  readonly arguments: string;
  readonly unoffered?: true;
}

/** The arguments' canonical form (keys sorted), or null when they are not a JSON object. `""` reads as `{}`, as the pipeline reads it. */
export function canonicalArguments(raw: string): string | null {
  try {
    // NFC: two spellings of the same text are the same call.
    const parsed: unknown = JSON.parse(raw === "" ? "{}" : raw, (_key, value: unknown) => typeof value === "string" ? value.normalize("NFC") : value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? canonicalize(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Whether a claimed inbox message was sent by a person into the turn: an allow-list of the steer and follow-up lanes
 * (`driver.steer`/`followup`: the CLI's --steer, a parent's IPC steer frame, a host's queue). Never "not a tool": an
 * `inject` (context snapshots, host reminders) or a `tool` message must not clear the repeat counts.
 */
export function sentByPerson(message: { readonly origin: string; readonly contextSnapshot?: true }): boolean {
  return message.contextSnapshot !== true && (message.origin === "steer" || message.origin === "followup");
}

/** What `beforeCall` hands back: the loop's own answer (or null to dispatch), and the call's place in the count. */
export interface GuardDecision { readonly answer: ToolCallOutcome | null; readonly ticket: GuardTicket | null }
/** A counted call: its signature and when it was counted (for the write reset). */
export interface GuardTicket { readonly signature: string; readonly seq: number }

/** A configured guard bound, held to [floor, default]: a typed caller cannot loosen what the parser refuses. */
function clamp(value: number | undefined, floor: number, ceiling: number): number {
  return value === undefined || !Number.isFinite(value) ? ceiling : Math.max(floor, Math.min(ceiling, Math.trunc(value)));
}

export class TurnGuards {
  private readonly refuseAt: number;
  private readonly stopAt: number;
  private readonly malformedAt: number;
  private readonly denialsAt: number;
  /** Per turn: how often each signature was called since the last reset, and the sequence of its latest call. */
  private readonly counts = new Map<string, { count: number; seq: number }>();
  private seq = 0;
  private stepMalformed = false;
  private malformedSteps = 0;
  private readonly denied: string[] = [];
  private tripped: RunLimitBreach | null = null;

  constructor(limits: RunLimits = {}) {
    this.stopAt = clamp(limits.repeatedCalls, 2, TURN_GUARD_DEFAULTS.repeatedCalls);
    this.refuseAt = Math.min(TURN_GUARD_DEFAULTS.repeatRefuseAt, this.stopAt);
    this.malformedAt = clamp(limits.malformedResponses, 1, TURN_GUARD_DEFAULTS.malformedResponses);
    this.denialsAt = clamp(limits.denials, 1, TURN_GUARD_DEFAULTS.denials);
  }

  /** At each turn start. Every count is per turn; the stop is kept until the next turn starts (the run report reads it). */
  reset(): void {
    this.clearRepeats();
    this.stepMalformed = false;
    this.malformedSteps = 0;
    this.denied.length = 0;
    this.tripped = null;
  }

  /** A person's message reached the turn (a steer): the model may now have a reason to repeat a call. */
  clearRepeats(): void { this.counts.clear(); }

  /** The guard stop of the current (or just ended) turn, if any. */
  get trip(): RunLimitBreach | null { return this.tripped; }

  /** In model order, before dispatch. Polling tools (whose result changes with no call between) are not counted. */
  beforeCall(call: GuardedCall): GuardDecision {
    const args = call.unoffered === true ? null : canonicalArguments(call.arguments);
    if (args === null) { this.stepMalformed = true; return { answer: null, ticket: null }; }
    if (isPollingNativeTool(call.name)) return { answer: null, ticket: null };
    const signature = sha256Hex(canonicalize([call.name, args])), seq = ++this.seq;
    const count = (this.counts.get(signature)?.count ?? 0) + 1;
    this.counts.set(signature, { count, seq });
    const ticket = { signature, seq };
    if (count < this.refuseAt) return { answer: null, ticket };
    if (count >= this.stopAt) this.stop({ kind: "limit", condition: "repeated-call", bound: this.stopAt, tools: [call.name.slice(0, MAX_NAME)] });
    return { ticket, answer: { outcome: "DENIED", denied: true, exitCode: null, timedOut: false,
      content: `[amc] You have made this exact call (same tool, same arguments) ${count} times in this turn, so it was not run. `
        + (this.tripped === null ? "Change the arguments, try a different approach, or stop and say what is blocking you."
          : "The turn is ending; say what is blocking you.") } };
  }

  /**
   * After a dispatched call settles. A write-class call that succeeded clears the counts of every OTHER signature counted
   * before it started (the workspace may have changed), never its own: the same successful write repeated still counts.
   * `actionClass` null (unknown) is not a write.
   */
  afterCall(name: string, outcome: ToolCallOutcome, actionClass: ActionClass | null, ticket: GuardTicket | null): void {
    if (outcome.denied) {
      this.denied.push(name.slice(0, MAX_NAME));
      if (this.denied.length >= this.denialsAt) this.stop({ kind: "limit", condition: "denials", bound: this.denialsAt, tools: this.denied });
    } else if (ticket !== null && outcome.outcome === "OK" && actionClass !== null && actionClass !== "READ_ONLY") {
      // Only counts made before this write started: its own entry was counted at its start (seq === ticket.seq), so it stays.
      for (const [signature, entry] of this.counts) if (entry.seq < ticket.seq) this.counts.delete(signature);
    }
  }

  /** After a step's calls have all been answered. */
  endStep(): void {
    this.malformedSteps = this.stepMalformed ? this.malformedSteps + 1 : 0;
    this.stepMalformed = false;
    if (this.malformedSteps >= this.malformedAt) this.stop({ kind: "limit", condition: "malformed-responses", bound: this.malformedAt });
  }

  private stop(breach: RunLimitBreach): void {
    if (this.tripped !== null) return;
    const tools = breach.tools === undefined ? undefined : [...new Set(breach.tools)].sort().slice(0, 16);
    this.tripped = Object.freeze({ ...breach, ...(tools === undefined ? {} : { tools }) });
  }
}

/** A stop and how far it reaches: `run` closes admission (a run limit), `turn` ends only this turn (a guard). */
export interface TurnStop { readonly cause: RunLimitBreach; readonly scope: "run" | "turn" }
export type TurnPolicy = () => TurnStop | null;

/**
 * The checks the driver runs after each `step/end`, in order; the first stop wins. Token and cost limits come first,
 * so a run that is over budget is reported as over budget, not as stuck.
 */
export function turnPolicies(limits: RunLimitTracker | null, guards: TurnGuards): readonly TurnPolicy[] {
  const run = (cause: RunLimitBreach | null): TurnStop | null => cause === null ? null : { cause, scope: "run" };
  return [
    () => run(limits?.breach ?? null),
    () => run(limits?.recordCost() ?? null),
    () => guards.trip === null ? null : { cause: guards.trip, scope: "turn" }
  ];
}

export function firstStop(policies: readonly TurnPolicy[]): TurnStop | null {
  for (const policy of policies) {
    const stop = policy();
    if (stop !== null) return stop;
  }
  return null;
}

/** A limit stop in plain words, for `amc session show` and the run report. */
export function describeTurnStop(cause: { readonly condition: string; readonly bound: number; readonly unmeasured?: true; readonly tools?: readonly string[];
  readonly unmeasuredBy?: string }): string {
  const tools = cause.tools === undefined || cause.tools.length === 0 ? "" : ` (${cause.tools.map(name => JSON.stringify(name)).join(", ")})`;
  switch (cause.condition) {
    case "repeated-call": return `The agent made the same tool call ${cause.bound} times in one turn${tools}, so AMC ended the turn.`;
    case "malformed-responses": return `The model sent ${cause.bound} responses in a row whose tool calls AMC could not use, so AMC ended the turn.`;
    case "denials": return `${cause.bound} tool calls were refused in one turn${tools}, so AMC ended the turn. Nothing refused was run.`;
    case "max-cost-usd": return cause.unmeasured === true
      ? `The run stopped: a cost limit of $${cause.bound} was set, and a model request had no known cost, so AMC could not keep the limit.`
      : `The run stopped: its indicative cost passed the limit of $${cause.bound}. This is an estimate, not a bill.`;
    case "max-tokens": return cause.unmeasured === true
      ? cause.unmeasuredBy === "compaction-summary"
        ? `The run stopped: a token limit of ${cause.bound} was set, and the token usage of a request asking the model to summarize earlier work was unknown (it was refused or failed), so AMC could not keep the limit.`
        : `The run stopped: a token limit of ${cause.bound} was set, and a step reported no token usage, so AMC could not keep the limit.`
      : `The run stopped: it used more than its limit of ${cause.bound} tokens.`;
    case "max-turns": return `The run stopped: it reached its limit of ${cause.bound} turns.`;
    case "deadline": return `The run stopped: it reached its time limit of ${cause.bound} ms.`;
    default: return "The run stopped at a limit this version of AMC does not know.";
  }
}

/** One turn that ended at a limit or a guard, read back from its signed `turn/end`. */
export interface TurnStopRow { readonly eventId: string; readonly turn: number; readonly condition: string; readonly text: string }

/** Every turn of `sessionId` whose signed `turn/end` names a `limit` cause, in plain words. */
export function projectTurnStops(events: readonly EvidenceEvent[], sessionId: string): TurnStopRow[] {
  const stops: TurnStopRow[] = [];
  for (const event of events) {
    if (event.session_id !== sessionId || event.event_type !== "turn/end") continue;
    const cause = readTurnEndMeta(event.meta_json)?.cancelCause;
    if (cause?.kind !== "limit") continue;
    stops.push({ eventId: event.id, turn: readTurnEndMeta(event.meta_json)!.turn, condition: cause.condition, text: describeTurnStop(cause) });
  }
  return stops;
}

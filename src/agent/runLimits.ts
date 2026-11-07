/**
 * Root-run stop conditions (SH-LOOP-06): `--stop max-turns:N`, `--stop max-tokens:N`,
 * `--stop timeout-ms:N` on `amc agent-loop run`.
 *
 * WHAT A LIMIT IS. An operator bound on ONE invocation of the driver, enforced
 * by the driver itself and recorded when it fires as a `loop/cancel` row whose
 * cause is `{kind:"limit", condition, bound}` (and, when a turn was live, inside
 * the hashed `turn/end`). It is deliberately NOT part of `AgentLoopConfig`, so it
 * is not in the session's policy digest: a limit is a bound on a run, not a
 * property of the session, and resuming with a different `--stop` must not be a
 * CONFIGURATION_MISMATCH.
 *
 * UNITS, STATED. `max-turns:N` is a SESSION turn number: no turn numbered above
 * N opens, so a resumed session that already ran N turns refuses its next one.
 * `max-tokens:N` counts provider-reported input, output and cache tokens over the
 * steps THIS driver ran, plus the tokens the session's earlier steps reported
 * (seeded by the caller from `sessionTokenCounts`). `timeout-ms:N` is wall clock
 * from the driver's construction. In-process delegated children run under their
 * own driver and are not counted; a run that needs a child bound uses
 * `--delegate-stop`.
 *
 * FAIL CLOSED ON UNMEASURED USAGE. Under `max-tokens`, a step whose provider
 * reported no usage is a step the bound cannot see. The run stops there with
 * condition `max-tokens` and `unmeasured: true`, rather than counting the step
 * as zero and letting an unmeasured route run past its budget.
 *
 * Separate from `parseSubagentStopConditions` on purpose: that parser's output
 * is signed into delegation packets children enforce, and widening it would sign
 * a `max-tokens` claim no child enforces.
 */
import type { TokenUsage } from "../session/sessionTypes.js";

export type RunLimitCondition = "max-turns" | "max-tokens" | "deadline";

export interface RunLimits {
  /** The highest session turn number that may open. */
  readonly maxTurns?: number;
  /** Provider-reported input + output + cache tokens, over the whole session. */
  readonly maxTotalTokens?: number;
  /** Wall-clock milliseconds from the driver's construction. */
  readonly deadlineMs?: number;
}

/** The cause a limit records. `bound` is the operator's number; `unmeasured` marks a fail-closed stop. */
export interface RunLimitBreach {
  readonly kind: "limit";
  readonly condition: RunLimitCondition;
  readonly bound: number;
  readonly unmeasured?: true;
}

/** Node timers cannot represent a larger delay without overflowing to 1ms. */
const MAX_TIMER_MS = 2_147_483_647;

export type RunLimitsParse =
  | { readonly ok: true; readonly limits: RunLimits; readonly conditions: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/** Parse the exact `--stop` strings. No prose, no defaults: an unknown form is refused, never ignored. */
export function parseRunLimits(conditions: readonly string[] | undefined): RunLimitsParse {
  const snapshot = [...(conditions ?? [])];
  const limits: { maxTurns?: number; maxTotalTokens?: number; deadlineMs?: number } = {};
  for (const condition of snapshot) {
    const match = typeof condition === "string" ? /^(max-turns|max-tokens|timeout-ms):([1-9][0-9]*)$/.exec(condition) : null;
    if (match === null || match[0] !== condition) {
      return { ok: false, reason: "invalid stop condition; expected max-turns:N, max-tokens:N or timeout-ms:N with a positive canonical decimal integer" };
    }
    const value = Number(match[2]);
    if (!Number.isSafeInteger(value)) return { ok: false, reason: `invalid ${match[1]} stop condition: value must be a positive safe integer` };
    const key = match[1] === "max-turns" ? "maxTurns" : match[1] === "max-tokens" ? "maxTotalTokens" : "deadlineMs";
    if (limits[key] !== undefined) return { ok: false, reason: `duplicate ${match[1]} stop condition` };
    if (key === "deadlineMs" && value > MAX_TIMER_MS) return { ok: false, reason: `timeout-ms stop condition exceeds the ${MAX_TIMER_MS}ms timer limit` };
    limits[key] = value;
  }
  return { ok: true, limits: Object.freeze({ ...limits }), conditions: Object.freeze(snapshot) };
}

/** What a session's earlier steps reported, for seeding a resumed run's token budget. */
export function priorTokensOf(counts: { readonly turns: readonly { readonly steps: number; readonly measuredSteps: number;
  readonly tokens: Record<"inputTokens" | "outputTokens" | "cacheRead" | "cacheWrite", number | null> }[] }): { readonly priorTokens: number; readonly priorUnmeasured: boolean } {
  let priorTokens = 0, priorUnmeasured = false;
  for (const turn of counts.turns) {
    if (turn.measuredSteps < turn.steps) priorUnmeasured = true;
    for (const value of Object.values(turn.tokens)) priorTokens += value ?? 0;
  }
  return { priorTokens, priorUnmeasured };
}

/** All tokens a step reported, or null when it reported none. */
export function totalTokensOf(usage: TokenUsage | null): number | null {
  if (usage === null) return null;
  const total = usage.inputTokens + usage.outputTokens + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

/** The driver's bookkeeping for one run. Pure except for the clock it is told. */
export class RunLimitTracker {
  private tokens: number;
  private breached: RunLimitBreach | null = null;

  constructor(private readonly limits: RunLimits, priorTokens = 0, priorUnmeasured = false) {
    this.tokens = priorTokens;
    // A history with steps that reported no usage is one the token bound cannot see: fail closed.
    if (priorUnmeasured && limits.maxTotalTokens !== undefined) {
      this.breached = { kind: "limit", condition: "max-tokens", bound: limits.maxTotalTokens, unmeasured: true };
    }
  }

  /** The first breach recorded, if any: once breached, no further turn opens. */
  get breach(): RunLimitBreach | null { return this.breached; }

  get deadlineMs(): number | undefined { return this.limits.deadlineMs; }

  /** Whether session turn `turn` may open. */
  turnAllowed(turn: number): RunLimitBreach | null {
    if (this.breached !== null) return this.breached;
    if (this.limits.maxTurns !== undefined && turn > this.limits.maxTurns) {
      this.breached = { kind: "limit", condition: "max-turns", bound: this.limits.maxTurns };
    }
    return this.breached;
  }

  /** Account one step's usage; a breach is returned once and remembered. */
  recordUsage(usage: TokenUsage | null): RunLimitBreach | null {
    if (this.breached !== null) return this.breached;
    if (this.limits.maxTotalTokens === undefined) return null;
    const total = totalTokensOf(usage);
    if (total === null) {
      this.breached = { kind: "limit", condition: "max-tokens", bound: this.limits.maxTotalTokens, unmeasured: true };
      return this.breached;
    }
    this.tokens += total;
    if (this.tokens > this.limits.maxTotalTokens) {
      this.breached = { kind: "limit", condition: "max-tokens", bound: this.limits.maxTotalTokens };
    }
    return this.breached;
  }

  /** The deadline breach, remembered so later turns stay refused. */
  deadlineReached(): RunLimitBreach {
    this.breached ??= { kind: "limit", condition: "deadline", bound: this.limits.deadlineMs ?? 0 };
    return this.breached;
  }
}

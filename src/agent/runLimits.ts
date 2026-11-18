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
 * steps THIS driver ran, plus the tokens a RESUMED session's earlier steps
 * reported (seeded by the caller from `sessionTokenCounts`; a fork starts at
 * zero, its parent's counts recorded beside it). `timeout-ms:N` is wall clock
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
import type { TokenUsage, TurnLimitCondition } from "../session/sessionTypes.js";
import { TURN_GUARD_DEFAULTS } from "./turnGuards.js";

export interface RunLimits {
  /** The highest session turn number that may open. */
  readonly maxTurns?: number;
  /** Provider-reported input + output + cache tokens, over the whole session. */
  readonly maxTotalTokens?: number;
  /** Wall-clock milliseconds from the driver's construction. */
  readonly deadlineMs?: number;
  /** US dollars of attributed (provider-reported or complete catalog-estimate) cost over the session; indicative. */
  readonly maxCostUsd?: number;
  /** Turn guards (src/agent/turnGuards.ts), only ever stricter than {@link TURN_GUARD_DEFAULTS}. */
  readonly repeatedCalls?: number;
  readonly malformedResponses?: number;
  readonly denials?: number;
}

/** `--stop` names of the turn guards, the RunLimits key each sets, and the default each may only tighten. */
const GUARD_FORMS = { "repeated-calls": ["repeatedCalls", TURN_GUARD_DEFAULTS.repeatedCalls, 2],
  "malformed-responses": ["malformedResponses", TURN_GUARD_DEFAULTS.malformedResponses, 1],
  "denials": ["denials", TURN_GUARD_DEFAULTS.denials, 1] } as const;

/** The cause a limit records. `bound` is the operator's number; `unmeasured` marks a fail-closed stop. */
export interface RunLimitBreach {
  readonly kind: "limit";
  readonly condition: TurnLimitCondition;
  readonly bound: number;
  readonly unmeasured?: true;
  readonly tools?: readonly string[];
}

/** Node timers cannot represent a larger delay without overflowing to 1ms. */
const MAX_TIMER_MS = 2_147_483_647;

export type RunLimitsParse =
  | { readonly ok: true; readonly limits: RunLimits; readonly conditions: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/** Parse the exact `--stop` strings. No prose, no defaults: an unknown form is refused, never ignored. */
export function parseRunLimits(conditions: readonly string[] | undefined): RunLimitsParse {
  const snapshot = [...(conditions ?? [])];
  const limits: { -readonly [K in keyof RunLimits]: RunLimits[K] } = {};
  for (const condition of snapshot) {
    const special = typeof condition === "string" ? parseSpecialLimit(condition, limits) : null;
    if (special === "ok") continue;
    if (special !== null) return { ok: false, reason: special };
    const match = typeof condition === "string" ? /^(max-turns|max-tokens|timeout-ms):([1-9][0-9]*)$/.exec(condition) : null;
    if (match === null || match[0] !== condition) {
      return { ok: false, reason: "invalid stop condition; expected max-turns:N, max-tokens:N, timeout-ms:N, max-cost-usd:D, repeated-calls:N, malformed-responses:N or denials:N with a positive canonical number" };
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

/** `max-cost-usd:D` and the stricter-only guard forms; null when `condition` is none of them. Mutates `limits` on "ok". */
function parseSpecialLimit(condition: string, limits: { -readonly [K in keyof RunLimits]: RunLimits[K] }): "ok" | string | null {
  const cost = /^max-cost-usd:((?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,6})?)$/.exec(condition);
  if (cost !== null) {
    const value = Number(cost[1]);
    if (!(value > 0)) return "invalid max-cost-usd stop condition: give a dollar amount above 0, such as max-cost-usd:0.50";
    if (limits.maxCostUsd !== undefined) return "duplicate max-cost-usd stop condition";
    limits.maxCostUsd = value;
    return "ok";
  }
  const guard = /^(repeated-calls|malformed-responses|denials):([1-9][0-9]*)$/.exec(condition);
  if (guard === null) return null;
  const [key, ceiling, floor] = GUARD_FORMS[guard[1] as keyof typeof GUARD_FORMS];
  const value = Number(guard[2]);
  if (value > ceiling || value < floor) return `${guard[1]} can only be made stricter than the default of ${ceiling}: give a number from ${floor} to ${ceiling}`;
  if (limits[key] !== undefined) return `duplicate ${guard[1]} stop condition`;
  limits[key] = value;
  return "ok";
}

/** A breach in the `--stop` syntax the operator gave it, for the run report. */
export function describeRunLimit(breach: RunLimitBreach): string {
  const condition = breach.condition === "deadline" ? "timeout-ms" : breach.condition;
  const unmeasured = breach.condition === "max-cost-usd" ? " (a model request has no known cost, so the cost limit could not see it)"
    : " (a step reported no usage, so the token budget could not see it)";
  return `${condition}:${breach.bound}${breach.unmeasured === true ? unmeasured : ""}`;
}

/** The part of a native cost projection (src/budgets/nativeCostProjection.ts) the cost limit reads. */
export interface RunCostView {
  readonly status: "complete" | "partial" | "unavailable" | "invalid";
  readonly attributedSubtotalUsd: number | null;
  readonly partialRequests: number;
  readonly unknownRequests: number;
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
function totalTokensOf(usage: TokenUsage | null): number | null {
  if (usage === null) return null;
  const total = usage.inputTokens + usage.outputTokens + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

const NO_COST: RunCostView = Object.freeze({ status: "unavailable", attributedSubtotalUsd: null, partialRequests: 0, unknownRequests: 0 });

/** The driver's bookkeeping for one run. Pure except for the clock it is told. */
export class RunLimitTracker {
  private tokens: number;
  private breached: RunLimitBreach | null = null;

  /** `cost` reads the session's cost projection; it is called only while a cost limit is set. */
  constructor(private readonly limits: RunLimits, priorTokens = 0, priorUnmeasured = false, private readonly cost: () => RunCostView = () => NO_COST) {
    this.tokens = priorTokens;
    // A history with steps that reported no usage is one the token bound cannot see: fail closed.
    if (priorUnmeasured && limits.maxTotalTokens !== undefined) {
      this.breached = { kind: "limit", condition: "max-tokens", bound: limits.maxTotalTokens, unmeasured: true };
    }
  }

  /** The first breach recorded, if any: once breached, no further turn opens. */
  get breach(): RunLimitBreach | null { return this.breached; }

  get deadlineMs(): number | undefined { return this.limits.deadlineMs; }

  /**
   * Account the session's cost, after each step and before each turn opens. Fails closed: any request without an attributed
   * cost (no price, no reported usage, a stub route, a failed attempt) is a cost the bound cannot see, so the run stops as
   * unmeasured.
   */
  recordCost(): RunLimitBreach | null {
    if (this.breached !== null || this.limits.maxCostUsd === undefined) return this.breached;
    const view = this.cost();
    const bound = this.limits.maxCostUsd;
    const seen = view.status === "complete" || (view.status === "unavailable" && view.partialRequests + view.unknownRequests === 0);
    if (!seen) this.breached = { kind: "limit", condition: "max-cost-usd", bound, unmeasured: true };
    else if ((view.attributedSubtotalUsd ?? 0) > bound) this.breached = { kind: "limit", condition: "max-cost-usd", bound };
    return this.breached;
  }

  /** Whether session turn `turn` may open. A session already past its cost limit (or with a request of unknown cost) opens none. */
  turnAllowed(turn: number): RunLimitBreach | null {
    if (this.recordCost() !== null) return this.breached;
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

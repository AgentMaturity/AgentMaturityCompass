/**
 * The projection contract — "framework drives, domain computes" (plan P2.3).
 *
 * A projection is a PURE fold over the session event log. A domain supplies
 * `init` / `apply` / `view`; the registry (./projectionRegistry.ts) owns every
 * impure concern: when to fold, what to cache, whether the result changed, and
 * who to tell. That split is what makes a cached projection *checkable* rather
 * than merely fast — `apply` reads nothing outside its two arguments, so the
 * fold of a given prefix is a function of that prefix alone, and a cached value
 * is correct exactly when the prefix it was folded over is still the log's
 * prefix. The registry's whole job reduces to deciding that one question.
 *
 * Two properties a unit MUST honour. TypeScript can enforce neither, and the
 * registry's guarantees rest on both:
 *
 *  1. `apply` is pure and deterministic — the same (state, event) always yields
 *     the same next state. No clock, no I/O, no ambient state, no dependence on
 *     object-key enumeration order.
 *  2. `apply` returns the state it was GIVEN (the same reference) when an event
 *     does not affect the projection. This is what makes `Object.is` change
 *     gating real: the registry re-derives `view` only when state identity
 *     changed, so an unaffected projection hands downstream consumers the very
 *     same value reference and they can skip their own work by comparing
 *     references. Most rows in a workspace ledger belong to other sessions or
 *     carry no surface op, so this is the common case, not the corner case.
 *
 * Violating (2) is merely noisy: every evaluation reports a change. Violating
 * (1) makes the cache unsound — which is what `stateVersion` is for: any change
 * to what the fold MEANS must bump it, and a cached state at another version is
 * discarded rather than migrated.
 */
import type { EvidenceEvent } from "../../types.js";

export interface ProjectionUnit<TState, TValue> {
  /**
   * Stable identity, and the cache slot. Two different folds may never share a
   * key at the same `stateVersion` — the registry rejects that at registration
   * rather than letting one fold read the other's cached state.
   */
  readonly key: string;

  /**
   * The version of this fold's MEANING, not of the code around it. Bump it when
   * `init` / `apply` / `view` change such that a state computed by the previous
   * version would now be wrong. Cached state at a different version is
   * DISCARDED, never migrated: migrating fold state across a semantic change is
   * precisely how a cache starts lying, and there is nothing to win by it — the
   * log is still there, and re-folding is cheap next to being wrong.
   */
  readonly stateVersion: number;

  /** The fold's zero. Called for a cold evaluation; must not capture state. */
  init(): TState;

  /** One fold step. Pure; returns `state` unchanged when the event is irrelevant. */
  apply(state: TState, event: EvidenceEvent): TState;

  /**
   * Derive the consumer-facing value from fold state. Pure. The registry calls
   * it only when state identity changed, so it may allocate freely; it must not
   * be relied on to return a stable reference for equal states.
   */
  view(state: TState): TValue;
}

/**
 * The exact stretch of log a value was folded over.
 *
 * `count` alone would be a lie the first time the log is rewritten rather than
 * appended to, so a cut also carries a digest binding the ORDER and IDENTITY of
 * every event in it. Validating a cached value means recomputing that digest
 * from the live rows: an append extends a cut, while a truncation, a reorder, a
 * deletion or an in-place rewrite retires it.
 */
export interface ProjectionCut {
  /** Number of leading events of the log the value was folded over. */
  readonly count: number;

  /** Rolling digest over those events' `event_hash` values, in order. */
  readonly prefixDigest: string;

  /** `event_hash` of the last event in the cut; null for the empty cut. */
  readonly headEventHash: string | null;
}

/**
 * How an evaluation was produced. This is diagnostic, but it is also the only
 * way a test can prove the cache is doing what it claims — that a cache HIT
 * really skipped the fold, and that a rewritten prefix really retired the entry
 * instead of being extended.
 */
export type ProjectionReuse =
  /** No cached entry existed for this key at all: folded from `init()`. */
  | "cold"
  /** An entry existed but was retired (version bump or prefix no longer valid). */
  | "rebuilt"
  /** The cached cut is still a prefix of the log; only the tail was folded. */
  | "extended"
  /** The cached cut is the whole log; nothing was folded. */
  | "unchanged";

export interface ProjectionEvaluation<TValue> {
  readonly key: string;
  /** The `stateVersion` of the unit that produced `value`. */
  readonly stateVersion: number;
  readonly value: TValue;
  readonly cut: ProjectionCut;
  /** `!Object.is(previous value, value)`. False means downstream may skip work. */
  readonly changed: boolean;
  readonly reuse: ProjectionReuse;
  /** How many events this evaluation actually applied. Zero on a full cache hit. */
  readonly eventsFolded: number;
}

/**
 * Identity helper: gives inference on `TState` from `init` and validates the two
 * fields the registry keys its cache on. Fail loud at definition, because a unit
 * with an empty key or a nonsense version corrupts a cache slot rather than
 * throwing at the point of the mistake.
 */
export function defineProjection<TState, TValue>(
  unit: ProjectionUnit<TState, TValue>
): ProjectionUnit<TState, TValue> {
  if (unit.key.trim().length === 0) {
    throw new Error("ProjectionUnit.key must be a non-empty string");
  }
  if (!Number.isInteger(unit.stateVersion) || unit.stateVersion < 1) {
    throw new Error(`ProjectionUnit ${unit.key}: stateVersion must be an integer >= 1`);
  }
  return unit;
}

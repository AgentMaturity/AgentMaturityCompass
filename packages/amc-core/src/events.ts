/**
 * AMC's typed event surface, merged into Cordis's `Events` interface.
 *
 * Declaration merging is what makes the bus typed end to end: a plugin in a
 * later phase writes `ctx.on("amc/tool-call", handler)` and the handler's
 * parameters are checked, without that plugin importing anything from the
 * emitter. The alternative — untyped string events — is how a harness quietly
 * accumulates listeners for events nobody emits any more.
 *
 * Cordis's four dispatch modes each mean something different here, and choosing
 * the wrong one is a correctness bug rather than a style choice:
 *
 *   emit      fire-and-forget notification; no listener can influence anything.
 *   bail      first non-nullish return wins and short-circuits — the shape a
 *             deny decision needs, so one veto ends the question.
 *   serial    every listener runs in order and all must resolve.
 *   waterfall each listener transforms the value for the next — the shape a
 *             redaction or sanitisation chain needs.
 */
import type { Context } from "@amc/cordis";

/** Where an event was raised, for scope-aware dispatch. */
export interface AmcEventOrigin {
  /** Agent the event belongs to, or null when raised at the platform root. */
  agentId: string | null;
}

/** A decision a listener may return to veto an action. */
export interface AmcDenyDecision {
  allow: false;
  reason: string;
  /** Which control decided; carried into evidence. */
  control: string;
}

export type AmcGuardDecision = AmcDenyDecision | undefined;

declare module "@amc/cordis" {
  interface Events<out C extends Context = Context> {
    /**
     * Raised when an agent scope is created or torn down.
     *
     * `emit` — nothing may veto scope lifecycle; a listener that needs to
     * refuse an agent does so at admission, not here.
     */
    "amc/scope-created"(this: C, origin: AmcEventOrigin): void;
    "amc/scope-disposed"(this: C, origin: AmcEventOrigin): void;

    /**
     * Asks every registered control whether an action may proceed.
     *
     * `bail` — the first control to return a denial ends the question. A
     * unanimous-allow model would let a control be silently outvoted, which is
     * the wrong default for enforcement.
     */
    "amc/guard-action"(this: C, action: AmcAction, origin: AmcEventOrigin): AmcGuardDecision;

    /**
     * Carries a scoped event across the shared bus.
     *
     * One typed event rather than synthesized string keys: the platform can
     * observe every scoped dispatch with a single listener (events up), while
     * scope.on() filters by origin so a sibling agent's events are never
     * delivered. Encoding the name in the key instead would put the whole
     * scoped surface outside the type system.
     */
    "amc/scoped-dispatch"(this: C, envelope: AmcScopedEnvelope): void;

    /**
     * Transforms a payload before it is recorded as evidence.
     *
     * `waterfall` — each listener receives the previous listener's output, so
     * redaction composes instead of racing.
     */
    "amc/redact-evidence"(this: C, payload: string, origin: AmcEventOrigin): string;
  }
}

/** Envelope for a scoped event travelling on the shared bus. */
export interface AmcScopedEnvelope {
  /** Event name within the scoped namespace. */
  name: string;
  origin: AmcEventOrigin;
  args: readonly unknown[];
}

/** An action a control may allow or deny. */
export interface AmcAction {
  /** Stable identifier, e.g. "tool.exec" or "fs.write". */
  kind: string;
  /** Human-readable summary for evidence; must not carry raw secrets. */
  summary: string;
  /** Structured detail, redacted before it becomes evidence. */
  detail?: Record<string, unknown>;
}

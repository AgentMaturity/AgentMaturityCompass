/**
 * The first invariant companions, mirroring the properties dsh guards.
 *
 * Each of these, when violated, produces evidence that looks valid and is not.
 * That is the specific failure AMC cannot have: a corrupted ledger announces
 * itself, but a *plausible* one does not, and every downstream score, report
 * and certificate inherits the error silently.
 */
import type { InvariantsService, InvariantViolation } from "./invariants.ts";
/** One recorded event, as the companions need to see it. */
export interface SessionEvent {
    sessionId: string;
    /** Monotonic within a session. */
    sequence: number;
    kind: string;
    /** Present on approval events. */
    approvalOf?: string;
    /** Identifier this event can be addressed by. */
    id: string;
}
/**
 * Session enclosure: every event belongs to exactly one session.
 *
 * A leaked event is attributed to the wrong run. In a product that scores an
 * agent from its evidence, that is not a logging defect — it is one agent's
 * behaviour counted against another's maturity.
 */
export declare function checkSessionEnclosure(events: readonly SessionEvent[], expectedSessionId: string): InvariantViolation | null;
/**
 * FIFO: a session's events are recorded in the order they happened.
 *
 * The ledger is hash-chained, so a reordering does not corrupt the chain — it
 * produces a *valid* chain describing a sequence of events that never
 * occurred. Causality is what makes a trace evidence rather than a set.
 */
export declare function checkFifo(events: readonly SessionEvent[]): InvariantViolation | null;
/**
 * Prompt reconstruction: what was sent can be rebuilt from what was recorded.
 *
 * This is the load-bearing one. AMC's whole claim is that a run can be audited
 * after the fact; if the recorded parts do not reassemble into the bytes that
 * were actually sent, the audit is of a fiction. Checked by digest so the
 * comparison does not itself retain the prompt.
 */
export declare function checkPromptReconstruction(recordedParts: readonly string[], sentDigest: string, digestOf: (value: string) => string): InvariantViolation | null;
/**
 * Approval pairing: every approval answers exactly one request.
 *
 * An unpaired approval is an authorisation with no question attached, and a
 * duplicate is a replay. Both are the shape a forged authorisation takes.
 */
export declare function checkApprovalPairing(events: readonly SessionEvent[]): InvariantViolation | null;
/**
 * Registers the companions against a live event source.
 *
 * The source is a callback rather than an array so `verify()` reads current
 * state — an invariant bound to a stale snapshot checks nothing.
 */
export declare function registerSessionInvariants(invariants: InvariantsService, source: () => {
    sessionId: string;
    events: readonly SessionEvent[];
}): () => void;
//# sourceMappingURL=invariantCompanions.d.ts.map
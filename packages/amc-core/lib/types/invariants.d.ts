/**
 * Runtime invariants: properties that must hold, checked where they can fail.
 *
 * dsh ships per-package `./invariant` companions and a `ctx.invariants`
 * service. The reason is worth restating, because it is not "extra tests":
 * an invariant catches a violation *in the running system*, at the moment the
 * state goes wrong, with the offending value in hand. A test catches it only
 * for the cases the test author imagined.
 *
 * For AMC the stakes are specific. The properties below are the ones whose
 * violation would corrupt evidence rather than crash the process — a session
 * whose events escape its enclosure, a ledger that reordered, a prompt that
 * cannot be reconstructed from what was recorded, an approval with no matching
 * request. Each of those produces evidence that looks valid and is not, which
 * is the failure this product cannot have.
 *
 * Enabled in development and in tests; off by default in production, where the
 * cost of checking every append is not obviously worth paying. That default is
 * a judgement, not a law — `AMC_INVARIANTS=1` turns them on anywhere.
 */
import type { Context } from "@amc/cordis";
export interface InvariantViolation {
    /** Which invariant failed. */
    name: string;
    /** What went wrong, in terms an operator can act on. */
    message: string;
    /** The offending value, for diagnosis. Must not carry secrets. */
    detail?: Record<string, unknown>;
}
export type InvariantCheck = () => InvariantViolation | null;
export declare class InvariantError extends Error {
    readonly violation: InvariantViolation;
    constructor(violation: InvariantViolation);
}
/** How a violation is handled. */
export type InvariantMode = 
/** Throw at the point of violation — the default in tests. */
"throw"
/** Record and continue — for production diagnosis without an outage. */
 | "collect"
/** Do nothing; checks are not even run. */
 | "off";
export interface InvariantsService {
    readonly mode: InvariantMode;
    /** Registers a named invariant. Returns a disposer. */
    register(name: string, check: InvariantCheck): () => void;
    /** Runs every registered check. */
    verify(): InvariantViolation[];
    /** Asserts one property inline, at the point it must hold. */
    assert(name: string, condition: boolean, message: string, detail?: Record<string, unknown>): void;
    /** Violations recorded in "collect" mode. */
    readonly violations: readonly InvariantViolation[];
}
/**
 * Resolves the default mode.
 *
 * Explicit env wins; otherwise on outside production. A governance product
 * that silently disabled its own consistency checks in the environment that
 * matters would be making exactly the kind of unstated trade-off this codebase
 * has spent its recent history removing — so the default is stated here and in
 * the docs, not buried.
 */
export declare function defaultInvariantMode(env?: NodeJS.ProcessEnv): InvariantMode;
/**
 * Installs `ctx.invariants`.
 *
 * A plain context property rather than a Cordis Service: invariants must be
 * available to code running *during* a plugin's setup, before service
 * resolution has settled, and a service that is not yet resolvable cannot
 * check the thing that is going wrong right now.
 */
export declare function installInvariants(ctx: Context, mode?: InvariantMode): InvariantsService;
//# sourceMappingURL=invariants.d.ts.map
/**
 * Settled-tree audit for the boot sequence.
 *
 * Cordis leaves a fiber in `PENDING` when a service it injects is not provided.
 * That is correct — the service may arrive later — but during boot it is
 * indistinguishable from a plugin that will never load, and a half-composed
 * runtime that reports success is exactly the failure mode a governance product
 * must not have. dsh's boot audits the settled tree and fails loud; this does
 * the same, and names the service so the diagnostic is actionable.
 */
import { Context } from "@amc/cordis";
/** One plugin that never reached ACTIVE. */
export interface UnsettledFiber {
    /** Best available label: the loader entry name, else the callback name. */
    label: string;
    state: "PENDING" | "FAILED" | "LOADING" | "UNLOADING" | "DISPOSED";
    /** Services the fiber injects that nothing provides. */
    missingServices: string[];
    /** Populated when the plugin threw rather than stalled. */
    error?: string;
}
/**
 * Watches every fiber created under `ctx` for the lifetime of the returned
 * handle.
 *
 * Registered before the composition tree mounts, so nothing that loads during
 * boot escapes the audit.
 */
export declare function watchFibers(ctx: Context): {
    settled(): UnsettledFiber[];
    stop(): void;
};
/** Renders the audit as an operator-facing diagnostic. */
export declare function describeUnsettled(unsettled: readonly UnsettledFiber[]): string;
//# sourceMappingURL=bootAudit.d.ts.map
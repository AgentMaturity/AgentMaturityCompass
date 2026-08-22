/**
 * The HMR-safety convention: every service must prove it disposes.
 *
 * dsh mandates this per package, and the reason generalises. Hot reload, agent
 * scoping and the signed plugin ecosystem all rest on one assumption — that
 * unloading a provider actually releases it. A provider that leaks does not
 * fail loudly; it survives its own replacement, so the operator who swapped a
 * policy engine keeps getting answers from the old one.
 *
 * The check observes two things it can observe reliably:
 *
 *   Service withdrawal — after unload, the service must be gone from the
 *   context. A registration that outlives its fiber shadows the replacement.
 *
 *   Self-reported teardown — the plugin records its own releases through a
 *   probe. This is deliberate rather than a limitation worked around: Cordis
 *   resolves `ctx.effect` through a proxy, so counting registrations from
 *   outside would mean reaching into internals, and a check that silently
 *   stopped counting after an upstream change would be worse than no check.
 *   A plugin proving its own teardown is also what the convention asks of it.
 *
 * What this cannot see: a resource acquired outside `ctx.effect()` entirely —
 * a bare `setInterval`, an unregistered watcher. Nothing observes those, which
 * is why `AmcSeam.track()` exists. A clean report means "everything it tracked
 * was released", never "it tracked everything".
 */
import { type Plugin } from "@amc/cordis";
export interface DisposalReport {
    /** Releases the plugin reported through the probe. */
    released: number;
    /** Services still registered on the context after unload. */
    leakedServices: string[];
    /** True when nothing leaked and, if expected, teardown was reported. */
    clean: boolean;
}
export interface CheckDisposalOptions {
    /** Services the plugin provides; each must be withdrawn on unload. */
    expectServices?: readonly string[];
    /**
     * Minimum number of releases the plugin should report through the probe.
     *
     * Omit when the plugin acquires nothing; set it when the plugin is expected
     * to tear something down, so a plugin that silently stops releasing fails.
     */
    expectReleases?: number;
}
/** Passed to the plugin under test so it can report its own teardown. */
export interface DisposalProbe {
    release(label?: string): void;
    readonly labels: readonly string[];
}
/**
 * Loads `plugin`, unloads it, and reports what it failed to release.
 *
 * The probe is exposed on the context as `amcDisposalProbe`, so a plugin under
 * test calls `ctx.amcDisposalProbe.release()` from its cleanup.
 */
export declare function checkDisposal(plugin: Plugin, config?: unknown, options?: CheckDisposalOptions): Promise<DisposalReport>;
/**
 * Renders a disposal failure into something a maintainer can act on.
 *
 * The two failures have different fixes: a missing release is a cleanup that
 * did not run, a leaked service is a registration that did not unwind.
 */
export declare function describeDisposal(report: DisposalReport, expectReleases?: number): string;
//# sourceMappingURL=hmrSafety.d.ts.map
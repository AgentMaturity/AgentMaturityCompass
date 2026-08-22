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
import { Context } from "@amc/cordis";
/**
 * Loads `plugin`, unloads it, and reports what it failed to release.
 *
 * The probe is exposed on the context as `amcDisposalProbe`, so a plugin under
 * test calls `ctx.amcDisposalProbe.release()` from its cleanup.
 */
export async function checkDisposal(plugin, config, options = {}) {
    const ctx = new Context();
    const labels = [];
    const probe = {
        release(label = "resource") {
            labels.push(label);
        },
        labels
    };
    ctx["amcDisposalProbe"] = probe;
    const expected = options.expectServices ?? [];
    const fiber = ctx.plugin(plugin, config);
    await fiber.await();
    const providedWhileLoaded = expected.filter((name) => ctx[name] !== undefined);
    // Cordis contains a throwing cleanup per-observer, so disposal resolves even
    // when a cleanup fails — which is why success is measured by what the plugin
    // reported, not by dispose() returning.
    await fiber.dispose().catch(() => { });
    const leakedServices = providedWhileLoaded.filter((name) => ctx[name] !== undefined);
    const released = labels.length;
    const meetsReleaseExpectation = options.expectReleases === undefined || released >= options.expectReleases;
    return {
        released,
        leakedServices,
        clean: leakedServices.length === 0 && meetsReleaseExpectation
    };
}
/**
 * Renders a disposal failure into something a maintainer can act on.
 *
 * The two failures have different fixes: a missing release is a cleanup that
 * did not run, a leaked service is a registration that did not unwind.
 */
export function describeDisposal(report, expectReleases) {
    if (report.clean)
        return "disposes cleanly";
    const parts = [];
    if (expectReleases !== undefined && report.released < expectReleases) {
        parts.push(`reported ${report.released} of ${expectReleases} expected release(s) — a cleanup did not run to completion`);
    }
    if (report.leakedServices.length > 0) {
        parts.push(`service(s) still registered after unload: ${report.leakedServices.join(", ")} ` +
            `— a replacement provider would be shadowed by this one`);
    }
    return parts.join("; ");
}
//# sourceMappingURL=hmrSafety.js.map
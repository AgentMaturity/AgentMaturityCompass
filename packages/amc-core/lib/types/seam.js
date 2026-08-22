/**
 * Capability seams: how AMC subsystems attach to the composed runtime.
 *
 * A seam is an abstract service contract plus the conventions every provider
 * must honour. Three of them are load-bearing:
 *
 *   Disposal. A provider must release everything it acquired when its fiber
 *   unloads. Cordis can hot-swap a provider only if the old one lets go, and a
 *   provider that leaks survives its own replacement — which in this codebase
 *   means a stale policy engine still answering guard questions after the
 *   operator replaced it.
 *
 *   Injection gating. Consumers declare what they need with `inject`, so a
 *   consumer whose provider is absent stays PENDING and is named by boot's
 *   settled-tree audit, rather than dereferencing undefined at the first call.
 *
 *   Unmanaged resources go through `ctx.effect()`. Timers, watchers, sockets
 *   and database handles acquired outside Cordis's knowledge are invisible to
 *   teardown unless registered.
 */
import { Service } from "@amc/cordis";
/**
 * Base class for AMC capability providers.
 *
 * Adds nothing to Cordis's Service except a stated contract and a place to put
 * it — subclasses register under `name` and must release everything on unload.
 * `assertDisposable` in the test helper below is how that claim gets checked
 * rather than trusted.
 */
export class AmcSeam extends Service {
    /**
     * @param ctx — the context this seam registers into.
     * @param name — the service name; consumers `inject` this exact string.
     */
    constructor(ctx, name) {
        super(ctx, name);
    }
    /**
     * Registers an unmanaged resource for teardown.
     *
     * Anything acquired outside Cordis — an interval, a file watcher, an open
     * handle — must come through here, or it outlives the fiber that made it.
     */
    track(acquire) {
        this.ctx.effect(() => acquire());
    }
}
/**
 * Declares a seam.
 *
 * The indirection exists so the service name lives in exactly one place: a
 * provider registering `"amcLedger"` and a consumer injecting `"amcledger"` is
 * a runtime PENDING with no compile-time signal, and that class of bug is
 * exactly what a seam convention should make impossible.
 */
export function defineSeam(name, inject = []) {
    if (name.trim().length === 0)
        throw new Error("seam name must not be empty");
    return { name, inject };
}
//# sourceMappingURL=seam.js.map
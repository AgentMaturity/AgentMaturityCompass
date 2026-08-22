const STATE_NAMES = {
    [0 /* FiberState.PENDING */]: "PENDING",
    [1 /* FiberState.LOADING */]: "LOADING",
    [3 /* FiberState.FAILED */]: "FAILED",
    [5 /* FiberState.UNLOADING */]: "UNLOADING",
    [4 /* FiberState.DISPOSED */]: "DISPOSED"
};
/** Reads a human label for a fiber without assuming the loader is present. */
function labelOf(fiber) {
    const entry = fiber.entry;
    if (entry?.options?.name)
        return entry.options.name;
    const callback = fiber.runtime?.callback;
    if (callback?.name)
        return callback.name;
    return "(anonymous plugin)";
}
/**
 * Services this fiber injects that are not resolvable from its context.
 *
 * A PENDING fiber is waiting on at least one of these; reporting the whole
 * unresolved set is more useful than the first one, because a plugin waiting on
 * three missing services fails three times if they are fixed one at a time.
 */
function missingServicesOf(fiber) {
    const missing = [];
    for (const name of Object.keys(fiber.inject ?? {})) {
        try {
            if (fiber.ctx[name] === undefined) {
                missing.push(name);
            }
        }
        catch {
            // A getter that throws is as good as absent for this purpose.
            missing.push(name);
        }
    }
    return missing.sort();
}
/**
 * Watches every fiber created under `ctx` for the lifetime of the returned
 * handle.
 *
 * Registered before the composition tree mounts, so nothing that loads during
 * boot escapes the audit.
 */
export function watchFibers(ctx) {
    const seen = new Set();
    const errors = new WeakMap();
    const offPlugin = ctx.on("internal/plugin", (fiber) => {
        seen.add(fiber);
    }, { global: true });
    const offStatus = ctx.on("internal/status", (fiber) => {
        seen.add(fiber);
        if (fiber.state === 3 /* FiberState.FAILED */) {
            const error = fiber.error;
            errors.set(fiber, error instanceof Error ? error.message : String(error ?? "unknown error"));
        }
    }, { global: true });
    return {
        settled() {
            const unsettled = [];
            for (const fiber of seen) {
                if (fiber.state === 2 /* FiberState.ACTIVE */)
                    continue;
                // A disposed fiber is a completed lifecycle, not a boot failure.
                if (fiber.state === 4 /* FiberState.DISPOSED */)
                    continue;
                const error = errors.get(fiber);
                unsettled.push({
                    label: labelOf(fiber),
                    state: STATE_NAMES[fiber.state] ?? "PENDING",
                    missingServices: missingServicesOf(fiber),
                    ...(error ? { error } : {})
                });
            }
            return unsettled.sort((a, b) => a.label.localeCompare(b.label));
        },
        stop() {
            offPlugin();
            offStatus();
        }
    };
}
/** Renders the audit as an operator-facing diagnostic. */
export function describeUnsettled(unsettled) {
    return unsettled
        .map((fiber) => {
        if (fiber.error)
            return `  - ${fiber.label} [${fiber.state}]: ${fiber.error}`;
        if (fiber.missingServices.length > 0) {
            return `  - ${fiber.label} [${fiber.state}] waiting for: ${fiber.missingServices.join(", ")}`;
        }
        return `  - ${fiber.label} [${fiber.state}]`;
    })
        .join("\n");
}
//# sourceMappingURL=bootAudit.js.map
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
import { Context, FiberState, type Fiber } from "@amc/cordis";

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

const STATE_NAMES: Record<number, UnsettledFiber["state"]> = {
  [FiberState.PENDING]: "PENDING",
  [FiberState.LOADING]: "LOADING",
  [FiberState.FAILED]: "FAILED",
  [FiberState.UNLOADING]: "UNLOADING",
  [FiberState.DISPOSED]: "DISPOSED"
};

/** Reads a human label for a fiber without assuming the loader is present. */
function labelOf(fiber: Fiber): string {
  const entry = (fiber as unknown as { entry?: { options?: { name?: string } } }).entry;
  if (entry?.options?.name) return entry.options.name;
  const callback = fiber.runtime?.callback as { name?: string } | undefined;
  if (callback?.name) return callback.name;
  return "(anonymous plugin)";
}

/**
 * Services this fiber injects that are not resolvable from its context.
 *
 * A PENDING fiber is waiting on at least one of these; reporting the whole
 * unresolved set is more useful than the first one, because a plugin waiting on
 * three missing services fails three times if they are fixed one at a time.
 */
function missingServicesOf(fiber: Fiber): string[] {
  const missing: string[] = [];
  for (const name of Object.keys(fiber.inject ?? {})) {
    try {
      if ((fiber.ctx as unknown as Record<string, unknown>)[name] === undefined) {
        missing.push(name);
      }
    } catch {
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
export function watchFibers(ctx: Context): {
  settled(): UnsettledFiber[];
  stop(): void;
} {
  const seen = new Set<Fiber>();
  const errors = new WeakMap<Fiber, string>();

  const offPlugin = ctx.on(
    "internal/plugin",
    (fiber: Fiber) => {
      seen.add(fiber);
    },
    { global: true }
  );

  const offStatus = ctx.on(
    "internal/status",
    (fiber: Fiber) => {
      seen.add(fiber);
      if (fiber.state === FiberState.FAILED) {
        const error = (fiber as unknown as { error?: unknown }).error;
        errors.set(fiber, error instanceof Error ? error.message : String(error ?? "unknown error"));
      }
    },
    { global: true }
  );

  return {
    settled(): UnsettledFiber[] {
      const unsettled: UnsettledFiber[] = [];
      for (const fiber of seen) {
        if (fiber.state === FiberState.ACTIVE) continue;
        // A disposed fiber is a completed lifecycle, not a boot failure.
        if (fiber.state === FiberState.DISPOSED) continue;
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
    stop(): void {
      offPlugin();
      offStatus();
    }
  };
}

/** Renders the audit as an operator-facing diagnostic. */
export function describeUnsettled(unsettled: readonly UnsettledFiber[]): string {
  return unsettled
    .map((fiber) => {
      if (fiber.error) return `  - ${fiber.label} [${fiber.state}]: ${fiber.error}`;
      if (fiber.missingServices.length > 0) {
        return `  - ${fiber.label} [${fiber.state}] waiting for: ${fiber.missingServices.join(", ")}`;
      }
      return `  - ${fiber.label} [${fiber.state}]`;
    })
    .join("\n");
}

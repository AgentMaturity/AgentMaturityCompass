/**
 * Per-agent scopes: events up, visibility down.
 *
 * A fleet runs many agents in one process. Two properties have to hold for that
 * to be safe, and Cordis gives one of them:
 *
 *   Visibility down — an agent scope sees platform services, and services it
 *   provides for itself do not leak upward or sideways. `ctx.isolate()` does
 *   this already.
 *
 *   Events up — an agent's events reach the platform (so evidence, scoring and
 *   audit see everything) but must NOT reach a sibling agent. Cordis's bus is
 *   global in both directions, so a listener registered by agent A would
 *   otherwise fire for agent B's actions. In a product that attributes evidence
 *   to an agent, cross-agent delivery is not noise — it is misattribution, and
 *   a control that fires for the wrong agent is worse than one that does not
 *   fire at all.
 *
 * This wraps dispatch so the origin travels with every event and listeners see
 * only what belongs to them.
 */
import type { Context } from "@amc/cordis";
import type { AmcEventOrigin, AmcScopedEnvelope } from "./events.ts";

/** Brand marking a context that has been narrowed to one agent. */
declare const scopedBrand: unique symbol;

/**
 * A context narrowed to a single agent.
 *
 * Branded so a platform-level API cannot silently accept an agent scope, or
 * the reverse, without an explicit conversion at the call site.
 */
export type Scoped<T> = T & { readonly [scopedBrand]: "amc-agent-scope" };

export interface AgentScope {
  agentId: string;
  /** Cordis context narrowed to this agent. */
  ctx: Scoped<Context>;
  /** Emits with this agent's origin attached. */
  emit<K extends keyof AmcScopedEvents>(
    name: K,
    ...args: AmcScopedEvents[K]
  ): Promise<void>;
  /** Registers a listener that fires only for this agent, or for the root. */
  on<K extends keyof AmcScopedEvents>(
    name: K,
    listener: (origin: AmcEventOrigin, ...args: AmcScopedEvents[K]) => void
  ): () => void;
  dispose(): Promise<void>;
}

/** Events carried through scoped dispatch, keyed by name. */
export interface AmcScopedEvents {
  [name: string]: unknown[];
}

/** Services isolated per agent by default. */
const DEFAULT_ISOLATED_SERVICES = ["amcLedger", "amcEnforce", "amcBudget"] as const;

/**
 * Creates an agent scope beneath `root`.
 *
 * `isolate` names the services the agent provides for itself. Anything not
 * listed stays visible from the platform, which is the "visibility down" half:
 * an agent should not have to re-provide the whole world to have its own ledger.
 */
export function createAgentScope(
  root: Context,
  agentId: string,
  options: { isolate?: readonly string[] } = {}
): AgentScope {
  if (agentId.trim().length === 0) {
    throw new Error("agent scope requires a non-empty agentId");
  }

  const isolated = options.isolate ?? DEFAULT_ISOLATED_SERVICES;
  let ctx = root;
  for (const service of isolated) {
    ctx = ctx.isolate(service);
  }

  const origin: AmcEventOrigin = { agentId };
  const disposers: (() => void)[] = [];

  const scope: AgentScope = {
    agentId,
    ctx: ctx as Scoped<Context>,
    async emit(name, ...args) {
      // Emitted on the root bus so the platform sees it — this is "events up".
      await root.emit("amc/scoped-dispatch", { name: String(name), origin, args });
    },
    on(name, listener) {
      const wanted = String(name);
      const handler = (envelope: AmcScopedEnvelope): void => {
        if (envelope.name !== wanted) return;
        // Deliver this agent's events and platform-wide ones (agentId null).
        // A sibling agent's event is not ours to see: delivering it would
        // attribute one agent's action to another.
        if (envelope.origin.agentId !== null && envelope.origin.agentId !== agentId) return;
        listener(envelope.origin, ...(envelope.args as never));
      };
      const off = root.on("amc/scoped-dispatch", handler);
      disposers.push(off);
      return off;
    },
    async dispose() {
      while (disposers.length > 0) {
        const off = disposers.pop();
        try {
          off?.();
        } catch {
          // One bad disposer must not strand the rest.
        }
      }
      await root.emit("amc/scope-disposed", origin);
    }
  };

  void root.emit("amc/scope-created", origin);
  return scope;
}

/**
 * Emits a platform-wide event that every agent scope receives.
 *
 * The counterpart to scoped emit: origin.agentId is null, so every scoped
 * listener accepts it.
 */
export async function emitPlatformEvent(
  root: Context,
  name: string,
  ...args: unknown[]
): Promise<void> {
  await root.emit("amc/scoped-dispatch", { name, origin: { agentId: null }, args });
}

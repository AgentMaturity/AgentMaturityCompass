/** Services isolated per agent by default. */
const DEFAULT_ISOLATED_SERVICES = ["amcLedger", "amcEnforce", "amcBudget"];
/**
 * Creates an agent scope beneath `root`.
 *
 * `isolate` names the services the agent provides for itself. Anything not
 * listed stays visible from the platform, which is the "visibility down" half:
 * an agent should not have to re-provide the whole world to have its own ledger.
 */
export function createAgentScope(root, agentId, options = {}) {
    if (agentId.trim().length === 0) {
        throw new Error("agent scope requires a non-empty agentId");
    }
    const isolated = options.isolate ?? DEFAULT_ISOLATED_SERVICES;
    let ctx = root;
    for (const service of isolated) {
        ctx = ctx.isolate(service);
    }
    const origin = { agentId };
    const disposers = [];
    const scope = {
        agentId,
        ctx: ctx,
        async emit(name, ...args) {
            // Emitted on the root bus so the platform sees it — this is "events up".
            await root.emit("amc/scoped-dispatch", { name: String(name), origin, args });
        },
        on(name, listener) {
            const wanted = String(name);
            const handler = (envelope) => {
                if (envelope.name !== wanted)
                    return;
                // Deliver this agent's events and platform-wide ones (agentId null).
                // A sibling agent's event is not ours to see: delivering it would
                // attribute one agent's action to another.
                if (envelope.origin.agentId !== null && envelope.origin.agentId !== agentId)
                    return;
                listener(envelope.origin, ...envelope.args);
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
                }
                catch {
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
export async function emitPlatformEvent(root, name, ...args) {
    await root.emit("amc/scoped-dispatch", { name, origin: { agentId: null }, args });
}
//# sourceMappingURL=scope.js.map
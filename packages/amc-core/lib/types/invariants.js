export class InvariantError extends Error {
    violation;
    constructor(violation) {
        super(`invariant "${violation.name}" violated: ${violation.message}`);
        this.violation = violation;
        this.name = "InvariantError";
    }
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
export function defaultInvariantMode(env = process.env) {
    const explicit = env["AMC_INVARIANTS"];
    if (explicit === "1" || explicit === "throw")
        return "throw";
    if (explicit === "collect")
        return "collect";
    if (explicit === "0" || explicit === "off")
        return "off";
    return env["NODE_ENV"] === "production" ? "off" : "throw";
}
class Invariants {
    mode;
    #checks = new Map();
    #violations = [];
    constructor(mode) {
        this.mode = mode;
    }
    get violations() {
        return this.#violations;
    }
    register(name, check) {
        if (this.#checks.has(name)) {
            throw new Error(`invariant "${name}" is already registered`);
        }
        this.#checks.set(name, check);
        return () => this.#checks.delete(name);
    }
    verify() {
        if (this.mode === "off")
            return [];
        const found = [];
        for (const [name, check] of this.#checks) {
            let violation;
            try {
                violation = check();
            }
            catch (error) {
                // A check that throws is itself a violation: it means the state it
                // inspects is not merely wrong but unreadable.
                violation = {
                    name,
                    message: `check threw: ${error instanceof Error ? error.message : String(error)}`
                };
            }
            if (violation)
                found.push(violation);
        }
        if (this.mode === "throw" && found.length > 0) {
            this.#violations.push(...found);
            throw new InvariantError(found[0]);
        }
        this.#violations.push(...found);
        return found;
    }
    assert(name, condition, message, detail) {
        if (this.mode === "off" || condition)
            return;
        const violation = { name, message, ...(detail ? { detail } : {}) };
        this.#violations.push(violation);
        if (this.mode === "throw")
            throw new InvariantError(violation);
    }
}
/**
 * Installs `ctx.invariants`.
 *
 * A plain context property rather than a Cordis Service: invariants must be
 * available to code running *during* a plugin's setup, before service
 * resolution has settled, and a service that is not yet resolvable cannot
 * check the thing that is going wrong right now.
 */
export function installInvariants(ctx, mode = defaultInvariantMode()) {
    const invariants = new Invariants(mode);
    ctx["invariants"] = invariants;
    return invariants;
}
//# sourceMappingURL=invariants.js.map
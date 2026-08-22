export class SettingsConflictError extends Error {
    expected;
    actual;
    constructor(expected, actual) {
        super(`settings changed underneath this write (expected revision ${expected}, store is at ${actual}). ` +
            `Re-read and re-apply.`);
        this.expected = expected;
        this.actual = actual;
        this.name = "SettingsConflictError";
    }
}
export class SettingsPathError extends Error {
    constructor(path, reason) {
        super(`invalid settings path "${path}": ${reason}`);
        this.name = "SettingsPathError";
    }
}
const REDACTED = "«redacted»";
function readPath(source, path) {
    let cursor = source;
    for (const segment of path.split(".")) {
        if (cursor === null || typeof cursor !== "object")
            return undefined;
        cursor = cursor[segment];
    }
    return cursor;
}
/** Returns a copy of `source` with `path` set, never mutating the input. */
function writePath(source, path, value) {
    const segments = path.split(".");
    const out = { ...source };
    let cursor = out;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const existing = cursor[segment];
        const next = existing && typeof existing === "object" ? { ...existing } : {};
        cursor[segment] = next;
        cursor = next;
    }
    cursor[segments[segments.length - 1]] = value;
    return out;
}
/** Every dotted leaf path in a plain object. */
function leafPaths(source, prefix = "") {
    if (source === null || typeof source !== "object" || Array.isArray(source)) {
        return prefix ? [prefix] : [];
    }
    const out = [];
    for (const [key, value] of Object.entries(source)) {
        out.push(...leafPaths(value, prefix ? `${prefix}.${key}` : key));
    }
    return out;
}
/**
 * In-memory settings store with layered resolution.
 *
 * Persistence is deliberately not here. The file format, its comment
 * preservation and its watcher belong with the config surface in P1.4; this
 * owns the resolution and concurrency semantics those will call into, so the
 * rules live in one place rather than being reimplemented per writer.
 */
export class SettingsStore {
    #revision = 0;
    #base;
    #user;
    #schema;
    #secrets;
    constructor(options) {
        this.#schema = options.schema;
        this.#base = options.base ?? {};
        this.#user = options.user ?? {};
        this.#secrets = new Set(options.secrets ?? []);
    }
    get revision() {
        return this.#revision;
    }
    /** Schema defaults, as the lowest layer. */
    #defaults() {
        try {
            return (this.#schema(undefined) ?? {});
        }
        catch {
            // A schema with required fields cannot produce defaults alone; the base
            // and user layers supply them.
            return {};
        }
    }
    /**
     * Effective settings with per-value provenance.
     *
     * Secret values are redacted here rather than at the caller: a redaction the
     * caller has to remember is a redaction that eventually gets forgotten.
     */
    snapshot() {
        const defaults = this.#defaults();
        const layers = [
            ["schema", defaults],
            ["base", this.#base],
            ["user", this.#user]
        ];
        const paths = new Set();
        for (const [, layer] of layers)
            for (const path of leafPaths(layer))
                paths.add(path);
        const values = {};
        for (const path of [...paths].sort()) {
            let resolved;
            for (const [source, layer] of layers) {
                const candidate = readPath(layer, path);
                if (candidate === undefined)
                    continue;
                resolved = { value: candidate, source, secret: this.#secrets.has(path) };
            }
            if (!resolved)
                continue;
            values[path] = resolved.secret ? { ...resolved, value: REDACTED } : resolved;
        }
        return { revision: this.#revision, values };
    }
    /** The user layer as stored — secrets included. For persistence only. */
    userLayer() {
        return structuredClone(this.#user);
    }
    /**
     * Applies one path write to the user layer.
     *
     * Validates the whole resulting object against the schema, not just the leaf:
     * a setting can be individually valid and jointly wrong, and the schema is
     * where that relationship is expressed.
     */
    set(write) {
        if (write.path.length === 0 || write.path.split(".").some((segment) => segment.length === 0)) {
            throw new SettingsPathError(write.path, "empty path segment");
        }
        if (write.expectedRevision !== undefined && write.expectedRevision !== this.#revision) {
            throw new SettingsConflictError(write.expectedRevision, this.#revision);
        }
        const candidate = writePath(this.#user, write.path, write.value);
        const merged = { ...this.#defaults(), ...this.#base, ...candidate };
        this.#schema(merged);
        this.#user = candidate;
        this.#revision += 1;
        return this.snapshot();
    }
}
//# sourceMappingURL=settings.js.map
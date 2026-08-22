/**
 * Live settings: schema defaults → base layer → user layer, with provenance.
 *
 * The substrate later phases' "change it without a restart" behaviours assume —
 * a budget, a policy threshold or a redaction rule adjusted under a running
 * agent. Three properties make that safe rather than merely convenient:
 *
 *   Provenance. Every effective value reports which layer produced it. A
 *   setting that cannot say where it came from cannot be audited, and in a
 *   product that scores evidence provenance that is not a detail.
 *
 *   Optimistic concurrency. Writes carry the revision they were computed
 *   against and are rejected if the store moved underneath. Two operators
 *   editing the same workspace is the normal case, not the exception.
 *
 *   Secret redaction. Values whose schema marks them secret are never returned
 *   by a read; writes address them by path so an operator can set one without
 *   ever having read it. A settings dump is exactly the artifact that ends up
 *   pasted into an issue.
 */
import Schema from "@amc/schemastery";
/** Which layer an effective value came from. */
export type SettingsLayer = "schema" | "base" | "user";
export interface SettingValue<T = unknown> {
    value: T;
    /** The layer that produced this value. */
    source: SettingsLayer;
    /** True when the schema marks this path secret; `value` is then redacted. */
    secret: boolean;
}
export interface SettingsSnapshot {
    /** Monotonic; every accepted write increments it. */
    revision: number;
    values: Record<string, SettingValue>;
}
export interface SettingsWrite {
    /** Dotted path, e.g. "gateway.budgetUsd". */
    path: string;
    value: unknown;
    /**
     * Revision the caller computed this write against.
     *
     * Omitting it is allowed but unsafe: a blind write silently discards a
     * concurrent change. Callers that read-modify-write should always pass it.
     */
    expectedRevision?: number;
}
export declare class SettingsConflictError extends Error {
    readonly expected: number;
    readonly actual: number;
    constructor(expected: number, actual: number);
}
export declare class SettingsPathError extends Error {
    constructor(path: string, reason: string);
}
/** Marks a dotted path as secret; its value is redacted on read. */
export type SecretPaths = readonly string[];
export interface SettingsStoreOptions {
    /** Schemastery schema; supplies defaults and validates writes. */
    schema: Schema;
    /** Layer beneath the user's, e.g. a profile or deployment default. */
    base?: Record<string, unknown>;
    /** The operator-editable layer. */
    user?: Record<string, unknown>;
    /** Dotted paths whose values are redacted on read. */
    secrets?: SecretPaths;
}
/**
 * In-memory settings store with layered resolution.
 *
 * Persistence is deliberately not here. The file format, its comment
 * preservation and its watcher belong with the config surface in P1.4; this
 * owns the resolution and concurrency semantics those will call into, so the
 * rules live in one place rather than being reimplemented per writer.
 */
export declare class SettingsStore {
    #private;
    constructor(options: SettingsStoreOptions);
    get revision(): number;
    /**
     * Effective settings with per-value provenance.
     *
     * Secret values are redacted here rather than at the caller: a redaction the
     * caller has to remember is a redaction that eventually gets forgotten.
     */
    snapshot(): SettingsSnapshot;
    /** The user layer as stored — secrets included. For persistence only. */
    userLayer(): Record<string, unknown>;
    /**
     * Applies one path write to the user layer.
     *
     * Validates the whole resulting object against the schema, not just the leaf:
     * a setting can be individually valid and jointly wrong, and the schema is
     * where that relationship is expressed.
     */
    set(write: SettingsWrite): SettingsSnapshot;
}
//# sourceMappingURL=settings.d.ts.map
/**
 * AMC's boot sequence: root context → composition tree → settled-tree audit.
 *
 * The ordering is deliberate. The audit runs *after* the tree settles and
 * *before* boot returns, so a caller either gets a fully composed runtime or an
 * error naming what did not load. A half-composed runtime that reports success
 * is the failure a governance product must not have: every later phase hangs
 * enforcement, evidence and scoring off this tree, and a silently absent plugin
 * is a silently absent control.
 */
import { Context } from "@amc/cordis";
import { type UnsettledFiber } from "./bootAudit.ts";
import { type CompositionSource } from "./composition.ts";
export interface BootOptions {
    /** Workspace root; the composition file is resolved beneath it. */
    workspace: string;
    /** Composition file, relative to the workspace. */
    configPath?: string;
    /**
     * Refuse to boot when the composition file's signature is missing or invalid.
     *
     * dsh's composition config is unsigned. AMC's is signable, and in a product
     * that sells tamper-evident evidence the plugin tree — which decides what is
     * enforced and what is recorded — is the last thing that should be editable
     * without attestation.
     */
    requireSignature?: boolean;
    /** Fail when any plugin has not reached ACTIVE. Default true. */
    auditSettled?: boolean;
    /**
     * Watch the composition and plugin sources, reloading on change.
     *
     * Off by default. A file watcher in production is a liability rather than a
     * feature: it turns an accidental write — a deploy touching a file, an editor
     * autosave — into a live reconfiguration of the controls that are enforcing
     * policy. Development wants it; a governed runtime should have to ask.
     */
    watch?: boolean | {
        root?: string[];
        debounce?: number;
        ignored?: string[];
    };
}
export interface BootResult {
    ctx: Context;
    composition: CompositionSource;
    /** Non-empty only when auditSettled is false. */
    unsettled: UnsettledFiber[];
    /**
     * Re-reads the composition file and reconciles the tree by entry id.
     *
     * Only entries whose options actually changed are rebuilt; untouched
     * siblings keep their fibers, and the process is not restarted. That
     * property is what makes a composed runtime worth having — a policy or
     * budget can change under a live agent without dropping the run it governs,
     * or the ledger handles and gateway leases held open around it.
     *
     * P1.4 wires a file watcher to call this; until then it is the caller's.
     */
    reload(): Promise<void>;
    dispose(): Promise<void>;
}
export declare class BootError extends Error {
    readonly unsettled: readonly UnsettledFiber[];
    constructor(message: string, unsettled?: readonly UnsettledFiber[]);
}
/**
 * Composes the runtime from `amc.cordis.yml`.
 *
 * On any failure the partially built tree is disposed before the error
 * propagates, so a failed boot leaves no half-live plugins holding file
 * handles, watchers or database connections.
 */
export declare function boot(options: BootOptions): Promise<BootResult>;
//# sourceMappingURL=boot.d.ts.map
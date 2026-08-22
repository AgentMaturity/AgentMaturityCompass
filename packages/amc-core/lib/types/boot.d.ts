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
}
export interface BootResult {
    ctx: Context;
    composition: CompositionSource;
    /** Non-empty only when auditSettled is false. */
    unsettled: UnsettledFiber[];
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
export declare const DEFAULT_COMPOSITION_FILE = "amc.cordis.yml";
export interface CompositionSource {
    /** Absolute path to the composition file. */
    path: string;
    /**
     * Path relative to the workspace, as Include expects.
     *
     * Include resolves its `path` as a URL against `ctx.baseUrl`, so it needs a
     * relative specifier and a `file://` base — an absolute filesystem path in
     * either slot throws `Invalid URL`.
     */
    relativePath: string;
    /** `file://` URL of the workspace, for URL resolution. */
    baseUrl: string;
    /** sha256 of the file's bytes. */
    sha256: string;
    signature: CompositionSignatureStatus;
}
export interface CompositionSignatureStatus {
    /** False when no `.sig` sidecar exists. */
    present: boolean;
    /** True only when a sidecar exists and its digest matches the file. */
    valid: boolean;
    reason: string | null;
}
export interface LoadCompositionOptions {
    workspace: string;
    configPath?: string;
    requireSignature?: boolean;
}
export declare class CompositionError extends Error {
    constructor(message: string);
}
/** Resolves, hashes and attests the composition file without mounting it. */
export declare function loadComposition(options: LoadCompositionOptions): CompositionSource;
//# sourceMappingURL=composition.d.ts.map
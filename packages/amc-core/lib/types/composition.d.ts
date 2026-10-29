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
    /** The sidecar's digest equals these exact bytes. Integrity only: anyone can write a digest. */
    digestMatched: boolean;
    /** The injected verifier authenticated the signature over that digest with an admitted key. */
    signatureVerified: boolean;
    /** Signer the sidecar names; null unless signatureVerified. */
    signer: string | null;
    /** Same as signatureVerified: a digest match plus a nonempty signature string is not a valid signature. */
    valid: boolean;
    reason: string | null;
}
/**
 * Authenticates a sidecar signature over the composition attestation digest
 * (see compositionAttestationDigest). The main AMC package builds it from its
 * admitted, revocation-aware key history; without one, no signature is ever
 * reported as verified.
 */
export type CompositionSignatureVerifier = (input: {
    attestationSha256: string;
    signature: string;
}) => boolean;
/** Sidecar `scheme` for domain-separated composition signatures. A sidecar without it must be re-signed. */
export declare const COMPOSITION_SIGNATURE_SCHEME = "amc-composition-v1";
/**
 * The digest a composition signature covers: sha256 over the scheme, the
 * workspace-relative path (POSIX separators) and the exact bytes, NUL-separated.
 * The config-signature key also signs other artifacts over their raw digests;
 * this prefix keeps those signatures, or one made for another path, from
 * verifying as a composition signature.
 */
export declare function compositionAttestationDigest(workspaceRelativePath: string, bytes: Uint8Array): string;
export interface LoadCompositionOptions {
    workspace: string;
    configPath?: string;
    /** Refuse unless the signature over these exact bytes is authenticated (requires verifySignature). */
    requireSignature?: boolean;
    verifySignature?: CompositionSignatureVerifier;
}
export declare class CompositionError extends Error {
    constructor(message: string);
}
/**
 * Admits one exact byte sequence of the composition file: its digest and
 * signature status, refusing when a signature is required and not verified.
 * Boot and every reload run this over the bytes actually parsed.
 */
export declare function admitCompositionBytes(path: string, workspaceRelativePath: string, bytes: Uint8Array, options: Pick<LoadCompositionOptions, "requireSignature" | "verifySignature">): {
    sha256: string;
    signature: CompositionSignatureStatus;
};
/** Resolves, hashes and attests the composition file without mounting it. */
export declare function loadComposition(options: LoadCompositionOptions): CompositionSource;
//# sourceMappingURL=composition.d.ts.map
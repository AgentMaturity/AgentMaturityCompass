/**
 * Loads and attests the declarative composition file.
 *
 * dsh's `cordis.yml` is unsigned — its own limitations list says so. AMC's
 * composition file decides which plugins compose the runtime, which means it
 * decides which controls run and which evidence is captured. In a product whose
 * thesis is that claims must be attested, leaving that file editable without
 * attestation would be the largest unsigned surface in the system.
 *
 * The signature reuses the same auditor key and detached-sidecar shape as
 * `.amc/amc.config.yaml.sig`, so an operator has one signing story rather than
 * two. Authenticating the signer needs the workspace key history, which lives
 * in the main AMC package; this package takes it as an injected verifier rather
 * than depending on that package.
 */
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative as relativePath, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_COMPOSITION_FILE = "amc.cordis.yml";

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
export type CompositionSignatureVerifier = (input: { attestationSha256: string; signature: string }) => boolean;

/** Sidecar `scheme` for domain-separated composition signatures. A sidecar without it must be re-signed. */
export const COMPOSITION_SIGNATURE_SCHEME = "amc-composition-v1";

/**
 * The digest a composition signature covers: sha256 over the scheme, the
 * workspace-relative path (POSIX separators) and the exact bytes, NUL-separated.
 * The config-signature key also signs other artifacts over their raw digests;
 * this prefix keeps those signatures, or one made for another path, from
 * verifying as a composition signature.
 */
export function compositionAttestationDigest(workspaceRelativePath: string, bytes: Uint8Array): string {
  return createHash("sha256")
    .update(`${COMPOSITION_SIGNATURE_SCHEME}\0${workspaceRelativePath.split(sep).join("/")}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

export interface LoadCompositionOptions {
  workspace: string;
  configPath?: string;
  /** Refuse unless the signature over these exact bytes is authenticated (requires verifySignature). */
  requireSignature?: boolean;
  verifySignature?: CompositionSignatureVerifier;
}

export class CompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompositionError";
  }
}

/** Detached signature sidecar, matching `.amc/amc.config.yaml.sig`. */
interface SignatureSidecar {
  scheme?: string;
  configSha256?: string;
  signature?: string;
  signedTs?: number;
  signer?: string;
}

/**
 * Checks the sidecar against the file's digest, then asks the injected
 * verifier to authenticate the signature. A digest match proves the file has
 * not changed since a sidecar was written, not who wrote it; only the verifier
 * (built from the workspace's admitted key history) establishes the signer.
 */
function readSignature(configPath: string, sha256: string, attestationSha256: string, verify?: CompositionSignatureVerifier): CompositionSignatureStatus {
  const refused = (present: boolean, digestMatched: boolean, reason: string): CompositionSignatureStatus =>
    ({ present, digestMatched, signatureVerified: false, signer: null, valid: false, reason });
  const sigPath = `${configPath}.sig`;
  if (!existsSync(sigPath)) return refused(false, false, "no signature sidecar");
  let sidecar: SignatureSidecar;
  try {
    sidecar = JSON.parse(readFileSync(sigPath, "utf8")) as SignatureSidecar;
  } catch (error) {
    return refused(true, false, `unreadable signature: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof sidecar !== "object" || sidecar === null) return refused(true, false, "signature sidecar is not an object");
  if (sidecar.configSha256 !== sha256) {
    return refused(true, false, `composition changed since signing (signed ${String(sidecar.configSha256 ?? "?")}, actual ${sha256})`);
  }
  if (typeof sidecar.signature !== "string" || sidecar.signature.length === 0) {
    return refused(true, true, "signature sidecar has no signature");
  }
  if (sidecar.scheme !== COMPOSITION_SIGNATURE_SCHEME) {
    return refused(true, true, `signature sidecar predates domain-separated composition signatures (scheme ${COMPOSITION_SIGNATURE_SCHEME}); re-sign required`);
  }
  if (!verify) return refused(true, true, "digest matches but the signer is not verified: no signature verifier was supplied");
  let verified = false;
  try {
    verified = verify({ attestationSha256, signature: sidecar.signature }) === true;
  } catch {
    verified = false;
  }
  if (!verified) return refused(true, true, "signature does not verify against the workspace's admitted signing keys");
  const signer = typeof sidecar.signer === "string" ? sidecar.signer : null;
  return { present: true, digestMatched: true, signatureVerified: true, signer, valid: true, reason: null };
}

/**
 * Admits one exact byte sequence of the composition file: its digest and
 * signature status, refusing when a signature is required and not verified.
 * Boot and every reload run this over the bytes actually parsed.
 */
export function admitCompositionBytes(
  path: string,
  workspaceRelativePath: string,
  bytes: Uint8Array,
  options: Pick<LoadCompositionOptions, "requireSignature" | "verifySignature">
): { sha256: string; signature: CompositionSignatureStatus } {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const signature = readSignature(path, sha256, compositionAttestationDigest(workspaceRelativePath, bytes), options.verifySignature);
  if (options.requireSignature && !signature.signatureVerified) {
    throw new CompositionError(
      `composition file is not validly signed: ${path}\n` +
        `  ${signature.reason}\n` +
        `  The composition decides which plugins run, so --require-signed-composition refuses to boot without attestation.`
    );
  }
  return { sha256, signature };
}

/** Resolves, hashes and attests the composition file without mounting it. */
export function loadComposition(options: LoadCompositionOptions): CompositionSource {
  // Realpath, not just resolve. The HMR watcher realpaths its base before
  // comparing a changed file against Node's ESM loadCache, so a workspace
  // reached through a symlink — /tmp on macOS is /private/tmp — would produce
  // module URLs that never match the watcher's, and no plugin would ever hot
  // reload. Nothing reports that; reloads would just silently not happen.
  const resolved = resolve(options.workspace);
  const workspace = existsSync(resolved) ? realpathSync(resolved) : resolved;
  const relative = options.configPath ?? DEFAULT_COMPOSITION_FILE;
  const path = isAbsolute(relative) ? relative : join(workspace, relative);

  if (!existsSync(path)) {
    throw new CompositionError(
      `composition file not found: ${path}\n` +
        `  Create one, or pass --config to point at it.`
    );
  }

  const workspaceRelativePath = relativePath(workspace, path) || DEFAULT_COMPOSITION_FILE;
  const { sha256, signature } = admitCompositionBytes(path, workspaceRelativePath, readFileSync(path), options);

  return {
    path,
    relativePath: workspaceRelativePath,
    baseUrl: pathToFileURL(`${workspace}/`).href,
    sha256,
    signature
  };
}

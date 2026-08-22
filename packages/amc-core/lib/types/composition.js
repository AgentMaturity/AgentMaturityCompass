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
 * two.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative as relativePath, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const DEFAULT_COMPOSITION_FILE = "amc.cordis.yml";
export class CompositionError extends Error {
    constructor(message) {
        super(message);
        this.name = "CompositionError";
    }
}
/**
 * Checks the sidecar's digest against the file.
 *
 * Digest verification alone proves the file has not changed since signing. It
 * does not prove *who* signed it — that requires the workspace key history,
 * which lives in the main AMC package and would make this package depend on it.
 * `verifyCompositionSigner` in the CLI layer completes the check; this reports
 * honestly on what it can establish here.
 */
function readSignature(configPath, sha256) {
    const sigPath = `${configPath}.sig`;
    if (!existsSync(sigPath)) {
        return { present: false, valid: false, reason: "no signature sidecar" };
    }
    let sidecar;
    try {
        sidecar = JSON.parse(readFileSync(sigPath, "utf8"));
    }
    catch (error) {
        return {
            present: true,
            valid: false,
            reason: `unreadable signature: ${error instanceof Error ? error.message : String(error)}`
        };
    }
    if (typeof sidecar.signature !== "string" || sidecar.signature.length === 0) {
        return { present: true, valid: false, reason: "signature sidecar has no signature" };
    }
    if (sidecar.configSha256 !== sha256) {
        return {
            present: true,
            valid: false,
            reason: `composition changed since signing (signed ${sidecar.configSha256 ?? "?"}, actual ${sha256})`
        };
    }
    return { present: true, valid: true, reason: null };
}
/** Resolves, hashes and attests the composition file without mounting it. */
export function loadComposition(options) {
    const workspace = resolve(options.workspace);
    const relative = options.configPath ?? DEFAULT_COMPOSITION_FILE;
    const path = isAbsolute(relative) ? relative : join(workspace, relative);
    if (!existsSync(path)) {
        throw new CompositionError(`composition file not found: ${path}\n` +
            `  Create one, or pass --config to point at it.`);
    }
    const bytes = readFileSync(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const signature = readSignature(path, sha256);
    if (options.requireSignature && !signature.valid) {
        throw new CompositionError(`composition file is not validly signed: ${path}\n` +
            `  ${signature.reason}\n` +
            `  The composition decides which plugins run, so --require-signed-composition refuses to boot without attestation.`);
    }
    return {
        path,
        relativePath: relativePath(workspace, path) || DEFAULT_COMPOSITION_FILE,
        baseUrl: pathToFileURL(`${workspace}/`).href,
        sha256,
        signature
    };
}
//# sourceMappingURL=composition.js.map
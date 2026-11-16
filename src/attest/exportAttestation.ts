/**
 * The standard envelope beside every exported file (passport, evidence bundle, assurance certificate): an in-toto
 * Statement v1 whose subject is the sha256 of the whole exported file, DSSE-signed with the workspace's artifact-seal key
 * and wrapped in a key-based Sigstore bundle v0.3, written as `<file>.sigstore.json`. Tools that read DSSE, in-toto and
 * Sigstore bundles can check it against a key they pin; the AMC-specific `.sig` files inside the export stay as they are.
 * The statement says who issued the file and when by the issuer's own clock; it says nothing about whether the file's
 * content is true.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { getSigningKey } from "../crypto/keys.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { ed25519Signer, INTOTO_PAYLOAD_TYPE, signDsse } from "./dsse.js";
import { toSigstoreBundle } from "./sigstoreBundle.js";
import { INTOTO_STATEMENT_TYPE } from "./statement.js";

/** Never reuse a published predicate version: a changed shape gets a new URI. */
export const EXPORT_PREDICATE = "https://agentmaturity.co/attestations/export/v0.1";
export const EXPORT_NOTICE = "A signature shows who issued this file and that it is unchanged, not that its content is true.";
export const EXPORT_KINDS = ["amcpass", "amcbundle", "amccert"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function exportStatement(input: { name: string; bytes: Uint8Array; kind: ExportKind; workspaceId: string; issuedAt: Date }) {
  return {
    _type: INTOTO_STATEMENT_TYPE,
    subject: [{ name: input.name, digest: { sha256: sha256Hex(input.bytes) } }],
    predicateType: EXPORT_PREDICATE,
    predicate: {
      kind: input.kind,
      issuerRelationship: "self" as const,
      workspace: input.workspaceId,
      issuedAt: input.issuedAt.toISOString(),
      timeBasis: "claimed" as const,
      notice: EXPORT_NOTICE
    }
  };
}

/**
 * Writes `<file>.sigstore.json` for `file` and returns its path, or the reason it could not be signed (a locked vault,
 * no-sign mode). The export itself is never undone for that; the caller prints the reason.
 */
export function writeExportAttestation(workspace: string, file: string, kind: ExportKind, expectedSha256?: string): { path: string } | { error: string } {
  try {
    const bytes = readFileSync(file);
    if (expectedSha256 !== undefined && sha256Hex(bytes) !== expectedSha256) throw new Error(`${basename(file)} changed after it was written`);
    const statement = exportStatement({ name: basename(file), bytes, kind, workspaceId: workspaceIdFromDirectory(workspace), issuedAt: new Date() });
    const signer = ed25519Signer(getSigningKey(workspace, "artifact-seal"));
    const bundle = toSigstoreBundle(signDsse(INTOTO_PAYLOAD_TYPE, Buffer.from(JSON.stringify(statement), "utf8"), signer));
    const path = `${file}.sigstore.json`;
    writeFileAtomic(path, `${JSON.stringify(bundle, null, 2)}\n`, 0o644);
    return { path };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** One line for a person: where the envelope is, or why there is none. */
export function exportAttestationLine(result: { path: string } | { error: string }): string {
  return "path" in result
    ? `Signed statement (DSSE, in-toto, Sigstore bundle) for the whole file: ${result.path}`
    : `No signed statement was written beside the file: ${result.error}`;
}

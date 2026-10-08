/**
 * Signed control-result files (P1-28 follow-up). AMC writes a control-result set for export only through
 * writeSignedControlResults, which signs the sha256 of exactly the bytes it writes as CONTROL_RESULT, in `<file>.sig`.
 * readSignedControlResults reads the file once, verifies that signature over the bytes it read and parses those same
 * bytes. Checked against the workspace's own auditor keys the signature is a local audit trail, not portable trust;
 * once the operator has a trust list the signer must also be pinned for artifact-seal (P0-09), and a distrusted or
 * revoked key is always refused. A signature shows who wrote the results and that they are unchanged, not that they
 * are true.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { z } from "zod";
import { getPublicKeyHistory } from "../../crypto/keys.js";
import { signatureEnvelopeSchema } from "../../crypto/signing/signatureEnvelope.js";
import { signDigestWithPolicy, verifySignedDigest } from "../../crypto/signing/signer.js";
import { assertOutsideSignedConfigTree } from "../../domains/operatingProfiles/operatingProfileEmit.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { checkDigestSignature, loadTrustContext, type IssuerAdmission } from "../../trust/index.js";
import { isKeyRefused } from "../../trust/signatureCheck.js";
import { pathExists, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import type { ControlResult } from "./types.js";

/** signDigestWithPolicy's SignedDigest, strict. */
const signatureFileSchema = z.strictObject({
  digestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
});

export const controlResultsSigPath = (path: string): string => `${path}.sig`;

/** Writes the result set and `<path>.sig`. Blocked in agent mode, and never under .amc/. */
export function writeSignedControlResults(workspace: string, path: string, results: readonly ControlResult[]): { path: string; sigPath: string; digestSha256: string } {
  const root = resolve(workspace);
  assertOwnerMode(root, "control results sign");
  const file = resolve(root, path);
  assertOutsideSignedConfigTree(root, file);
  const bytes = Buffer.from(`${JSON.stringify(results, null, 2)}\n`, "utf8");
  const digestSha256 = sha256Hex(bytes);
  const signed = signDigestWithPolicy({ workspace: root, kind: "CONTROL_RESULT", digestHex: digestSha256 });
  writeFileAtomic(file, bytes, 0o644);
  writeFileAtomic(controlResultsSigPath(file), `${JSON.stringify(signed, null, 2)}\n`, 0o644);
  return { path: file, sigPath: controlResultsSigPath(file), digestSha256 };
}

const parseJson = (text: string, what: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${what} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * The results file, read once and refused as an integrity failure unless `<path>.sig` signs the sha256 of exactly those
 * bytes as described above. `value` is parsed from the verified bytes; the caller still checks its shape.
 */
export function readSignedControlResults(workspace: string, path: string): { value: unknown; digestSha256: string; admission: IssuerAdmission } {
  const root = resolve(workspace);
  const file = resolve(root, path);
  const sigPath = controlResultsSigPath(file);
  const what = `results file ${file}`;
  if (!pathExists(sigPath)) throw new Error(`${what} is not signed (${basename(sigPath)} missing); nothing was exported`);
  const bytes = readFileSync(file);
  const digestSha256 = sha256Hex(bytes);
  const parsed = signatureFileSchema.safeParse(parseJson(readFileSync(sigPath, "utf8"), basename(sigPath)));
  if (!parsed.success) throw new Error(`${basename(sigPath)} is not a CONTROL_RESULT signature: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  const sig = parsed.data;
  if (sig.digestSha256 !== digestSha256) throw new Error(`${what} changed after signing (digest mismatch); nothing was exported`);
  if (!verifySignedDigest({ workspace: root, digestHex: digestSha256, signed: sig })) {
    throw new Error(`${what} signature does not verify against this workspace's auditor keys; nothing was exported`);
  }
  const trust = loadTrustContext();
  const { admission } = checkDigestSignature({ signature: basename(sigPath), purpose: "artifact-seal", digestHex: digestSha256,
    signatureB64: sig.signature, candidates: getPublicKeyHistory(root, "auditor"), context: trust, claimedSignedAt: sig.signedTs });
  if (isKeyRefused(admission) || (trust.lists.length > 0 && admission.status !== "admitted")) {
    throw new Error(`${what} signer is not trusted (${admission.status}${admission.detail ? `: ${admission.detail}` : ""}); nothing was exported`);
  }
  return { value: parseJson(bytes.toString("utf8"), what), digestSha256, admission };
}

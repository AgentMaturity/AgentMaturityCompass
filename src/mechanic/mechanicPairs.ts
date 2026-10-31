/** Internal fixed BUNDLE pair admission; one captured body supplies both verification and parsing. */
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import type { SignedFileVerification } from "../org/orgSigner.js";
export function captureMechanicPair(workspace: string, path: string, missingReason: string, snapshot?: OrgPairsSnapshot) {
  const before = snapshot ?? captureOrgPairs([path]), bytes = orgPairBytes(before, path), signature = orgPairBytes(before, `${path}.sig`);
  const verification: SignedFileVerification = bytes === null ? { valid: false, signatureExists: false, reason: missingReason, path, sigPath: `${path}.sig` }
    : signature === null ? { valid: false, signatureExists: false, reason: "signature missing", path, sigPath: `${path}.sig` }
      : { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, signature), signatureExists: true, path, sigPath: `${path}.sig` };
  if (verification.reason === "signature verification failed") verification.reason = "signature verify failed";
  return { before, bytes, hasSidecar: signature !== null, verification, assertCurrent() { assertOrgPairsCurrent(before); } };
}
export function requireMechanicPair(pair: ReturnType<typeof captureMechanicPair>): Buffer {
  if (pair.bytes === null || !pair.verification.valid) throw new Error(`mechanic input signature invalid: ${pair.verification.reason ?? "unknown"}`);
  return pair.bytes;
}
export function verifyMechanicPair(workspace: string, path: string, missingReason: string): SignedFileVerification {
  try { return captureMechanicPair(workspace, path, missingReason).verification; }
  catch { return { valid: false, signatureExists: true, reason: "invalid file signature", path, sigPath: `${path}.sig` }; }
}

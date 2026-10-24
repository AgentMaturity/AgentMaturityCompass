import { pathExists } from "../utils/fs.js";
import { captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import type { SignedFileVerification } from "../org/orgSigner.js";

/** Fixed BUNDLE pair admission for the actual binder cache and scheduler-state readers only. */
export function verifyAuditBundlePair(workspace: string, path: string): SignedFileVerification {
  const sigPath = `${path}.sig`;
  try {
    const pair = captureOrgPairs([path]), body = orgPairBytes(pair, path), signature = orgPairBytes(pair, sigPath);
    if (body === null) return { valid: true, signatureExists: false, reason: null, path, sigPath };
    if (signature === null) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
    return { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature), signatureExists: true, path, sigPath };
  } catch { return { valid: false, signatureExists: pathExists(sigPath), reason: "audit signed pair could not be read", path, sigPath }; }
}

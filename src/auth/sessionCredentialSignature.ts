import { verifyCurrentPurposeCredentialSignature } from "../keys/purposeCredentialSignature.js";

/** Current session credentials use authenticated session history, but never a revoked or distrusted signer. */
export function verifySessionCredentialSignature(workspace: string, payloadBytes: Uint8Array, signature: Uint8Array): boolean {
  return verifyCurrentPurposeCredentialSignature(workspace, "session", payloadBytes, signature);
}

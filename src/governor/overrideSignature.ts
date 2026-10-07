/**
 * Break-glass signatures (gap G16).
 *
 * Both override paths used to store the literal signature "unsigned" when no
 * auditor key was available, and nothing checked the signature on read, so a
 * hand-written JSON file counted as an active override. Overrides are
 * workspace-internal records, so they are signed with the workspace auditor key
 * and verified against its authenticated key history. A signature proves who
 * recorded an override and that it is unchanged, not that it was justified.
 */
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";

export type OverrideSignatureCheck =
  | { valid: true }
  | { valid: false; code: "UNSIGNED" | "HASH_MISMATCH" | "SIGNATURE_INVALID"; reason: string };

const REFUSED =
  "Emergency override refused: no verifiable auditor signature (vault locked or missing, or no-sign mode). " +
  "Unlock the vault with `amc vault unlock` or set AMC_VAULT_PASSPHRASE, then retry. Unsigned overrides are never recorded.";

export class BreakGlassSigningError extends Error {
  readonly code = "BREAK_GLASS_UNSIGNED";
  constructor(message: string = REFUSED) {
    super(message);
    this.name = "BreakGlassSigningError";
  }
}

/** Signs, then verifies against the workspace auditor history; throws BreakGlassSigningError. */
export function signOverrideDigest(workspace: string, digestHex: string): string {
  // With no-sign mode a locked vault hands out an ephemeral key nothing can verify later.
  if (process.env.AMC_NO_SIGN === "1") throw new BreakGlassSigningError();
  let signature: string;
  try {
    signature = signHexDigest(digestHex, getPrivateKeyPem(workspace, "auditor"));
  } catch {
    throw new BreakGlassSigningError();
  }
  if (!verifyOverrideDigest(workspace, digestHex, signature).valid) throw new BreakGlassSigningError();
  return signature;
}

export function verifyOverrideDigest(workspace: string, digestHex: string, signature: string): OverrideSignatureCheck {
  if (!signature || signature === "unsigned") {
    return { valid: false, code: "UNSIGNED", reason: "the override carries no signature" };
  }
  let keys: string[];
  try {
    keys = getPublicKeyHistory(workspace, "auditor");
  } catch {
    return { valid: false, code: "SIGNATURE_INVALID", reason: "the workspace has no auditor public key" };
  }
  return verifyHexDigestAny(digestHex, signature, keys)
    ? { valid: true }
    : { valid: false, code: "SIGNATURE_INVALID", reason: "the signature does not verify against the workspace auditor key history" };
}

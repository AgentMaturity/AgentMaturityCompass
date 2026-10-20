/**
 * Break-glass signatures (gap G16).
 *
 * Both override paths used to store the literal signature "unsigned" when no
 * auditor key was available, and nothing checked the signature on read, so a
 * hand-written JSON file counted as an active override. Overrides are
 * workspace-internal records, so they are signed with the workspace auditor key
 * and verified against its authenticated key history. A signature proves who
 * recorded an override and that it is unchanged, not that it was justified.
 *
 * The auditor key also signs bare sha256 digests of raw bytes (signHexDigest,
 * for example `amc fix-signatures` over a config file an attacker can write),
 * so a signature over the bare override hash could be obtained without ever
 * activating an override. Override signatures therefore cover domain-tagged
 * bytes, signed directly as trust lists are, never through signHexDigest.
 */
import { sign } from "node:crypto";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { assertSha256HexDigest, getSigningKey, isSha256HexDigest } from "../crypto/keys.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { signWithPurposeKey, type PurposeSignature } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent, capturePurposePublication, type PurposePublication } from "../keys/purposePublication.js";

const DOMAIN_TAG = "AMC_BREAK_GLASS_OVERRIDE_V1";

function signedBytes(digestHex: string): Buffer {
  return Buffer.concat([Buffer.from(DOMAIN_TAG, "ascii"), Buffer.from([0]), Buffer.from(digestHex, "hex")]);
}

function verifiesUnder(digestHex: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    return verifyWithKey(signedBytes(digestHex), publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

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
    assertSha256HexDigest(digestHex);
    signature = sign(null, signedBytes(digestHex), getSigningKey(workspace, "config-signature")).toString("base64");
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
    // An active governance bypass also requires every committed public key to remain intact.
    assertKeysetComplete(workspace);
    keys = getPurposeKeyHistory(workspace, "config-signature");
  } catch {
    return { valid: false, code: "SIGNATURE_INVALID", reason: "the workspace has no auditor public key" };
  }
  return isSha256HexDigest(digestHex) && keys.some((pem) => verifiesUnder(digestHex, signature, pem))
    ? { valid: true }
    : { valid: false, code: "SIGNATURE_INVALID", reason: "the signature does not verify against the workspace auditor key history" };
}

/** Override-only live policy: call inside the final synchronous publication phase, after every signing await. */
export function assertOverridePublicationCurrent(workspace: string, captured: PurposePublication, signed: PurposeSignature): void {
  if (process.env.AMC_NO_SIGN === "1") throw new BreakGlassSigningError();
  assertPurposePublicationCurrent(workspace, captured, signed);
}

/** Internal prepared signature for actual async override publishers; final publication must recheck its captured authority. */
export async function prepareOverrideDigestSignature(workspace: string, digestHex: string): Promise<{ captured: PurposePublication; signed: PurposeSignature }> {
  if (process.env.AMC_NO_SIGN === "1") throw new BreakGlassSigningError();
  try {
    assertSha256HexDigest(digestHex);
    const captured = capturePurposePublication(workspace, "config-signature");
    const signed = await signWithPurposeKey(workspace, "config-signature", signedBytes(digestHex));
    if (!verifyOverrideDigest(workspace, digestHex, signed.signature.toString("base64")).valid) throw new BreakGlassSigningError();
    return { captured, signed };
  } catch (error) {
    if (error instanceof KeyProviderError || error instanceof KeyRevokedError) throw error;
    throw new BreakGlassSigningError();
  }
}

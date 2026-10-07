import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigest } from "../../crypto/keys.js";
import { checkDigestSignature, ed25519KeyId, loadTrustContext } from "../../trust/index.js";
import { isKeyRefused } from "../../trust/signatureCheck.js";
import { pathExists, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { readOperatingProfile } from "./operatingProfileBuilder.js";
import { checkOperatingProfileConsistency } from "./operatingProfileConsistency.js";
import { assertOutsideSignedConfigTree } from "./operatingProfileEmit.js";
import type { OperatingProfile } from "./operatingProfileTypes.js";

/** Same shape as the signed-config `.sig` files (`signBudgetsConfig`). */
export interface OperatingProfileSignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export interface OperatingProfileSignatureCheck {
  valid: boolean;
  reason: string | null;
  digestSha256: string;
  /** Ed25519 key id of the auditor key that made the signature, when it verified. */
  signerFingerprint: string | null;
}

export function operatingProfileSigPath(profilePath: string): string {
  return `${profilePath}.sig`;
}

/** Parses profile bytes and refuses a profile whose recomputed consistency check fails. */
function parseConsistentProfile(bytes: Buffer): OperatingProfile {
  let profile: OperatingProfile;
  let violations: string[];
  try {
    profile = readOperatingProfile(JSON.parse(bytes.toString("utf8")) as unknown);
    violations = checkOperatingProfileConsistency(profile).violations;
  } catch (error) {
    throw new Error(`operating profile is inconsistent: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (violations.length > 0) throw new Error(`operating profile is inconsistent: ${violations.join("; ")}`);
  return profile;
}

/** What `signOperatingProfile` would sign: the profile's digest, after the consistency check. Writes nothing. */
export function inspectOperatingProfileForSigning(workspace: string, profilePath: string): { profilePath: string; sigPath: string; digestSha256: string } {
  const path = resolve(workspace, profilePath);
  assertOutsideSignedConfigTree(workspace, path);
  const bytes = readFileSync(path);
  parseConsistentProfile(bytes);
  return { profilePath: path, sigPath: operatingProfileSigPath(path), digestSha256: sha256Hex(bytes) };
}

/**
 * Signs a reviewed profile with the workspace auditor key and writes `<profilePath>.sig`.
 * A signature records who signed and that the bytes are unchanged; it does not make a value
 * true, and the same workspace key does not show that a second person reviewed it.
 */
export function signOperatingProfile(workspace: string, profilePath: string): string {
  const { sigPath, digestSha256 } = inspectOperatingProfileForSigning(workspace, profilePath);
  const payload: OperatingProfileSignature = {
    digestSha256,
    signature: signHexDigest(digestSha256, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

function verifyProfileBytes(workspace: string, profilePath: string, bytes: Buffer): OperatingProfileSignatureCheck {
  const digestSha256 = sha256Hex(bytes);
  const refuse = (reason: string): OperatingProfileSignatureCheck => ({ valid: false, reason, digestSha256, signerFingerprint: null });
  const unauthorized = "operating profile signature does not verify against an authorized key";
  const sigPath = operatingProfileSigPath(profilePath);
  if (!pathExists(sigPath)) return refuse(`operating profile is not signed: ${sigPath} missing`);
  try {
    const sig = JSON.parse(readFileSync(sigPath, "utf8")) as Partial<OperatingProfileSignature>;
    if (typeof sig.digestSha256 !== "string" || typeof sig.signature !== "string") return refuse(`${unauthorized} (unreadable ${basename(sigPath)})`);
    if (sig.digestSha256 !== digestSha256) return refuse("operating profile changed after signing (digest mismatch)");
    const signer = getPublicKeyHistory(workspace, "auditor").find((pem) => verifyHexDigest(digestSha256, sig.signature!, pem));
    if (!signer) return refuse(unauthorized);
    // P0-09 pinned trust: distrust always refuses; once an operator trust list exists, the key
    // must also be pinned for config signatures.
    const trust = loadTrustContext();
    const { admission } = checkDigestSignature({
      signature: basename(sigPath),
      purpose: "config-signature",
      candidates: [signer],
      context: trust,
      digestHex: digestSha256,
      signatureB64: sig.signature,
      claimedSignedAt: typeof sig.signedTs === "number" ? sig.signedTs : null
    });
    if (isKeyRefused(admission) || (trust.lists.length > 0 && admission.status !== "admitted")) {
      return refuse(`${unauthorized} (${admission.status}${admission.detail ? `: ${admission.detail}` : ""})`);
    }
    return { valid: true, reason: null, digestSha256, signerFingerprint: ed25519KeyId(signer) };
  } catch (error) {
    return refuse(`${unauthorized} (${error instanceof Error ? error.message : String(error)})`);
  }
}

export function verifyOperatingProfileSignature(workspace: string, profilePath: string): OperatingProfileSignatureCheck {
  const path = resolve(workspace, profilePath);
  return verifyProfileBytes(workspace, path, readFileSync(path));
}

/** Reads the profile once, verifies its signature over those bytes, then parses and re-checks it. */
export function loadSignedOperatingProfile(workspace: string, profilePath: string): {
  profile: OperatingProfile;
  profilePath: string;
  digestSha256: string;
  signerFingerprint: string;
} {
  const path = resolve(workspace, profilePath);
  const bytes = readFileSync(path);
  const check = verifyProfileBytes(workspace, path, bytes);
  if (!check.valid || !check.signerFingerprint) throw new Error(check.reason ?? "operating profile signature does not verify against an authorized key");
  return { profile: parseConsistentProfile(bytes), profilePath: path, digestSha256: check.digestSha256, signerFingerprint: check.signerFingerprint };
}

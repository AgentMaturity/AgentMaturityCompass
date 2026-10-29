import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  getSigningKey,
  signHexDigest
} from "../crypto/keys.js";
import { verifyCurrentPurposeCredentialSignature } from "../keys/purposeCredentialSignature.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { withAmcConfigPublicationLock } from "./configPublicationLock.js";

/**
 * Signs .amc/amc.config.yaml with the auditor key.
 *
 * This file carries security.trustBoundaryMode, and the ledger treats
 * "isolated" as the statement that monitor and auditor keys are out of reach of
 * the evaluated agent. It was the only root config without a signature, so that
 * claim could be granted by editing a plain YAML file — the check it feeds
 * asserts something the file itself could not attest to.
 */
export function signAmcConfig(workspace: string): string {
  return withAmcConfigPublicationLock(workspace, () => signAmcConfigLocked(workspace));
}

function signAmcConfigLocked(workspace: string): string {
  const configPath = join(workspace, ".amc", "amc.config.yaml");
  if (!pathExists(configPath)) {
    throw new Error(`Cannot sign missing config: ${configPath}`);
  }
  const digest = sha256Hex(readFileSync(configPath));
  const signature = signHexDigest(digest, getSigningKey(workspace, "config-signature"));
  const sigPath = `${configPath}.sig`;
  writeFileAtomic(
    sigPath,
    JSON.stringify({ configSha256: digest, signature, signedTs: Date.now(), signer: "auditor" }, null, 2),
    0o644
  );
  return sigPath;
}

/**
 * Verifies the signature over amc.config.yaml.
 *
 * Returns signatureExists: false when unsigned, so callers can distinguish
 * "never signed" from "signature does not match".
 */
export function verifyAmcConfigSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
} {
  const configPath = join(workspace, ".amc", "amc.config.yaml");
  const sigPath = `${configPath}.sig`;
  if (!pathExists(configPath)) {
    return { valid: false, signatureExists: false, reason: "config missing" };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "config signature missing" };
  }
  try {
    const payload = JSON.parse(readFileSync(sigPath, "utf8")) as {
      configSha256: string;
      signature: string;
    };
    const digest = sha256Hex(readFileSync(configPath));
    if (digest !== payload.configSha256) {
      return { valid: false, signatureExists: true, reason: "config digest mismatch" };
    }
    assertKeysetComplete(workspace);
    // Revocation-aware: a signature by a revoked or distrusted config-signature key never verifies.
    const ok = verifyCurrentPurposeCredentialSignature(workspace, "config-signature", Buffer.from(digest, "hex"), Buffer.from(payload.signature, "base64"));
    return { valid: ok, signatureExists: true, reason: ok ? null : "signature invalid" };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Verifier for the declarative composition's `.sig` sidecar, injected into
 * `@amc/core` (which cannot depend on this package). The signature must cover
 * the domain-separated composition attestation digest and verify against a
 * current, unrevoked config-signature key, so a nonempty string with a correct
 * file digest, or a config-signature signature made for another artifact, is
 * not enough. Any failure, including an incomplete keyset, is unverified.
 */
export function createCompositionSignatureVerifier(workspace: string): (input: { attestationSha256: string; signature: string }) => boolean {
  return ({ attestationSha256, signature }) => {
    try {
      assertKeysetComplete(workspace);
      return verifyCurrentPurposeCredentialSignature(workspace, "config-signature", Buffer.from(attestationSha256, "hex"), Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  };
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  getSigningKey,
  signHexDigest,
  verifyHexDigestAny
} from "../crypto/keys.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
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
    const ok = verifyHexDigestAny(digest, payload.signature, getPurposeKeyHistory(workspace, "config-signature"));
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
 * `@amc/core` (which cannot depend on this package). It uses the same
 * config-signature key history as amc.config.yaml, so a nonempty signature
 * string with a correct digest is not enough: it must verify against an
 * admitted key. Any failure, including an incomplete keyset, is unverified.
 */
export function createCompositionSignatureVerifier(workspace: string): (input: { sha256: string; signature: string }) => boolean {
  return ({ sha256, signature }) => {
    try {
      assertKeysetComplete(workspace);
      return verifyHexDigestAny(sha256, signature, getPurposeKeyHistory(workspace, "config-signature"));
    } catch {
      return false;
    }
  };
}

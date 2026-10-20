import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { orgSignatureSchema } from "./orgSchema.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync, verifySignedDigest } from "../crypto/signing/signer.js";
import { signingPurposeForKind } from "../crypto/signing/signerTypes.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import type { SignKind, SignedDigest } from "../crypto/signing/signerTypes.js";

function signKindForPath(path: string): SignKind {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.endsWith("/.amc/ops-policy.yaml")) {
    return "OPS_POLICY";
  }
  if (normalized.endsWith("/.amc/compliance-maps.yaml")) {
    return "COMPLIANCE_MAPS";
  }
  if (normalized.endsWith("/.amc/audit/maps/builtin.yaml") || normalized.endsWith("/.amc/audit/maps/active.yaml")) {
    return "COMPLIANCE_MAPS";
  }
  if (normalized.endsWith("/.amc/plugins/installed.lock.json")) {
    return "INSTALLED_LOCK";
  }
  if (normalized.includes("/org/scorecards/") && normalized.endsWith(".json")) {
    return "ORG_SCORECARD";
  }
  if (normalized.includes("/transform/plans/") && normalized.endsWith(".json")) {
    return "TRANSFORM_PLAN";
  }
  return "BUNDLE";
}

export interface SignedFileVerification {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
}

/** `bytes`: the exact content the caller wrote; signing them, not a re-read, leaves no window for a swapped file to be signed. */
export function signFileWithAuditor(workspace: string, path: string, bytes?: Buffer): string {
  if (!pathExists(path)) {
    throw new Error(`File not found: ${path}`);
  }
  const digest = sha256Hex(bytes ?? readFileSync(path));
  const signed = signDigestWithPolicy({
    workspace,
    kind: signKindForPath(path),
    digestHex: digest
  });
  const payload: SignedDigest = {
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  };
  const sigPath = `${path}.sig`;
  ensureDir(dirname(sigPath));
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

/** `bytes`: the content the caller read once and will use; the signature is checked over them, never over a second read. */
export function verifySignedFileWithAuditor(workspace: string, path: string, bytes?: Buffer): SignedFileVerification {
  const sigPath = `${path}.sig`;
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "file missing",
      path,
      sigPath
    };
  }
  if (!pathExists(sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "signature missing",
      path,
      sigPath
    };
  }
  try {
    const sig = orgSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(bytes ?? readFileSync(path));
    if (digest !== sig.digestSha256) {
      return {
        valid: false,
        signatureExists: true,
        reason: "digest mismatch",
        path,
        sigPath
      };
    }
    const valid = verifySignedDigest({
      workspace,
      digestHex: digest,
      signed: {
        signature: sig.signature,
        envelope: sig.envelope
      }
    });
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verify failed",
      path,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path,
      sigPath
    };
  }
}

export function signSerializedPayloadWithAuditor(workspace: string, serialized: string): {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
  envelope?: SignedDigest["envelope"];
} {
  const digest = sha256Hex(Buffer.from(serialized, "utf8"));
  const signed = signDigestWithPolicy({
    workspace,
    kind: "BUNDLE",
    digestHex: digest
  });
  return {
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  };
}

/** Prepare bytes for a real publisher; no body or sidecar is written before the checked provider returns. */
export async function prepareFileSignatureWithAuditor(workspace: string, path: string, input: Uint8Array,
  kind: SignKind = signKindForPath(path)): Promise<{ readonly digestSha256: string; readonly signatureBytes: string; assertCurrent(): void }> {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  const bytes = Buffer.from(input), digestSha256 = sha256Hex(bytes), descriptor = describePolicySigner(workspace, kind);
  const purpose = signingPurposeForKind(kind), policy = JSON.stringify(loadTrustConfig(workspace));
  const authority = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, purpose) : null;
  const provider = authority === null ? "file" : boundProviderKey(workspace, purpose)?.binding.provider ?? "file";
  const signed = await signDigestWithPolicyAsync({ workspace, kind, digestHex: digestSha256, expectedSigner: descriptor });
  // Keep the historical five-field order and the complete checked envelope/basis.
  const signatureBytes = JSON.stringify({ digestSha256, signature: signed.signature, signedTs: signed.signedTs,
    signer: "auditor", envelope: signed.envelope }, null, 2);
  return Object.freeze({ digestSha256, signatureBytes, assertCurrent() {
    assertPolicySignerCurrent(workspace, descriptor);
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy) throw new Error("file signing policy changed while signing");
    if (authority !== null) {
      if (signed.envelope === undefined) throw new Error("prepared file signature has no envelope");
      assertPurposePublicationCurrent(workspace, authority, { provider, algorithm: signed.envelope.alg, keyId: descriptor.fingerprint,
        publicKeyPem: descriptor.publicKeyPem, signature: Buffer.from(signed.signature, "base64") });
    }
  } });
}

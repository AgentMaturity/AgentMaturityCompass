import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { orgSignatureSchema } from "./orgSchema.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
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

export function signFileWithAuditor(workspace: string, path: string): string {
  if (!pathExists(path)) {
    throw new Error(`File not found: ${path}`);
  }
  const digest = sha256Hex(readFileSync(path));
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

export function verifySignedFileWithAuditor(workspace: string, path: string): SignedFileVerification {
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
    const digest = sha256Hex(readFileSync(path));
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
    }) || verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
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

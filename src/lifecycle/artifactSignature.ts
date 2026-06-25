import { readFileSync } from "node:fs";
import { z } from "zod";
import { ensureSigningKeys } from "../crypto/keys.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import type { SignatureEnvelope } from "../crypto/signing/signerTypes.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

const artifactSignatureSchema = z.object({
  schemaVersion: z.literal("2026-05-22"),
  artifactKind: z.enum([
    "lifecycle-artifact",
    "lifecycle-receipt-bundle",
    "enforce-resource-manifest",
    "enforce-resource-snapshot",
    "enforce-resource-lifecycle-receipt",
    "enforce-resource-restore-receipt",
    "observability-lane",
    "org-run-artifact",
    "runtime-firewall-policy",
    "runtime-firewall-decision",
    "runtime-autonomy-boundary-decision",
    "runtime-run-state",
    "runtime-run-event",
    "runtime-lifecycle-graph",
    "runtime-state-checkpoint",
    "runtime-state-restore-proof",
    "partner-interoperability-fixture",
    "fleet-lifecycle-run",
    "trace-failure-index",
    "fixer-rca-report",
    "governed-optimizer-run",
    "reasoning-memory-item",
    "reasoning-memory-receipt",
    "exploit-confirmation-scope",
    "exploit-confirmation-proof",
    "neutral-import-artifact",
    "inference-strategy-run"
  ]),
  artifactSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z.unknown().optional()
});

export type ArtifactSignature = z.infer<typeof artifactSignatureSchema>;

export interface ArtifactSignatureVerification {
  valid: boolean;
  signatureExists: boolean;
  artifactPath: string;
  sigPath: string;
  reason: string | null;
  artifactSha256: string | null;
}

export function artifactSigPath(path: string): string {
  return `${path}.sig`;
}

export function signArtifactFile(input: {
  workspace: string;
  path: string;
  artifactKind: ArtifactSignature["artifactKind"];
}): { sigPath: string; signature: ArtifactSignature } {
  ensureSigningKeys(input.workspace);
  const artifactSha256 = sha256Hex(readFileSync(input.path));
  const signed = signDigestWithPolicy({
    workspace: input.workspace,
    kind: "BUNDLE",
    digestHex: artifactSha256
  });
  const signature = artifactSignatureSchema.parse({
    schemaVersion: "2026-05-22",
    artifactKind: input.artifactKind,
    artifactSha256,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
  const sigPath = artifactSigPath(input.path);
  writeFileAtomic(sigPath, `${JSON.stringify(signature, null, 2)}\n`, 0o644);
  return { sigPath, signature };
}

export function trySignArtifactFile(input: {
  workspace: string;
  path: string;
  artifactKind: ArtifactSignature["artifactKind"];
}): { sigPath: string; signature: ArtifactSignature } | null {
  try {
    return signArtifactFile(input);
  } catch {
    return null;
  }
}

export function verifyArtifactFileSignature(input: {
  workspace: string;
  path: string;
}): ArtifactSignatureVerification {
  const sigPath = artifactSigPath(input.path);
  if (!pathExists(input.path)) {
    return { valid: false, signatureExists: pathExists(sigPath), artifactPath: input.path, sigPath, reason: "artifact missing", artifactSha256: null };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, artifactPath: input.path, sigPath, reason: "signature missing", artifactSha256: null };
  }
  try {
    const signature = artifactSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const artifactSha256 = sha256Hex(readFileSync(input.path));
    if (artifactSha256 !== signature.artifactSha256) {
      return { valid: false, signatureExists: true, artifactPath: input.path, sigPath, reason: "digest mismatch", artifactSha256 };
    }
    const valid = verifySignedDigest({
      workspace: input.workspace,
      digestHex: artifactSha256,
      signed: {
        signature: signature.signature,
        envelope: signature.envelope as SignatureEnvelope | undefined
      }
    });
    return {
      valid,
      signatureExists: true,
      artifactPath: input.path,
      sigPath,
      reason: valid ? null : "signature verification failed",
      artifactSha256
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      artifactPath: input.path,
      sigPath,
      reason: error instanceof Error ? error.message : String(error),
      artifactSha256: null
    };
  }
}

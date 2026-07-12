import { readFileSync } from "node:fs";
import { z } from "zod";
import { ensureSigningKeys } from "../crypto/keys.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import type { SignatureEnvelope } from "../crypto/signing/signerTypes.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

const artifactKindSchema = z.enum([
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
    "guardrail-control-state",
    "guardrail-control-head",
    "runtime-autonomy-boundary-decision",
    "runtime-run-state",
    "runtime-run-event",
    "runtime-lifecycle-graph",
    "runtime-state-checkpoint",
    "runtime-state-restore-proof",
    "partner-interoperability-fixture",
    "rag-grounding-eval-receipt",
    "fleet-lifecycle-run",
    "trace-failure-index",
    "fixer-rca-report",
    "governed-optimizer-run",
    "reasoning-memory-item",
    "reasoning-memory-receipt",
    "knowledge-refresh-lineage-receipt",
    "exploit-confirmation-scope",
    "exploit-confirmation-proof",
    "neutral-import-artifact",
    "inference-strategy-run",
    "evaluator-registry-manifest"
]);

const artifactSignatureFields = {
  artifactKind: artifactKindSchema,
  artifactSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z.unknown().optional()
};

const artifactSignatureSchema = z.discriminatedUnion("schemaVersion", [
  z.object({
    schemaVersion: z.literal("2026-05-22"),
    ...artifactSignatureFields
  }),
  z.object({
    schemaVersion: z.literal("2026-07-10"),
    ...artifactSignatureFields
  })
]);

export type ArtifactSignature = z.infer<typeof artifactSignatureSchema>;

export interface ArtifactSignatureVerification {
  valid: boolean;
  signatureExists: boolean;
  artifactPath: string;
  sigPath: string;
  reason: string | null;
  artifactSha256: string | null;
}

export interface ArtifactSignatureSnapshotVerification extends ArtifactSignatureVerification {
  artifactBytes: Buffer | null;
  signature: ArtifactSignature | null;
}

export function artifactSigPath(path: string): string {
  return `${path}.sig`;
}

function domainSeparatedArtifactDigest(input: {
  artifactKind: ArtifactSignature["artifactKind"];
  artifactSha256: string;
}): string {
  return sha256Hex(Buffer.from(
    `AMC_ARTIFACT_SIGNATURE_V2\0${input.artifactKind}\0${input.artifactSha256}`,
    "utf8"
  ));
}

export function signArtifactFile(input: {
  workspace: string;
  path: string;
  artifactKind: ArtifactSignature["artifactKind"];
}): { sigPath: string; signature: ArtifactSignature } {
  ensureSigningKeys(input.workspace);
  const artifactSha256 = sha256Hex(readFileSync(input.path));
  const digestHex = domainSeparatedArtifactDigest({
    artifactKind: input.artifactKind,
    artifactSha256
  });
  const signed = signDigestWithPolicy({
    workspace: input.workspace,
    kind: "BUNDLE",
    digestHex
  });
  const signature = artifactSignatureSchema.parse({
    schemaVersion: "2026-07-10",
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

export function readAndVerifyArtifactFileSignature(input: {
  workspace: string;
  path: string;
  artifactKind?: ArtifactSignature["artifactKind"];
  requireDomainSeparated?: boolean;
}): ArtifactSignatureSnapshotVerification {
  const sigPath = artifactSigPath(input.path);
  if (!pathExists(input.path)) {
    return {
      valid: false,
      signatureExists: pathExists(sigPath),
      artifactPath: input.path,
      sigPath,
      reason: "artifact missing",
      artifactSha256: null,
      artifactBytes: null,
      signature: null
    };
  }
  if (!pathExists(sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      artifactPath: input.path,
      sigPath,
      reason: "signature missing",
      artifactSha256: null,
      artifactBytes: null,
      signature: null
    };
  }
  try {
    const artifactBytes = readFileSync(input.path);
    const signature = artifactSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    if (input.artifactKind && signature.artifactKind !== input.artifactKind) {
      return {
        valid: false,
        signatureExists: true,
        artifactPath: input.path,
        sigPath,
        reason: `artifact kind mismatch: expected ${input.artifactKind}, got ${signature.artifactKind}`,
        artifactSha256: null,
        artifactBytes,
        signature
      };
    }
    if (input.requireDomainSeparated && signature.schemaVersion !== "2026-07-10") {
      return {
        valid: false,
        signatureExists: true,
        artifactPath: input.path,
        sigPath,
        reason: "legacy artifact signature is not domain-separated",
        artifactSha256: null,
        artifactBytes,
        signature
      };
    }
    const artifactSha256 = sha256Hex(artifactBytes);
    if (artifactSha256 !== signature.artifactSha256) {
      return {
        valid: false,
        signatureExists: true,
        artifactPath: input.path,
        sigPath,
        reason: "digest mismatch",
        artifactSha256,
        artifactBytes,
        signature
      };
    }
    const digestHex = signature.schemaVersion === "2026-07-10"
      ? domainSeparatedArtifactDigest({ artifactKind: signature.artifactKind, artifactSha256 })
      : artifactSha256;
    const valid = verifySignedDigest({
      workspace: input.workspace,
      digestHex,
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
      artifactSha256,
      artifactBytes,
      signature
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      artifactPath: input.path,
      sigPath,
      reason: error instanceof Error ? error.message : String(error),
      artifactSha256: null,
      artifactBytes: null,
      signature: null
    };
  }
}

export function verifyArtifactFileSignature(input: {
  workspace: string;
  path: string;
  artifactKind?: ArtifactSignature["artifactKind"];
  requireDomainSeparated?: boolean;
}): ArtifactSignatureVerification {
  const { artifactBytes: _artifactBytes, signature: _signature, ...verification } = readAndVerifyArtifactFileSignature(input);
  return verification;
}

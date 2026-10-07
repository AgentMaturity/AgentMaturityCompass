import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";

export const opsPolicySchema = z.object({
  opsPolicy: z.object({
    version: z.literal(1),
    retention: z.object({
      prunePayloadsAfterDays: z.number().int().min(1),
      archivePayloadsAfterDays: z.number().int().min(1),
      keepArchiveSegmentsDays: z.number().int().min(1),
      maxPayloadBytesPerEvent: z.number().int().min(1),
      maxBlobBytes: z.number().int().min(1),
      tombstoneInsteadOfDelete: z.literal(true),
      /**
       * Days after which guard events are deleted. Optional: the schema is
       * strict, so a required key would invalidate every already-signed
       * ops-policy.yaml. Absent means "do not prune", which is the behaviour
       * every existing workspace already has.
       */
      pruneGuardEventsAfterDays: z.number().int().min(1).optional()
    }),
    encryption: z.object({
      blobEncryptionEnabled: z.boolean(),
      algorithm: z.literal("AES-256-GCM"),
      keyRotationDays: z.number().int().min(1),
      reencryptOnRotate: z.boolean(),
      aadMode: z.literal("BLOB_ID_AND_VERSION")
    }),
    backups: z.object({
      requireEncryptedBackups: z.boolean(),
      defaultBackupEncryption: z.literal("PASSPHRASE_AES_256_GCM"),
      maxBackupAgeDaysWarning: z.number().int().min(1),
      excludePaths: z.array(z.string().min(1)),
      includePaths: z.array(z.string().min(1))
    }),
    maintenance: z.object({
      autoVacuumOnRetention: z.boolean(),
      vacuumAtMostOnceHours: z.number().int().min(1),
      rotateLogsDays: z.number().int().min(1),
      maxLogFileMb: z.number().int().min(1),
      pruneConsoleSnapshotsDays: z.number().int().min(1),
      pruneTransformSnapshotsDays: z.number().int().min(1)
    })
  })
});

export type OpsPolicy = z.infer<typeof opsPolicySchema>;

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
  envelope?: {
    v: 1;
    alg: "ed25519";
    pubkeyB64: string;
    fingerprint: string;
    sigB64: string;
    signedTs: number;
    signer: {
      type: "VAULT" | "NOTARY";
      attestationLevel: "SOFTWARE" | "HARDWARE";
      notaryFingerprint?: string;
    };
  };
}

export function opsPolicyPath(workspace: string): string {
  return join(workspace, ".amc", "ops-policy.yaml");
}

export function opsPolicySigPath(workspace: string): string {
  return `${opsPolicyPath(workspace)}.sig`;
}

export function defaultOpsPolicy(): OpsPolicy {
  return opsPolicySchema.parse({
    opsPolicy: {
      version: 1,
      retention: {
        prunePayloadsAfterDays: 14,
        archivePayloadsAfterDays: 7,
        keepArchiveSegmentsDays: 3650,
        maxPayloadBytesPerEvent: 65536,
        maxBlobBytes: 10485760,
        tombstoneInsteadOfDelete: true
      },
      encryption: {
        blobEncryptionEnabled: true,
        algorithm: "AES-256-GCM",
        keyRotationDays: 90,
        reencryptOnRotate: false,
        aadMode: "BLOB_ID_AND_VERSION"
      },
      backups: {
        requireEncryptedBackups: true,
        defaultBackupEncryption: "PASSPHRASE_AES_256_GCM",
        maxBackupAgeDaysWarning: 7,
        excludePaths: [".amc/studio/sessions", ".amc/studio/tmp", ".amc/cache"],
        includePaths: [".amc"]
      },
      maintenance: {
        autoVacuumOnRetention: true,
        vacuumAtMostOnceHours: 24,
        rotateLogsDays: 14,
        maxLogFileMb: 50,
        pruneConsoleSnapshotsDays: 30,
        pruneTransformSnapshotsDays: 180
      }
    }
  });
}

export function loadOpsPolicy(workspace: string): OpsPolicy {
  const path = opsPolicyPath(workspace);
  if (!pathExists(path)) {
    return defaultOpsPolicy();
  }
  const parsed = YAML.parse(readFileSync(path, "utf8")) as unknown;
  return opsPolicySchema.parse(parsed);
}

export function signOpsPolicy(workspace: string): string {
  const path = opsPolicyPath(workspace);
  const digest = sha256Hex(readFileSync(path));
  const signed = signDigestWithPolicy({
    workspace,
    kind: "OPS_POLICY",
    digestHex: digest
  });
  const payload: SignedDigest = {
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  };
  const sigPath = opsPolicySigPath(workspace);
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

export function verifyOpsPolicySignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = opsPolicyPath(workspace);
  const sigPath = opsPolicySigPath(workspace);
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "ops policy missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "ops policy signature missing", path, sigPath };
  }
  try {
    const signature = JSON.parse(readFileSync(sigPath, "utf8")) as SignedDigest;
    const digest = sha256Hex(readFileSync(path));
    if (digest !== signature.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    }
    const valid = verifySignedDigest({
      workspace,
      digestHex: digest,
      signed: {
        signature: signature.signature,
        envelope: signature.envelope
      }
    }) || verifyHexDigestAny(digest, signature.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
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

export function initOpsPolicy(workspace: string): { configPath: string; sigPath: string } {
  ensureDir(join(workspace, ".amc"));
  const configPath = opsPolicyPath(workspace);
  writeFileAtomic(configPath, YAML.stringify(defaultOpsPolicy()), 0o644);
  const sigPath = signOpsPolicy(workspace);
  return {
    configPath,
    sigPath
  };
}

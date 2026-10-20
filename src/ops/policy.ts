import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { signingPurposeForKind } from "../crypto/signing/signerTypes.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOwnerMode } from "../mode/mode.js";

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

const BODY = ".amc/ops-policy.yaml", SIG = `${BODY}.sig`;
const pair = (workspace: string) => ({ body: readContainedOrNull(workspace, BODY, Number.MAX_SAFE_INTEGER), signature: readContainedOrNull(workspace, SIG, 64 * 1024) });
const equal = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
function signatureBytes(signed: SignedDigest): string {
  return JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2);
}
export class OpsPolicyPublicationError extends Error {
  readonly code = "OPS_POLICY_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], cause: unknown) {
    super("ops policy publication is incomplete; inspect the published pair before retrying", { cause }); this.name = "OpsPolicyPublicationError";
  }
}
interface OpsPolicyOptions { onlyIfMissing?: boolean; beforePublish?: () => void }
function prepare(workspace: string, initialize: boolean, options: OpsPolicyOptions = {}, validate = false) {
  const beforePublish = options.beforePublish, onlyIfMissing = options.onlyIfMissing === true;
  beforePublish?.();
  const previous = pair(workspace);
  if (onlyIfMissing && (previous.body !== null || previous.signature !== null)) throw new Error("ops policy pair is no longer absent; retry");
  const bytes = initialize ? Buffer.from(YAML.stringify(defaultOpsPolicy())) : previous.body;
  if (bytes === null) throw new Error("ops policy missing");
  if (validate) opsPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  return { workspace, initialize, beforePublish, previous, bytes };
}
function publish(plan: ReturnType<typeof prepare>, signed: SignedDigest, finalAuthority?: () => void): { configPath: string; sigPath: string } {
  return withControlFileLock({ root: join(plan.workspace, ".amc"), name: "ops-policy-pair", operation: () => {
    plan.beforePublish?.(); finalAuthority?.();
    const current = pair(plan.workspace);
    if (!equal(current.body, plan.previous.body) || !equal(current.signature, plan.previous.signature)) throw new Error("ops policy or signature changed while signing; retry");
    const published: string[] = [];
    try {
      if (plan.initialize) { writeContained(plan.workspace, BODY, plan.bytes, 0o644); published.push(BODY); }
      writeContained(plan.workspace, SIG, signatureBytes(signed), 0o644); published.push(SIG);
    } catch (error) { if (published.length > 0) throw new OpsPolicyPublicationError(Object.freeze([...published]), error); throw error; }
    return { configPath: opsPolicyPath(plan.workspace), sigPath: opsPolicySigPath(plan.workspace) };
  } });
}
/** Retained synchronous SDK path; signing refuses before any pair member is replaced. */
export function signOpsPolicy(workspace: string): string {
  const plan = prepare(workspace, false), signed = signDigestWithPolicy({ workspace, kind: "OPS_POLICY", digestHex: sha256Hex(plan.bytes) });
  return publish(plan, signed).sigPath;
}
async function publishAsync(workspace: string, initialize: boolean, options: OpsPolicyOptions = {}): Promise<{ configPath: string; sigPath: string }> {
  if (initialize) assertOwnerMode(workspace, "ops init");
  const plan = prepare(workspace, initialize, options, true), descriptor = describePolicySigner(workspace, "OPS_POLICY");
  const purpose = signingPurposeForKind("OPS_POLICY"), policy = JSON.stringify(loadTrustConfig(workspace));
  const captured = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, purpose) : null;
  const provider = boundProviderKey(workspace, purpose)?.binding.provider ?? "file";
  const signed = await signDigestWithPolicyAsync({ workspace, kind: "OPS_POLICY", digestHex: sha256Hex(plan.bytes), expectedSigner: descriptor });
  return publish(plan, signed, () => {
    if (initialize) assertOwnerMode(workspace, "ops init");
    assertPolicySignerCurrent(workspace, descriptor);
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy) throw new Error("ops policy signing policy changed while signing");
    if (captured !== null) {
      if (signed.envelope === undefined) throw new Error("prepared ops policy signature has no envelope");
      assertPurposePublicationCurrent(workspace, captured, { provider, algorithm: signed.envelope.alg, keyId: descriptor.fingerprint,
        publicKeyPem: descriptor.publicKeyPem, signature: Buffer.from(signed.signature, "base64") });
    }
  });
}
export async function signOpsPolicyAsync(workspace: string, options: OpsPolicyOptions = {}): Promise<string> {
  return (await publishAsync(workspace, false, options)).sigPath;
}
export function initOpsPolicyAsync(workspace: string, options: OpsPolicyOptions = {}): Promise<{ configPath: string; sigPath: string }> {
  return publishAsync(workspace, true, options);
}

export function verifyOpsPolicyBytes(workspace: string, body: Buffer | null, sidecar: Buffer | null): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = opsPolicyPath(workspace);
  const sigPath = opsPolicySigPath(workspace);
  if (body === null) {
    return { valid: false, signatureExists: false, reason: "ops policy missing", path, sigPath };
  }
  if (sidecar === null) {
    return { valid: false, signatureExists: false, reason: "ops policy signature missing", path, sigPath };
  }
  try {
    const verified = verifyAuditorSignatureBytes(workspace, "OPS_POLICY", body, sidecar);
    return {
      valid: verified.valid,
      signatureExists: true,
      reason: verified.reason === "invalid file signature" ? "invalid ops policy signature" : verified.reason,
      path,
      sigPath
    };
  } catch {
    return {
      valid: false,
      signatureExists: true,
      reason: "invalid ops policy signature",
      path,
      sigPath
    };
  }
}

/** Current-file facade; consumers already holding a verified input pair use verifyOpsPolicyBytes without reopening it. */
export function verifyOpsPolicySignature(workspace: string): ReturnType<typeof verifyOpsPolicyBytes> {
  try { const current = pair(workspace); return verifyOpsPolicyBytes(workspace, current.body, current.signature); }
  catch { return { valid: false, signatureExists: pathExists(opsPolicySigPath(workspace)), reason: "invalid ops policy signature", path: opsPolicyPath(workspace), sigPath: opsPolicySigPath(workspace) }; }
}

/** Fresh workspace/bootstrap compatibility API; no provider-error fallback is attempted. */
export function initOpsPolicy(workspace: string): { configPath: string; sigPath: string } {
  const plan = prepare(workspace, true), signed = signDigestWithPolicy({ workspace, kind: "OPS_POLICY", digestHex: sha256Hex(plan.bytes) });
  return publish(plan, signed);
}

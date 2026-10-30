import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
import { capturePublicConfigAuthority } from "../config/configSignaturePair.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { assertRetentionMeetsRegimes } from "./retention/regimeRetention.js";

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
      aadMode: z.literal("BLOB_ID_AND_VERSION"),
      /** P2-09: encrypt inline evidence payloads under provider-wrapped data keys. Optional; absent means off. */
      ledgerEncryptionEnabled: z.boolean().optional()
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
interface OpsInitializationMember { path: string; attempted: boolean; returned: boolean; acknowledged: boolean }
interface OpsInitializationObservation {
  lock: Readonly<{ attempted: boolean; entered: boolean; returned: boolean }>;
  members: readonly Readonly<OpsInitializationMember>[];
}
export class OpsPolicyInitializationPartialError extends OpsPolicyPublicationError {
  constructor(paths: readonly string[], cause: unknown, readonly observation: OpsInitializationObservation) {
    super(paths, cause); this.name = "OpsPolicyInitializationPartialError";
  }
}
interface MissingOpsPublication {
  lockEntered(): void;
  beforeBody(): void;
  bodyReturned(): void;
  beforeSignature(): void;
  signatureReturned(bytes: Buffer): void;
  pairReturned(): void;
}
const missingOpsPublications = new WeakMap<ReturnType<typeof prepare>, MissingOpsPublication>();
interface OpsPolicyOptions { onlyIfMissing?: boolean; beforePublish?: () => void }
function prepare(workspace: string, initialize: boolean, options: OpsPolicyOptions = {}, validate = false) {
  const beforePublish = options.beforePublish, onlyIfMissing = options.onlyIfMissing === true;
  beforePublish?.();
  const previous = pair(workspace);
  if (onlyIfMissing && (previous.body !== null || previous.signature !== null)) throw new Error("ops policy pair is no longer absent; retry");
  const bytes = initialize ? Buffer.from(YAML.stringify(defaultOpsPolicy())) : previous.body;
  if (bytes === null) throw new Error("ops policy missing");
  if (validate || !initialize) {
    const parsed = opsPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
    // P2-26: applying (signing) a policy whose pruning undercuts an applicable regime's floor is refused, naming the regime.
    if (!initialize) assertRetentionMeetsRegimes(workspace, parsed);
  }
  return { workspace, initialize, beforePublish, previous, bytes };
}
function assertPairCurrent(workspace: string, previous: ReturnType<typeof pair>): void {
  const current = pair(workspace);
  if (!equal(current.body, previous.body) || !equal(current.signature, previous.signature)) throw new Error("ops policy or signature changed while signing; retry");
}
function publish(plan: ReturnType<typeof prepare>, signed: SignedDigest, finalAuthority?: () => void): { configPath: string; sigPath: string } {
  const retained = missingOpsPublications.get(plan);
  return withControlFileLock({ root: join(plan.workspace, ".amc"), name: "ops-policy-pair", operation: () => {
    retained?.lockEntered();
    plan.beforePublish?.(); finalAuthority?.();
    assertPairCurrent(plan.workspace, plan.previous);
    const published: string[] = [];
    try {
      if (retained === undefined) {
        if (plan.initialize) { writeContained(plan.workspace, BODY, plan.bytes, 0o644); published.push(BODY); }
        writeContained(plan.workspace, SIG, signatureBytes(signed), 0o644); published.push(SIG);
      } else {
        retained.beforeBody();
        writeContained(plan.workspace, BODY, plan.bytes, 0o644); published.push(BODY);
        retained.bodyReturned();
        const bytes = Buffer.from(signatureBytes(signed));
        retained.beforeSignature();
        writeContained(plan.workspace, SIG, bytes, 0o644); published.push(SIG);
        retained.signatureReturned(bytes); retained.pairReturned();
      }
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
  const beforeSign = () => { plan.beforePublish?.(); if (initialize) assertOwnerMode(workspace, "ops init"); assertPairCurrent(workspace, plan.previous); };
  const signed = await signDigestWithPolicyAsync({ workspace, kind: "OPS_POLICY", digestHex: sha256Hex(plan.bytes), expectedSigner: descriptor, beforeSign });
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

/** Internal missing-only attempt. Captures before earlier waits; existing reset/sign APIs remain separate. */
export function captureMissingOpsPolicyInitialization(workspace: string, beforePublish: () => void) {
  const root = resolve(workspace), caller = beforePublish, noSignAtEntry = process.env.AMC_NO_SIGN === "1";
  const enabled = () => {
    if (noSignAtEntry || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  };
  enabled();
  const plan = prepare(root, true, { onlyIfMissing: true }, true);
  const previous = captureOrgPairs([opsPolicyPath(root)]);
  if (orgPairBytes(previous, opsPolicyPath(root)) !== null || orgPairBytes(previous, opsPolicySigPath(root)) !== null)
    throw new Error("ops policy pair is no longer absent; retry");
  assertPairCurrent(root, plan.previous); assertOrgPairsCurrent(previous);
  const descriptor = describePolicySigner(root, "OPS_POLICY"), policy = JSON.stringify(loadTrustConfig(root));
  const publicCurrent = descriptor.mode === "VAULT" ? capturePublicConfigAuthority(root) : null;
  const provider = descriptor.mode === "VAULT" ? boundProviderKey(root, "config-signature")?.binding.provider ?? "file" : null;
  const expected = new Map(previous.members.map(row => [row.path, row]));
  const body: OpsInitializationMember = { path: BODY, attempted: false, returned: false, acknowledged: false };
  const sidecar: OpsInitializationMember = { path: SIG, attempted: false, returned: false, acknowledged: false };
  const lock = { attempted: false, entered: false, returned: false };
  let failure: { cause: unknown } | null = null, entered = false, completed = false;
  let signatureCurrent: (() => void) | null = null;
  const checked = (operation: () => void) => {
    if (failure !== null) throw failure.cause;
    try { operation(); } catch (cause) { failure = { cause }; throw cause; }
  };
  const authority = () => {
    enabled(); assertOwnerMode(root, "ops init"); publicCurrent?.();
    assertPolicySignerCurrent(root, descriptor);
    if (JSON.stringify(loadTrustConfig(root)) !== policy) throw new Error("ops policy signing policy changed while signing");
    enabled();
  };
  const assertCurrent = () => checked(() => {
    authority(); signatureCurrent?.();
    pair(root); // Retain contained regular/single-link constraints as well as strict identity/bytes/mode.
    assertOrgPairsCurrent({ members: [...expected.values()] });
  });
  const actor = () => checked(() => { assertCurrent(); caller(); assertCurrent(); });
  const observation = (): OpsInitializationObservation => Object.freeze({ lock: Object.freeze({ ...lock }),
    members: Object.freeze([body, sidecar].map(row => Object.freeze({ ...row }))) });
  const publishedPaths = (): readonly string[] => Object.freeze([body, sidecar].filter(row => row.returned).map(row => row.path));
  const acknowledge = (member: OpsInitializationMember, intended: Buffer) => checked(() => {
    authority(); signatureCurrent?.();
    const path = join(root, member.path);
    assertOrgPairsCurrent({ members: [...expected.values()].filter(row => row.path !== path) });
    pair(root);
    const own = captureOrgFiles([path]).members[0]!;
    if (own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(intended))
      throw new Error("initialized ops policy member differs from its actual prepared publication");
    // writeContained exposes no inode: this is a matching point-read after actual return, not native attribution.
    expected.set(path, own);
    assertCurrent(); member.acknowledged = true;
  });
  actor();
  return Object.freeze({ assertCurrent, observation, publishedPaths,
    assertCompleted() {
      if (!completed) throw new Error("missing ops initialization has not completed its actual final gate");
      assertCurrent();
    },
    async initialize(): Promise<{ configPath: string; sigPath: string }> {
      if (entered) throw new Error("missing ops initialization attempt has already entered"); entered = true;
      try {
        actor();
        // Keep normal private warming at the real ops stage, after earlier mature effects and the actor.
        const captured = descriptor.mode === "VAULT" ? capturePurposePublication(root, "config-signature") : null;
        actor();
        const signed = await signDigestWithPolicyAsync({ workspace: root, kind: "OPS_POLICY", digestHex: sha256Hex(plan.bytes),
          expectedSigner: descriptor, beforeSign: actor });
        actor();
        signatureCurrent = () => {
          authority();
          if (captured !== null) {
            if (signed.envelope === undefined || provider === null) throw new Error("prepared ops policy signature has no envelope");
            assertPurposePublicationCurrent(root, captured, { provider, algorithm: signed.envelope.alg, keyId: descriptor.fingerprint,
              publicKeyPem: descriptor.publicKeyPem, signature: Buffer.from(signed.signature, "base64") });
          }
        };
        assertCurrent();
        missingOpsPublications.set(plan, {
          lockEntered() { lock.entered = true; },
          beforeBody() {
            actor();
            if (body.attempted || sidecar.attempted) throw new Error("missing ops body stage is out of order");
            body.attempted = true;
          },
          bodyReturned() {
            body.returned = true; acknowledge(body, plan.bytes);
          },
          beforeSignature() {
            actor();
            if (!body.acknowledged || sidecar.attempted) throw new Error("missing ops signature stage is out of order");
            sidecar.attempted = true;
          },
          signatureReturned(bytes) {
            sidecar.returned = true; acknowledge(sidecar, bytes);
          },
          pairReturned() { actor(); }
        });
        lock.attempted = true;
        const result = publish(plan, signed, actor); lock.returned = true;
        actor();
        if (!body.acknowledged || !sidecar.acknowledged) throw new Error("missing ops pair was not acknowledged");
        completed = true; return result;
      } catch (cause) {
        if (failure === null) failure = { cause };
        throw new OpsPolicyInitializationPartialError(publishedPaths(), cause, observation());
      } finally { missingOpsPublications.delete(plan); }
    }
  });
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

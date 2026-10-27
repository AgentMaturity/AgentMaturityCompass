import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { actionPolicySchema, type ActionPolicy } from "./actionPolicySchema.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOwnerMode } from "../mode/mode.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { verifyCurrentPurposeCredentialSignature } from "../keys/purposeCredentialSignature.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { canonicalSigningKey, verifyWithKey } from "../keys/algorithmPolicy.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { assertSigningKeyUsable, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { vaultStatus } from "../vault/vault.js";
import { canonicalize } from "../utils/json.js";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";

export const ACTION_POLICY_WRITER_LOCK = "action-policy-writer" as const;

export function actionPolicyWriterPendingPath(workspace: string): string {
  return join(workspace, ".amc", ".action-policy-writer.pending.json");
}

export function assertActionPolicyWriterReady(workspace: string): void {
  if (pathExists(actionPolicyWriterPendingPath(workspace))) {
    throw new Error("Action Policy writer recovery is pending; retry the original exact-confirm apply first.");
  }
}

interface ActionPolicySignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export function actionPolicyPath(workspace: string): string {
  return join(workspace, ".amc", "action-policy.yaml");
}

export function actionPolicySigPath(workspace: string): string {
  return `${actionPolicyPath(workspace)}.sig`;
}

function signActionPolicyDigest(workspace: string, digest: string): string {
  return signHexDigest(digest, getSigningKey(workspace, "config-signature"));
}

export function defaultActionPolicy(): ActionPolicy {
  return actionPolicySchema.parse({
    version: 1,
    defaultMode: "DENY",
    riskTierDefaults: {
      low: { requireSandboxForExecute: false },
      medium: { requireSandboxForExecute: true },
      high: { requireSandboxForExecute: true },
      critical: { requireSandboxForExecute: true }
    },
    actions: [
      {
        actionClass: "READ_ONLY",
        minEffectiveQuestionLevels: {
          "AMC-1.7": 2,
          "AMC-3.3.1": 2
        },
        requireTrustTierAtLeast: "OBSERVED",
        requireAssurancePacks: {
          injection: { minScore: 60, maxSucceeded: 0 }
        },
        allowExecute: true,
        requireExecTicket: false
      },
      {
        actionClass: "WRITE_LOW",
        minEffectiveQuestionLevels: {
          "AMC-1.7": 3,
          "AMC-1.8": 3,
          "AMC-3.3.1": 3,
          "AMC-4.6": 3
        },
        requireTrustTierAtLeast: "OBSERVED",
        requireAssurancePacks: {
          unsafe_tooling: { minScore: 75, maxSucceeded: 0 },
          governance_bypass: { minScore: 75, maxSucceeded: 0 }
        },
        allowExecute: true,
        requireExecTicket: false
      },
      {
        actionClass: "WRITE_HIGH",
        minEffectiveQuestionLevels: {
          "AMC-1.8": 4,
          "AMC-1.7": 4,
          "AMC-3.3.1": 4,
          "AMC-4.6": 4
        },
        requireTrustTierAtLeast: "OBSERVED_HARDENED",
        requireAssurancePacks: {
          unsafe_tooling: { minScore: 85, maxSucceeded: 0 },
          governance_bypass: { minScore: 85, maxSucceeded: 0 }
        },
        allowExecute: true,
        requireExecTicket: true
      },
      {
        actionClass: "DEPLOY",
        minEffectiveQuestionLevels: {
          "AMC-1.8": 4,
          "AMC-1.7": 4,
          "AMC-1.5": 4,
          "AMC-2.5": 3,
          "AMC-3.3.1": 4,
          "AMC-3.3.4": 3,
          "AMC-4.6": 4,
          "AMC-5.3": 3
        },
        requireTrustTierAtLeast: "OBSERVED_HARDENED",
        requireAssurancePacks: {
          unsafe_tooling: { minScore: 85, maxSucceeded: 0 },
          governance_bypass: { minScore: 85, maxSucceeded: 0 },
          hallucination: { minScore: 85, maxSucceeded: 0 }
        },
        allowExecute: true,
        requireExecTicket: true
      },
      {
        actionClass: "SECURITY",
        minEffectiveQuestionLevels: {
          "AMC-1.8": 5,
          "AMC-3.2.3": 5,
          "AMC-3.3.1": 5,
          "AMC-4.6": 5
        },
        requireTrustTierAtLeast: "OBSERVED_HARDENED",
        requireAssurancePacks: {
          exfiltration: { minScore: 90, maxSucceeded: 0 },
          injection: { minScore: 90, maxSucceeded: 0 },
          governance_bypass: { minScore: 90, maxSucceeded: 0 }
        },
        allowExecute: false,
        requireExecTicket: true
      },
      {
        actionClass: "FINANCIAL",
        minEffectiveQuestionLevels: {
          "AMC-1.8": 5,
          "AMC-3.3.1": 5,
          "AMC-4.6": 5
        },
        requireTrustTierAtLeast: "OBSERVED_HARDENED",
        requireAssurancePacks: {
          governance_bypass: { minScore: 90, maxSucceeded: 0 },
          hallucination: { minScore: 90, maxSucceeded: 0 }
        },
        allowExecute: false,
        requireExecTicket: true
      },
      {
        actionClass: "NETWORK_EXTERNAL",
        minEffectiveQuestionLevels: {
          "AMC-1.5": 4,
          "AMC-1.8": 4,
          "AMC-4.6": 4
        },
        requireTrustTierAtLeast: "OBSERVED_HARDENED",
        requireAssurancePacks: {
          exfiltration: { minScore: 85, maxSucceeded: 0 },
          injection: { minScore: 85, maxSucceeded: 0 }
        },
        allowExecute: false,
        requireExecTicket: true
      },
      {
        actionClass: "DATA_EXPORT",
        minEffectiveQuestionLevels: {
          "AMC-1.8": 5,
          "AMC-3.2.3": 5,
          "AMC-3.3.1": 5
        },
        requireTrustTierAtLeast: "OBSERVED_HARDENED",
        requireAssurancePacks: {
          exfiltration: { minScore: 90, maxSucceeded: 0 }
        },
        allowExecute: false,
        requireExecTicket: true
      },
      {
        actionClass: "IDENTITY",
        minEffectiveQuestionLevels: {
          "AMC-1.8": 5,
          "AMC-3.2.3": 5,
          "AMC-4.6": 5
        },
        requireTrustTierAtLeast: "OBSERVED_HARDENED",
        requireAssurancePacks: {
          governance_bypass: { minScore: 90, maxSucceeded: 0 },
          injection: { minScore: 90, maxSucceeded: 0 }
        },
        allowExecute: false,
        requireExecTicket: true
      }
    ]
  });
}

export function loadActionPolicy(workspace: string, explicitPath?: string): ActionPolicy {
  const file = explicitPath ? resolve(workspace, explicitPath) : actionPolicyPath(workspace);
  if (!pathExists(file)) {
    throw new Error(`Action policy not found: ${file}`);
  }
  return actionPolicySchema.parse(YAML.parse(readUtf8(file)) as unknown);
}

export function signActionPolicyWithLockHeld(workspace: string, explicitPath?: string): string {
  const file = explicitPath ? resolve(workspace, explicitPath) : actionPolicyPath(workspace);
  if (!pathExists(file)) {
    throw new Error(`Action policy not found: ${file}`);
  }
  const digest = sha256Hex(readFileSync(file));
  const payload: ActionPolicySignature = {
    digestSha256: digest,
    signature: signActionPolicyDigest(workspace, digest),
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = `${file}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

export function signActionPolicy(workspace: string, explicitPath?: string): string {
  const plan = captureActionPolicyPlan(workspace, undefined, { explicitPath }, false);
  return completeActionPolicyPlan(plan, signActionPolicyDigest(workspace, plan.digest)).publish().signaturePath;
}

export function initActionPolicy(workspace: string, policy?: ActionPolicy): { policyPath: string; signaturePath: string } {
  assertOwnerMode(workspace, "policy action init"); ensureDir(join(workspace, ".amc"));
  const bytes = Buffer.from(YAML.stringify(actionPolicySchema.parse(policy ?? defaultActionPolicy())), "utf8");
  const plan = captureActionPolicyPlan(workspace, bytes, { beforePublish() { assertOwnerMode(workspace, "policy action init"); } });
  return completeActionPolicyPlan(plan, signActionPolicyDigest(workspace, plan.digest)).publish();
}

export function verifyActionPolicySignature(workspace: string, explicitPath?: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = explicitPath ? resolve(workspace, explicitPath) : actionPolicyPath(workspace);
  const sigPath = `${path}.sig`;
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "action policy missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "action policy signature missing", path, sigPath };
  }
  try {
    const sig = JSON.parse(readUtf8(sigPath)) as ActionPolicySignature;
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    }
    assertKeysetComplete(workspace);
    const valid = verifyCurrentPurposeCredentialSignature(workspace, "config-signature", Buffer.from(digest, "hex"), Buffer.from(sig.signature, "base64"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch {
    return {
      valid: false,
      signatureExists: true,
      reason: "invalid action policy signature",
      path,
      sigPath
    };
  }
}


export interface ActionPolicyPairOptions {
  explicitPath?: string; onlyIfMissing?: boolean;
  beforePublish?: () => void; assertInputsCurrent?: () => void;
}

/** Original committed config holder; no private getter or invented checked signature in resumed gates. */
function captureActionPolicyAuthority(workspace: string) {
  const captured = capturePurposePublication(workspace, "config-signature"), bound = boundProviderKey(workspace, "config-signature");
  const holder = bound?.binding.provider ?? "file", publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature");
  const algorithm = canonicalSigningKey(publicKeyPem)?.algorithm;
  if (algorithm === undefined) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original action-policy config signer is unsupported");
  const assertCurrent = () => {
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset || !policy.allowed.includes(algorithm)
      || (holder === "file" && policy.requireNonExportable))
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original action-policy config authority changed or is refused");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
    if (holder === "file" && !vaultStatus(workspace).unlocked)
      throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
  };
  assertCurrent(); return { captured, publicKeyPem, assertCurrent };
}

function withActionPolicyLock<T>(file: string, operation: () => T): T {
  return withControlFileLock({ root: dirname(file), name: ACTION_POLICY_WRITER_LOCK, timeoutMs: 500, operation });
}
function captureActionPolicyPlan(workspace: string, replacement?: Uint8Array, options: ActionPolicyPairOptions = {}, validate = true) {
  const file = options.explicitPath ? resolve(workspace, options.explicitPath) : actionPolicyPath(workspace);
  const copy = replacement === undefined ? undefined : Buffer.from(replacement), onlyIfMissing = options.onlyIfMissing === true;
  const beforePublish = options.beforePublish, assertInputsCurrent = options.assertInputsCurrent;
  beforePublish?.(); assertActionPolicyWriterReady(workspace);
  const before = withActionPolicyLock(file, () => { assertActionPolicyWriterReady(workspace); return captureOrgPairs([file]); });
  const previous = orgPairBytes(before, file);
  if (onlyIfMissing && previous !== null) throw new Error("action policy appeared while initializing; retry");
  const bytes = copy ?? previous;
  if (bytes === null) throw new Error(`Action policy not found: ${file}`);
  // Async/prepared bodies are schema checked without reserializing their actual reviewed bytes.
  // The retained sync sign-only API preserves its original raw-body signing contract.
  if (validate) actionPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const original = captureActionPolicyAuthority(workspace); // Ordinary entry warm/migration stays OUTSIDE the writer lock.
  const digest = sha256Hex(bytes);
  const beforeSign = () => { beforePublish?.(); assertInputsCurrent?.(); assertActionPolicyWriterReady(workspace); original.assertCurrent(); assertOrgPairsCurrent(before); };
  beforeSign(); return { workspace, file, bytes, digest, replacement: copy !== undefined, before, original, beforePublish, assertInputsCurrent, beforeSign };
}
function completeActionPolicyPlan(plan: ReturnType<typeof captureActionPolicyPlan>, signature: string, checkedCurrent?: () => void) {
  const { workspace, file, bytes, digest } = plan, signaturePath = `${file}.sig`;
  let published: OrgPairsSnapshot | null = null;
  const assertSignatureCurrent = () => {
    plan.original.assertCurrent(); checkedCurrent?.();
    if (!verifyWithKey(Buffer.from(digest, "hex"), plan.original.publicKeyPem, Buffer.from(signature, "base64")))
      throw new Error("prepared action-policy signature does not match its original config authority");
  };
  assertSignatureCurrent();
  const assertCurrent = () => { plan.beforePublish?.(); assertActionPolicyWriterReady(workspace); assertSignatureCurrent(); assertOrgPairsCurrent(published ?? plan.before); };
  // Only the observed branch adds member callbacks; the old no-observer publisher below is literal.
  const publishObserved = (recorded: (path: string) => void) => {
    let expected = plan.before;
    const signatureBytes = Buffer.from(JSON.stringify({ digestSha256: digest, signature, signedTs: Date.now(), signer: "auditor" } satisfies ActionPolicySignature, null, 2));
    const guard = () => { plan.beforePublish?.(); plan.assertInputsCurrent?.(); assertActionPolicyWriterReady(workspace); assertSignatureCurrent(); assertOrgPairsCurrent(expected); };
    const committed: string[] = []; let attemptedPath = plan.replacement ? file : signaturePath;
    try {
      for (const member of plan.replacement ? [{ path: file, bytes }, { path: signaturePath, bytes: signatureBytes }] : [{ path: signaturePath, bytes: signatureBytes }]) {
        guard(); attemptedPath = member.path;
        writeFileAtomic(member.path, member.bytes, 0o644); committed.push(member.path);
        const own = captureOrgFiles([member.path]).members[0];
        if (own === undefined || own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(member.bytes))
          throw new Error("published action-policy member differs from its actual prepared bytes");
        expected = { members: expected.members.map(old => old.path === member.path ? own : old) };
        recorded(member.path); guard();
      }
      published = expected; return { policyPath: file, signaturePath };
    } catch (cause) { throw new ActionPolicyPublicationError(Object.freeze([...committed]), attemptedPath, cause); }
  };
  return { bytes: Buffer.from(bytes), digestSha256: digest, assertCurrent,
    publishWithLockHeld(recorded: (path: string) => void) { return publishObserved(recorded); },
    publish(recorded?: (path: string) => void) {
    if (recorded !== undefined) return withActionPolicyLock(file, () => publishObserved(recorded));
    return withActionPolicyLock(file, () => {
      plan.beforePublish?.(); plan.assertInputsCurrent?.(); assertActionPolicyWriterReady(workspace); assertSignatureCurrent();
      const sidecar: ActionPolicySignature = { digestSha256: digest, signature, signedTs: Date.now(), signer: "auditor" };
      const signatureBytes = Buffer.from(JSON.stringify(sidecar, null, 2));
      assertOrgPairsCurrent(plan.before); // The exact destination check is last, after every caller/authority check.
      const committed: string[] = []; let attemptedPath = plan.replacement ? file : signaturePath;
      try {
        if (plan.replacement) { writeFileAtomic(file, bytes, 0o644); committed.push(file); }
        attemptedPath = signaturePath; writeFileAtomic(signaturePath, signatureBytes, 0o644); committed.push(signaturePath);
        const observed = captureOrgPairs([file]);
        const expectedBodyMode = plan.replacement ? 0o644 : plan.before.members.find(row => row.path === file)?.mode;
        if (!orgPairBytes(observed, file)?.equals(bytes) || !orgPairBytes(observed, signaturePath)?.equals(signatureBytes)
          || observed.members.find(row => row.path === file)?.mode !== expectedBodyMode
          || observed.members.find(row => row.path === signaturePath)?.mode !== 0o644)
          throw new Error("published action-policy pair differs from its acknowledged prepared bytes");
        published = observed;
      } catch (cause) { throw new ActionPolicyPublicationError(Object.freeze([...committed]), attemptedPath, cause); }
      return { policyPath: file, signaturePath };
    });
  } };
}
export class ActionPolicyPublicationError extends Error {
  readonly code = "ACTION_POLICY_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("action-policy pair publication is incomplete; earlier members remain committed", { cause }); this.name = "ActionPolicyPublicationError";
  }
}

/** Used checked raw config-purpose seam. Caller options can add refusal, never choose authority or replace gates. */
export async function prepareActionPolicyPair(workspace: string, replacement?: Uint8Array, options: ActionPolicyPairOptions = {}) {
  const plan = captureActionPolicyPlan(workspace, replacement, options);
  const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(plan.digest, "hex"), { beforeSign: plan.beforeSign });
  plan.beforeSign();
  return completeActionPolicyPlan(plan, signed.signature.toString("base64"), () => assertPurposePublicationCurrent(workspace, plan.original.captured, signed));
}
/** Maintained initializer: retain the actual existing mode key at entry, before Sign and final publication. */
export async function initActionPolicyAsync(workspace: string, policy?: ActionPolicy, opts: Omit<ActionPolicyPairOptions, "explicitPath"> = {}): Promise<{ policyPath: string; signaturePath: string }> {
  assertOwnerMode(workspace, "policy action init");
  const bytes = Buffer.from(YAML.stringify(actionPolicySchema.parse(policy ?? defaultActionPolicy())), "utf8");
  const caller = opts.beforePublish, assertInputsCurrent = opts.assertInputsCurrent, onlyIfMissing = opts.onlyIfMissing;
  const prepared = await prepareActionPolicyPair(workspace, bytes, { onlyIfMissing, assertInputsCurrent,
    beforePublish() { caller?.(); assertOwnerMode(workspace, "policy action init"); } });
  return prepared.publish();
}

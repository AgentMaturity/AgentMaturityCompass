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
import { assertKeysetComplete } from "../keys/keyset.js";

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
  const file = explicitPath ? resolve(workspace, explicitPath) : actionPolicyPath(workspace);
  return withControlFileLock({
    root: dirname(file),
    name: ACTION_POLICY_WRITER_LOCK,
    timeoutMs: 500,
    operation: () => {
      assertActionPolicyWriterReady(workspace);
      return signActionPolicyWithLockHeld(workspace, explicitPath);
    },
  });
}

export function initActionPolicy(workspace: string, policy?: ActionPolicy): {
  policyPath: string;
  signaturePath: string;
} {
  assertOwnerMode(workspace, "policy action init");
  ensureDir(join(workspace, ".amc"));
  const targetPath = actionPolicyPath(workspace);
  return withControlFileLock({
    root: dirname(targetPath),
    name: ACTION_POLICY_WRITER_LOCK,
    timeoutMs: 500,
    operation: () => {
      assertActionPolicyWriterReady(workspace);
      const parsed = actionPolicySchema.parse(policy ?? defaultActionPolicy());
      getSigningKey(workspace, "config-signature"); // Refuse before the existing synchronous initializer replaces any body.
      assertOwnerMode(workspace, "policy action init");
      writeFileAtomic(targetPath, YAML.stringify(parsed), 0o644);
      const signaturePath = signActionPolicyWithLockHeld(workspace);
      return {
        policyPath: targetPath,
        signaturePath
      };
    },
  });
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


/** The actual init producer prepares remotely outside the existing shared writer/recovery lock. */
export async function initActionPolicyAsync(workspace: string, policy?: ActionPolicy, opts: { onlyIfMissing?: boolean } = {}): Promise<{ policyPath: string; signaturePath: string }> {
  assertOwnerMode(workspace, "policy action init");
  const targetPath = actionPolicyPath(workspace), signaturePath = actionPolicySigPath(workspace);
  const bytes = Buffer.from(YAML.stringify(actionPolicySchema.parse(policy ?? defaultActionPolicy())), "utf8");
  const pair = () => ({ body: pathExists(targetPath) ? readFileSync(targetPath) : null,
    signature: pathExists(signaturePath) ? readFileSync(signaturePath) : null });
  const prepared = withControlFileLock({
    root: dirname(targetPath), name: ACTION_POLICY_WRITER_LOCK, timeoutMs: 500,
    operation: () => {
      assertActionPolicyWriterReady(workspace);
      const previous = pair();
      if (opts.onlyIfMissing === true && previous.body !== null) throw new Error("action policy appeared while initializing; retry");
      return { previous, authority: capturePurposePublication(workspace, "config-signature") };
    }
  });
  const digest = sha256Hex(bytes), signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digest, "hex"));
  return withControlFileLock({
    root: dirname(targetPath), name: ACTION_POLICY_WRITER_LOCK, timeoutMs: 500,
    operation: () => {
      assertActionPolicyWriterReady(workspace);
      const current = pair(), equal = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
      if (!equal(prepared.previous.body, current.body) || !equal(prepared.previous.signature, current.signature)) {
        throw new Error("action policy or signature changed while signing; retry");
      }
      assertPurposePublicationCurrent(workspace, prepared.authority, signed);
      assertOwnerMode(workspace, "policy action init");
      const sidecar: ActionPolicySignature = { digestSha256: digest, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" };
      writeFileAtomic(targetPath, bytes, 0o644);
      writeFileAtomic(signaturePath, JSON.stringify(sidecar, null, 2), 0o644);
      return { policyPath: targetPath, signaturePath };
    }
  });
}

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { ActionClass } from "../types.js";
import { approvalPolicySchema, type ApprovalClassPolicy, type ApprovalPolicy } from "./approvalPolicySchema.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";

interface SignaturePayload {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export interface ApprovalPolicyConditionResult {
  conditionId: string;
  label: string;
  passed: boolean | null;
  actual: string | number | boolean | null;
  expected: string | number | boolean | null;
  reason: string;
}

export interface ApprovalRequestPolicyEvaluation {
  allowed: boolean;
  outcome: "allow" | "require_approval" | "deny";
  matchedRuleId: string;
  rule: ApprovalClassPolicy | null;
  reasons: string[];
  conditionResults: ApprovalPolicyConditionResult[];
}

export function approvalPolicyPath(workspace: string): string {
  return join(workspace, ".amc", "approval-policy.yaml");
}

export function approvalPolicySigPath(workspace: string): string {
  return `${approvalPolicyPath(workspace)}.sig`;
}

export function defaultApprovalPolicy(): ApprovalPolicy {
  return approvalPolicySchema.parse({
    approvalPolicy: {
      version: 1,
      defaults: {
        simulateAlwaysAllowed: true
      },
      actionClasses: {
        READ_ONLY: {
          requiredApprovals: 0,
          rolesAllowed: ["APPROVER", "OWNER"],
          requireDistinctUsers: false,
          ttlMinutes: 60
        },
        WRITE_LOW: {
          requiredApprovals: 1,
          rolesAllowed: ["APPROVER", "OWNER"],
          requireDistinctUsers: false,
          ttlMinutes: 60
        },
        WRITE_HIGH: {
          requiredApprovals: 2,
          rolesAllowed: ["APPROVER", "OWNER"],
          requireDistinctUsers: true,
          ttlMinutes: 15
        },
        DEPLOY: {
          requiredApprovals: 2,
          rolesAllowed: ["APPROVER", "OWNER"],
          requireDistinctUsers: true,
          ttlMinutes: 15,
          requireAssurancePacks: {
            unsafe_tooling: {
              minScore: 85,
              maxSucceeded: 0
            }
          }
        },
        SECURITY: {
          requiredApprovals: 2,
          rolesAllowed: ["OWNER", "AUDITOR"],
          requireDistinctUsers: true,
          ttlMinutes: 10
        },
        FINANCIAL: {
          requiredApprovals: 2,
          rolesAllowed: ["OWNER", "AUDITOR"],
          requireDistinctUsers: true,
          ttlMinutes: 10
        },
        NETWORK_EXTERNAL: {
          requiredApprovals: 2,
          rolesAllowed: ["APPROVER", "OWNER"],
          requireDistinctUsers: true,
          ttlMinutes: 15
        },
        DATA_EXPORT: {
          requiredApprovals: 2,
          rolesAllowed: ["OWNER", "AUDITOR"],
          requireDistinctUsers: true,
          ttlMinutes: 10
        },
        IDENTITY: {
          requiredApprovals: 2,
          rolesAllowed: ["OWNER", "AUDITOR"],
          requireDistinctUsers: true,
          ttlMinutes: 10
        }
      }
    }
  });
}

export function loadApprovalPolicy(workspace: string, explicitPath?: string): ApprovalPolicy {
  const file = explicitPath ? resolve(workspace, explicitPath) : approvalPolicyPath(workspace);
  if (!pathExists(file)) {
    if (!explicitPath) {
      return defaultApprovalPolicy();
    }
    throw new Error(`approval policy not found: ${file}`);
  }
  return approvalPolicySchema.parse(YAML.parse(readUtf8(file)) as unknown);
}

export function signApprovalPolicy(workspace: string, explicitPath?: string): string {
  const path = explicitPath ? resolve(workspace, explicitPath) : approvalPolicyPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`approval policy not found: ${path}`);
  }
  const digest = sha256Hex(readFileSync(path));
  const payload: SignaturePayload = {
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = `${path}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  appendTransparencyEntry({
    workspace,
    type: "APPROVAL_POLICY_SIGNED",
    agentId: "system",
    artifact: {
      kind: "policy",
      sha256: digest,
      id: "approval-policy"
    }
  });
  return sigPath;
}

export function initApprovalPolicy(workspace: string, policy?: ApprovalPolicy): {
  path: string;
  sigPath: string;
} {
  ensureDir(join(workspace, ".amc"));
  const path = approvalPolicyPath(workspace);
  writeFileAtomic(path, YAML.stringify(approvalPolicySchema.parse(policy ?? defaultApprovalPolicy())), 0o644);
  return {
    path,
    sigPath: signApprovalPolicy(workspace)
  };
}

export function verifyApprovalPolicySignature(workspace: string, explicitPath?: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = explicitPath ? resolve(workspace, explicitPath) : approvalPolicyPath(workspace);
  const sigPath = `${path}.sig`;
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "approval policy missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "approval policy signature missing", path, sigPath };
  }
  try {
    const sig = JSON.parse(readUtf8(sigPath)) as SignaturePayload;
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    }
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
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

export function evaluateApprovalRequestPolicy(input: {
  actionClass: ActionClass;
  policy: ApprovalPolicy;
  policySignatureValid: boolean;
  policySignatureReason?: string | null;
}): ApprovalRequestPolicyEvaluation {
  const matchedRuleId = `approval:${input.actionClass}`;
  const rule = input.policy.approvalPolicy.actionClasses[input.actionClass] ?? null;
  const conditionResults: ApprovalPolicyConditionResult[] = [{
    conditionId: "approval-policy-signature",
    label: "Signed Approval Policy configuration",
    passed: input.policySignatureValid,
    actual: input.policySignatureValid,
    expected: true,
    reason: input.policySignatureValid
      ? "Approval Policy signature is valid."
      : `Approval Policy is not trusted: ${input.policySignatureReason ?? "signature verification failed"}.`,
  }, {
    conditionId: "approval-policy-rule",
    label: "Approval action rule",
    passed: rule !== null,
    actual: rule ? matchedRuleId : null,
    expected: matchedRuleId,
    reason: rule
      ? `Matched the explicit ${input.actionClass} Approval Policy rule.`
      : `Approval Policy has no ${input.actionClass} rule.`,
  }];

  if (!input.policySignatureValid) {
    return {
      allowed: false,
      outcome: "deny",
      matchedRuleId,
      rule,
      reasons: ["Approval request denied because the Approval Policy signature is not trusted."],
      conditionResults,
    };
  }
  if (!rule) {
    return {
      allowed: false,
      outcome: "deny",
      matchedRuleId,
      rule: null,
      reasons: [`Approval request denied because no ${input.actionClass} rule exists.`],
      conditionResults,
    };
  }

  conditionResults.push({
    conditionId: "approval-quorum",
    label: "Required approval quorum",
    passed: null,
    actual: rule.requiredApprovals,
    expected: rule.requiredApprovals,
    reason: rule.requiredApprovals === 0
      ? "No human approvals are required by this rule."
      : `${rule.requiredApprovals} human approval${rule.requiredApprovals === 1 ? " is" : "s are"} required.`,
  }, {
    conditionId: "approval-distinct-users",
    label: "Distinct approvers",
    passed: null,
    actual: rule.requireDistinctUsers,
    expected: rule.requireDistinctUsers,
    reason: rule.requireDistinctUsers
      ? "Configured quorum must be satisfied by distinct users."
      : "The same user may satisfy the configured quorum.",
  }, {
    conditionId: "approval-roles",
    label: "Allowed approver roles",
    passed: null,
    actual: rule.rolesAllowed.join(", "),
    expected: rule.rolesAllowed.join(", "),
    reason: `Allowed roles: ${rule.rolesAllowed.join(", ")}.`,
  }, {
    conditionId: "approval-expiry",
    label: "Approval expiry",
    passed: null,
    actual: rule.ttlMinutes,
    expected: rule.ttlMinutes,
    reason: `Approval expires after ${rule.ttlMinutes} minutes.`,
  });
  for (const [packId, requirement] of Object.entries(rule.requireAssurancePacks ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    conditionResults.push({
      conditionId: `approval-assurance:${packId}`,
      label: `${packId} assurance requirement`,
      passed: null,
      actual: null,
      expected: `score >= ${requirement.minScore}; succeeded <= ${requirement.maxSucceeded}`,
      reason: `Approval requires ${packId} score at least ${requirement.minScore} with at most ${requirement.maxSucceeded} succeeded attacks.`,
    });
  }

  return {
    allowed: true,
    outcome: rule.requiredApprovals > 0 ? "require_approval" : "allow",
    matchedRuleId,
    rule,
    reasons: [
      rule.requiredApprovals > 0
        ? `${rule.requiredApprovals} approval${rule.requiredApprovals === 1 ? " is" : "s are"} required before execution.`
        : "The signed Approval Policy permits execution without human approval.",
    ],
    conditionResults,
  };
}

export function approvalRuleForAction(policy: ApprovalPolicy, actionClass: ActionClass): ApprovalClassPolicy {
  return policy.approvalPolicy.actionClasses[actionClass] ?? defaultApprovalPolicy().approvalPolicy.actionClasses[actionClass]!;
}

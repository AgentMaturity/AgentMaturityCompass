import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActionClass, ExecutionMode } from "../types.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { loadWorkOrder, workOrderDigest } from "../workorders/workorderEngine.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  evaluateApprovalRequestPolicy,
  initApprovalPolicy,
  loadApprovalPolicy,
  verifyApprovalPolicySignature,
} from "./approvalPolicyEngine.js";
import {
  approvalRequestSchema,
  cancelApprovalRequest,
  createApprovalRequestRecord,
  listApprovalRequests,
  listApprovalDecisions,
  loadApprovalConsumed,
  loadApprovalRequestRecord,
  markApprovalConsumed,
  recordApprovalDecision,
  updateApprovalRequestStatus,
  type ApprovalDecisionKind,
  type ApprovalRequestRecord
} from "./approvalChainStore.js";
import { evaluateApprovalQuorum } from "./approvalQuorum.js";
import { parseUserRoles, type UserRole } from "../auth/roles.js";

export interface ApprovalRequestInput {
  workspace: string;
  agentId: string;
  intentId: string;
  toolName: string;
  actionClass: ActionClass;
  workOrderId?: string;
  requestedMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  riskTier: "low" | "medium" | "high" | "critical";
  intentPayload: Record<string, unknown>;
  leaseConstraints?: Record<string, unknown>;
}

function fileDigestOrFallback(workspace: string, rel: string, fallback = ""): string {
  const path = join(workspace, rel);
  if (!readFileSafe(path)) {
    return sha256Hex(fallback);
  }
  return sha256Hex(readFileSync(path));
}

function readFileSafe(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

function requestBoundHashes(input: ApprovalRequestInput): {
  intentHash: string;
  workOrderHash: string | null;
  policyHash: string;
  toolsHash: string;
  budgetsHash: string;
  leaseConstraintsHash: string;
} {
  let workOrderHash: string | null = null;
  if (input.workOrderId) {
    try {
      const workOrder = loadWorkOrder({
        workspace: input.workspace,
        agentId: input.agentId,
        workOrderId: input.workOrderId,
        requireValidSignature: true
      });
      workOrderHash = workOrderDigest(workOrder);
    } catch {
      workOrderHash = null;
    }
  }
  return {
    intentHash: sha256Hex(canonicalize(input.intentPayload)),
    workOrderHash,
    policyHash: fileDigestOrFallback(input.workspace, ".amc/action-policy.yaml", "missing-action-policy"),
    toolsHash: fileDigestOrFallback(input.workspace, ".amc/tools.yaml", "missing-tools"),
    budgetsHash: fileDigestOrFallback(input.workspace, ".amc/budgets.yaml", "missing-budgets"),
    leaseConstraintsHash: sha256Hex(canonicalize(input.leaseConstraints ?? {}))
  };
}

function requestStatusForRecord(workspace: string, request: ApprovalRequestRecord): {
  status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CANCELLED" | "CONSUMED";
  required: number;
  received: number;
} {
  const consumed = loadApprovalConsumed({
    workspace,
    agentId: request.agentId,
    approvalRequestId: request.approvalRequestId
  });
  if (consumed) {
    return {
      status: "CONSUMED",
      required: request.requiredApprovals,
      received: request.requiredApprovals
    };
  }
  const policy = loadApprovalPolicy(workspace);
  const decisions = listApprovalDecisions({
    workspace,
    agentId: request.agentId,
    approvalRequestId: request.approvalRequestId
  });
  const quorum = evaluateApprovalQuorum({
    request,
    decisions,
    policy
  });
  return {
    status: quorum.status,
    required: quorum.required,
    received: quorum.received
  };
}

export function createApprovalForIntent(input: ApprovalRequestInput): {
  approval: {
    approvalId: string;
    approvalRequestId: string;
    status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CANCELLED" | "CONSUMED";
    requiredApprovals: number;
    receivedApprovals: number;
  };
  request: ApprovalRequestRecord;
  filePath: string;
  sigPath: string;
} {
  let policySig = verifyApprovalPolicySignature(input.workspace);
  if (!policySig.valid) {
    const canBootstrap =
      !policySig.signatureExists &&
      (policySig.reason?.includes("missing") ?? false);
    if (canBootstrap) {
      initApprovalPolicy(input.workspace);
      policySig = verifyApprovalPolicySignature(input.workspace);
    }
  }
  if (!policySig.valid) {
    throw new Error(`approval policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const policy = loadApprovalPolicy(input.workspace);
  const evaluation = evaluateApprovalRequestPolicy({
    actionClass: input.actionClass,
    policy,
    policySignatureValid: policySig.valid,
    policySignatureReason: policySig.reason,
  });
  if (!evaluation.allowed || !evaluation.rule) {
    throw new Error(evaluation.reasons[0] ?? `approval policy missing action class rule: ${input.actionClass}`);
  }
  const rule = evaluation.rule;
  const created = createApprovalRequestRecord({
    workspace: input.workspace,
    agentId: input.agentId,
    intentId: input.intentId,
    toolName: input.toolName,
    actionClass: input.actionClass,
    workOrderId: input.workOrderId ?? null,
    requestedMode: input.requestedMode,
    effectiveMode: input.effectiveMode,
    riskTier: input.riskTier,
    requiredApprovals: rule.requiredApprovals,
    requireDistinctUsers: rule.requireDistinctUsers,
    rolesAllowed: parseUserRoles(rule.rolesAllowed),
    ttlMinutes: rule.ttlMinutes,
    requiredAssurancePacks: rule.requireAssurancePacks,
    boundHashes: requestBoundHashes(input)
  });
  return {
    approval: {
      approvalId: created.request.approvalRequestId,
      approvalRequestId: created.request.approvalRequestId,
      status: "PENDING",
      requiredApprovals: created.request.requiredApprovals,
      receivedApprovals: 0
    },
    request: created.request,
    filePath: created.path,
    sigPath: created.sigPath
  };
}

export function decideApprovalForIntent(params: {
  workspace: string;
  agentId?: string;
  approvalId: string;
  decision: "APPROVED" | "DENIED";
  mode: "EXECUTE" | "SIMULATE";
  reason: string;
  ttlMs?: number;
  decisionReceiptId?: string | null;
  username?: string;
  userId?: string;
  userRoles?: UserRole[];
}): {
  approval: {
    approvalId: string;
    approvalRequestId: string;
    status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CANCELLED" | "CONSUMED";
    requiredApprovals: number;
    receivedApprovals: number;
    quorum: {
      required: number;
      received: number;
      status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CONSUMED" | "CANCELLED";
    };
    lastDecisionId: string;
    decisionReceiptId: string | null;
  };
} {
  const request = loadApprovalRequestRecord({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalId,
    requireValidSignature: true
  });
  const modeDecision: ApprovalDecisionKind =
    params.decision === "DENIED" ? "DENY" : params.mode === "EXECUTE" ? "APPROVE_EXECUTE" : "APPROVE_SIMULATE";
  const decision = recordApprovalDecision({
    workspace: params.workspace,
    agentId: request.agentId,
    approvalRequestId: request.approvalRequestId,
    userId: params.userId ?? "owner",
    username: params.username ?? "owner",
    roles: params.userRoles ?? ["OWNER"],
    decision: modeDecision,
    reason: params.reason
  }).decision;
  const policy = loadApprovalPolicy(params.workspace);
  const quorum = evaluateApprovalQuorum({
    request,
    decisions: listApprovalDecisions({
      workspace: params.workspace,
      agentId: request.agentId,
      approvalRequestId: request.approvalRequestId
    }),
    policy
  });
  const nextStatus = quorum.status;
  updateApprovalRequestStatus({
    workspace: params.workspace,
    agentId: request.agentId,
    approvalRequestId: request.approvalRequestId,
    status: nextStatus
  });
  return {
    approval: {
      approvalId: request.approvalRequestId,
      approvalRequestId: request.approvalRequestId,
      status: nextStatus,
      requiredApprovals: request.requiredApprovals,
      receivedApprovals: quorum.received,
      quorum: {
        required: quorum.required,
        received: quorum.received,
        status: quorum.status
      },
      lastDecisionId: decision.approvalDecisionId,
      decisionReceiptId: params.decisionReceiptId ?? null
    }
  };
}

export function verifyApprovalForExecution(params: {
  workspace: string;
  approvalId: string;
  expectedAgentId: string;
  expectedIntentId: string;
  expectedToolName: string;
  expectedActionClass: ActionClass;
}): {
  ok: boolean;
  status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CANCELLED" | "CONSUMED" | null;
  approval: ApprovalRequestRecord | null;
  error?: string;
  quorum?: { required: number; received: number };
} {
  let request: ApprovalRequestRecord;
  try {
    request = loadApprovalRequestRecord({
      workspace: params.workspace,
      agentId: params.expectedAgentId,
      approvalRequestId: params.approvalId,
      requireValidSignature: true
    });
  } catch (error) {
    return {
      ok: false,
      status: null,
      approval: null,
      error: String(error)
    };
  }
  if (request.agentId !== params.expectedAgentId) {
    return { ok: false, status: null, approval: request, error: "approval agent mismatch" };
  }
  if (request.intentId !== params.expectedIntentId) {
    return { ok: false, status: null, approval: request, error: "approval intent mismatch" };
  }
  if (request.toolName !== params.expectedToolName) {
    return { ok: false, status: null, approval: request, error: "approval tool mismatch" };
  }
  if (request.actionClass !== params.expectedActionClass) {
    return { ok: false, status: null, approval: request, error: "approval action class mismatch" };
  }
  const approvalPolicySig = verifyApprovalPolicySignature(params.workspace);
  if (!approvalPolicySig.valid) {
    return { ok: false, status: null, approval: request, error: `approval policy signature invalid: ${approvalPolicySig.reason ?? "unknown"}` };
  }
  const actionSig = verifyActionPolicySignature(params.workspace);
  if (!actionSig.valid) {
    return { ok: false, status: null, approval: request, error: `action policy signature invalid: ${actionSig.reason ?? "unknown"}` };
  }
  const toolsSig = verifyToolsConfigSignature(params.workspace);
  if (!toolsSig.valid) {
    return { ok: false, status: null, approval: request, error: `tools signature invalid: ${toolsSig.reason ?? "unknown"}` };
  }
  const budgetsSig = verifyBudgetsConfigSignature(params.workspace);
  if (!budgetsSig.valid) {
    return { ok: false, status: null, approval: request, error: `budgets signature invalid: ${budgetsSig.reason ?? "unknown"}` };
  }

  const hashActionPolicy = sha256Hex(readFileSync(join(params.workspace, ".amc", "action-policy.yaml")));
  const hashTools = sha256Hex(readFileSync(join(params.workspace, ".amc", "tools.yaml")));
  const hashBudgets = sha256Hex(readFileSync(join(params.workspace, ".amc", "budgets.yaml")));
  if (request.boundHashes.policyHash !== hashActionPolicy) {
    return { ok: false, status: null, approval: request, error: "approval policy hash mismatch" };
  }
  if (request.boundHashes.toolsHash !== hashTools) {
    return { ok: false, status: null, approval: request, error: "approval tools hash mismatch" };
  }
  if (request.boundHashes.budgetsHash !== hashBudgets) {
    return { ok: false, status: null, approval: request, error: "approval budgets hash mismatch" };
  }

  const status = requestStatusForRecord(params.workspace, request);
  if (status.status !== "QUORUM_MET") {
    return {
      ok: false,
      status: status.status,
      approval: request,
      error: status.status === "CONSUMED" ? "approval already consumed" : `approval quorum not met (${status.status})`,
      quorum: {
        required: status.required,
        received: status.received
      }
    };
  }
  return {
    ok: true,
    status: status.status,
    approval: request,
    quorum: {
      required: status.required,
      received: status.received
    }
  };
}

export function consumeApprovedExecution(params: {
  workspace: string;
  approvalId: string;
  expectedAgentId: string;
  executionId?: string | null;
}): {
  consumed: boolean;
  replay: boolean;
  reason: string;
  consumedTs?: number;
} {
  const consumed = markApprovalConsumed({
    workspace: params.workspace,
    agentId: params.expectedAgentId,
    approvalRequestId: params.approvalId,
    executionId: params.executionId ?? null,
    reason: "approved execution completed"
  });
  return {
    consumed: !consumed.replay,
    replay: consumed.replay,
    reason: consumed.replay ? "approval already consumed" : "ok",
    consumedTs: consumed.consumed.consumedTs
  };
}

export function approvalStatusPayload(params: {
  workspace: string;
  agentId: string;
  approvalId: string;
}): {
  status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CONSUMED" | "CANCELLED";
  effectiveMode: ExecutionMode;
  nextStep: "WAIT_FOR_OWNER_DECISION" | "CALL_TOOLHUB_EXECUTE_WITH_APPROVAL" | "STOP";
  approvalId: string;
  approvalRequestId: string;
  intentId: string;
  quorum: { required: number; received: number; status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CONSUMED" | "CANCELLED" };
} {
  const request = loadApprovalRequestRecord({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalId,
    requireValidSignature: true
  });
  const state = requestStatusForRecord(params.workspace, request);
  const nextStep =
    state.status === "QUORUM_MET"
      ? "CALL_TOOLHUB_EXECUTE_WITH_APPROVAL"
      : state.status === "PENDING"
        ? "WAIT_FOR_OWNER_DECISION"
        : "STOP";
  return {
    status: state.status,
    effectiveMode: request.effectiveMode,
    nextStep,
    approvalId: request.approvalRequestId,
    approvalRequestId: request.approvalRequestId,
    intentId: request.intentId,
    quorum: {
      required: state.required,
      received: state.received,
      status: state.status
    }
  };
}

export function cancelApprovalRequestForIntent(params: {
  workspace: string;
  agentId: string;
  approvalId: string;
}): ApprovalRequestRecord {
  return cancelApprovalRequest({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalId
  });
}

export function summarizeApprovalHygiene(params: {
  workspace: string;
  agentId: string;
  windowStartTs: number;
  windowEndTs: number;
}): {
  requested: number;
  approved: number;
  denied: number;
  expired: number;
  consumed: number;
  replayAttempts: number;
} {
  const rows = listApprovalRequests({
    workspace: params.workspace,
    agentId: params.agentId
  }).filter((row) => row.createdTs >= params.windowStartTs && row.createdTs <= params.windowEndTs);
  let requested = 0;
  let approved = 0;
  let denied = 0;
  let expired = 0;
  let consumed = 0;
  for (const row of rows) {
    requested += 1;
    const status = requestStatusForRecord(params.workspace, row).status;
    if (status === "QUORUM_MET") {
      approved += 1;
    } else if (status === "DENIED") {
      denied += 1;
    } else if (status === "EXPIRED") {
      expired += 1;
    } else if (status === "CONSUMED") {
      consumed += 1;
      approved += 1;
    }
  }
  return {
    requested,
    approved,
    denied,
    expired,
    consumed,
    replayAttempts: 0
  };
}

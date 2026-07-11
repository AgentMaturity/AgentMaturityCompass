import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import {
  listApprovalDecisions,
  listApprovalRequests,
  loadApprovalRequestRecord,
  inspectApprovalChainIntegrity,
  type ApprovalDecisionRecord,
  type ApprovalRequestRecord,
  type ApprovalRequestStatus
} from "./approvalChainStore.js";
import { approvalStatusPayload, verifyApprovalForExecution } from "./approvalEngine.js";

export interface ApprovalInboxIntegrity {
  valid: boolean;
  reasonCode: string | null;
}

export interface ApprovalInboxItem {
  request: ApprovalRequestRecord;
  requestDigestSha256: string;
  status: ApprovalRequestStatus;
  quorum: {
    required: number;
    received: number;
    status: ApprovalRequestStatus;
  };
  decisions: ApprovalDecisionRecord[];
  requestIntegrity: ApprovalInboxIntegrity;
  chainIntegrity: ApprovalInboxIntegrity;
  contextIntegrity: ApprovalInboxIntegrity;
  executionReady: boolean;
}

export interface ApprovalInboxSummary {
  schemaVersion: "2026-07-11";
  approvalRequestId: string;
  requestDigestSha256: string;
  agentId: string;
  actionClass: ApprovalRequestRecord["actionClass"];
  riskTier: ApprovalRequestRecord["riskTier"];
  requestedMode: ApprovalRequestRecord["requestedMode"];
  effectiveMode: ApprovalRequestRecord["effectiveMode"];
  createdTs: number;
  expiresTs: number;
  status: ApprovalRequestStatus;
  quorum: ApprovalInboxItem["quorum"];
  decisionCount: number;
  requestIntegrity: ApprovalInboxIntegrity;
  chainIntegrity: ApprovalInboxIntegrity;
  contextIntegrity: ApprovalInboxIntegrity;
  executionReady: boolean;
}

function contextReasonCode(error: unknown): string {
  const message = String(error).toLowerCase();
  if (message.includes("approval policy signature")) {
    return "APPROVAL_POLICY_UNTRUSTED";
  }
  if (message.includes("action policy signature") || message.includes("policy hash mismatch")) {
    return "ACTION_POLICY_UNTRUSTED";
  }
  if (message.includes("tools signature") || message.includes("tools hash mismatch")) {
    return "TOOLS_UNTRUSTED";
  }
  if (message.includes("budgets signature") || message.includes("budgets hash mismatch")) {
    return "BUDGETS_UNTRUSTED";
  }
  if (message.includes("consumed signature")) {
    return "CONSUMPTION_UNTRUSTED";
  }
  return "APPROVAL_CONTEXT_UNTRUSTED";
}

function fallbackStatus(request: ApprovalRequestRecord): ApprovalRequestStatus {
  if (
    request.status === "DENIED" ||
    request.status === "CANCELLED" ||
    request.status === "CONSUMED" ||
    request.status === "EXPIRED"
  ) {
    return request.status;
  }
  return "PENDING";
}

function projectApprovalInboxItem(params: {
  workspace: string;
  request: ApprovalRequestRecord;
}): ApprovalInboxItem {
  const decisions = listApprovalDecisions({
    workspace: params.workspace,
    agentId: params.request.agentId,
    approvalRequestId: params.request.approvalRequestId
  });
  const chainIntegrity = inspectApprovalChainIntegrity({
    workspace: params.workspace,
    agentId: params.request.agentId,
    approvalRequestId: params.request.approvalRequestId
  });
  let status = fallbackStatus(params.request);
  let quorum = {
    required: params.request.requiredApprovals,
    received: 0,
    status
  };
  let statusError: unknown = null;
  try {
    const projected = approvalStatusPayload({
      workspace: params.workspace,
      agentId: params.request.agentId,
      approvalId: params.request.approvalRequestId
    });
    status = projected.status;
    quorum = projected.quorum;
  } catch (error) {
    statusError = error;
  }

  const context = (() => {
    try {
      return verifyApprovalForExecution({
        workspace: params.workspace,
        approvalId: params.request.approvalRequestId,
        expectedAgentId: params.request.agentId,
        expectedIntentId: params.request.intentId,
        expectedToolName: params.request.toolName,
        expectedActionClass: params.request.actionClass
      });
    } catch (error) {
      return {
        ok: false,
        status: null,
        approval: params.request,
        error: String(error)
      } as const;
    }
  })();
  const contextValid = chainIntegrity.valid && statusError === null && context.approval !== null && context.status !== null;
  const contextError = statusError ?? context.error ?? null;

  return {
    request: params.request,
    requestDigestSha256: sha256Hex(canonicalize(params.request)),
    status,
    quorum,
    decisions,
    requestIntegrity: {
      valid: true,
      reasonCode: null
    },
    chainIntegrity: {
      valid: chainIntegrity.valid,
      reasonCode: chainIntegrity.valid ? null : "APPROVAL_CHAIN_UNTRUSTED"
    },
    contextIntegrity: {
      valid: contextValid,
      reasonCode: contextValid ? null : contextReasonCode(contextError)
    },
    executionReady: chainIntegrity.valid && contextValid && context.ok
  };
}

export function parseApprovalInboxStatus(value?: string): ApprovalRequestStatus | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "APPROVED") {
    return "QUORUM_MET";
  }
  if (
    normalized === "PENDING" ||
    normalized === "QUORUM_MET" ||
    normalized === "DENIED" ||
    normalized === "EXPIRED" ||
    normalized === "CANCELLED" ||
    normalized === "CONSUMED"
  ) {
    return normalized;
  }
  throw new Error(`Invalid approval status: ${value}`);
}

export function getApprovalInboxItem(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
}): ApprovalInboxItem {
  const request = loadApprovalRequestRecord({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    requireValidSignature: true
  });
  return projectApprovalInboxItem({
    workspace: params.workspace,
    request
  });
}

export function projectApprovalInboxSummary(item: ApprovalInboxItem): ApprovalInboxSummary {
  return {
    schemaVersion: "2026-07-11",
    approvalRequestId: item.request.approvalRequestId,
    requestDigestSha256: item.requestDigestSha256,
    agentId: item.request.agentId,
    actionClass: item.request.actionClass,
    riskTier: item.request.riskTier,
    requestedMode: item.request.requestedMode,
    effectiveMode: item.request.effectiveMode,
    createdTs: item.request.createdTs,
    expiresTs: item.request.expiresTs,
    status: item.status,
    quorum: item.quorum,
    decisionCount: item.decisions.length,
    requestIntegrity: item.requestIntegrity,
    chainIntegrity: item.chainIntegrity,
    contextIntegrity: item.contextIntegrity,
    executionReady: item.executionReady
  };
}

export function listApprovalInbox(params: {
  workspace: string;
  agentId?: string;
  status?: ApprovalRequestStatus;
}): ApprovalInboxItem[] {
  return listApprovalRequests({
    workspace: params.workspace,
    agentId: params.agentId
  })
    .map((request) => projectApprovalInboxItem({ workspace: params.workspace, request }))
    .filter((row) => (params.status ? row.status === params.status : true));
}

export function summarizeApprovalInbox(params: {
  workspace: string;
  agentId?: string;
  windowStartTs?: number;
  windowEndTs?: number;
}): {
  requested: number;
  approved: number;
  denied: number;
  expired: number;
  cancelled: number;
  consumed: number;
} {
  const start = params.windowStartTs ?? Number.MIN_SAFE_INTEGER;
  const end = params.windowEndTs ?? Number.MAX_SAFE_INTEGER;
  const rows = listApprovalInbox({
    workspace: params.workspace,
    agentId: params.agentId
  }).filter((row) => row.request.createdTs >= start && row.request.createdTs <= end);
  return {
    requested: rows.length,
    approved: rows.filter((row) => row.status === "QUORUM_MET" || row.status === "CONSUMED").length,
    denied: rows.filter((row) => row.status === "DENIED").length,
    expired: rows.filter((row) => row.status === "EXPIRED").length,
    cancelled: rows.filter((row) => row.status === "CANCELLED").length,
    consumed: rows.filter((row) => row.status === "CONSUMED").length
  };
}

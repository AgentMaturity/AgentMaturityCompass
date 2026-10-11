import type { UserRole } from "../auth/roles.js";
import type { ApprovalPolicy } from "./approvalPolicySchema.js";
import type { ApprovalDecisionRecord, ApprovalRequestRecord } from "./approvalChainStore.js";
import { approvalRequestBindingDigest } from "./approvalChainStore.js";

export interface QuorumState {
  status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CONSUMED" | "CANCELLED";
  required: number;
  received: number;
  approverUserIds: string[];
  deniedBy: string[];
  duplicateApproverRejected: string[];
  remainingRequired: number;
}

/**
 * Whether `userId` is the request's recorded initiator (P1-78). An initiator keyed as A4 keys principals
 * (`LOCAL_USER:<userId>`, `WORKSPACE_ROUTER:<userId>`) names the user id an engine decision records; A4 resolves an engine
 * decision's user id to exactly one plane (resolveApprover), so this matches every decision A4 would key the same, and
 * also a same-named user of the other plane (the conservative direction). Any other initiator is a user id.
 */
export function isApprovalInitiator(request: Pick<ApprovalRequestRecord, "initiator">, userId: string): boolean {
  if (request.initiator === undefined) return false;
  return (/^(?:LOCAL_USER|WORKSPACE_ROUTER):(.+)$/.exec(request.initiator)?.[1] ?? request.initiator) === userId;
}

function hasAllowedRole(roles: readonly UserRole[], allowed: readonly UserRole[]): boolean {
  for (const role of roles) {
    if (allowed.includes(role)) {
      return true;
    }
  }
  return false;
}

export function evaluateApprovalQuorum(params: {
  request: ApprovalRequestRecord;
  decisions: ApprovalDecisionRecord[];
  /** Not read: the request carries its own quorum rules. Optional so an offline verifier without the policy can count. */
  policy?: ApprovalPolicy;
  /** The caller's clock, so a display and a progression check agree across the expiry boundary (A4, design §6.4). */
  now?: number;
}): QuorumState {
  const request = params.request;
  const now = params.now ?? Date.now();
  if (request.status === "CONSUMED") {
    return {
      status: "CONSUMED",
      required: request.requiredApprovals,
      received: request.requiredApprovals,
      approverUserIds: [],
      deniedBy: [],
      duplicateApproverRejected: [],
      remainingRequired: 0
    };
  }
  if (request.status === "CANCELLED") {
    return {
      status: "CANCELLED",
      required: request.requiredApprovals,
      received: 0,
      approverUserIds: [],
      deniedBy: [],
      duplicateApproverRejected: [],
      remainingRequired: request.requiredApprovals
    };
  }
  if (request.status === "DENIED" || request.status === "EXPIRED") {
    return {
      status: request.status,
      required: request.requiredApprovals,
      received: 0,
      approverUserIds: [],
      deniedBy: [],
      duplicateApproverRejected: [],
      remainingRequired: request.requiredApprovals
    };
  }
  if (now > request.expiresTs) {
    return {
      status: "EXPIRED",
      required: request.requiredApprovals,
      received: 0,
      approverUserIds: [],
      deniedBy: [],
      duplicateApproverRejected: [],
      remainingRequired: request.requiredApprovals
    };
  }

  const allowedRoles = request.rolesAllowed;
  const approverUserIds: string[] = [];
  const duplicateApproverRejected: string[] = [];
  const deniedBy: string[] = [];
  let received = 0;

  for (const decision of params.decisions) {
    if (decision.approvalRequestId !== request.approvalRequestId) {
      continue;
    }
    if (decision.requestDigestSha256 !== undefined && decision.requestDigestSha256 !== approvalRequestBindingDigest(request)) continue;
    if (!hasAllowedRole(decision.roles, allowedRoles)) {
      continue;
    }
    if (decision.decision === "DENY") {
      deniedBy.push(decision.username);
      continue;
    }
    if (decision.decision !== "APPROVE_EXECUTE") {
      continue;
    }
    // Initiator is never approver (P1-78): such a decision was refused at write, so one on disk is never counted.
    if (isApprovalInitiator(request, decision.userId)) {
      continue;
    }
    if (request.requireDistinctUsers && approverUserIds.includes(decision.userId)) {
      duplicateApproverRejected.push(decision.userId);
      continue;
    }
    approverUserIds.push(decision.userId);
    received += 1;
  }

  if (deniedBy.length > 0) {
    return {
      status: "DENIED",
      required: request.requiredApprovals,
      received,
      approverUserIds,
      deniedBy,
      duplicateApproverRejected,
      remainingRequired: Math.max(0, request.requiredApprovals - received)
    };
  }

  if (request.requiredApprovals <= 0) {
    return {
      status: "QUORUM_MET",
      required: 0,
      received: 0,
      approverUserIds,
      deniedBy: [],
      duplicateApproverRejected,
      remainingRequired: 0
    };
  }

  if (received >= request.requiredApprovals) {
    return {
      status: "QUORUM_MET",
      required: request.requiredApprovals,
      received,
      approverUserIds,
      deniedBy: [],
      duplicateApproverRejected,
      remainingRequired: 0
    };
  }

  return {
    status: "PENDING",
    required: request.requiredApprovals,
    received,
    approverUserIds,
    deniedBy: [],
    duplicateApproverRejected,
    remainingRequired: request.requiredApprovals - received
  };
}

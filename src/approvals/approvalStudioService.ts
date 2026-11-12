import { z } from "zod";
import { activeUserRecord } from "../auth/authApi.js";
import type { UserRole } from "../auth/roles.js";
import { recordApprovalDecisionMetric } from "../ops/metrics/metricsMiddleware.js";
import {
  approvalRequestBindingDigest,
  cancelApprovalRequest,
  countedApprovalDecisions,
  loadApprovalRequestRecord,
  updateApprovalRequestStatus
} from "./approvalChainStore.js";
import { deliverApprovalLifecycle, type ApprovalDeliverySummary } from "./approvalDelivery.js";
import { approvalStatusPayload, decideApprovalForIntent } from "./approvalEngine.js";
import { getApprovalInboxItem } from "./approvalInbox.js";
import { loadApprovalPolicy } from "./approvalPolicyEngine.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const studioApprovalDecisionInputSchema = z.object({
  mode: z.enum(["SIMULATE", "EXECUTE"]).optional(),
  decision: z.enum(["APPROVE_EXECUTE", "APPROVE_SIMULATE", "DENY"]).optional(),
  reason: z.string().trim().min(1).max(1_000).optional(),
  /** The digest the reviewer was shown (the inbox row's requestDigestSha256, or the engine's binding digest). */
  expectedRequestDigestSha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict();

export const studioApprovalDenyInputSchema = z.object({
  reason: z.string().trim().min(1).max(1_000).optional()
}).strict();

export type StudioApprovalDecisionInput = z.infer<typeof studioApprovalDecisionInputSchema>;

export class ApprovalStudioError extends Error {
  constructor(readonly statusCode: 400 | 403 | 409, message: string) {
    super(message);
  }
}

interface StudioApprovalAuditInput {
  auditType: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  agentId: string;
  payload: Record<string, unknown>;
}

type StudioApprovalAuditWriter = (input: StudioApprovalAuditInput) => {
  eventId: string;
  receiptId: string;
};

const statusTransitionLocks = new Map<string, Promise<void>>();

async function withApprovalStatusTransitionLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = statusTransitionLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  const chain = previous.catch(() => undefined).then(() => gate);
  statusTransitionLocks.set(key, chain);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (statusTransitionLocks.get(key) === chain) {
      statusTransitionLocks.delete(key);
    }
  }
}

export async function observeApprovalStatusInStudio(params: {
  workspace: string;
  agentId: string;
  approvalRequestId: string;
  reviewBasePath?: string;
}): Promise<{
  status: ReturnType<typeof approvalStatusPayload>;
  approvalDelivery?: ApprovalDeliverySummary;
  approvalEvent?: "APPROVAL_EXPIRED";
}> {
  const key = `${params.workspace}::${params.agentId}::${params.approvalRequestId}`;
  return withApprovalStatusTransitionLock(key, async () => {
    const current = loadApprovalRequestRecord({
      workspace: params.workspace,
      agentId: params.agentId,
      approvalRequestId: params.approvalRequestId,
      requireValidSignature: true
    });
    const status = approvalStatusPayload({
      workspace: params.workspace,
      agentId: params.agentId,
      approvalId: params.approvalRequestId
    });
    if (status.status !== "EXPIRED" || current.status === "EXPIRED") {
      return { status };
    }
    updateApprovalRequestStatus({
      workspace: params.workspace,
      agentId: params.agentId,
      approvalRequestId: params.approvalRequestId,
      status: "EXPIRED"
    });
    const approvalDelivery = await deliverApprovalLifecycle({
      workspace: params.workspace,
      agentId: params.agentId,
      approvalRequestId: params.approvalRequestId,
      trigger: "STATUS_CHECK",
      reviewBasePath: params.reviewBasePath
    });
    return {
      status: approvalStatusPayload({
        workspace: params.workspace,
        agentId: params.agentId,
        approvalId: params.approvalRequestId
      }),
      approvalDelivery,
      approvalEvent: "APPROVAL_EXPIRED"
    };
  });
}

function requireTrustedPendingApproval(params: {
  workspace: string;
  agentId: string;
  approvalRequestId: string;
}) {
  const inbox = getApprovalInboxItem(params);
  if (!inbox.chainIntegrity.valid || !inbox.contextIntegrity.valid) {
    throw new ApprovalStudioError(409, "approval request context is not trusted");
  }
  if (inbox.status !== "PENDING") {
    throw new ApprovalStudioError(409, `approval request is not pending: ${inbox.status}`);
  }
  return inbox;
}

export async function decideApprovalInStudio(params: {
  workspace: string;
  agentId: string;
  approvalRequestId: string;
  actor: {
    isAdmin: boolean;
    username: string;
    /** Verified caller identity; older trusted local callers retain their username fallback. */
    userId?: string;
    roles: UserRole[];
    /** How the session signed in; only a LOCAL_USER decision is bound to a reviewed inbox digest. */
    authSource?: "LOCAL_USER" | "WORKSPACE_ROUTER";
  };
  input: StudioApprovalDecisionInput;
  requireExplicitDecision: boolean;
  reviewBasePath?: string;
  writeAudit: StudioApprovalAuditWriter;
  /**
   * The bound path (the A4 card): the decision binds this exact request digest, and the actor must carry its own
   * verified userId and live roles; nothing defaults to OWNER here. Omitted: unchanged behaviour.
   */
  expectedRequestDigestSha256?: string;
}): Promise<{
  approval: ReturnType<typeof decideApprovalForIntent>["approval"];
  approvalDelivery: ApprovalDeliverySummary;
  approvalEvent: "APPROVAL_DECISION_RECORDED" | "APPROVAL_QUORUM_MET" | "APPROVAL_DENIED";
}> {
  // The inbox path: a reviewed digest that no longer names this request refuses. The decision of a signed-in, active
  // users.yaml user then binds the engine's digest, so consumers that count only bound decisions (governance records,
  // src/governor/boundRecords.ts) count it, as they count `amc approvals decide --session-token-file`. The admin token
  // names no person and a workspace-router session is not checked against users.yaml: both stay unbound, as before.
  let boundDigest = params.expectedRequestDigestSha256;
  const reviewed = params.input.expectedRequestDigestSha256;
  if (boundDigest === undefined && reviewed !== undefined) {
    const request = loadApprovalRequestRecord({ workspace: params.workspace, agentId: params.agentId, approvalRequestId: params.approvalRequestId, requireValidSignature: true });
    const binding = approvalRequestBindingDigest(request);
    if (reviewed !== binding && reviewed !== sha256Hex(canonicalize(request))) throw new ApprovalStudioError(409, "approval request changed after review");
    if (!params.actor.isAdmin && params.actor.authSource === "LOCAL_USER" && params.actor.userId
      && activeUserRecord(params.workspace, params.actor.userId) !== null) boundDigest = binding;
  }
  const bound = boundDigest !== undefined;
  if (bound && (!params.actor.userId || params.actor.roles.length === 0)) {
    throw new ApprovalStudioError(403, "a bound decision needs the reviewer's verified user id and live roles");
  }
  if (params.requireExplicitDecision && !params.input.decision) {
    throw new ApprovalStudioError(400, "decision is required");
  }
  const decision = params.input.decision ?? (params.input.mode === "SIMULATE" ? "APPROVE_SIMULATE" : "APPROVE_EXECUTE");
  const mode = decision === "APPROVE_SIMULATE" ? "SIMULATE" : decision === "APPROVE_EXECUTE" ? "EXECUTE" : "SIMULATE";
  if (params.input.mode && decision !== "DENY" && params.input.mode !== mode) {
    throw new ApprovalStudioError(400, "decision and mode conflict");
  }

  const inbox = requireTrustedPendingApproval({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId
  });
  const policy = loadApprovalPolicy(params.workspace);
  const rule = policy.approvalPolicy.actionClasses[inbox.request.actionClass];
  const rolesAllowed = new Set((rule?.rolesAllowed ?? ["APPROVER", "OWNER"]) as UserRole[]);
  if ((bound || !params.actor.isAdmin) && !params.actor.roles.some((role) => rolesAllowed.has(role))) {
    throw new ApprovalStudioError(403, `roles not allowed for ${inbox.request.actionClass}`);
  }
  if (
    (rule?.requireDistinctUsers ?? false) &&
    decision !== "DENY" &&
    countedApprovalDecisions(inbox.decisions).some((row) => row.decision !== "DENY" &&
      (row.username === params.actor.username || row.userId === (params.actor.userId ?? params.actor.username)))
  ) {
    params.writeAudit({
      auditType: "APPROVAL_QUORUM_FAILED",
      severity: "HIGH",
      agentId: params.agentId,
      payload: {
        approvalRequestId: params.approvalRequestId,
        reason: "distinct approver required",
        username: params.actor.username
      }
    });
    throw new ApprovalStudioError(409, "distinct approver required; same user cannot approve twice");
  }

  recordApprovalDecisionMetric(decision, inbox.request.actionClass);
  const reason = params.input.reason ?? (decision === "DENY" ? "Denied" : "Approved");
  const audit = params.writeAudit({
    auditType: "APPROVAL_DECISION_RECORDED",
    severity: "MEDIUM",
    agentId: params.agentId,
    payload: {
      approvalRequestId: params.approvalRequestId,
      decision,
      mode,
      reason
    }
  });
  params.writeAudit({
    auditType: "CONSOLE_APPROVAL_DECIDED",
    severity: "LOW",
    agentId: params.agentId,
    payload: {
      approvalRequestId: params.approvalRequestId,
      decision,
      mode
    }
  });
  params.writeAudit({
    auditType: "APPROVAL_DECIDED",
    severity: "MEDIUM",
    agentId: params.agentId,
    payload: {
      approvalRequestId: params.approvalRequestId,
      decision,
      mode,
      reason
    }
  });

  let decided: ReturnType<typeof decideApprovalForIntent>;
  try {
    decided = decideApprovalForIntent({
      workspace: params.workspace,
      agentId: params.agentId,
      approvalId: params.approvalRequestId,
      decision: decision === "DENY" ? "DENIED" : "APPROVED",
      mode,
      reason,
      decisionReceiptId: audit.receiptId,
      username: params.actor.username,
      userId: params.actor.userId ?? params.actor.username,
      userRoles: bound || params.actor.roles.length > 0 ? params.actor.roles : ["OWNER"],
      // The route resolved this actor from the signed-in session or the admin token (requireRouteRoles).
      reviewerAuthentication: "authenticated",
      ...(bound ? { expectedRequestDigestSha256: boundDigest } : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/approval request (?:is not pending|context is untrusted):|approval request changed after review/i.test(message)) {
      throw new ApprovalStudioError(409, message);
    }
    // P1-78 through Studio (P2-13): the initiator's own approval is a refusal, not a server error.
    if (/^initiator cannot approve their own request/.test(message)) throw new ApprovalStudioError(403, message);
    throw error;
  }

  const approvalDelivery = await deliverApprovalLifecycle({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    trigger: "DECISION_RECORDED",
    reviewBasePath: params.reviewBasePath
  });
  const approvalEvent = decided.approval.status === "QUORUM_MET"
    ? "APPROVAL_QUORUM_MET"
    : decided.approval.status === "DENIED"
      ? "APPROVAL_DENIED"
      : "APPROVAL_DECISION_RECORDED";
  return {
    approval: decided.approval,
    approvalDelivery,
    approvalEvent
  };
}

export async function cancelApprovalInStudio(params: {
  workspace: string;
  agentId: string;
  approvalRequestId: string;
  reviewBasePath?: string;
}): Promise<{
  request: ReturnType<typeof cancelApprovalRequest>;
  approvalDelivery: ApprovalDeliverySummary;
}> {
  const inbox = getApprovalInboxItem({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId
  });
  if (inbox.status !== "PENDING") {
    throw new ApprovalStudioError(409, `approval request is not pending: ${inbox.status}`);
  }
  let request: ReturnType<typeof cancelApprovalRequest>;
  try {
    request = cancelApprovalRequest({
      workspace: params.workspace,
      agentId: params.agentId,
      approvalRequestId: params.approvalRequestId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/approval request is not pending:/i.test(message)) {
      throw new ApprovalStudioError(409, message);
    }
    throw error;
  }
  const approvalDelivery = await deliverApprovalLifecycle({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    trigger: "CANCELLED",
    reviewBasePath: params.reviewBasePath
  });
  return { request, approvalDelivery };
}

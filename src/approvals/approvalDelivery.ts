import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { verifyIntegrationsConfigSignature } from "../integrations/integrationStore.js";
import { openLedger } from "../ledger/ledger.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { getApprovalInboxItem } from "./approvalInbox.js";

export const approvalDeliveryTriggerSchema = z.enum([
  "REQUEST_CREATED",
  "DECISION_RECORDED",
  "CANCELLED",
  "STATUS_CHECK"
]);

export type ApprovalDeliveryTrigger = z.infer<typeof approvalDeliveryTriggerSchema>;

export const approvalDeliveryEnvelopeSchema = z.object({
  v: z.literal(1),
  type: z.literal("AMC_APPROVAL_NOTIFICATION"),
  lifecycle: z.enum([
    "REQUEST_CREATED",
    "DECISION_RECORDED",
    "QUORUM_MET",
    "DENIED",
    "CANCELLED",
    "EXPIRED",
    "CONSUMED"
  ]),
  approvalRequestId: z.string().startsWith("apprreq_"),
  requestDigestSha256: z.string().length(64),
  actionClass: z.enum([
    "READ_ONLY",
    "WRITE_LOW",
    "WRITE_HIGH",
    "DEPLOY",
    "SECURITY",
    "FINANCIAL",
    "NETWORK_EXTERNAL",
    "DATA_EXPORT",
    "IDENTITY"
  ]),
  riskTier: z.enum(["low", "medium", "high", "critical"]),
  requestedMode: z.enum(["SIMULATE", "EXECUTE"]),
  effectiveMode: z.enum(["SIMULATE", "EXECUTE"]),
  createdTs: z.number().int(),
  expiresTs: z.number().int(),
  status: z.enum(["PENDING", "QUORUM_MET", "DENIED", "EXPIRED", "CANCELLED", "CONSUMED"]),
  quorum: z.object({
    required: z.number().int().nonnegative(),
    received: z.number().int().nonnegative()
  }).strict(),
  reviewPath: z.string().regex(
    /^\/(?:w\/[a-z0-9][a-z0-9-]{1,62}\/)?console\/approvals\?approval=apprreq_[A-Za-z0-9._~%-]+$/
  ),
  authRequired: z.literal(true),
  notificationOnly: z.literal(true),
  proofEligible: z.literal(false)
}).strict();

export type ApprovalDeliveryEnvelope = z.infer<typeof approvalDeliveryEnvelopeSchema>;

export interface ApprovalDeliveryChannelSummary {
  channelId: string;
  deliveryId: string;
  attempts: number;
  httpStatus: number;
  eventId: string;
  receiptId: string;
}

export interface ApprovalDeliveryEvidenceSummary {
  eventId: string;
  receiptId: string;
}

export interface ApprovalQueuedChannelSummary {
  channelId: string;
  queueId: string;
  attemptRound: number;
  maxRounds: number;
  nextAttemptTs: number;
}

export interface ApprovalDeliverySummary {
  schemaVersion: "2026-07-11";
  approvalRequestId: string;
  status: "DELIVERED" | "QUEUED" | "SKIPPED" | "FAILED" | "BLOCKED";
  reasonCode: string | null;
  eventName: string | null;
  requestDigestSha256: string | null;
  expiresTs: number | null;
  channels: ApprovalDeliveryChannelSummary[];
  queued: ApprovalQueuedChannelSummary[];
  skipped: string[];
  notificationOnly: true;
  proofEligible: false;
  evidence: ApprovalDeliveryEvidenceSummary | null;
}

class ApprovalDeliveryError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
  }
}

function lifecycleForStatus(params: {
  trigger: ApprovalDeliveryTrigger;
  status: ApprovalDeliveryEnvelope["status"];
}): ApprovalDeliveryEnvelope["lifecycle"] {
  if (params.status === "QUORUM_MET") return "QUORUM_MET";
  if (params.status === "DENIED") return "DENIED";
  if (params.status === "CANCELLED") return "CANCELLED";
  if (params.status === "EXPIRED") return "EXPIRED";
  if (params.status === "CONSUMED") return "CONSUMED";
  return params.trigger === "REQUEST_CREATED" ? "REQUEST_CREATED" : "DECISION_RECORDED";
}

function eventNameForLifecycle(lifecycle: ApprovalDeliveryEnvelope["lifecycle"]): string {
  return `APPROVAL_${lifecycle}`;
}

function summaryForLifecycle(lifecycle: ApprovalDeliveryEnvelope["lifecycle"]): string {
  switch (lifecycle) {
    case "REQUEST_CREATED": return "Approval review required";
    case "QUORUM_MET": return "Approval quorum met";
    case "DENIED": return "Approval denied";
    case "CANCELLED": return "Approval cancelled";
    case "EXPIRED": return "Approval expired";
    case "CONSUMED": return "Approval consumed";
    default: return "Approval decision recorded";
  }
}

function sanitizeSkipped(rows: string[]): string[] {
  const safe = rows.map((row) => {
    const [channelId = "channel", code = "skipped"] = row.split(":");
    return `${channelId.replace(/[^a-zA-Z0-9._-]/g, "_")}:${code.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  });
  return [...new Set(safe)].sort((a, b) => a.localeCompare(b));
}

function normalizeReviewBasePath(input?: string): string {
  const value = (input ?? "/console").trim().replace(/\/+$/, "");
  if (value === "/console" || /^\/w\/[a-z0-9][a-z0-9-]{1,62}\/console$/.test(value)) {
    return value;
  }
  throw new ApprovalDeliveryError("REVIEW_PATH_INVALID");
}

function recordDeliveryEvidence(params: {
  workspace: string;
  agentId: string;
  summary: Omit<ApprovalDeliverySummary, "evidence">;
}): ApprovalDeliveryEvidenceSummary | null {
  const ledger = openLedger(params.workspace);
  const sessionId = `approval-delivery-${randomUUID()}`;
  const payload = canonicalize(params.summary);
  const bodySha256 = sha256Hex(payload);
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-approval-delivery",
      binarySha256: sha256Hex("amc-approval-delivery")
    });
    const written = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload,
      payloadExt: "json",
      inline: true,
      meta: {
        trustTier: "OBSERVED",
        auditType: `APPROVAL_DELIVERY_${params.summary.status}`,
        approvalRequestId: params.summary.approvalRequestId,
        deliveryEventName: params.summary.eventName,
        deliveryStatus: params.summary.status,
        requestDigestSha256: params.summary.requestDigestSha256,
        channelCount: params.summary.channels.length,
        bodySha256,
        agentId: params.agentId
      },
      receipt: {
        kind: "guard_check",
        agentId: params.agentId,
        providerId: "approval-delivery",
        model: null,
        bodySha256
      }
    });
    ledger.sealSession(sessionId);
    return {
      eventId: written.id,
      receiptId: written.receiptId
    };
  } catch {
    return null;
  } finally {
    ledger.close();
  }
}

function withEvidence(params: {
  workspace: string;
  agentId: string;
  summary: Omit<ApprovalDeliverySummary, "evidence">;
}): ApprovalDeliverySummary {
  return {
    ...params.summary,
    evidence: recordDeliveryEvidence(params)
  };
}

export function buildApprovalDeliveryEnvelope(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
  trigger: ApprovalDeliveryTrigger;
  reviewBasePath?: string;
}): ApprovalDeliveryEnvelope {
  const trigger = approvalDeliveryTriggerSchema.parse(params.trigger);
  let inbox;
  try {
    inbox = getApprovalInboxItem({
      workspace: params.workspace,
      agentId: params.agentId,
      approvalRequestId: params.approvalRequestId
    });
  } catch {
    throw new ApprovalDeliveryError("REQUEST_INTEGRITY_INVALID");
  }
  if (!inbox.requestIntegrity.valid) {
    throw new ApprovalDeliveryError("REQUEST_INTEGRITY_INVALID");
  }
  if (!inbox.chainIntegrity.valid) {
    throw new ApprovalDeliveryError("APPROVAL_CHAIN_UNTRUSTED");
  }
  if (!inbox.contextIntegrity.valid) {
    throw new ApprovalDeliveryError(inbox.contextIntegrity.reasonCode ?? "APPROVAL_CONTEXT_UNTRUSTED");
  }
  const lifecycle = lifecycleForStatus({
    trigger,
    status: inbox.status
  });
  return approvalDeliveryEnvelopeSchema.parse({
    v: 1,
    type: "AMC_APPROVAL_NOTIFICATION",
    lifecycle,
    approvalRequestId: inbox.request.approvalRequestId,
    requestDigestSha256: inbox.requestDigestSha256,
    actionClass: inbox.request.actionClass,
    riskTier: inbox.request.riskTier,
    requestedMode: inbox.request.requestedMode,
    effectiveMode: inbox.request.effectiveMode,
    createdTs: inbox.request.createdTs,
    expiresTs: inbox.request.expiresTs,
    status: inbox.status,
    quorum: {
      required: inbox.quorum.required,
      received: inbox.quorum.received
    },
    reviewPath: `${normalizeReviewBasePath(params.reviewBasePath)}/approvals?approval=${encodeURIComponent(inbox.request.approvalRequestId)}`,
    authRequired: true,
    notificationOnly: true,
    proofEligible: false
  });
}

export async function deliverApprovalLifecycle(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
  trigger: ApprovalDeliveryTrigger;
  reviewBasePath?: string;
}): Promise<ApprovalDeliverySummary> {
  const agentId = params.agentId ?? "default";
  let envelope: ApprovalDeliveryEnvelope;
  try {
    envelope = buildApprovalDeliveryEnvelope(params);
  } catch (error) {
    const reasonCode = error instanceof ApprovalDeliveryError ? error.reasonCode : "REQUEST_INTEGRITY_INVALID";
    return withEvidence({
      workspace: params.workspace,
      agentId,
      summary: {
        schemaVersion: "2026-07-11",
        approvalRequestId: params.approvalRequestId,
        status: "BLOCKED",
        reasonCode,
        eventName: null,
        requestDigestSha256: null,
        expiresTs: null,
        channels: [],
        queued: [],
        skipped: [],
        notificationOnly: true,
        proofEligible: false
      }
    });
  }

  const eventName = eventNameForLifecycle(envelope.lifecycle);
  const integrations = verifyIntegrationsConfigSignature(params.workspace);
  if (!integrations.valid) {
    return withEvidence({
      workspace: params.workspace,
      agentId,
      summary: {
        schemaVersion: "2026-07-11",
        approvalRequestId: envelope.approvalRequestId,
        status: "BLOCKED",
        reasonCode: "INTEGRATIONS_UNTRUSTED",
        eventName,
        requestDigestSha256: envelope.requestDigestSha256,
        expiresTs: envelope.expiresTs,
        channels: [],
        queued: [],
        skipped: [],
        notificationOnly: true,
        proofEligible: false
      }
    });
  }

  try {
    const dispatched = await dispatchIntegrationEvent({
      workspace: params.workspace,
      eventName,
      agentId: "approval",
      summary: summaryForLifecycle(envelope.lifecycle),
      details: envelope
    });
    const channels = dispatched.dispatched.map((row) => ({
      channelId: row.channelId,
      deliveryId: row.deliveryId,
      attempts: row.attempts,
      httpStatus: row.httpStatus,
      eventId: row.eventId,
      receiptId: row.receiptId
    }));
    const queued = dispatched.queued.map((row) => ({
      channelId: row.channelId,
      queueId: row.queueId,
      attemptRound: row.attemptRound,
      maxRounds: row.maxRounds,
      nextAttemptTs: row.nextAttemptTs
    }));
    const skipped = dispatched.dispatched.length === 0 && dispatched.queued.length === 0 && dispatched.skipped.length === 0
      ? ["no-routed-channels"]
      : sanitizeSkipped(dispatched.skipped);
    const failed = skipped.some((row) => row.endsWith(":dispatch-failed"));
    const status = queued.length > 0
      ? "QUEUED"
      : channels.length > 0
        ? "DELIVERED"
        : failed
          ? "FAILED"
          : "SKIPPED";
    return withEvidence({
      workspace: params.workspace,
      agentId,
      summary: {
        schemaVersion: "2026-07-11",
        approvalRequestId: envelope.approvalRequestId,
        status,
        reasonCode: status === "QUEUED"
          ? "DELIVERY_QUEUED"
          : status === "DELIVERED"
            ? null
            : status === "FAILED"
              ? "DELIVERY_FAILED"
              : "NO_DELIVERY_ROUTE",
        eventName,
        requestDigestSha256: envelope.requestDigestSha256,
        expiresTs: envelope.expiresTs,
        channels,
        queued,
        skipped,
        notificationOnly: true,
        proofEligible: false
      }
    });
  } catch {
    return withEvidence({
      workspace: params.workspace,
      agentId,
      summary: {
        schemaVersion: "2026-07-11",
        approvalRequestId: envelope.approvalRequestId,
        status: "FAILED",
        reasonCode: "DELIVERY_FAILED",
        eventName,
        requestDigestSha256: envelope.requestDigestSha256,
        expiresTs: envelope.expiresTs,
        channels: [],
        queued: [],
        skipped: [],
        notificationOnly: true,
        proofEligible: false
      }
    });
  }
}

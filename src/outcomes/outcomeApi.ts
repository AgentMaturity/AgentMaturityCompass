import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { openLedger } from "../ledger/ledger.js";
import { resolveAgentId } from "../fleet/paths.js";
import { sha256Hex } from "../utils/hash.js";
import { loadOutcomeContract } from "./outcomeContractEngine.js";

const feedbackPayloadSchema = z.object({
  agentId: z.string().min(1),
  workOrderId: z.string().min(1).optional(),
  userIdHash: z.string().min(1).optional(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().min(1)).optional(),
  comment: z.string().min(1).optional()
});

const outcomeWebhookPayloadSchema = z.object({
  agentId: z.string().min(1),
  signalId: z.string().min(1),
  category: z.enum(["Emotional", "Functional", "Economic", "Brand", "Lifetime"]),
  value: z.union([z.number(), z.string(), z.boolean()]),
  unit: z.string().min(1).optional(),
  ts: z.number().int().optional(),
  workOrderId: z.string().min(1).optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});

function normalizeSig(sigHeader: string): string {
  const trimmed = sigHeader.trim();
  if (trimmed.startsWith("sha256=")) {
    return trimmed.slice("sha256=".length);
  }
  return trimmed;
}

export function verifyHmacSignature(body: string, secret: string, provided: string): boolean {
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const left = Buffer.from(expected, "hex");
  const rightText = normalizeSig(provided);
  if (!/^[0-9a-fA-F]+$/.test(rightText)) {
    return false;
  }
  const right = Buffer.from(rightText, "hex");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function ingestFeedbackOutcome(params: {
  workspace: string;
  payload: unknown;
  trustTier?: "OBSERVED" | "ATTESTED" | "SELF_REPORTED";
}): {
  outcomeEventId: string;
  eventHash: string;
  receiptId: string;
  payloadSha256: string;
} {
  const parsed = feedbackPayloadSchema.parse(params.payload);
  const agentId = resolveAgentId(params.workspace, parsed.agentId);
  const ledger = openLedger(params.workspace);
  try {
    const commentSha = parsed.comment ? sha256Hex(Buffer.from(parsed.comment, "utf8")) : null;
    const tags = parsed.tags ?? [];
    const meta = {
      userIdHash: parsed.userIdHash ?? null,
      tags,
      commentSha256: commentSha,
      source: "feedback.ingest"
    };
    const written = ledger.appendOutcomeEvent({
      ts: Date.now(),
      agentId,
      workOrderId: parsed.workOrderId ?? null,
      category: "Emotional",
      metricId: "feedback.rating",
      value: parsed.rating,
      unit: "1-5",
      trustTier: params.trustTier ?? "ATTESTED",
      source: "import",
      meta,
      payload: JSON.stringify({
        rating: parsed.rating,
        tags,
        commentSha256: commentSha
      })
    });
    return {
      outcomeEventId: written.outcomeEventId,
      eventHash: written.eventHash,
      receiptId: written.receiptId,
      payloadSha256: written.payloadSha256
    };
  } finally {
    ledger.close();
  }
}

export function ingestOutcomeWebhook(params: {
  workspace: string;
  payload: unknown;
  sourceLabel?: string;
  trustTier?: "OBSERVED" | "ATTESTED" | "SELF_REPORTED";
}): {
  outcomeEventId: string;
  eventHash: string;
  receiptId: string;
  payloadSha256: string;
} {
  const parsed = outcomeWebhookPayloadSchema.parse(params.payload);
  const agentId = resolveAgentId(params.workspace, parsed.agentId);
  const ledger = openLedger(params.workspace);
  try {
    const written = ledger.appendOutcomeEvent({
      ts: parsed.ts ?? Date.now(),
      agentId,
      workOrderId: parsed.workOrderId ?? null,
      category: parsed.category,
      metricId: parsed.signalId,
      value: parsed.value,
      unit: parsed.unit ?? null,
      trustTier: params.trustTier ?? "OBSERVED",
      source: "webhook",
      meta: {
        ...(parsed.meta ?? {}),
        sourceLabel: params.sourceLabel ?? "outcomes.webhook"
      },
      payload: JSON.stringify(parsed)
    });

    const sessionId = `outcome-webhook-${Date.now()}`;
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-outcomes-webhook",
      binarySha256: "amc-outcomes-webhook"
    });
    ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "OUTCOME_WEBHOOK_INGESTED",
        agentId,
        signalId: parsed.signalId,
        payloadSha256: written.payloadSha256
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        auditType: "OUTCOME_WEBHOOK_INGESTED",
        agentId,
        signalId: parsed.signalId,
        payloadSha256: written.payloadSha256,
        trustTier: "OBSERVED"
      },
      receipt: {
        kind: "guard_check",
        agentId,
        providerId: "outcomes",
        model: null,
        bodySha256: written.payloadSha256
      }
    });
    ledger.sealSession(sessionId);

    return {
      outcomeEventId: written.outcomeEventId,
      eventHash: written.eventHash,
      receiptId: written.receiptId,
      payloadSha256: written.payloadSha256
    };
  } finally {
    ledger.close();
  }
}

export function outcomeMetricExistsInContract(workspace: string, agentId: string, metricId: string): boolean {
  try {
    const contract = loadOutcomeContract(workspace, agentId);
    return contract.outcomeContract.metrics.some((metric) => metric.metricId === metricId);
  } catch {
    return false;
  }
}

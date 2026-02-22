import type { Ledger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";

export function appendBridgeRequestReceipt(params: {
  ledger: Ledger;
  sessionId: string;
  payload: {
    requestId: string;
    correlationId: string;
    runId: string;
    provider: string;
    model: string | null;
    requestKind: string;
    leaseCarrier: string | null;
    bodySha256: string;
    summary: string;
    traceparent?: string;
    tracestate?: string;
    traceId?: string;
    promptPackSha256?: string;
    promptPackId?: string;
    promptTemplateId?: string;
    cgxPackSha256?: string;
  };
  agentId: string;
}): {
  eventId: string;
  receipt: string;
  receiptId: string;
  receiptSha256: string;
} {
  const serialized = JSON.stringify(params.payload);
  const out = params.ledger.appendEvidenceWithReceipt({
    sessionId: params.sessionId,
    runtime: "gateway",
    eventType: "llm_request",
    payload: serialized,
    payloadExt: "json",
    inline: false,
    meta: {
      ...params.payload,
      trustTier: "OBSERVED"
    },
    receipt: {
      kind: "llm_request",
      agentId: params.agentId,
      providerId: params.payload.provider,
      model: params.payload.model,
      bodySha256: params.payload.bodySha256
    }
  });
  return {
    eventId: out.id,
    receipt: out.receipt,
    receiptId: out.receiptId,
    receiptSha256: out.receiptSha256
  };
}

export function appendBridgeResponseReceipt(params: {
  ledger: Ledger;
  sessionId: string;
  payload: {
    requestId: string;
    correlationId: string;
    runId: string;
    provider: string;
    model: string | null;
    statusCode: number;
    usage: Record<string, unknown> | null;
    bodySha256: string;
    durationMs: number;
    summary: string;
    traceparent?: string;
    tracestate?: string;
    traceId?: string;
    promptPackSha256?: string;
    promptPackId?: string;
    promptTemplateId?: string;
    cgxPackSha256?: string;
  };
  agentId: string;
}): {
  eventId: string;
  receipt: string;
  receiptId: string;
  receiptSha256: string;
} {
  const serialized = JSON.stringify(params.payload);
  const out = params.ledger.appendEvidenceWithReceipt({
    sessionId: params.sessionId,
    runtime: "gateway",
    eventType: "llm_response",
    payload: serialized,
    payloadExt: "json",
    inline: false,
    meta: {
      ...params.payload,
      trustTier: "OBSERVED"
    },
    receipt: {
      kind: "llm_response",
      agentId: params.agentId,
      providerId: params.payload.provider,
      model: params.payload.model,
      bodySha256: params.payload.bodySha256
    }
  });
  return {
    eventId: out.id,
    receipt: out.receipt,
    receiptId: out.receiptId,
    receiptSha256: out.receiptSha256
  };
}

export function appendBridgeAudit(params: {
  ledger: Ledger;
  sessionId: string;
  auditType: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details: Record<string, unknown>;
}): string {
  const payload = JSON.stringify({
    auditType: params.auditType,
    severity: params.severity,
    ...params.details
  });
  return params.ledger.appendEvidence({
    sessionId: params.sessionId,
    runtime: "gateway",
    eventType: "audit",
    payload,
    payloadExt: "json",
    inline: true,
    meta: {
      auditType: params.auditType,
      severity: params.severity,
      trustTier: "OBSERVED",
      bodySha256: sha256Hex(Buffer.from(payload, "utf8")),
      ...params.details
    }
  });
}

export function appendBridgeOutputValidated(params: {
  ledger: Ledger;
  sessionId: string;
  agentId: string;
  payload: {
    requestId: string;
    correlationId: string;
    runId: string;
    provider: string;
    model: string | null;
    status: "PASS" | "FAIL";
    reasons: string[];
    missingEvidenceRefs: string[];
    violationCount: number;
    promptPackSha256?: string;
    promptPackId?: string;
    promptTemplateId?: string;
    cgxPackSha256?: string;
  };
}): string {
  const serialized = JSON.stringify(params.payload);
  return params.ledger.appendEvidence({
    sessionId: params.sessionId,
    runtime: "gateway",
    eventType: "output_validated",
    payload: serialized,
    payloadExt: "json",
    inline: false,
    meta: {
      ...params.payload,
      trustTier: "OBSERVED"
    }
  });
}

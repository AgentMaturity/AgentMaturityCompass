import type { Ledger } from "../ledger/ledger.js";
import { defaultGatewayConfig, loadGatewayConfig } from "../gateway/config.js";
import { redactBody } from "../gateway/redaction.js";
import { sha256Hex } from "../utils/hash.js";

export function redactToolPayload(workspace: string, payload: string): {
  redacted: string;
  wasRedacted: boolean;
  bodySha256: string;
} {
  let redaction = defaultGatewayConfig().redaction;
  try {
    redaction = loadGatewayConfig(workspace).redaction;
  } catch {
    // fall back to defaults
  }
  const body = Buffer.from(payload, "utf8");
  const redacted = redactBody(body, "application/json", redaction);
  return {
    redacted: redacted.redactedBytes.toString("utf8"),
    wasRedacted: redacted.wasRedacted,
    bodySha256: sha256Hex(redacted.redactedBytes)
  };
}

export function appendToolEvidenceWithReceipt(params: {
  ledger: Ledger;
  workspace: string;
  sessionId: string;
  agentId: string;
  providerId?: string;
  toolName: string;
  eventType: "tool_action" | "tool_result" | "audit";
  payload: Record<string, unknown>;
  trustTier?: string;
  extraMeta?: Record<string, unknown>;
}): { eventId: string; receipt?: string } {
  const providerId = params.providerId ?? "toolhub";
  const payloadText = JSON.stringify(params.payload);
  const redacted = redactToolPayload(params.workspace, payloadText);

  if (params.eventType === "tool_action" || params.eventType === "tool_result") {
    const out = params.ledger.appendEvidenceWithReceipt({
      sessionId: params.sessionId,
      runtime: "unknown",
      eventType: params.eventType,
      payload: redacted.redacted,
      payloadExt: "json",
      inline: true,
      meta: {
        toolName: params.toolName,
        trustTier: params.trustTier ?? "OBSERVED",
        agentId: params.agentId,
        bodySha256: redacted.bodySha256,
        bodyRedacted: redacted.wasRedacted,
        ...(params.extraMeta ?? {})
      },
      receipt: {
        kind: params.eventType,
        agentId: params.agentId,
        providerId,
        model: null,
        bodySha256: redacted.bodySha256
      }
    });
    return {
      eventId: out.id,
      receipt: out.receipt
    };
  }

  const eventId = params.ledger.appendEvidence({
    sessionId: params.sessionId,
    runtime: "unknown",
    eventType: "audit",
    payload: redacted.redacted,
    payloadExt: "json",
    inline: true,
      meta: {
        toolName: params.toolName,
        trustTier: params.trustTier ?? "OBSERVED",
        agentId: params.agentId,
        bodySha256: redacted.bodySha256,
        bodyRedacted: redacted.wasRedacted,
        ...(params.extraMeta ?? {}),
        ...(params.payload as Record<string, unknown>)
      }
  });
  return { eventId };
}

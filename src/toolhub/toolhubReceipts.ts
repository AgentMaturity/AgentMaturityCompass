import type { Ledger } from "../ledger/ledger.js";
import { defaultGatewayConfig, loadGatewayConfig } from "../gateway/config.js";
import { redactBody } from "../gateway/redaction.js";
import { nestedJsonRedactor, redactJsonLeaves } from "../dataflow/detectors.js";
import { protectedDataOptedIn } from "../dataflow/processorRegistry.js";
import { tokenizeDeclared } from "../dataflow/redactingSession.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { sha256Hex } from "../utils/hash.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "./toolhubValidators.js";

const MARKER = "[REDACTED]";

/**
 * Where the workspace opted in (P2-02), a tool_result payload's `result` with the values its signed tool definition
 * declares in `protectedFields` replaced by the marker, by the native session's walk (arrays fan out, an object or array
 * end covers every key and leaf beneath it, JSON held in a string leaf is followed), and every whole repeat of one of
 * them too. Null, so the caller stores nothing of the body, when the tools config does not verify or the walk fails.
 */
function withDeclaredFields(workspace: string, toolName: string, payload: Record<string, unknown>): Record<string, unknown> | null {
  try {
    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (snapshot.config === null) return snapshot.signatureExists ? null : payload;
    const declared = findToolDefinition(snapshot.config, toolName)?.protectedFields;
    if (declared === undefined || Object.keys(declared).length === 0 || !Object.hasOwn(payload, "result")) return payload;
    const values = new Map<string, ProtectedDataClass>(), matched = new Set<string>();
    const result = tokenizeDeclared(payload.result, declared, () => MARKER, matched, () => false, values);
    if (matched.size === 0) return payload;
    const repeats = nestedJsonRedactor((text) => values.has(text) ? MARKER : text, () => MARKER);
    return { ...payload, result: values.size === 0 ? result : redactJsonLeaves(result, repeats, () => MARKER) };
  } catch {
    return null;
  }
}

function redactToolPayload(workspace: string, payload: Record<string, unknown> | string, toolName?: string): {
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
  // P2-02: the protected-data detectors and declared fields run only where the workspace opted in.
  const protectedData = protectedDataOptedIn(workspace);
  const declared = protectedData && toolName !== undefined && typeof payload !== "string" ? withDeclaredFields(workspace, toolName, payload) : payload;
  const text = declared === null ? JSON.stringify(MARKER) : typeof declared === "string" ? declared : JSON.stringify(declared);
  const redacted = redactBody(Buffer.from(text, "utf8"), "application/json", redaction, { protectedData });
  return {
    redacted: redacted.redactedBytes.toString("utf8"),
    wasRedacted: redacted.wasRedacted || declared !== payload,
    bodySha256: sha256Hex(redacted.redactedBytes)
  };
}

/**
 * A copy of call facts for evidence meta and digests (a denial's message and the blast-radius consent quote argument
 * paths): where the workspace opted in, redacted as a payload is, so neither the copy nor a digest over it can be matched
 * against guessed raw arguments. Elsewhere the value itself.
 */
export function redactedEvidenceValue(workspace: string, value: unknown): unknown {
  if (value === undefined || !protectedDataOptedIn(workspace)) return value;
  return JSON.parse(redactToolPayload(workspace, JSON.stringify(value)).redacted) as unknown;
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
  const redacted = redactToolPayload(params.workspace, params.payload, params.eventType === "tool_result" ? params.toolName : undefined);

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

  // The meta copy of an audit payload is the redacted one, never the raw object.
  const stored = JSON.parse(redacted.redacted) as unknown;
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
        ...(stored !== null && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {})
      }
  });
  return { eventId };
}

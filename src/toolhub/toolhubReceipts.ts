import type { Ledger } from "../ledger/ledger.js";
import { defaultGatewayConfig, loadGatewayConfig } from "../gateway/config.js";
import { redactBody } from "../gateway/redaction.js";
import type { DeclaredFields } from "../dataflow/detectors.js";
import { protectedDataOptedIn } from "../dataflow/processorRegistry.js";
import { sha256Hex } from "../utils/hash.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "./toolhubValidators.js";

const MARKER = "[REDACTED]";

/**
 * The `protectedFields` a tool_result's signed tool definition declares, for the walk to cover under the payload's
 * `result` (P2-02, opted-in workspaces): undefined when it declares none or the tools config is unsigned, null, so the
 * caller stores nothing of the body, when the tools config does not verify or cannot be read.
 */
function declaredFieldsOf(workspace: string, toolName: string): DeclaredFields | undefined | null {
  try {
    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (snapshot.config === null) return snapshot.signatureExists ? null : undefined;
    const declared = findToolDefinition(snapshot.config, toolName)?.protectedFields;
    return declared === undefined || Object.keys(declared).length === 0 ? undefined : declared;
  } catch {
    return null;
  }
}

/**
 * A payload as evidence stores it: `redactBody`, so where the workspace opted in the protected-data walk runs over it, a
 * tool_result's declared fields (`declaredFieldsOf`) covered under `result` the native session's way (arrays fan out, an
 * object or array end covers every key and leaf beneath it, JSON held in a string is followed) and every repeat of one of
 * their values replaced too, with `[REDACTED]`.
 */
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
  // P2-02: the protected-data walk and declared fields run only where the workspace opted in.
  const protectedData = protectedDataOptedIn(workspace);
  const fields = protectedData && toolName !== undefined && typeof payload !== "string" ? declaredFieldsOf(workspace, toolName) : undefined;
  const text = fields === null ? JSON.stringify(MARKER) : typeof payload === "string" ? payload : JSON.stringify(payload);
  const redacted = redactBody(Buffer.from(text, "utf8"), "application/json", redaction,
    { protectedData, declared: fields ? { fields, at: ["result"] } : undefined });
  return {
    redacted: redacted.redactedBytes.toString("utf8"),
    wasRedacted: redacted.wasRedacted || fields === null,
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

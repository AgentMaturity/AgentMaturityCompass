import { appendHumanActionEvent, prepareHumanActionEvent } from "../auth/humanLog.js";
import { openLedger } from "../ledger/ledger.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { sha256Hex } from "../utils/hash.js";

interface StudioAuditInput {
  workspace: string;
  auditType: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  agentId?: string;
  payload: Record<string, unknown>;
}
function humanTypeFor(auditType: string): string | null {
    if (auditType === "HUMAN_LOGIN_SUCCESS") return "HUMAN_LOGIN_SUCCESS";
    if (auditType === "HUMAN_LOGIN_FAILED") return "HUMAN_LOGIN_FAILED";
    if (auditType === "APPROVAL_DECIDED" || auditType === "CONSOLE_APPROVAL_DECIDED") return "HUMAN_APPROVAL_DECISION";
    if (auditType === "CONSOLE_TARGET_DRAFT_APPLIED") return "HUMAN_TARGET_APPLY";
    if (auditType === "POLICY_PACK_APPLIED" || auditType === "HUMAN_POLICY_PACK_APPLY") return "HUMAN_POLICY_PACK_APPLY";
    if (auditType === "HUMAN_FREEZE_LIFT") return "HUMAN_FREEZE_LIFT";
    if (auditType.startsWith("OPS_")) return "HUMAN_OPS_ACTION";
    if (auditType.startsWith("ORG_")) return "HUMAN_ORG_ACTION";
    return null;

}
function humanInput(params: StudioAuditInput, type: string) {
  return { workspace: params.workspace, type, agentId: params.agentId ?? null,
    username: typeof params.payload.username === "string" ? params.payload.username : null, payload: params.payload };
}
function primaryAudit(params: StudioAuditInput): { eventId: string; receiptId: string } {
  const ledger = openLedger(params.workspace);
  const sessionId = `studio-audit-${Date.now()}`;
  const body = JSON.stringify({
    auditType: params.auditType,
    severity: params.severity ?? "MEDIUM",
    ...params.payload
  });
  const bodySha = sha256Hex(Buffer.from(body, "utf8"));
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-studio",
      binarySha256: "amc-studio"
    });
    const out = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: body,
      payloadExt: "json",
      inline: true,
      meta: {
        auditType: params.auditType,
        severity: params.severity ?? "MEDIUM",
        trustTier: "OBSERVED",
        bodySha256: bodySha,
        ...(params.agentId ? { agentId: params.agentId } : {}),
        ...params.payload
      },
      receipt: {
        kind: "guard_check",
        agentId: params.agentId ?? "unknown",
        providerId: "unknown",
        model: null,
        bodySha256: bodySha
      }
    });
    ledger.sealSession(sessionId);
    // Fire-and-forget integration routing for deterministic ops hooks.
    if (params.auditType !== "INTEGRATION_DISPATCHED") {
      void dispatchIntegrationEvent({
        workspace: params.workspace,
        eventName: params.auditType,
        agentId: params.agentId ?? "system",
        summary: `AMC audit event ${params.auditType}`,
        details: {
          source: "studio-audit",
          auditEventId: out.id
        }
      }).catch(() => {
        // Integration channel failures must not block core audit persistence.
      });
    }
    return {
      eventId: out.id,
      receiptId: out.receiptId
    };
  } finally {
    ledger.close();
  }
}
/** Retained synchronous path, including held approval callbacks. */
export function writeStudioAuditEvent(params: StudioAuditInput): { eventId: string; receiptId: string } {
  const type = humanTypeFor(params.auditType);
  if (type) {
    try { appendHumanActionEvent(humanInput(params, type)); }
    catch { /* Human publication never rolls back or replaces the primary audit. */ }
  }
  return primaryAudit(params);
}
/** Internal actual Studio caller only: fixed inputs, no root SDK/auth forwarding channel. */
export async function writeStudioAuditEventAsync(params: StudioAuditInput, assertActorCurrent?: () => void): Promise<{ eventId: string; receiptId: string }> {
  const input: StudioAuditInput = { ...params, payload: JSON.parse(JSON.stringify(params.payload)) as Record<string, unknown> };
  const type = humanTypeFor(input.auditType);
  if (type) {
    try {
      assertActorCurrent?.();
      const plan = await prepareHumanActionEvent(humanInput(input, type), assertActorCurrent);
      plan.publish(assertActorCurrent);
    } catch { /* Secondary refusal/partial publication does not undo a completed primary action or emit HTTP denial. */ }
  }
  return primaryAudit(input);
}

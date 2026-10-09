/**
 * A4 audit mirrors (P1-57; design §6.4 step 6). The signed A4_STATE row the store writes is the ledger audit record of
 * every transition, so no second ledger row is written here (only src/a4/a4Store.ts emits A4_STATE). Gate requests,
 * decisions and holds are mirrored to the human action log (`appendHumanActionEvent`) and dispatched as a
 * notification-only integration event linking to the project page (`deliverApprovalLifecycle` accepts only
 * /console/approvals review paths, so A4 dispatches its own). Both are best effort and never decide anything.
 * Host mode's `appendHostAudit` needs the host directory, which the per-workspace Studio does not receive (C-29); it
 * joins with P2-33.
 */
import { appendHumanActionEvent } from "../auth/humanLog.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";

export type A4AuditType = "A4_GATE_OPENED" | "A4_GATE_DECIDED" | "A4_HOLD";

export function auditA4(workspace: string, input: { type: A4AuditType; agentId: string; projectId: string; username: string; summary: string;
  details: Record<string, unknown> }): void {
  const details = { projectId: input.projectId, link: `/console/a4Project?project=${encodeURIComponent(input.projectId)}`, ...input.details };
  try {
    appendHumanActionEvent({ workspace, type: input.type, agentId: input.agentId, username: input.username, payload: details });
  } catch {
    // The signed A4_STATE row is the record; the human log is a mirror.
  }
  // An unsigned or absent integrations config refuses to dispatch; the notification is optional.
  void dispatchIntegrationEvent({ workspace, eventName: input.type, agentId: input.agentId, summary: input.summary, details }).catch(() => undefined);
}

/**
 * An explicit request becomes a proposal (SH-INTEG-02): one signed approval request in the agent's existing inbox,
 * decided by a human with `amc approvals approve|deny` or Studio. The request binds the signed work order (the engine
 * verifies and hashes it), the observation's identity and the policy digest; its quorum floor is one approval, so a
 * class the signed approval policy auto-allows still waits for a person.
 *
 * The approvals engine does not deduplicate by intentId, so the proposals table is reserved before the request is
 * created and completed after; a crashed filer is recovered by intentId. Notification reuses the approval lifecycle
 * delivery (APPROVAL_REQUEST_CREATED through integrations.yaml routing); without integrations.yaml it reports SKIPPED.
 */
import type Database from "better-sqlite3";
import { createApprovalForIntent } from "../../approvals/approvalEngine.js";
import { listApprovalRequests } from "../../approvals/approvalChainStore.js";
import { deliverApprovalLifecycle } from "../../approvals/approvalDelivery.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import type { ActionClass } from "../../types.js";
import { loadWorkOrder } from "../../workorders/workorderEngine.js";
import { releaseProposal, reserveProposal, settleProposal } from "./sourceIntakeStore.js";
import type { SourceObservation } from "./sourceObservationSchema.js";
import type { SourcePolicySource } from "./sourcePolicySchema.js";

export const SOURCE_ADMIT_TOOL = "amc.source.admit";
export const SOURCE_REQUEST_INTENT_SCHEMA = "amc.source-request/v1";

export type ProposalOutcome =
  | { state: "proposed"; approvalRequestId: string; actionClass: ActionClass; notification: string }
  | { state: "already_proposed"; approvalRequestId: string }
  | { state: "held" }
  | { state: "refused"; reason: "work_order_unavailable" | "work_order_agent_mismatch" | "approval_refused"; detail: string };

export function sourceIntentId(observationId: string): string {
  return `source:${observationId}`;
}

/** The most restrictive class the work order allows, so the proposal is filed under the strictest rule it can reach. */
export function proposalActionClass(allowed: readonly ActionClass[]): ActionClass {
  return [...allowed].sort((a, b) => ACTION_CLASSES.indexOf(b) - ACTION_CLASSES.indexOf(a))[0]!;
}

/** The delivery summary's status, so a caller never reads a missing integrations config as a sent notification. */
async function notify(workspace: string, agentId: string, approvalRequestId: string): Promise<string> {
  try {
    const summary = await deliverApprovalLifecycle({ workspace, agentId, approvalRequestId, trigger: "REQUEST_CREATED" });
    return summary.reasonCode === null ? summary.status : `${summary.status}:${summary.reasonCode}`;
  } catch (error) {
    return `FAILED: ${String(error)}`;
  }
}

export async function proposeSourceRequest(params: {
  workspace: string; db: Database.Database; observation: SourceObservation; source: SourcePolicySource;
  sender: { id: number; login: string }; policyDigest: string; now?: number;
}): Promise<ProposalOutcome> {
  const { workspace, db, observation, source } = params;
  const now = params.now ?? Date.now();
  const reservation = reserveProposal(db, observation.observationId, now);
  if (reservation.outcome === "held") return { state: "held" };
  if (reservation.outcome === "existing") {
    const row = reservation.row;
    if (row.state === "proposed" && row.approvalRequestId !== null) return { state: "already_proposed", approvalRequestId: row.approvalRequestId };
    return { state: "refused", reason: "approval_refused", detail: `observation settled as ${row.state}: ${row.reason ?? "no reason"}` };
  }
  const refuse = (reason: Extract<ProposalOutcome, { state: "refused" }>["reason"], detail: string): ProposalOutcome => {
    releaseProposal(db, observation.observationId);
    return { state: "refused", reason, detail };
  };
  // A crashed filer may have created the request before settling the row: recover it by intentId rather than file twice.
  const intentId = sourceIntentId(observation.observationId);
  const recovered = listApprovalRequests({ workspace, agentId: source.agentId }).find((request) => request.intentId === intentId && request.toolName === SOURCE_ADMIT_TOOL);
  if (recovered) {
    settleProposal(db, observation.observationId, { state: "proposed", approvalRequestId: recovered.approvalRequestId }, now);
    return { state: "already_proposed", approvalRequestId: recovered.approvalRequestId };
  }
  let workOrder: ReturnType<typeof loadWorkOrder>;
  try {
    workOrder = loadWorkOrder({ workspace, agentId: source.agentId, workOrderId: source.workOrderId, requireValidSignature: true });
  } catch (error) {
    return refuse("work_order_unavailable", String(error));
  }
  if (workOrder.agentId !== source.agentId) return refuse("work_order_agent_mismatch", `work order belongs to ${workOrder.agentId}, source names ${source.agentId}`);
  const actionClass = proposalActionClass(workOrder.allowedActionClasses);
  let approvalRequestId: string;
  try {
    const created = createApprovalForIntent({
      workspace, agentId: source.agentId, intentId, toolName: SOURCE_ADMIT_TOOL, actionClass, workOrderId: workOrder.workOrderId,
      requestedMode: workOrder.requestedMode, effectiveMode: workOrder.requestedMode, riskTier: workOrder.riskTier,
      quorumFloor: { requiredApprovals: 1 },
      initiator: `github:${params.sender.login}`,
      intentPayload: {
        schema: SOURCE_REQUEST_INTENT_SCHEMA, sourceId: source.id, observationId: observation.observationId, nativeEventId: observation.nativeEventId,
        revisionDigest: observation.revisionDigest, contentSha256: observation.contentSha256, threadKey: observation.primaryThreadKey,
        repositoryId: observation.repository.id, sender: { id: params.sender.id, login: params.sender.login }, policyDigest: params.policyDigest,
        workOrderId: workOrder.workOrderId
      }
    });
    approvalRequestId = created.request.approvalRequestId;
  } catch (error) {
    return refuse("approval_refused", String(error));
  }
  settleProposal(db, observation.observationId, { state: "proposed", approvalRequestId }, now);
  const notification = await notify(workspace, source.agentId, approvalRequestId);
  return { state: "proposed", approvalRequestId, actionClass, notification };
}

/** Records a refusal so `admit --all-pending` does not revisit it; the row keeps the reason, never the body. */
export function recordNotAdmitted(db: Database.Database, observationId: string, reason: string, now = Date.now()): void {
  const reservation = reserveProposal(db, observationId, now);
  if (reservation.outcome !== "reserved") return;
  settleProposal(db, observationId, { state: "not_admitted", reason }, now);
}

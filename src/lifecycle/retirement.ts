/**
 * Retirement (P2-23, backlog A13). Credentials go first, so a failure part-way leaves the agent less able to act, never
 * more: every lease the agent holds is revoked through the signed lease revocation list (one `agent:<id>` row, honoured by
 * verifyLeaseToken), its static Studio token is rotated to an unscoped one nobody holds, and its pending approvals are
 * cancelled. Open outcome_unknown receipts refuse retirement unless an OWNER records an acceptance note. The final
 * LIFECYCLE_TRANSITION row names the ledger head, the retention segments and the agent's bundles at that moment.
 *
 * Retirement never deletes evidence; deletion after retention ends goes through P2-01's executor. P2-25's delegation
 * chain revocation is not wired yet (pending its merge).
 */
import { readdirSync } from "node:fs";
import { listApprovalRequests } from "../approvals/approvalChainStore.js";
import { cancelApprovalRequestForIntent } from "../approvals/approvalEngine.js";
import { getAgentPaths } from "../fleet/paths.js";
import { openLedger } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { revokeLeaseAsync } from "../leases/leaseStore.js";
import { agentLeaseRevocationId } from "../leases/leaseVerifier.js";
import { issueAgentToken, studioAgentTokenPath } from "../studio/studioState.js";
import { pathExists } from "../utils/fs.js";
import { LifecycleError, lifecycleView, transitionAgent, type LifecycleActor, type LifecycleView } from "./governanceLifecycle.js";
import { failOpenReassessments } from "./reassessment.js";

/** Open outcome_unknown executions of the agent (P1-03 journal). */
function outcomeUnknown(workspace: string, agentId: string): string[] {
  const ledger = openLedger(workspace);
  try {
    if (!hasTable(ledger.db, "action_executions")) return [];
    return (ledger.db.prepare("SELECT execution_id FROM action_executions WHERE agent_id = ? AND state = 'outcome_unknown' ORDER BY created_ts")
      .all(agentId) as Array<{ execution_id: string }>).map((row) => row.execution_id);
  } finally {
    ledger.close();
  }
}

/** The evidence the retirement row points at; read, never changed. */
function evidenceAnchors(workspace: string, agentId: string): { ledgerHeadHash: string; retentionSegmentIds: string[]; bundleIds: string[] } {
  const ledger = openLedger(workspace);
  try {
    const head = ledger.db.prepare("SELECT event_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1").get() as { event_hash: string } | undefined;
    const segments = ledger.db.prepare("SELECT DISTINCT archive_segment_id AS id FROM evidence_events WHERE archive_segment_id IS NOT NULL ORDER BY 1")
      .all() as Array<{ id: string }>;
    const bundles = getAgentPaths(workspace, agentId).bundlesDir;
    return { ledgerHeadHash: head?.event_hash ?? "GENESIS", retentionSegmentIds: segments.map((row) => row.id),
      bundleIds: pathExists(bundles) ? readdirSync(bundles).sort() : [] };
  } finally {
    ledger.close();
  }
}

export async function retireAgent(input: { workspace: string; agentId: string; actor: LifecycleActor; note?: string; acceptOutcomeUnknown?: string }):
  Promise<{ id: string; ts: number; view: LifecycleView; retirement: Record<string, unknown> }> {
  const { workspace, agentId, actor } = input;
  if (!actor.roles.includes("OWNER") || actor.via === "amc") throw new LifecycleError("owner_required", "retirement needs an authenticated OWNER", 403);
  const before = lifecycleView(workspace, agentId);
  if (before.state === "retired") throw new LifecycleError("transition_illegal", `agent ${agentId} is already retired`);
  const unknown = outcomeUnknown(workspace, agentId);
  const acceptance = input.acceptOutcomeUnknown?.trim() ?? "";
  if (unknown.length > 0 && acceptance.length === 0) {
    throw new LifecycleError("outcome_unknown_open", `agent ${agentId} has ${unknown.length} outcome_unknown receipt(s) open; reconcile them or record an OWNER acceptance note`);
  }
  const revocation = agentLeaseRevocationId(agentId);
  await revokeLeaseAsync(workspace, revocation, `agent ${agentId} retired (P2-23)`);
  const staticTokenRotated = pathExists(studioAgentTokenPath(workspace, agentId));
  if (staticTokenRotated) {
    issueAgentToken(workspace, agentId, { scopes: [], executeActionClasses: [], grantedBy: { kind: "operator", reason: `agent ${agentId} retired (P2-23); unscoped replacement` } });
  }
  const now = Date.now();
  const cancelledApprovals = listApprovalRequests({ workspace, agentId })
    .filter((request) => request.status === "PENDING" && request.expiresTs > now)
    .map((request) => cancelApprovalRequestForIntent({ workspace, agentId, approvalId: request.approvalRequestId }).approvalRequestId);
  const retirement = { leaseRevocationId: revocation, staticTokenRotated, cancelledApprovals, outcomeUnknown: unknown,
    outcomeUnknownAcceptance: unknown.length > 0 ? { note: acceptance, by: actor.userId } : null, ...evidenceAnchors(workspace, agentId) };
  const written = transitionAgent({ workspace, agentId, to: "retired", actor, note: input.note, retirement });
  failOpenReassessments(workspace, agentId);
  return { ...written, retirement };
}

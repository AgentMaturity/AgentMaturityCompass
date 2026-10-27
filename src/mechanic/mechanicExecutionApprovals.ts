/** Internal same-grant refusal checks after the initial full configuration admission. */
import { verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { approvalRequestBindingDigest, inspectApprovalChainIntegrity, listApprovalDecisions, loadApprovalConsumed, loadApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { evaluateApprovalQuorum } from "../approvals/approvalQuorum.js";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import type { MechanicUpgradePlan } from "./upgradePlanSchema.js";
import { selectAgentId } from "./mechanicExecutionActions.js";
import { inCheckPass } from "../utils/checkPass.js";
type Action = MechanicUpgradePlan["phases"][number]["actions"][number];

export function captureMechanicApprovals(workspace: string, plan: MechanicUpgradePlan) {
  const grants = new Map<Action, { binding: string; initiator: string | undefined; id: string; agentId: string; intentId: string;
    mode: "SIMULATE" | "EXECUTE"; executionId: string | null }>();
  // Preserve the old all-grants configuration-bound check before ANY mutating action.
  for (const phase of plan.phases) for (const action of phase.actions) {
    if (!action.requiresApproval) continue;
    if (!action.approvalRequestId) throw new Error(`action ${action.id} requires approval request before execution`);
    const result = verifyApprovalForExecution({ workspace, approvalId: action.approvalRequestId, expectedAgentId: selectAgentId(plan),
      expectedIntentId: String(action.params.approvalIntentId ?? ""), expectedToolName: "mechanic.plan.execute", expectedActionClass: "SECURITY" });
    if (!result.ok || result.approval === null) throw new Error(`approval not executable for ${action.id}: ${result.error ?? result.status ?? "unknown"}`);
    const request = result.approval;
    grants.set(action, { binding: approvalRequestBindingDigest(request), initiator: request.initiator, id: request.approvalRequestId,
      agentId: request.agentId, intentId: request.intentId, mode: request.effectiveMode, executionId: null });
  }
  const assertGrant = (action: Action, policyPairInFlight: boolean) => {
    const grant = grants.get(action); if (grant === undefined) return;
    const read = () => {
      const request = loadApprovalRequestRecord({ workspace, agentId: grant.agentId, approvalRequestId: grant.id, requireValidSignature: true });
      if (approvalRequestBindingDigest(request) !== grant.binding || request.initiator !== grant.initiator)
        throw new Error("mechanic approval grant changed after initial admission");
      return request;
    };
    const request = read();
    if (!inspectApprovalChainIntegrity({ workspace, agentId: grant.agentId, approvalRequestId: grant.id }).valid)
      throw new Error("mechanic approval chain is no longer valid");
    if (grant.executionId !== null) {
      const consumed = loadApprovalConsumed({ workspace, agentId: grant.agentId, approvalRequestId: grant.id });
      if (consumed === null || consumed.executionId !== grant.executionId) throw new Error("mechanic approval consumption no longer names this execution");
    } else {
      // Do not rebase the old config hashes after a legitimate earlier config action. Only current lifecycle/quorum narrows.
      // A policy-pack action republishes approval-policy.yaml then its .sig; between them the old sidecar cannot verify.
      // That publisher checks both members and the original config signer itself; this check reruns right after it returns.
      if (!policyPairInFlight && !verifyApprovalPolicySignature(workspace).valid) throw new Error("mechanic approval policy signature is no longer valid");
      if (loadApprovalConsumed({ workspace, agentId: grant.agentId, approvalRequestId: grant.id }) !== null)
        throw new Error("mechanic approval was consumed by another execution");
      const decisions = listApprovalDecisions({ workspace, agentId: grant.agentId, approvalRequestId: grant.id });
      if (!inspectApprovalChainIntegrity({ workspace, agentId: grant.agentId, approvalRequestId: grant.id }).valid)
        throw new Error("mechanic approval decision chain is no longer valid");
      // Evaluate the exact authenticated request already checked against the original binding, never a reloaded replacement grant.
      if (evaluateApprovalQuorum({ request, decisions }).status !== "QUORUM_MET" || request.intentId !== grant.intentId || request.effectiveMode !== grant.mode
        || loadApprovalConsumed({ workspace, agentId: grant.agentId, approvalRequestId: grant.id }) !== null)
        throw new Error("mechanic approval is no longer executable");
    }
    if (read().status !== request.status) throw new Error("mechanic approval lifecycle changed during its final check");
  };
  const assertCurrent = inCheckPass((policyPairInFlight: boolean) => { for (const action of grants.keys()) assertGrant(action, policyPairInFlight); });
  return { assertCurrent(policyPairInFlight = false) { assertCurrent(policyPairInFlight); },
    consumed(action: Action, executionId: string) { const grant = grants.get(action); if (grant !== undefined) grant.executionId = executionId; } };
}

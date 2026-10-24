/** Maintained mechanic API suffixes; preserve both existing engine and API log entries. */
import { executeMechanicPlanForAuthority, requestPlanApprovalsForAuthority } from "./executionEngine.js";
import { appendMechanicEntry } from "./mechanicPublication.js";
import { sha256Hex } from "../utils/hash.js";

export async function mechanicPlanRequestApprovalForApiAsync(params: Parameters<typeof requestPlanApprovalsForAuthority>[0]) {
  return mechanicPlanRequestApprovalForAuthority(params, () => {});
}
export async function mechanicPlanRequestApprovalForAuthority(params: Parameters<typeof requestPlanApprovalsForAuthority>[0], beforePublish: () => void) {
  const { result, current } = await requestPlanApprovalsForAuthority({ ...params }, beforePublish);
  try {
    const transparencyHash = await appendMechanicEntry(params.workspace, { type: "MECHANIC_PLAN_APPROVAL_REQUESTED", agentId: result.plan.scope.id,
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(JSON.stringify(result.approvalRequests), "utf8")), id: result.plan.planId } },
      current.run, current.assertInputs, current.state);
    current.assertCurrent(); return { ...result, transparencyHash };
  } catch (cause) { current.failed(cause); }
}
export async function mechanicPlanExecuteForAuthority(params: Parameters<typeof executeMechanicPlanForAuthority>[0], beforePublish: () => void) {
  const { result, current } = await executeMechanicPlanForAuthority({ ...params }, beforePublish);
  try {
    const transparencyHash = await appendMechanicEntry(params.workspace, { type: "MECHANIC_PLAN_EXECUTED", agentId: result.plan.scope.id,
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(JSON.stringify(result.executed), "utf8")), id: result.plan.planId } },
      current.run, current.assertInputs, current.state);
    current.assertCurrent(); return { ...result, transparencyHash };
  } catch (cause) { current.failed(cause); }
}

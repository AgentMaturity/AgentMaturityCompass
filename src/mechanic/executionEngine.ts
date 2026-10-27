import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { createApprovalForIntent, consumeApprovedExecution } from "../approvals/approvalEngine.js";
import { assertVaultMaySign } from "../keys/signingKeys.js";
import { sha256Hex } from "../utils/hash.js";
import { captureMechanicPlanById, loadMechanicPlanById, prepareMechanicPlan, saveMechanicPlan } from "./planStore.js";
import { executeAction, selectAgentId } from "./mechanicExecutionActions.js";
import { captureMechanicApprovals } from "./mechanicExecutionApprovals.js";
import { captureMechanicRun, mechanicProgress, mechanicFailed, appendMechanicEntry, MechanicPublicationError } from "./mechanicPublication.js";
import type { MechanicUpgradePlan } from "./upgradePlanSchema.js";

type RequestParams = { workspace: string; planId: string; actor: string; reason: string };
type ExecuteParams = { workspace: string; planId: string };
type Executed = { actionId: string; status: "EXECUTED" | "SKIPPED"; note: string };
type Consumption = ReturnType<typeof consumeApprovedExecution> & { actionId: string; approvalRequestId: string; attemptedExecutionId: string };
class MechanicExecutionError extends Error {
  readonly code = "MECHANIC_EXECUTION_PARTIAL";
  constructor(readonly executed: readonly Executed[], readonly consumptions: readonly Consumption[], readonly attemptedActionId: string | null,
    readonly completed: readonly string[], readonly phase: string, readonly entryHash: string | null, readonly pendingRecorded: boolean | null,
    readonly recordingErrors: readonly unknown[], readonly publicationError: unknown | null, cause: unknown) {
    super("mechanic execution did not complete; inspect earlier effects and recording failures before retrying", { cause }); this.name = "MechanicExecutionError";
  }
}
function context(workspace: string, planId: string, beforePublish: () => void) {
  const run = captureMechanicRun(workspace, beforePublish), captured = captureMechanicPlanById(workspace, planId), state = mechanicProgress();
  let published: (() => void) | null = null;
  const assertPlan = () => { if (published === null) captured.assertCurrent(); else published(); };
  const assertCurrent = () => { run.beforePublish(); assertPlan(); run.fixed(); };
  return { run, captured, state, assertPlan, assertInputs: assertPlan, assertCurrent, failed(cause: unknown): never { return mechanicFailed(state, cause); }, async save(plan: MechanicUpgradePlan, assertInputs: () => void = () => {}) {
    state.phase = "plan-prepare"; state.entryHash = null; state.pendingRecorded = null;
    run.beforePublish(); assertPlan(); assertInputs(); run.fixed();
    const prepared = await prepareMechanicPlan(workspace, plan, { beforePublish() { run.beforePublish(); run.fixed(); },
      assertInputsCurrent() { assertPlan(); assertInputs(); run.fixed(); } }, captured.destinations);
    state.phase = "plan-publish"; const saved = prepared.publish(); published = prepared.assertCurrent;
    state.completed.push(...[saved.latestPath, saved.latestSigPath, saved.snapshotPath, saved.snapshotSigPath].map(path => relative(workspace, path)));
    return saved;
  }, async log(type: "MECHANIC_PLAN_APPROVAL_REQUESTED" | "MECHANIC_PLAN_EXECUTED" | "MECHANIC_PLAN_EXECUTION_FAILED",
    kind: "approval" | "policy", digest: string, id: string, assertInputs: () => void = () => {}) {
    return appendMechanicEntry(workspace, { type, agentId: selectAgentId(captured.plan), artifact: { kind, sha256: digest, id } }, run, () => { assertPlan(); assertInputs(); }, state);
  } };
}

export function requestPlanApprovals(params: {
  workspace: string;
  planId: string;
  actor: string;
  reason: string;
}): {
  plan: MechanicUpgradePlan;
  approvalRequests: Array<{ actionId: string; approvalRequestId: string; intentId: string }>;
} {
  const plan = loadMechanicPlanById(params.workspace, params.planId);
  const approvals: Array<{ actionId: string; approvalRequestId: string; intentId: string }> = [];
  const planSha = sha256Hex(Buffer.from(JSON.stringify(plan), "utf8"));

  for (const phase of plan.phases) {
    for (const action of phase.actions) {
      if (!action.requiresApproval || action.approvalRequestId) {
        continue;
      }
      assertVaultMaySign(params.workspace, "artifact-seal");
      const intentId = `mechanic-${plan.planId}-${action.id}`;
      const approval = createApprovalForIntent({
        workspace: params.workspace,
        initiator: params.actor,
        agentId: selectAgentId(plan),
        intentId,
        toolName: "mechanic.plan.execute",
        actionClass: "SECURITY",
        requestedMode: "EXECUTE",
        effectiveMode: "EXECUTE",
        riskTier: "high",
        intentPayload: {
          planId: plan.planId,
          actionId: action.id,
          planSha256: planSha,
          reason: params.reason
        },
        leaseConstraints: {
          scopes: [],
          routeAllowlist: [],
          modelAllowlist: []
        }
      });
      action.approvalRequestId = approval.approval.approvalRequestId;
      action.params.approvalIntentId = intentId;
      approvals.push({
        actionId: action.id,
        approvalRequestId: approval.approval.approvalRequestId,
        intentId
      });
    }
  }

  saveMechanicPlan(params.workspace, plan);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "MECHANIC_PLAN_APPROVAL_REQUESTED",
    agentId: selectAgentId(plan),
    artifact: {
      kind: "approval",
      sha256: sha256Hex(Buffer.from(JSON.stringify(approvals), "utf8")),
      id: plan.planId
    }
  });

  return {
    plan,
    approvalRequests: approvals
  };
}

/** Internal maintained request path. The approval producer remains its existing held synchronous boundary. */
export async function requestPlanApprovalsForAuthority(params: RequestParams, beforePublish: () => void) {
  const input = { ...params }, current = context(input.workspace, input.planId, beforePublish), plan = current.captured.plan;
  const approvals: Array<{ actionId: string; approvalRequestId: string; intentId: string }> = [];
  const planSha = sha256Hex(Buffer.from(JSON.stringify(plan), "utf8"));
  try {
    for (const phase of plan.phases) for (const action of phase.actions) {
      if (!action.requiresApproval || action.approvalRequestId) continue;
      current.state.phase = "approval-request"; current.assertCurrent(); assertVaultMaySign(input.workspace, "artifact-seal");
      const intentId = `mechanic-${plan.planId}-${action.id}`;
      const approval = createApprovalForIntent({ workspace: input.workspace, initiator: input.actor, agentId: selectAgentId(plan), intentId,
        toolName: "mechanic.plan.execute", actionClass: "SECURITY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high",
        intentPayload: { planId: plan.planId, actionId: action.id, planSha256: planSha, reason: input.reason },
        leaseConstraints: { scopes: [], routeAllowlist: [], modelAllowlist: [] } });
      action.approvalRequestId = approval.approval.approvalRequestId; action.params.approvalIntentId = intentId;
      approvals.push({ actionId: action.id, approvalRequestId: approval.approval.approvalRequestId, intentId });
      current.state.completed.push(`approval-request:${approval.approval.approvalRequestId}`); current.assertCurrent();
    }
    await current.save(plan);
    await current.log("MECHANIC_PLAN_APPROVAL_REQUESTED", "approval", sha256Hex(Buffer.from(JSON.stringify(approvals), "utf8")), plan.planId);
    current.assertCurrent();
    return { result: { plan, approvalRequests: approvals }, current };
  } catch (cause) { mechanicFailed(current.state, cause); }
}
/** Internal trusted caller boundary; the callback adds only refusal to original authority and actual grant checks. */
export async function executeMechanicPlanForAuthority(params: ExecuteParams, beforePublish: () => void) {
  const input = { ...params }, current = context(input.workspace, input.planId, beforePublish), plan = current.captured.plan;
  const grants = captureMechanicApprovals(input.workspace, plan), executed: Executed[] = [], consumptions: Consumption[] = [];
  let attemptedActionId: string | null = null;
  const assertCurrent = () => { current.run.beforePublish(); current.assertPlan(); grants.assertCurrent(); current.run.fixed(); };
  const fail = (cause: unknown, recordingErrors: readonly unknown[] = []): never => {
    let publicationError: unknown | null = null;
    try { mechanicFailed(current.state, recordingErrors.at(-1) ?? cause); }
    catch (projected) { if (projected !== (recordingErrors.at(-1) ?? cause)) publicationError = projected; }
    const progress = publicationError instanceof MechanicPublicationError ? publicationError : current.state;
    throw new MechanicExecutionError(Object.freeze([...executed]), Object.freeze([...consumptions]), attemptedActionId,
      Object.freeze([...progress.completed]), progress.phase, progress.entryHash, progress.pendingRecorded,
      Object.freeze([...recordingErrors]), publicationError, cause);
  };
  for (const phase of plan.phases) for (const action of phase.actions) {
    attemptedActionId = action.id;
    try {
      const beforeEffect = () => { current.run.beforePublish(); current.assertPlan(); grants.assertCurrent(); current.run.fixed(); };
      current.state.phase = `action:${action.id}`; current.state.entryHash = null; current.state.pendingRecorded = null; beforeEffect();
      if (action.approvalRequestId) assertVaultMaySign(input.workspace, "artifact-seal");
      const out = await executeAction({ workspace: input.workspace, plan, action, beforeEffect,
        recordEffect(effect) { current.state.completed.push(effect); } });
      // A returned action effect exists even if authority or consumption is refused immediately afterward.
      executed.push({ actionId: action.id, ...out }); current.state.completed.push(`action:${action.id}:${out.status}`);
      action.executionStatus = out.status; action.executionNote = out.note; action.executedTs = Date.now(); beforeEffect();
      if (action.approvalRequestId) {
        current.state.phase = `approval-consume:${action.id}`;
        const executionId = `${plan.planId}:${action.id}:${randomUUID()}`;
        const consumed = consumeApprovedExecution({ workspace: input.workspace, approvalId: action.approvalRequestId,
          expectedAgentId: selectAgentId(plan), executionId });
        consumptions.push({ ...consumed, actionId: action.id, approvalRequestId: action.approvalRequestId, attemptedExecutionId: executionId });
        if (!consumed.consumed) throw new Error("mechanic approval consumption was a replay; this action may already have taken effect");
        current.state.completed.push(`approval-consumed:${action.approvalRequestId}`); grants.consumed(action, executionId);
      }
      assertCurrent();
    } catch (cause) {
      action.executionStatus = "FAILED"; action.executionNote = String(cause); action.executedTs = Date.now();
      const recordingErrors: unknown[] = [];
      // Preserve the original failed-log then failed-plan order. Neither recording failure replaces the action cause.
      try { await current.log("MECHANIC_PLAN_EXECUTION_FAILED", "policy", sha256Hex(Buffer.from(`${plan.planId}:${action.id}:${String(cause)}`, "utf8")), action.id); }
      catch (recording) { recordingErrors.push(recording); }
      try { await current.save(plan); } catch (recording) { recordingErrors.push(recording); }
      fail(cause, recordingErrors);
    }
  }
  try {
    assertCurrent(); await current.save(plan, grants.assertCurrent);
    await current.log("MECHANIC_PLAN_EXECUTED", "policy", sha256Hex(Buffer.from(JSON.stringify(executed), "utf8")), plan.planId, grants.assertCurrent);
    assertCurrent(); return { result: { plan, executed }, current: { ...current, assertCurrent, failed: fail, assertInputs() { current.assertPlan(); grants.assertCurrent(); } } };
  } catch (cause) { return fail(cause); }
}

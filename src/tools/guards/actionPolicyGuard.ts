import { existsSync } from "node:fs";
import { actionPolicyPath, actionPolicySigPath, loadActionPolicy, verifyActionPolicySignature } from "../../governor/actionPolicyEngine.js";
import { actionPolicyDeclaredAbsent } from "../../governor/actionPolicyStore.js";
import { readGovernorInputs, runGovernorCheck, type GovernorInputs } from "../../governor/governorCli.js";
import type { ActionClass } from "../../types.js";
import { RUN_CODE_TOOL } from "../toolPipeline.js";
import type { ToolExecution, ToolGuard, ToolMode } from "../toolTypes.js";

/**
 * The governor's signed Action Policy on native tool calls (AXR-02), as ToolHub decides it.
 *
 * - No `.amc/action-policy.yaml` in a workspace created without one (its signed absence declaration verifies): not
 *   configured. Native calls are not checked against it (today's behaviour), and readiness and doctor say so.
 * - Removed after signing (no verifying absence declaration: `amc init` always signs a policy), or present but unsigned
 *   or tampered (or its signature left behind): every governed class is denied until it is restored or re-signed.
 * - Present and signed: the decision ToolHub makes for a call without a work order (risk tier `med`, no exec ticket).
 *   A denial denies; a downgrade to SIMULATE narrows the call's mode before it enters (see `actionPolicyMode`).
 */
export type ActionPolicyState = "not configured" | "signed" | "untrusted";

export function actionPolicyState(workspace: string): ActionPolicyState {
  if (!existsSync(actionPolicyPath(workspace))) {
    return existsSync(actionPolicySigPath(workspace)) || !actionPolicyDeclaredAbsent(workspace) ? "untrusted" : "not configured";
  }
  return verifyActionPolicySignature(workspace).valid ? "signed" : "untrusted";
}

const EXECUTION_STAGE_CONDITIONS = new Set(["incident-freeze", "budget-policy-signature", "execution-budget"]);

export interface ActionPolicyCall {
  readonly name: string;
  readonly agentId: string;
  readonly actionClass: ActionClass;
  readonly requestedMode: ToolMode;
  /**
   * A person's signed approval names this call. At entry this is the pipeline's expectation (the call carries, or will
   * be asked for, an approval through an approval gate); at the guard it is read from the bound authorization record,
   * whose approvals the authorization stage rechecks against the exact call and consumes before the body.
   */
  readonly approved?: boolean;
}

/** Whether a person's approval is bound to this call: approvals named in its authorization record. */
function approvalBound(execution: Pick<ToolExecution, "authorization">): boolean {
  return (execution.authorization?.record.authority.approvals.length ?? 0) > 0;
}

/** The classes the signed Action Policy runs as EXECUTE once a person approves the call (`executeOnApproval`). */
export function executeOnApprovalClasses(workspace: string): ReadonlySet<ActionClass> {
  if (actionPolicyState(workspace) !== "signed") return new Set();
  try {
    return new Set(loadActionPolicy(workspace).actions.filter((rule) => rule.executeOnApproval === true).map((rule) => rule.actionClass));
  } catch {
    return new Set();
  }
}

/** The Action Policy's verdict for one call, or null when it does not apply (not configured, or the Code Mode transport). */
function actionPolicyVerdict(workspace: string, call: ActionPolicyCall, read?: { readonly state: ActionPolicyState; readonly inputs: () => GovernorInputs }):
  { readonly denial: string | null; readonly mode: ToolMode; readonly reasons?: readonly string[] } | null {
  // The transport is not a capability; each call it dispatches meets this verdict on its own name and class.
  if (call.name === RUN_CODE_TOOL) return null;
  const state = read?.state ?? actionPolicyState(workspace);
  if (state === "not configured") return null;
  if (state === "untrusted") {
    return { denial: existsSync(actionPolicyPath(workspace))
      ? "Action Policy is present but does not verify; every governed class is denied until .amc/action-policy.yaml is restored or re-signed (amc policy action init)"
      : "Action Policy was removed after signing; every governed class is denied until .amc/action-policy.yaml is restored from backup or re-created (amc policy action init)", mode: "SIMULATE" };
  }
  try {
    const decision = runGovernorCheck({ workspace, agentId: call.agentId, actionClass: call.actionClass, riskTier: "med", mode: call.requestedMode,
      approvedByPerson: call.approved === true, ...(read === undefined ? {} : { inputs: read.inputs() }) });
    if (!decision.allowed) return { denial: `Action Policy denied ${call.actionClass}: ${decision.reasons.join(" ") || decision.matchedRuleId}`, mode: "SIMULATE" };
    // A freeze or an exhausted budget does not run an EXECUTE simulated: ToolHub refuses it at execution, and so does
    // this guard. The mode is left as requested so the budgets guard, composed before this one, names it first.
    if (decision.conditionResults.some((condition) => condition.passed === false && EXECUTION_STAGE_CONDITIONS.has(condition.conditionId))) {
      return { denial: `Action Policy refused EXECUTE of ${call.actionClass}: ${decision.reasons.join(" ")}`, mode: call.requestedMode };
    }
    return { denial: null, mode: decision.effectiveMode, reasons: decision.reasons };
  } catch (error) {
    return { denial: `Action Policy could not be evaluated: ${error instanceof Error ? error.message : String(error)}`, mode: "SIMULATE" };
  }
}

/** The mode a call enters with: SIMULATE where the signed policy downgrades it, otherwise as requested. Never widens. */
export function actionPolicyMode(workspace: string): (call: ActionPolicyCall) => ToolMode {
  return (call) => call.requestedMode === "EXECUTE" && actionPolicyVerdict(workspace, call)?.mode === "SIMULATE" ? "SIMULATE" : call.requestedMode;
}

/**
 * Why a call that asked for EXECUTE ran as SIMULATE (H-3), as one line appended to its output, so the model, print mode,
 * chat and stream-json all say nothing was executed and why. `otherNarrowing` names a narrowing the policy did not make
 * (an approval mode). A call that ran as requested is returned unchanged.
 */
export function simulationNotice(workspace: string, otherNarrowing: string | null): (output: string, call: ActionPolicyCall & { readonly effectiveMode: ToolMode }) => string {
  return (output, call) => {
    // A READ_ONLY body has no effect to withhold: fs.read, glob and grep return real results under SIMULATE, and the
    // few that do hold back (ask_user, tool search) say so in their own output.
    if (call.requestedMode !== "EXECUTE" || call.effectiveMode !== "SIMULATE" || call.actionClass === "READ_ONLY") return output;
    const verdict = actionPolicyVerdict(workspace, call);
    const reasons = verdict?.mode === "SIMULATE" ? (verdict.reasons ?? []) : [];
    const onApproval = verdict?.mode === "SIMULATE" && call.approved !== true && actionPolicyVerdict(workspace, { ...call, approved: true })?.mode === "EXECUTE";
    const why = onApproval
      ? `the signed Action Policy runs ${call.actionClass} only after a person approves the call, and nobody was asked (start the agent with --approval-mode default to be asked)`
      : verdict?.mode === "SIMULATE"
      ? `the signed Action Policy runs ${call.actionClass} as SIMULATE${reasons.length === 0 ? "" : ` (${reasons.slice(0, 2).join("; ")}${reasons.length > 2 ? `; +${reasons.length - 2} more` : ""})`}`
      : otherNarrowing ?? `${call.actionClass} was narrowed to SIMULATE`;
    return `${output}\nsimulated, not executed: ${why}; see \`amc governor check --agent ${call.agentId} --action ${call.actionClass} --risk med --mode execute\``;
  };
}

/**
 * The guard, evaluated again immediately before the body. A policy that narrowed after the call entered (for example a
 * freeze declared meanwhile) denies an EXECUTE call rather than letting it run with the mode it entered with.
 */
export function actionPolicyGuard(workspace: string): ToolGuard {
  return (execution) => {
    const verdict = actionPolicyVerdict(workspace, { ...execution, approved: approvalBound(execution) });
    if (verdict === null) return undefined;
    if (verdict.denial !== null) return verdict.denial;
    return execution.effectiveMode === "EXECUTE" && verdict.mode !== "EXECUTE"
      ? `Action Policy now permits only SIMULATE for ${execution.actionClass}` : undefined;
  };
}

/** What the native runtime does with one class of action in this workspace (UX-06), from the verdict the guard uses. */
export type ActionOutcome = "runs" | "asks a person" | "dry run" | "blocked" | "no signed policy";

/**
 * For each class, what really happens to a call that asks to run it: read from the signed Action Policy in force through
 * the same verdict `actionPolicyGuard` and `actionPolicyMode` apply, with and without a person's approval
 * (`executeOnApproval`). A read returns real results even as a dry run, so a readable READ_ONLY class runs.
 */
export function actionPolicyOutcomes(workspace: string, agentId: string, classes: readonly ActionClass[]):
  Array<{ readonly actionClass: ActionClass; readonly outcome: ActionOutcome; readonly reasons: readonly string[] }> {
  // One read of the policy state and the governor's inputs serves every class of this request (each read alone scans
  // the ledger for budget usage); the guard and the mode still read them fresh for every call.
  let inputs: GovernorInputs | undefined;
  const read = { state: actionPolicyState(workspace), inputs: () => (inputs ??= readGovernorInputs(workspace, agentId)) };
  return classes.map((actionClass) => {
    const call = { name: "governor-outcome", agentId, actionClass, requestedMode: "EXECUTE" as const };
    const alone = actionPolicyVerdict(workspace, call, read);
    if (alone === null) return { actionClass, outcome: "no signed policy", reasons: ["No signed Action Policy applies in this workspace."] };
    if (alone.denial !== null) return { actionClass, outcome: "blocked", reasons: [alone.denial] };
    const reasons = alone.reasons ?? [];
    if (alone.mode === "EXECUTE" || actionClass === "READ_ONLY") return { actionClass, outcome: "runs", reasons };
    const approved = actionPolicyVerdict(workspace, { ...call, approved: true }, read);
    return { actionClass, outcome: approved?.denial === null && approved.mode === "EXECUTE" ? "asks a person" : "dry run", reasons };
  });
}

import { existsSync } from "node:fs";
import { actionPolicyPath, actionPolicySigPath, verifyActionPolicySignature } from "../../governor/actionPolicyEngine.js";
import { actionPolicyDeclaredAbsent } from "../../governor/actionPolicyStore.js";
import { runGovernorCheck } from "../../governor/governorCli.js";
import type { ActionClass } from "../../types.js";
import { RUN_CODE_TOOL } from "../toolPipeline.js";
import type { ToolGuard, ToolMode } from "../toolTypes.js";

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
}

/** The Action Policy's verdict for one call, or null when it does not apply (not configured, or the Code Mode transport). */
function actionPolicyVerdict(workspace: string, call: ActionPolicyCall):
  { readonly denial: string | null; readonly mode: ToolMode; readonly reasons?: readonly string[] } | null {
  // The transport is not a capability; each call it dispatches meets this verdict on its own name and class.
  if (call.name === RUN_CODE_TOOL) return null;
  const state = actionPolicyState(workspace);
  if (state === "not configured") return null;
  if (state === "untrusted") {
    return { denial: existsSync(actionPolicyPath(workspace))
      ? "Action Policy is present but does not verify; every governed class is denied until .amc/action-policy.yaml is restored or re-signed (amc policy action init)"
      : "Action Policy was removed after signing; every governed class is denied until .amc/action-policy.yaml is restored from backup or re-created (amc policy action init)", mode: "SIMULATE" };
  }
  try {
    const decision = runGovernorCheck({ workspace, agentId: call.agentId, actionClass: call.actionClass, riskTier: "med", mode: call.requestedMode });
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
    if (call.requestedMode !== "EXECUTE" || call.effectiveMode !== "SIMULATE") return output;
    const verdict = actionPolicyVerdict(workspace, call);
    const reasons = verdict?.mode === "SIMULATE" ? (verdict.reasons ?? []) : [];
    const why = verdict?.mode === "SIMULATE"
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
    const verdict = actionPolicyVerdict(workspace, execution);
    if (verdict === null) return undefined;
    if (verdict.denial !== null) return verdict.denial;
    return execution.effectiveMode === "EXECUTE" && verdict.mode !== "EXECUTE"
      ? `Action Policy now permits only SIMULATE for ${execution.actionClass}` : undefined;
  };
}

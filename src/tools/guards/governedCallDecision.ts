import { loadActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import { activeFreezeStatus } from "../../drift/freezeEngine.js";
import type { GovernorDecision } from "../../governor/actionPolicyEngine.js";
import { loadVerifiedToolsConfigSnapshot, type VerifiedToolsConfigSnapshot } from "../../toolhub/toolhubValidators.js";
import type { ActionClass } from "../../types.js";
import { freezeToolArguments } from "../toolArguments.js";
import type { LabelledToolGuard, ToolExecution, ToolMode } from "../toolTypes.js";
import { actionPolicyGuard } from "./actionPolicyGuard.js";
import { compiledPolicyDenial } from "./compiledPolicyGuard.js";
import { networkEgressGuard, promptInjectionGuard, runtimeFirewallGuard, toolhubAllowlistGuard } from "./policyGuards.js";

/**
 * One deny-only decision for a governed call, whichever plane dispatches it (AXR-01).
 *
 * The native toolset registers these same guards, under these labels and in this order, on its pipeline
 * (src/agent/agentToolset.ts; the freeze is its authorization stage).
 * ToolHub (createIntent and executeIntent) and hook control (evaluateHookControl) call this function, so the compiled
 * plan, the signed Action Policy, the prompt-injection matcher, the runtime firewall, residency egress, the signed tool
 * allowlist and the freezes give one call the same denial on every plane. It can only deny; each plane keeps its own
 * transport steps (exec tickets, approvals, provider-local asks) outside it, and those can only deny further.
 */
export interface GovernedCall {
  readonly name: string;
  readonly agentId: string;
  readonly actionClass: ActionClass;
  readonly arguments: Record<string, unknown>;
  readonly requestedMode: ToolMode;
}

export interface GovernedCallDenial {
  readonly label: string;
  readonly reason: string;
}

/** A freeze holding this call's class, as the native pipeline and ToolHub refuse it; an unreadable freeze denies. */
function freezeDenial(execution: ToolExecution): string | undefined {
  try {
    const freeze = activeFreezeStatus(execution.workspace, execution.agentId);
    return freeze.active && freeze.actionClasses.includes(execution.actionClass)
      ? `action_class_frozen: incidents ${freeze.incidentIds.join(", ")}` : undefined;
  } catch (error) {
    return `action_class_frozen: the freeze state could not be read: ${String(error)}`;
  }
}

function sharedGuards(workspace: string, readTools: () => VerifiedToolsConfigSnapshot): LabelledToolGuard[] {
  return [
    { label: "compiled-policy", guard: (execution) => {
      try {
        const compiled = loadActiveCompiledPolicy(workspace);
        return compiled ? compiledPolicyDenial(compiled, workspace, execution, readTools, true) : undefined;
      } catch (error) {
        return `compiled policy integrity failure: ${error instanceof Error ? error.message : String(error)}`;
      }
    } },
    { label: "prompt-injection", guard: promptInjectionGuard() },
    { label: "runtime-firewall", guard: runtimeFirewallGuard(workspace) },
    { label: "action-policy", guard: actionPolicyGuard(workspace) },
    { label: "network-egress", guard: networkEgressGuard(workspace, (execution) => execution.arguments, readTools) },
    { label: "tool-allowlist", guard: toolhubAllowlistGuard(workspace, undefined, undefined, (execution) => execution.arguments, readTools) },
    { label: "freeze", guard: freezeDenial }
  ];
}

/**
 * The first denial for `call`, or null. `omit` names checks a plane already decides with more context than this call
 * carries (ToolHub's Action Policy decision uses the work order); omitting one never allows what it would deny elsewhere.
 */
export function governedCallDenial(workspace: string, call: GovernedCall, omit: readonly string[] = []): GovernedCallDenial | null {
  const execution: ToolExecution = {
    token: "governed-call", callId: "governed-call", rootCallId: "governed-call", name: call.name, agentId: call.agentId, workspace,
    actionClass: call.actionClass, requestedMode: call.requestedMode, effectiveMode: call.requestedMode,
    arguments: freezeToolArguments(call.arguments), parentToken: null
  };
  let snapshot: VerifiedToolsConfigSnapshot | null = null;
  const readTools = (): VerifiedToolsConfigSnapshot => (snapshot ??= loadVerifiedToolsConfigSnapshot(workspace));
  for (const { label, guard } of sharedGuards(workspace, readTools)) {
    if (omit.includes(label)) continue;
    let reason: string | undefined;
    try {
      reason = guard(execution);
    } catch (error) {
      reason = `${label} could not be evaluated: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (reason !== undefined) return { label, reason };
  }
  return null;
}

/** A governor decision narrowed by a shared denial: not allowed and SIMULATE, the denial named first. Never widens. */
export function withGovernedCallDenial(decision: GovernorDecision, denial: GovernedCallDenial | null): GovernorDecision {
  return denial === null ? decision
    : { ...decision, allowed: false, effectiveMode: "SIMULATE", reasons: [`${denial.label}: ${denial.reason}`, ...decision.reasons] };
}

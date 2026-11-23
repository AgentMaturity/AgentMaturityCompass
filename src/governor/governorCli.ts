import { loadTargetProfile } from "../targets/targetProfile.js";
import { loadContextGraph } from "../context/contextGraph.js";
import { resolveAgentId } from "../fleet/paths.js";
import { buildGovernorMatrix, renderGovernorMatrixMarkdown } from "./governorReport.js";
import {
  evaluateActionPermission,
  loadActionPolicy,
  summarizeGovernorInput,
  verifyActionPolicySignature
} from "./actionPolicyEngine.js";
import { type ActionClass, type ExecutionMode, type RiskTier } from "../types.js";
import { evaluateBudgetStatus } from "../budgets/budgets.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";

/**
 * What a governor decision reads for one agent, read now: the signed policy and its signature, the target, the run,
 * trust and assurance summary, the budget status (a ledger scan) and any freeze. A caller deciding several classes in
 * one request reads these once (`actionPolicyOutcomes`); nothing is kept between requests.
 */
export function readGovernorInputs(workspace: string, agentIdInput?: string) {
  const agentId = resolveAgentId(workspace, agentIdInput);
  return { agentId, policy: loadActionPolicy(workspace), signatureValid: verifyActionPolicySignature(workspace).valid,
    target: loadTargetProfile(workspace, "default", agentId), summary: summarizeGovernorInput(workspace, agentId),
    budget: evaluateBudgetStatus(workspace, agentId), freeze: activeFreezeStatus(workspace, agentId) };
}
export type GovernorInputs = ReturnType<typeof readGovernorInputs>;

export function runGovernorCheck(params: {
  workspace: string;
  agentId?: string;
  actionClass: ActionClass;
  riskTier: RiskTier;
  mode: ExecutionMode;
  hasExecTicket?: boolean;
  /** See GovernorDecisionInput.approvedByPerson: set only by a caller that verifies the approval against the call. */
  approvedByPerson?: boolean;
  /** Inputs this same request already read for the same workspace and agent (`readGovernorInputs`). */
  inputs?: GovernorInputs;
}) {
  const inputs = params.inputs ?? readGovernorInputs(params.workspace, params.agentId);
  return evaluateActionPermission({
    agentId: inputs.agentId,
    actionClass: params.actionClass,
    riskTier: params.riskTier,
    currentDiagnosticRun: inputs.summary.run,
    targetProfile: inputs.target,
    trustSummary: inputs.summary.trust,
    assuranceSummary: inputs.summary.assurance,
    requestedMode: params.mode,
    freezeStatus: inputs.freeze,
    budgetStatus: inputs.budget,
    hasExecTicket: params.hasExecTicket,
    approvedByPerson: params.approvedByPerson,
    policy: inputs.policy,
    policySignatureValid: inputs.signatureValid
  });
}

export function explainGovernorAction(params: {
  workspace: string;
  agentId?: string;
  actionClass: ActionClass;
}) {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const policy = loadActionPolicy(params.workspace);
  const rule = policy.actions.find((item) => item.actionClass === params.actionClass);
  if (!rule) {
    return {
      actionClass: params.actionClass,
      exists: false,
      details: "No explicit rule. Policy default applies."
    };
  }
  return {
    actionClass: params.actionClass,
    exists: true,
    rule
  };
}

export function buildGovernorReport(params: {
  workspace: string;
  agentId?: string;
  riskTier?: RiskTier;
}): { markdown: string; autonomyAllowanceIndex: number } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const policy = loadActionPolicy(params.workspace);
  const signature = verifyActionPolicySignature(params.workspace);
  const target = loadTargetProfile(params.workspace, "default", agentId);
  const summary = summarizeGovernorInput(params.workspace, agentId);
  const budget = evaluateBudgetStatus(params.workspace, agentId);
  const freeze = activeFreezeStatus(params.workspace, agentId);
  const context = loadContextGraph(params.workspace, agentId);
  const matrix = buildGovernorMatrix({
    policy,
    agentId,
    riskTier: params.riskTier ?? context.riskTier,
    run: summary.run,
    targetProfile: target,
    trust: summary.trust,
    assurance: summary.assurance,
    budget,
    freeze,
    policySignatureValid: signature.valid
  });
  return {
    markdown: renderGovernorMatrixMarkdown(matrix),
    autonomyAllowanceIndex: matrix.autonomyAllowanceIndex
  };
}
// nlPolicy is exported from the governor module

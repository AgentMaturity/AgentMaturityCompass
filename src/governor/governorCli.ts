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

export function runGovernorCheck(params: {
  workspace: string;
  agentId?: string;
  actionClass: ActionClass;
  riskTier: RiskTier;
  mode: ExecutionMode;
  hasExecTicket?: boolean;
}) {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const policy = loadActionPolicy(params.workspace);
  const signature = verifyActionPolicySignature(params.workspace);
  const target = loadTargetProfile(params.workspace, "default", agentId);
  const summary = summarizeGovernorInput(params.workspace, agentId);
  const budget = evaluateBudgetStatus(params.workspace, agentId);
  const freeze = activeFreezeStatus(params.workspace, agentId);
  return evaluateActionPermission({
    agentId,
    actionClass: params.actionClass,
    riskTier: params.riskTier,
    currentDiagnosticRun: summary.run,
    targetProfile: target,
    trustSummary: summary.trust,
    assuranceSummary: summary.assurance,
    requestedMode: params.mode,
    freezeStatus: freeze,
    budgetStatus: budget,
    hasExecTicket: params.hasExecTicket,
    policy,
    policySignatureValid: signature.valid
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

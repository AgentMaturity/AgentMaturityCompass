import { emitGuardEvent } from './evidenceEmitter.js';
export interface DryRunRequest {
  actionType: string;
  target: string;
  params: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface DryRunResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  predictedOutcome: string;
  impact: { scope: string; reversible: boolean; estimatedDuration: string };
  approved: boolean;
  proposedChanges: string[];
}

export type DryRunPlan = DryRunResult;

const HIGH_RISK_ACTIONS = new Set(['delete', 'drop', 'truncate', 'exec', 'deploy', 'send_payment', 'transfer', 'shutdown']);
const MEDIUM_RISK_ACTIONS = new Set(['update', 'modify', 'write', 'create', 'install', 'restart']);

export function dryRunAction(action: DryRunRequest): DryRunResult {
  const actionLower = action.actionType.toLowerCase();
  let riskLevel: DryRunResult['riskLevel'] = 'low';
  let reversible = true;

  if (HIGH_RISK_ACTIONS.has(actionLower)) {
    riskLevel = 'critical';
    reversible = false;
  } else if (MEDIUM_RISK_ACTIONS.has(actionLower)) {
    riskLevel = 'medium';
  }

  if (action.params['force'] || action.params['cascade']) riskLevel = 'critical';
  if (action.params['dryRun'] || action.params['preview']) riskLevel = 'low';

  const proposedChanges = Object.entries(action.params).map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
  const scope = action.target.includes('*') ? 'broad' : 'targeted';

  emitGuardEvent({ agentId: 'system', moduleCode: 'E17', decision: 'allow', reason: 'E17 observation (no allow/deny decision was made here)', severity: 'medium' });
  return {
    riskLevel,
    predictedOutcome: `${action.actionType} on ${action.target}`,
    impact: { scope, reversible, estimatedDuration: riskLevel === 'critical' ? 'minutes' : 'seconds' },
    approved: riskLevel === 'low' || riskLevel === 'medium',
    proposedChanges,
  };
}

export function planDryRun(tool: string, params: Record<string, unknown>): DryRunPlan {
  return dryRunAction({ actionType: tool, target: tool, params });
}
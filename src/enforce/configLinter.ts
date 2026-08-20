import { emitGuardEvent } from './evidenceEmitter.js';
/**
 * Configuration risk linter.
 */

export interface LintFinding {
  riskId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface LintResult {
  passed: boolean;
  findings: LintFinding[];
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'safe';
  riskScore: number;
  score: number;
}

interface LintRule {
  id: string;
  check: (config: Record<string, unknown>) => LintFinding | null;
}

const LINT_RULES: LintRule[] = [
  { id: 'CL001', check: (c) => c['debug'] === true ? { riskId: 'CL001', severity: 'high', description: 'Debug mode enabled in production' } : null },
  { id: 'CL002', check: (c) => c['auditEnabled'] === false ? { riskId: 'CL002', severity: 'critical', description: 'Audit logging disabled' } : null },
  { id: 'CL003', check: (c) => c['maxBudget'] === -1 || c['maxBudget'] === Infinity ? { riskId: 'CL003', severity: 'high', description: 'Unlimited budget configured' } : null },
  { id: 'CL004', check: (c) => c['publicEndpoint'] === true && !c['auth'] ? { riskId: 'CL004', severity: 'critical', description: 'Public endpoint without authentication' } : null },
  { id: 'CL005', check: (c) => c['tlsEnabled'] === false ? { riskId: 'CL005', severity: 'critical', description: 'TLS disabled' } : null },
  { id: 'CL006', check: (c) => typeof c['apiKey'] === 'string' && (c['apiKey'] as string).startsWith('sk-') ? { riskId: 'CL006', severity: 'critical', description: 'Hardcoded API key in config' } : null },
  { id: 'CL007', check: (c) => c['rateLimit'] === 0 || c['rateLimit'] === undefined ? { riskId: 'CL007', severity: 'medium', description: 'No rate limiting configured' } : null },
];

function computeRisk(score: number): LintResult['overallRisk'] {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'safe';
}

export function lintConfig(config: Record<string, unknown>): LintResult {
  const findings: LintFinding[] = [];
  for (const rule of LINT_RULES) {
    const f = rule.check(config);
    if (f) findings.push(f);
  }

  const weights = { critical: 25, high: 15, medium: 8, low: 3 };
  let riskScore = 0;
  for (const f of findings) riskScore += weights[f.severity];
  riskScore = Math.min(100, riskScore);

    const __e25Allowed = findings.length === 0;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E25', severity: 'low', decision: __e25Allowed ? 'allow' : 'deny', reason: `E25 ${__e25Allowed ? 'allowed' : 'denied'}` });
  return { passed: findings.length === 0, findings, overallRisk: computeRisk(riskScore), riskScore, score: riskScore };
}
import { runTrustPipeline, type TrustPipelineResult } from './trustPipeline.js';
import type { PreActionTrustGateRequest } from './shieldGuardOrchestrator.js';

export type RuntimeShieldRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RuntimeShieldAnalysisInput {
  agentId: string;
  action: string;
  toolName: string;
  parameters?: Record<string, unknown>;
  sessionId?: string;
  workspaceId?: string;
  instructionSource?: PreActionTrustGateRequest['instructionSource'];
  sensitiveDataFields?: string[];
  lastVerifiedAt?: number;
  cumulativeConfidence?: number;
  stepNumber?: number;
  previousActions?: string[];
}

export interface RuntimeShieldStageSummary {
  shieldGate: {
    passed: boolean;
    trustScore0to100: number;
    reason: string;
    checks: TrustPipelineResult['stages']['shieldGate']['checks'];
    evidenceId: string;
  };
  formalVerification: TrustPipelineResult['stages']['formalVerification'];
  zkProof: TrustPipelineResult['stages']['zkProof'];
  trustToken: TrustPipelineResult['stages']['trustToken'];
}

export interface RuntimeShieldAnalysisReport {
  mode: 'runtime-action-analysis';
  agentId: string;
  action: string;
  toolName: string;
  sessionId: string;
  workspaceId: string;
  parameters: Record<string, unknown>;
  allowed: boolean;
  blocked: boolean;
  riskLevel: RuntimeShieldRiskLevel;
  score0to100: number;
  shieldTrustScore0to100: number;
  reason: string;
  stages: RuntimeShieldStageSummary;
  evidenceChain: string[];
  evidence: {
    chainLength: number;
    firstHash: string;
    lastHash: string;
    shieldGateEvidenceId: string;
  };
  recommendations: string[];
  processingTimeMs: number;
}

function riskFromPipeline(result: TrustPipelineResult): RuntimeShieldRiskLevel {
  const shieldScore0to100 = Math.round(result.stages.shieldGate.trustScore * 100);

  if (!result.allowed && shieldScore0to100 < 30) return 'critical';
  if (!result.allowed) return 'high';
  if (result.overallTrustScore < 50) return 'high';
  if (result.overallTrustScore < 75) return 'medium';
  if (!result.stages.formalVerification.passed || !result.stages.zkProof.generated || !result.stages.trustToken.issued) {
    return 'medium';
  }
  return 'low';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}

function buildRecommendations(result: TrustPipelineResult, riskLevel: RuntimeShieldRiskLevel): string[] {
  const recommendations: string[] = [...result.stages.shieldGate.recommendations];

  if (!result.allowed) {
    recommendations.push('Do not execute this runtime action until the Shield gate failure is remediated.');
  }
  if (!result.stages.shieldGate.checks.instructionHierarchyValid) {
    recommendations.push('Re-issue the action from a user, developer, or system authority instead of tool-sourced content.');
  }
  if (result.stages.shieldGate.checks.dataLeakageRisk === 'medium' || result.stages.shieldGate.checks.dataLeakageRisk === 'high') {
    recommendations.push('Remove or mask sensitive fields before sending data to the target tool.');
  }
  if (result.stages.shieldGate.checks.credentialFreshness !== 'valid') {
    recommendations.push('Refresh authorization context before allowing the action.');
  }
  if (!result.stages.shieldGate.checks.uncertaintyAcceptable) {
    recommendations.push('Route the action to human review or collect additional confidence evidence.');
  }
  if (result.allowed && !result.stages.formalVerification.passed) {
    recommendations.push('Review formal-verification warnings before treating this as a high-assurance action.');
  }
  if (result.allowed && !result.stages.zkProof.generated) {
    recommendations.push('Regenerate privacy-preserving trust proof before sharing the runtime decision externally.');
  }
  if (result.allowed && !result.stages.trustToken.issued) {
    recommendations.push('Re-run trust-token issuance before exporting portable trust claims.');
  }
  if (riskLevel === 'low') {
    recommendations.push('Action is suitable for execution under the current runtime Shield checks.');
  }

  return unique(recommendations);
}

export async function analyzeRuntimeAction(input: RuntimeShieldAnalysisInput): Promise<RuntimeShieldAnalysisReport> {
  const sessionId = input.sessionId ?? 'cli-session';
  const workspaceId = input.workspaceId ?? process.cwd();
  const parameters = input.parameters ?? {};

  const pipeline = await runTrustPipeline({
    agentId: input.agentId,
    action: input.action,
    toolName: input.toolName,
    parameters,
    sessionId,
    workspaceId,
    instructionSource: input.instructionSource,
    sensitiveDataFields: input.sensitiveDataFields,
    lastVerifiedAt: input.lastVerifiedAt,
    cumulativeConfidence: input.cumulativeConfidence,
    stepNumber: input.stepNumber,
    previousActions: input.previousActions,
  });

  const riskLevel = riskFromPipeline(pipeline);
  const shieldTrustScore0to100 = Math.round(pipeline.stages.shieldGate.trustScore * 100);
  const firstHash = pipeline.evidenceChain[0] ?? '';
  const lastHash = pipeline.evidenceChain[pipeline.evidenceChain.length - 1] ?? '';

  return {
    mode: 'runtime-action-analysis',
    agentId: input.agentId,
    action: input.action,
    toolName: input.toolName,
    sessionId,
    workspaceId,
    parameters,
    allowed: pipeline.allowed,
    blocked: !pipeline.allowed,
    riskLevel,
    score0to100: pipeline.overallTrustScore,
    shieldTrustScore0to100,
    reason: pipeline.stages.shieldGate.reason,
    stages: {
      shieldGate: {
        passed: pipeline.stages.shieldGate.passed,
        trustScore0to100: shieldTrustScore0to100,
        reason: pipeline.stages.shieldGate.reason,
        checks: pipeline.stages.shieldGate.checks,
        evidenceId: pipeline.stages.shieldGate.evidenceId,
      },
      formalVerification: pipeline.stages.formalVerification,
      zkProof: pipeline.stages.zkProof,
      trustToken: pipeline.stages.trustToken,
    },
    evidenceChain: pipeline.evidenceChain,
    evidence: {
      chainLength: pipeline.evidenceChain.length,
      firstHash,
      lastHash,
      shieldGateEvidenceId: pipeline.stages.shieldGate.evidenceId,
    },
    recommendations: buildRecommendations(pipeline, riskLevel),
    processingTimeMs: pipeline.processingTimeMs,
  };
}

import { questionBank } from "../diagnostic/questionBank.js";
import type { DiagnosticReport, LayerName, QuestionScore, TargetProfile } from "../types.js";
import { resolveAgentId } from "../fleet/paths.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import {
  latestRunForAgent,
  summarizeAssuranceForWindow,
  deriveTrustSummaryFromRun,
  verifyActionPolicySignature
} from "../governor/actionPolicyEngine.js";
import { predictGovernorPermissions } from "./governorWhatIf.js";
import { predictBudgetPressure } from "./budgetsWhatIf.js";
import { predictCiGateOutcome } from "./ciGateWhatIf.js";

export interface TargetWhatIfResult {
  agentId: string;
  runId: string | null;
  currentTargetId: string | null;
  changes: Array<{
    questionId: string;
    current: number;
    activeTarget: number;
    proposedTarget: number;
    effectiveBefore: number;
    effectiveAfter: number;
    delta: number;
  }>;
  topChanges: Array<{
    questionId: string;
    effectiveBefore: number;
    effectiveAfter: number;
    delta: number;
  }>;
  effectiveLevels: Record<string, number>;
  governor: ReturnType<typeof predictGovernorPermissions>;
  budgetPressure: ReturnType<typeof predictBudgetPressure>;
  ciGate: ReturnType<typeof predictCiGateOutcome>;
  warnings: string[];
}

function layerScoresFromQuestions(scores: QuestionScore[]): Array<{
  layerName: LayerName;
  avgFinalLevel: number;
  confidenceWeightedFinalLevel: number;
}> {
  const grouped = new Map<LayerName, QuestionScore[]>();
  for (const q of questionBank) {
    const arr = grouped.get(q.layerName) ?? [];
    const found = scores.find((row) => row.questionId === q.id);
    if (found) {
      arr.push(found);
    }
    grouped.set(q.layerName, arr);
  }
  return [...grouped.entries()].map(([layerName, rows]) => {
    const avg = rows.length > 0 ? rows.reduce((sum, row) => sum + row.finalLevel, 0) / rows.length : 0;
    const confidenceWeight = rows.reduce((sum, row) => sum + row.confidence, 0);
    const weighted =
      confidenceWeight > 0 ? rows.reduce((sum, row) => sum + row.finalLevel * row.confidence, 0) / confidenceWeight : avg;
    return {
      layerName,
      avgFinalLevel: Number(avg.toFixed(3)),
      confidenceWeightedFinalLevel: Number(weighted.toFixed(3))
    };
  });
}

function patchedTarget(current: TargetProfile | null, mapping: Record<string, number>): TargetProfile {
  return {
    id: current?.id ?? "whatif",
    name: current?.name ?? "default",
    createdTs: Date.now(),
    contextGraphHash: current?.contextGraphHash ?? "whatif",
    mapping,
    signature: current?.signature ?? "whatif"
  };
}

export function simulateTargetWhatIf(params: {
  workspace: string;
  agentId?: string;
  proposedTarget: Record<string, number>;
}): TargetWhatIfResult {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const run = latestRunForAgent(params.workspace, agentId);
  let activeTarget: TargetProfile | null = null;
  try {
    activeTarget = loadTargetProfile(params.workspace, "default", agentId);
  } catch {
    activeTarget = null;
  }

  const warnings: string[] = [];
  const effectiveLevels: Record<string, number> = {};
  const changes: TargetWhatIfResult["changes"] = [];
  const patchedScores: QuestionScore[] =
    run?.questionScores.map((row) => ({
      ...row
    })) ?? [];

  for (const question of questionBank) {
    const current = run?.questionScores.find((row) => row.questionId === question.id)?.finalLevel ?? 0;
    const active = activeTarget?.mapping[question.id] ?? 0;
    const proposedRaw = params.proposedTarget[question.id] ?? active;
    const proposed = Math.max(0, Math.min(5, Math.round(proposedRaw)));
    const effectiveBefore = Math.min(current, active);
    const effectiveAfter = Math.min(current, proposed);
    const delta = Number((effectiveAfter - effectiveBefore).toFixed(3));
    effectiveLevels[question.id] = effectiveAfter;
    if (proposed < current) {
      warnings.push(`${question.id} target (${proposed}) is below current measured level (${current}); this tightens permissions.`);
    }
    changes.push({
      questionId: question.id,
      current,
      activeTarget: active,
      proposedTarget: proposed,
      effectiveBefore,
      effectiveAfter,
      delta
    });
    const score = patchedScores.find((row) => row.questionId === question.id);
    if (score) {
      score.finalLevel = effectiveAfter;
      score.supportedMaxLevel = Math.min(score.supportedMaxLevel, effectiveAfter);
      if (score.claimedLevel > effectiveAfter) {
        score.claimedLevel = effectiveAfter;
      }
    }
  }

  const target = patchedTarget(activeTarget, Object.fromEntries(changes.map((row) => [row.questionId, row.proposedTarget])));
  const trust = deriveTrustSummaryFromRun(params.workspace, agentId, run);
  const assurance = summarizeAssuranceForWindow(
    params.workspace,
    agentId,
    run?.windowStartTs ?? Date.now() - 14 * 86_400_000,
    run?.windowEndTs ?? Date.now()
  );
  const governor = predictGovernorPermissions({
    workspace: params.workspace,
    agentId,
    run,
    targetProfile: target,
    trust,
    assurance,
    policySignatureValid: verifyActionPolicySignature(params.workspace).valid
  });

  const simulatedReport: DiagnosticReport = run
    ? {
        ...run,
        questionScores: patchedScores,
        layerScores: layerScoresFromQuestions(patchedScores),
        targetProfileId: target.id
      }
    : ({
        agentId,
        runId: "whatif",
        ts: Date.now(),
        windowStartTs: Date.now() - 14 * 86_400_000,
        windowEndTs: Date.now(),
        status: "INVALID",
        verificationPassed: false,
        trustBoundaryViolated: false,
        trustBoundaryMessage: null,
        integrityIndex: 0,
        trustLabel: "DEVELOPING — some evidence, needs more coverage",
        targetProfileId: target.id,
        layerScores: [],
        questionScores: [],
        inflationAttempts: [],
        unsupportedClaimCount: 0,
        contradictionCount: 0,
        correlationRatio: 0,
        invalidReceiptsCount: 0,
        correlationWarnings: [],
        evidenceCoverage: 0,
        evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 0 },
        targetDiff: [],
        prioritizedUpgradeActions: [],
        evidenceToCollectNext: [],
        runSealSig: "",
        reportJsonSha256: ""
      } as DiagnosticReport);

  const ciGate = predictCiGateOutcome({
    workspace: params.workspace,
    agentId,
    report: simulatedReport
  });

  const topChanges = changes
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.questionId.localeCompare(b.questionId))
    .slice(0, 10)
    .map((row) => ({
      questionId: row.questionId,
      effectiveBefore: row.effectiveBefore,
      effectiveAfter: row.effectiveAfter,
      delta: row.delta
    }));

  return {
    agentId,
    runId: run?.runId ?? null,
    currentTargetId: activeTarget?.id ?? null,
    changes,
    topChanges,
    effectiveLevels,
    governor,
    budgetPressure: predictBudgetPressure({
      workspace: params.workspace,
      agentId
    }),
    ciGate,
    warnings
  };
}


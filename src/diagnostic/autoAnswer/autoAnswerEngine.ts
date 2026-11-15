import { captureRunHashAuthority, type RunHashPublicationOptions } from "../../ledger/runHashSignature.js";
import { runReportFailure } from "../../ledger/runReportOutputs.js";
import { runDiagnostic } from "../runner.js";
import { resolveAgentId } from "../../fleet/paths.js";
import { createAgentTransformPlanForApi, createAgentTransformPlanForApiAsync } from "../../transformation/transformApi.js";
import { deriveAutoAnswerResults } from "./autoAnswerEvidenceQueries.js";
import { latestDisplayRun } from "../runReportResolution.js";
import { UnverifiedRecordError } from "../../utils/unverifiedRecordError.js";
import type { DiagnosticReport } from "../../types.js";

export interface AutoAnswerOutput {
  agentId: string;
  runId: string;
  measuredScores: Record<string, number>;
  evidenceCoverage: Record<string, number>;
  unknownReasons: Array<{ questionId: string; reasons: string[] }>;
  questions: ReturnType<typeof deriveAutoAnswerResults>["questions"];
  recommendedUpgradeActions: string[];
  recommendationControls: NonNullable<DiagnosticReport["recommendationControls"]>;
  confidenceSummary: DiagnosticReport["confidenceSummary"];
  integrityIndex: number;
  trustLabel: string;
  evidenceTrustCoverage: DiagnosticReport["evidenceTrustCoverage"];
  reportStatus: DiagnosticReport["status"];
  transformPlan: {
    created: boolean;
    planId: string | null;
    next3Tasks: string[];
  };
}

export async function runAutoAnswer(params: {
  workspace: string;
  agentId?: string;
  window?: string;
  targetName?: string;
  createPlan?: boolean;
}, options: RunHashPublicationOptions = {}): Promise<AutoAnswerOutput> {
  params = { ...params }; options = { ...options }; const actor = options.beforePublish; actor?.();
  const compatibility = Boolean(options.synchronousSeal || process.env.AMC_NO_SIGN === "1"), fixed = captureRunHashAuthority(params.workspace, compatibility), beforePublish = () => { actor?.(); fixed(); };
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const report = await runDiagnostic({
    workspace: params.workspace,
    agentId,
    window: params.window ?? "14d",
    targetName: params.targetName ?? "default",
    claimMode: "auto"
  }, undefined, { ...options, beforePublish });
  let planId: string | null = null;
  let next3Tasks: string[] = [];
  let created = false;
  if (params.createPlan) {
    let completedPlan: string | null = null;
    try {
      const input = { workspace: params.workspace, agentId, to: "targets" as const };
      beforePublish(); const planned = compatibility ? createAgentTransformPlanForApi(input)
        : await createAgentTransformPlanForApiAsync(input, { beforePublish });
      completedPlan = planned.plan.planId; beforePublish(); planId = completedPlan; next3Tasks = [...planned.plan.summary.next3Tasks]; created = true;
    } catch (cause) { runReportFailure([`diagnostic-run:${report.runId}`, ...(completedPlan === null ? [] : [`transform-plan:${completedPlan}`])], "auto-answer-transform-plan", cause); }
  }
  return autoAnswerOutput(agentId, report, { created, planId, next3Tasks });
}

function autoAnswerOutput(agentId: string, report: DiagnosticReport, transformPlan: AutoAnswerOutput["transformPlan"]): AutoAnswerOutput {
  const derived = deriveAutoAnswerResults(report);
  return {
    agentId,
    runId: report.runId,
    measuredScores: derived.measuredScores,
    evidenceCoverage: derived.evidenceCoverage,
    unknownReasons: derived.unknownReasons,
    questions: derived.questions,
    recommendedUpgradeActions: report.prioritizedUpgradeActions.slice(0, 10),
    recommendationControls: (report.recommendationControls ?? []).slice(0, 10),
    confidenceSummary: report.confidenceSummary,
    integrityIndex: report.integrityIndex,
    trustLabel: report.trustLabel,
    evidenceTrustCoverage: report.evidenceTrustCoverage,
    reportStatus: report.status,
    transformPlan
  };
}

/**
 * The auto-answer view of the agent's latest recorded run, for reading only: it runs nothing and writes nothing. Null
 * when there is no run yet. A run whose seal does not verify (edited or unsigned) is refused, never shown as trusted.
 */
export function autoAnswerFromLatestRun(workspace: string, agentId?: string): AutoAnswerOutput | null {
  const resolved = resolveAgentId(workspace, agentId), latest = latestDisplayRun(workspace, resolved);
  if (!latest) return null;
  if (!latest.verified) throw new UnverifiedRecordError("RUN_UNVERIFIED", "The latest score record does not pass its signature check, so it is not shown. Run a new score.");
  return autoAnswerOutput(resolved, latest.report, { created: false, planId: null, next3Tasks: [] });
}

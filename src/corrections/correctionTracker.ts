import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem, getPublicKeyHistory } from "../crypto/keys.js";
import type { DiagnosticReport } from "../types.js";
import type { CorrectionEvent, CorrectionEffectivenessReport, CorrectionTriggerType, CorrectionStatus } from "./correctionTypes.js";
import {
  getCorrectionsByAgent,
  getCorrectionsByQuestion,
  getPendingCorrections,
  getCorrectionById,
  getVerifiedCorrections,
  getCorrectionsByWindow,
  updateCorrectionVerification
} from "./correctionStore.js";

export interface VerificationResult {
  effective: boolean;
  score: number;
  details: Record<string, { before: number; after: number; delta: number }>;
}

/**
 * Verify if a correction was effective by comparing baseline and verification diagnostic reports
 *
 * For each questionId in the correction:
 * - Compare baselineLevels to latestReport's finalLevel
 * - Effective if average delta > 0
 * - Score = avg(delta / (5 - baselineLevel)) clamped to [0,1]
 */
export function verifyCorrection(
  correction: CorrectionEvent,
  latestReport: DiagnosticReport
): VerificationResult {
  if (!correction.baselineLevels || Object.keys(correction.baselineLevels).length === 0) {
    return { effective: false, score: 0, details: {} };
  }

  const details: Record<string, { before: number; after: number; delta: number }> = {};
  const deltas: number[] = [];
  const normalizedDeltas: number[] = [];

  for (const questionId of correction.questionIds) {
    const beforeLevel = correction.baselineLevels[questionId];
    const afterQuestion = latestReport.questionScores.find((q) => q.questionId === questionId);

    if (beforeLevel === undefined) {
      // Question was not in baseline, skip it
      continue;
    }

    if (!afterQuestion) {
      // Question not found in latest report, assume no improvement
      details[questionId] = { before: beforeLevel, after: beforeLevel, delta: 0 };
      deltas.push(0);
      normalizedDeltas.push(0);
      continue;
    }

    const afterLevel = afterQuestion.finalLevel;
    const delta = afterLevel - beforeLevel;
    details[questionId] = { before: beforeLevel, after: afterLevel, delta };
    deltas.push(delta);

    // Normalize by the room for improvement: (5 - beforeLevel)
    const maxGain = 5 - beforeLevel;
    const normalized = maxGain > 0 ? delta / maxGain : 0;
    normalizedDeltas.push(normalized);
  }

  if (deltas.length === 0) {
    return { effective: false, score: 0, details };
  }

  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const effective = avgDelta > 0;

  // Score is average of normalized deltas, clamped to [0, 1]
  const avgNormalized = normalizedDeltas.reduce((a, b) => a + b, 0) / normalizedDeltas.length;
  const score = Math.max(0, Math.min(1, avgNormalized));

  return { effective, score, details };
}

/**
 * Auto-verify all pending corrections for an agent using the latest diagnostic report
 * Updates status to VERIFIED_EFFECTIVE or VERIFIED_INEFFECTIVE
 */
export function autoVerifyPendingCorrections(
  db: Database.Database,
  agentId: string,
  latestReport: DiagnosticReport,
  workspace: string
): CorrectionEvent[] {
  const pending = getPendingCorrections(db, agentId);
  const updated: CorrectionEvent[] = [];

  for (const correction of pending) {
    // Only verify if latestReport is after the correction was applied
    if (latestReport.ts <= correction.createdTs) {
      continue;
    }

    const verification = verifyCorrection(correction, latestReport);
    const newStatus: CorrectionStatus = verification.effective ? "VERIFIED_EFFECTIVE" : "VERIFIED_INEFFECTIVE";

    // Compute the hash for the updated correction
    const hashPayload = canonicalize({
      correctionId: correction.correctionId,
      agentId: correction.agentId,
      triggerType: correction.triggerType,
      triggerId: correction.triggerId,
      questionIds: correction.questionIds,
      correctionDescription: correction.correctionDescription,
      appliedAction: correction.appliedAction,
      status: newStatus,
      baselineRunId: correction.baselineRunId,
      baselineLevels: correction.baselineLevels,
      verificationRunId: latestReport.runId,
      verificationLevels: Object.fromEntries(
        latestReport.questionScores.map((q) => [q.questionId, q.finalLevel])
      ),
      effectivenessScore: verification.score,
      verifiedTs: latestReport.ts,
      verifiedBy: latestReport.runId,
      createdTs: correction.createdTs,
      updatedTs: Date.now()
    });

    const correctionHash = sha256Hex(hashPayload);
    const privateKey = getPrivateKeyPem(workspace, "monitor");
    const signature = signHexDigest(correctionHash, privateKey);

    updateCorrectionVerification(
      db,
      correction.correctionId,
      latestReport.runId,
      Object.fromEntries(latestReport.questionScores.map((q) => [q.questionId, q.finalLevel])),
      verification.score,
      newStatus,
      latestReport.ts,
      latestReport.runId,
      correctionHash,
      signature,
      { workspace }
    );

    const updated_correction = getCorrectionById(db, correction.correctionId);
    if (updated_correction) {
      updated.push(updated_correction);
    }
  }

  return updated;
}

/**
 * Compute the SHA256 hash of a correction for signing
 */
export function computeCorrectionHash(correction: CorrectionEvent): string {
  const canonical = canonicalize({
    correctionId: correction.correctionId,
    agentId: correction.agentId,
    triggerType: correction.triggerType,
    triggerId: correction.triggerId,
    questionIds: correction.questionIds,
    correctionDescription: correction.correctionDescription,
    appliedAction: correction.appliedAction,
    status: correction.status,
    baselineRunId: correction.baselineRunId,
    baselineLevels: correction.baselineLevels,
    verificationRunId: correction.verificationRunId,
    verificationLevels: correction.verificationLevels,
    effectivenessScore: correction.effectivenessScore,
    verifiedTs: correction.verifiedTs,
    verifiedBy: correction.verifiedBy,
    createdTs: correction.createdTs,
    updatedTs: correction.updatedTs
  });
  return sha256Hex(canonical);
}

/**
 * Compute the effectiveness report for corrections in a time window
 */
export function computeEffectivenessReport(
  db: Database.Database,
  agentId: string,
  windowStartTs: number,
  windowEndTs: number
): CorrectionEffectivenessReport {
  const corrections = getCorrectionsByWindow(db, agentId, windowStartTs, windowEndTs);

  const totalCorrections = corrections.length;
  const verifiedCorrections = corrections.filter(
    (c) => c.status === "VERIFIED_EFFECTIVE" || c.status === "VERIFIED_INEFFECTIVE"
  ).length;
  const effectiveCorrections = corrections.filter((c) => c.status === "VERIFIED_EFFECTIVE").length;
  const ineffectiveCorrections = corrections.filter((c) => c.status === "VERIFIED_INEFFECTIVE").length;
  const pendingCorrections = corrections.filter(
    (c) => c.status === "APPLIED" || c.status === "PENDING_VERIFICATION"
  ).length;

  const overallEffectivenessRatio = verifiedCorrections > 0 ? effectiveCorrections / verifiedCorrections : 0;

  // Aggregate by trigger type
  const byTriggerType: Record<CorrectionTriggerType, any> = {
    OWNER_MANUAL: { total: 0, effective: 0, ineffective: 0, ratio: 0 },
    ASSURANCE_FAILURE: { total: 0, effective: 0, ineffective: 0, ratio: 0 },
    DRIFT_EVENT: { total: 0, effective: 0, ineffective: 0, ratio: 0 },
    EXPERIMENT_RESULT: { total: 0, effective: 0, ineffective: 0, ratio: 0 },
    INCIDENT_RESPONSE: { total: 0, effective: 0, ineffective: 0, ratio: 0 },
    POLICY_CHANGE: { total: 0, effective: 0, ineffective: 0, ratio: 0 }
  };

  for (const correction of corrections) {
    if (!byTriggerType[correction.triggerType]) {
      byTriggerType[correction.triggerType] = { total: 0, effective: 0, ineffective: 0, ratio: 0 };
    }

    byTriggerType[correction.triggerType].total++;

    if (correction.status === "VERIFIED_EFFECTIVE") {
      byTriggerType[correction.triggerType].effective++;
    } else if (correction.status === "VERIFIED_INEFFECTIVE") {
      byTriggerType[correction.triggerType].ineffective++;
    }
  }

  // Compute ratios for trigger types
  for (const triggerType of Object.keys(byTriggerType) as CorrectionTriggerType[]) {
    const data = byTriggerType[triggerType];
    const verified = data.effective + data.ineffective;
    data.ratio = verified > 0 ? data.effective / verified : 0;
  }

  // Aggregate by question ID
  const byQuestionId: Record<string, any> = {};

  for (const correction of corrections) {
    for (const questionId of correction.questionIds) {
      if (!byQuestionId[questionId]) {
        byQuestionId[questionId] = { total: 0, effective: 0, avgImprovement: 0, improvements: [] };
      }

      byQuestionId[questionId].total++;

      if (correction.status === "VERIFIED_EFFECTIVE") {
        byQuestionId[questionId].effective++;
      }

      if (correction.verificationLevels && correction.baselineLevels) {
        const before = correction.baselineLevels[questionId];
        const after = correction.verificationLevels[questionId];
        if (before !== undefined && after !== undefined) {
          byQuestionId[questionId].improvements.push(after - before);
        }
      }
    }
  }

  // Compute average improvements and remove the temporary array
  for (const questionId of Object.keys(byQuestionId)) {
    const data = byQuestionId[questionId];
    if (data.improvements.length > 0) {
      data.avgImprovement =
        data.improvements.reduce((a: number, b: number) => a + b, 0) / data.improvements.length;
    }
    delete data.improvements;
  }

  // Identify frequently ineffective questions (>3 corrections, <30% effective)
  const frequentlyIneffective: string[] = [];
  for (const questionId of Object.keys(byQuestionId)) {
    const data = byQuestionId[questionId];
    const threshold = 0.3;
    if (data.total > 3 && data.effective / data.total < threshold) {
      frequentlyIneffective.push(questionId);
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (overallEffectivenessRatio < 0.5 && verifiedCorrections > 5) {
    recommendations.push(
      "Less than 50% of corrections are proving effective. Review correction process and root cause analysis."
    );
  }

  if (frequentlyIneffective.length > 0) {
    recommendations.push(
      `Questions ${frequentlyIneffective.join(", ")} are frequently ineffective targets. Consider alternative approaches.`
    );
  }

  const triggerTypeStats = Object.entries(byTriggerType).find(
    ([_, data]) => data.total > 0 && data.ratio < 0.25
  );
  if (triggerTypeStats) {
    recommendations.push(
      `Corrections from ${triggerTypeStats[0]} are underperforming (${(triggerTypeStats[1].ratio * 100).toFixed(0)}% effective).`
    );
  }

  if (pendingCorrections > 0) {
    recommendations.push(`${pendingCorrections} corrections still pending verification. Schedule diagnostic run.`);
  }

  return {
    agentId,
    windowStartTs,
    windowEndTs,
    totalCorrections,
    verifiedCorrections,
    effectiveCorrections,
    ineffectiveCorrections,
    pendingCorrections,
    overallEffectivenessRatio,
    byTriggerType,
    byQuestionId,
    frequentlyIneffective,
    recommendations
  };
}

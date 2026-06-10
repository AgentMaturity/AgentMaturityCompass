import { describe, expect, test } from "vitest";
import {
  confidenceControlsForQuestion,
  recommendationControlForScore,
  summarizeConfidenceControls
} from "../src/diagnostic/confidenceControls.js";
import { deriveAutoAnswerResults } from "../src/diagnostic/autoAnswer/autoAnswerEvidenceQueries.js";
import { generateReport } from "../src/diagnostic/runner.js";
import type { DiagnosticReport, QuestionScore } from "../src/types.js";

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  const base: QuestionScore = {
    questionId: "AMC-1.1",
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.78,
    evidenceEventIds: ["ev-1", "ev-2", "ev-3"],
    flags: [],
    narrative: "Evidence supports the claim."
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    confidenceControls: confidenceControlsForQuestion(merged)
  };
}

function report(questionScores: QuestionScore[]): DiagnosticReport {
  const recommendationControls = questionScores.map((row) =>
    recommendationControlForScore({
      score: row,
      action: `${row.questionId} action`
    })
  );
  return {
    agentId: "default",
    runId: "confidence-run",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 55, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.76,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Agent Resilience", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }],
    questionScores,
    inflationAttempts: [],
    unsupportedClaimCount: questionScores.filter((row) => row.flags.includes("FLAG_UNSUPPORTED_CLAIM")).length,
    contradictionCount: questionScores.filter((row) => row.flags.includes("FLAG_CONTRADICTION_RISK")).length,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.8,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: questionScores.map((row) => ({ questionId: row.questionId, current: row.finalLevel, target: 5, gap: 5 - row.finalLevel })),
    prioritizedUpgradeActions: recommendationControls.map((row) => row.action),
    recommendationControls,
    confidenceSummary: summarizeConfidenceControls(questionScores, recommendationControls),
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "sha",
  };
}

describe("confidence and uncertainty controls", () => {
  test("marks supported findings as verified and eligible for auto-fix", () => {
    const controls = confidenceControlsForQuestion(score());
    expect(controls.presentationStatus).toBe("verified");
    expect(controls.uncertaintyLevel).toBe("low");
    expect(controls.autoFixAllowed).toBe(true);
    expect(controls.evidenceSufficiency).toBe(1);
  });

  test("downgrades unsupported low-evidence findings and blocks auto-fix", () => {
    const unsupported = score({
      claimedLevel: 5,
      supportedMaxLevel: 1,
      finalLevel: 1,
      confidence: 0.35,
      evidenceEventIds: [],
      flags: ["FLAG_UNSUPPORTED_CLAIM"]
    });
    const controls = unsupported.confidenceControls!;
    const recommendation = recommendationControlForScore({
      score: unsupported,
      action: "Raise confidence only after evidence is collected."
    });

    expect(controls.presentationStatus).toBe("needs_review");
    expect(controls.uncertaintyLevel).toBe("high");
    expect(controls.downgradeReason).toContain("Claim exceeds supported evidence");
    expect(recommendation.autoFixAllowed).toBe(false);
    expect(recommendation.reason).toContain("Claim exceeds supported evidence");
  });

  test("adds simple uncertainty language to markdown reports", () => {
    const supported = score();
    const unsupported = score({
      questionId: "AMC-1.2",
      claimedLevel: 5,
      supportedMaxLevel: 1,
      finalLevel: 1,
      confidence: 0.3,
      evidenceEventIds: [],
      flags: ["FLAG_UNSUPPORTED_CLAIM"]
    });
    const markdown = generateReport(report([supported, unsupported]), "md") as string;

    expect(markdown).toContain("## Confidence and Uncertainty Controls");
    expect(markdown).toContain("Low-Confidence Findings");
    expect(markdown).toContain("Auto-Fix Blocked Recommendations");
    expect(markdown).toContain("| AMC-1.2 | 0.30 | high | blocked | Claim exceeds supported evidence.");
    expect(markdown).toContain("downgrades low-evidence findings and blocks auto-fix");
  });

  test("exposes controls through auto-answer results for Studio filtering", () => {
    const diagnostic = report([
      score({
        questionId: "AMC-1.1",
        evidenceEventIds: [],
        flags: ["FLAG_UNSUPPORTED_CLAIM"],
        claimedLevel: 5,
        supportedMaxLevel: 1,
        finalLevel: 1,
        confidence: 0.3
      })
    ]);
    const derived = deriveAutoAnswerResults(diagnostic);

    expect(derived.questions[0]!.confidenceControls.uncertaintyLevel).toBe("high");
    expect(derived.questions[0]!.confidenceControls.autoFixAllowed).toBe(false);
  });
});

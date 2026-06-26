import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOI = "https://doi.org/10.21203/rs.3.rs-8994957/v1";
const OPENALEX = "https://openalex.org/W7133818764";
const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0657-meta-thinking-marl-score-explainability.md";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) throw new Error(`missing test question ${id}`);
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-1.3",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.87,
    evidenceEventIds: ["ev-gap0657-eval-pack", "ev-gap0657-signed-ledger", "ev-gap0657-ci"],
    flags: [],
    narrative: "GAP-0657 metadata is bounded to AMC-owned question-score explainability evidence.",
    ...overrides,
  };
}

describe("GAP-0657 meta-thinking MARL source-review boundary", () => {
  it("documents live DOI/OpenAlex metadata and the no-bloat relevance decision", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("## Live metadata verification");
    expect(doc).toContain("W7133818764");
    expect(doc).toContain("10.21203/rs.3.rs-8994957/v1");
    expect(doc).toContain("OpenAlex metadata SHA-256: `4710bd1b67e790fdef5975cb443403948ba74c1d09c1ed9286917a95f76a9c12`");
    expect(doc).toContain("DOI CSL metadata SHA-256: `4b63e29c2dc802da59e470537090b37a0475be5d8089533192c39049931a6c51`");
    expect(doc).toContain("Relevant, but only as source-review context for AMC's existing question-level score explainability");
    expect(doc).toContain("Metadata-only DOI/OpenAlex citation remains rejected");
    expect(doc).toContain("No-bloat boundary");
    expect(doc).toContain("does **not** add a meta-thinking subsystem, MARL subsystem");
    expect(doc).toContain("No paper prose, abstract text, figures, tables, datasets, benchmark rows");
  });

  it("binds the paper only through existing question-score explainability and multi-user benchmark lenses", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0657-meta-thinking-review-agent",
      runId: "run-gap-0657-source-review-boundary",
      generatedAt: "2026-06-21T04:34:33.000Z",
      sourceRefs: [DOI, OPENALEX],
      rows: [
        {
          question: question("AMC-1.3"),
          score: score(),
          acceptedEvidence: [
            { id: "ev-gap0657-eval-pack", event_hash: hash("a"), writer_sig: "sig-gap0657-eval-pack", event_type: "artifact", session_id: "session-gap0657", ts: 1, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0657-signed-ledger", event_hash: hash("b"), writer_sig: "sig-gap0657-signed-ledger", event_type: "metric", session_id: "session-gap0657", ts: 2, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0657-ci", event_hash: hash("c"), writer_sig: "sig-gap0657-ci", event_type: "test", session_id: "session-gap0657", ts: 3, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0657-paper-metadata-only", event_hash: hash("d"), writer_sig: "sig-gap0657-paper-metadata", event_type: "review", session_id: "session-gap0657-source", ts: 4, trustTier: "ATTESTED" },
              reason: "DOI/OpenAlex metadata confirms a relevant survey context only; it lacks AMC-owned question evidence, role manifests, interaction traces, evaluator configs, signed rows, thresholds, and repair hints.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0657-question-score-boundary",
              criterionType: "objective_quality",
              status: "satisfied",
              evidenceRefs: ["ev-gap0657-eval-pack", "ev-gap0657-signed-ledger", "ev-gap0657-ci"],
              rejectedEvidenceRefs: ["ev-gap0657-paper-metadata-only"],
              judgeRef: "judge://amc/gap-0657-source-review-boundary",
              repairHint: "Keep meta-thinking/MARL source metadata bounded to AMC-owned question IDs, role manifests, traces, evaluator configs, signed rows, thresholds, and no-paper-copy proof.",
            },
          ],
          multiUserBenchmarkLens: [
            {
              benchmarkId: "gap-0657-amc-owned-multi-agent-eval",
              sourceRef: DOI,
              scenarioId: "metadata-bounded-multi-agent-explainability",
              scenarioFamily: "shared_queue",
              capability: "sequential_coordination",
              datasetManifestHash: hash("e"),
              userRoleManifestHash: hash("f"),
              permissionPolicyHash: hash("1"),
              preferenceProfileHash: hash("2"),
              resourceQueuePolicyHash: hash("3"),
              instructionSetHash: hash("4"),
              interactionTraceHash: hash("5"),
              evaluatorConfigHash: hash("6"),
              resultArtifactHash: hash("7"),
              metricReportHash: hash("8"),
              userRoleCount: 3,
              turnCount: 10,
              privacyPassRate0to1: 0.99,
              minPrivacyPassRate0to1: 0.95,
              coordinationSuccessRate0to1: 0.91,
              minCoordinationSuccessRate0to1: 0.86,
              queueFairnessScore0to1: 0.9,
              minQueueFairnessScore0to1: 0.85,
              instructionFollowingScore0to1: 0.93,
              minInstructionFollowingScore0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-gap0657-eval-pack", "ev-gap0657-signed-ledger", "ev-gap0657-ci"],
              rejectedEvidenceRefs: ["ev-gap0657-paper-metadata-only"],
              repairHint: "Do not treat the survey as a benchmark; require AMC-owned manifests, traces, evaluator configs, signed evidence, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap-0657-question-explainability-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "vitest",
              adapter: "generic_llm_client",
              datasetRef: "amc://gap-0657/question-explainability",
              datasetHash: hash("9"),
              testCaseId: "AMC-1.3:gap-0657-source-review-boundary",
              testCaseHash: hash("0"),
              evaluatorIds: ["question-id", "signed-ledger", "metadata-rejection", "multi-user-lens"],
              evaluatorConfigHash: hash("a"),
              judgeModelRef: "judge://amc/local-source-review",
              experimentRunId: "gap-0657-meta-thinking-marl-boundary",
              experimentResultHash: hash("b"),
              exportArtifactHash: hash("c"),
              ciRunId: "vitest:gap-0657-source-review-boundary",
              ciConfigHash: hash("d"),
              traceArtifactHash: hash("e"),
              toolCallValidationHash: hash("f"),
              agentBehaviorEvaluation: true,
              passRate0to1: 1,
              minPassRate0to1: 0.99,
              averageScore0to1: 0.93,
              threshold0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-gap0657-eval-pack", "ev-gap0657-signed-ledger", "ev-gap0657-ci"],
              rejectedEvidenceRefs: ["ev-gap0657-paper-metadata-only"],
              repairHint: "Preserve source-review/no-copy proof and fail closed without AMC-owned eval-pack evidence.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.multiUserBenchmarkLens[0]?.sourceRef).toBe(DOI);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("metadata confirms a relevant survey context only");
    expect(pack.sourceRefs).toEqual([DOI, OPENALEX]);
    expect(pack.sourceRefCount).toBe(2);
    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]?.status).toBe("ready");
    expect(pack.rows[0]?.acceptedEvidenceIds).toEqual(["ev-gap0657-eval-pack", "ev-gap0657-signed-ledger", "ev-gap0657-ci"]);
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.evidenceId).toBe("ev-gap0657-paper-metadata-only");
    expect(pack.rows[0]?.reproducibleEvalPacks[0]?.kind).toBe("test_suite_evaluation");
    expect(pack.rows[0]?.failClosedThresholds.every((row) => row.passed)).toBe(true);
  });
});

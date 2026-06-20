import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildEvalScoreExplainabilityPack, buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import { generateGuide, guideToHumanMarkdown } from "../src/guide/guideGenerator.js";
import { passportJsonSchema } from "../src/passport/passportSchema.js";
import { generateReport, runDiagnostic } from "../src/diagnostic/runner.js";
import { openLedger } from "../src/ledger/ledger.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-question-explainability-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) {
    throw new Error(`missing test question ${id}`);
  }
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-1.1",
    claimedLevel: 5,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.72,
    evidenceEventIds: ["ev-pass"],
    flags: ["FLAG_UNSUPPORTED_CLAIM"],
    narrative: "AMC-1.1: claim exceeded evidence gates; final level capped to supported evidence.",
    ...overrides
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("question score explainability receipts", () => {
  test("binds SkillLens-style rubric checks, fix hints, market signals, and certificate hashes into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "skill-agent",
      runId: "skill-run",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/AndrewNgGirl/SkillLens"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 3,
            supportedMaxLevel: 3,
            finalLevel: 3,
          }),
          acceptedEvidence: [
            {
              id: "ev-skill-pass",
              event_hash: "a".repeat(64),
              writer_sig: "sig-skill-pass",
              event_type: "audit",
              session_id: "session-skill",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-skill-reject",
                event_hash: "b".repeat(64),
                writer_sig: "sig-skill-reject",
                event_type: "review",
                session_id: "session-skill-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "subskill quality evidence was not complete enough for the selected rubric check",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "signed-skill-evidence",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-skill-pass"],
              judgeRef: "judge://skilllens/deep-review",
              repairHint: "Keep the agent-side skill review certificate linked to the score receipt.",
            },
          ],
          rubricLens: [
            {
              rubricId: "skilllens-general-rubric",
              rubricVersion: "2026.06.13",
              rubricSource: "https://github.com/AndrewNgGirl/SkillLens",
              skillType: "pipeline",
              score0to100: 81.337,
              grade: "A",
              deepReviewCertificateHash: "c".repeat(64),
              marketSignalRefs: ["github:skilllens:market-signal"],
              checks: [
                {
                  checkId: "user-need-realness",
                  pillar: "skill-value",
                  status: "pass",
                  weight: 6,
                  evidenceRefs: ["ev-skill-pass"],
                  fixHint: "Keep user-need evidence attached to the question score.",
                },
                {
                  checkId: "subskill-quality",
                  pillar: "effect-stability",
                  status: "partial",
                  weight: 2,
                  evidenceRefs: ["ev-skill-pass"],
                  rejectedEvidenceRefs: ["ev-skill-reject"],
                  fixHint: "Add subskill-level fixtures before claiming full pipeline readiness.",
                },
              ],
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "passed",
      rubricLens: [
        {
          rubricId: "skilllens-general-rubric",
          rubricVersion: "2026.06.13",
          rubricSource: "https://github.com/AndrewNgGirl/SkillLens",
          skillType: "pipeline",
          score0to100: 81.34,
          grade: "A",
          deepReviewCertificateHash: "c".repeat(64),
          marketSignalRefs: ["github:skilllens:market-signal"],
          checks: [
            expect.objectContaining({
              checkId: "user-need-realness",
              pillar: "skill-value",
              status: "pass",
              evidenceRefs: ["ev-skill-pass"],
            }),
            expect.objectContaining({
              checkId: "subskill-quality",
              pillar: "effect-stability",
              status: "partial",
              rejectedEvidenceRefs: ["ev-skill-reject"],
              fixHint: "Add subskill-level fixtures before claiming full pipeline readiness.",
            }),
          ],
        },
      ],
    });

    const invalidCertificate = buildQuestionExplainabilityReport({
      agentId: "skill-agent",
      runId: "skill-run-invalid",
      generatedAt: "2026-06-13T00:00:00.000Z",
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({ flags: [], claimedLevel: 3, supportedMaxLevel: 3, finalLevel: 3 }),
          acceptedEvidence: [
            {
              id: "ev-skill-pass",
              event_hash: "a".repeat(64),
              writer_sig: "sig-skill-pass",
              event_type: "audit",
              session_id: "session-skill",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "signed-skill-evidence",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-skill-pass"],
            },
          ],
          rubricLens: [
            {
              rubricId: "skilllens-general-rubric",
              rubricVersion: "2026.06.13",
              score0to100: 92,
              deepReviewCertificateHash: "not-a-sha",
              checks: [
                {
                  checkId: "metadata-completeness",
                  pillar: "writing-quality",
                  status: "pass",
                  evidenceRefs: ["ev-skill-pass"],
                },
              ],
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    expect(invalidCertificate.replayable).toBe(false);
  });

  test("binds Promptflow-style RAG flow, evaluator, mapping, variant, and deployment evidence into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "rag-promptflow-agent",
      runId: "rag-promptflow-run",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/microsoft/promptflow-rag-project-template"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
          }),
          acceptedEvidence: [
            {
              id: "ev-rag-flow",
              event_hash: "a".repeat(64),
              writer_sig: "sig-rag-flow",
              event_type: "audit",
              session_id: "session-rag-flow",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-rag-evaluator",
              event_hash: "b".repeat(64),
              writer_sig: "sig-rag-evaluator",
              event_type: "metric",
              session_id: "session-rag-evaluator",
              ts: 20,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "promptflow-rag-batch-eval",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-rag-flow", "ev-rag-evaluator"],
              judgeRef: "promptflow://rag-evaluator",
              repairHint: "Keep the Promptflow RAG batch run and evaluator mapping linked to this question.",
            },
          ],
          ragFlowDiagnostics: [
            {
              flowId: "financial-transcripts-rag-azure-search",
              vectorSearchBackend: "azure_search",
              flowDagHash: "c".repeat(64),
              paramConfigHash: "d".repeat(64),
              evalSetHash: "e".repeat(64),
              batchRunId: "pf-batch-run-001",
              evaluatorFlowHash: "f".repeat(64),
              groundTruthColumn: "ground_truth",
              dataMappingHash: "1".repeat(64),
              variantId: "prompt-node-temperature-variant",
              variantConfigHash: "2".repeat(64),
              deploymentArtifactHash: "3".repeat(64),
              metricIds: ["answer_groundedness", "retrieval_relevance"],
              status: "satisfied",
              evidenceRefs: ["ev-rag-flow", "ev-rag-evaluator"],
              repairHint: "Preserve the flow, evaluator, evalset, mapping, variant, and deployment hashes before raising this question.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "passed",
      ragFlowDiagnostics: [
        {
          flowId: "financial-transcripts-rag-azure-search",
          vectorSearchBackend: "azure_search",
          batchRunId: "pf-batch-run-001",
          groundTruthColumn: "ground_truth",
          metricIds: ["answer_groundedness", "retrieval_relevance"],
          status: "satisfied",
          evidenceRefs: ["ev-rag-flow", "ev-rag-evaluator"],
        },
      ],
    });
    expect(report.rows[0]?.ragFlowDiagnostics[0]?.flowDagHash).toBe("c".repeat(64));
    expect(report.rows[0]?.ragFlowDiagnostics[0]?.dataMappingHash).toBe("1".repeat(64));
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.sourceRefs).toContain("https://github.com/microsoft/promptflow-rag-project-template");
  });

  test("fails closed when Promptflow-style RAG question explainability lacks evaluator mapping proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "rag-promptflow-agent",
      runId: "rag-promptflow-run-missing-mapping",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/microsoft/promptflow-rag-project-template"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
          }),
          acceptedEvidence: [
            {
              id: "ev-rag-flow",
              event_hash: "a".repeat(64),
              writer_sig: "sig-rag-flow",
              event_type: "audit",
              session_id: "session-rag-flow",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-rag-mapping-reject",
                event_hash: "b".repeat(64),
                writer_sig: "sig-rag-mapping-reject",
                event_type: "review",
                session_id: "session-rag-review",
                ts: 20,
                trustTier: "ATTESTED",
              },
              reason: "batch evaluator run did not bind the evalset ground-truth column or data mapping",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "promptflow-rag-batch-eval",
              criterionType: "agent_judge",
              status: "failed",
              evidenceRefs: ["ev-rag-flow"],
              rejectedEvidenceRefs: ["ev-rag-mapping-reject"],
              judgeRef: "promptflow://rag-evaluator",
              repairHint: "Attach signed evalset column mapping and rerun the evaluator flow.",
            },
          ],
          ragFlowDiagnostics: [
            {
              flowId: "financial-transcripts-rag-azure-search",
              vectorSearchBackend: "azure_search",
              flowDagHash: "c".repeat(64),
              paramConfigHash: "d".repeat(64),
              evalSetHash: "e".repeat(64),
              batchRunId: "pf-batch-run-001",
              evaluatorFlowHash: "f".repeat(64),
              groundTruthColumn: null,
              dataMappingHash: null,
              variantId: "prompt-node-temperature-variant",
              variantConfigHash: "2".repeat(64),
              deploymentArtifactHash: null,
              metricIds: ["answer_groundedness"],
              status: "failed",
              evidenceRefs: ["ev-rag-flow"],
              rejectedEvidenceRefs: ["ev-rag-mapping-reject"],
              repairHint: "Attach the evalset ground-truth column and data mapping hash before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      ragFlowDiagnostics: [
        {
          status: "failed",
          groundTruthColumn: null,
          dataMappingHash: null,
          rejectedEvidenceRefs: ["ev-rag-mapping-reject"],
          repairHint: expect.stringContaining("ground-truth column"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("ground-truth column");
  });

  test("binds AI-Coding-Landscape category, cohort, dataset, freshness, and repair proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "coding-landscape-agent",
      runId: "run-ai-coding-landscape",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/joylarkin/AI-Coding-Landscape"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-landscape-csv", "ev-landscape-cohort"],
            narrative: "AMC-2.3: coding-agent landscape proof includes source category, cohort, dataset, and freshness evidence.",
          }),
          acceptedEvidence: [
            {
              id: "ev-landscape-csv",
              event_hash: "a".repeat(64),
              writer_sig: "sig-landscape-csv",
              event_type: "artifact",
              session_id: "session-landscape",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-landscape-cohort",
              event_hash: "b".repeat(64),
              writer_sig: "sig-landscape-cohort",
              event_type: "audit",
              session_id: "session-landscape",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-landscape-reject",
                event_hash: "c".repeat(64),
                writer_sig: "sig-landscape-reject",
                event_type: "review",
                session_id: "session-landscape-review",
                ts: 12,
                trustTier: "ATTESTED",
              },
              reason: "listing-only evidence did not bind a dataset hash or cohort freshness check",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "ai-coding-landscape-source-binding",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-landscape-csv", "ev-landscape-cohort"],
              rejectedEvidenceRefs: ["ev-landscape-reject"],
              judgeRef: "judge://amc/ai-coding-landscape",
              repairHint: "Keep the landscape category, dataset hash, cohort, and freshness proof linked to this question.",
            },
          ],
          landscapeLens: [
            {
              landscapeId: "ai-coding-landscape-2026",
              sourceRef: "https://github.com/joylarkin/AI-Coding-Landscape",
              category: "ai_coding_leaderboard",
              datasetRefs: ["aicodingtools.csv", "aicodingmodels.csv", "huggingface:ai-coding-tools"],
              datasetHashes: ["d".repeat(64), "e".repeat(64)],
              updateCadence: "bimonthly",
              lastVerifiedAt: "2026-06-13",
              freshnessDays: 7,
              maxAllowedFreshnessDays: 62,
              cohortRefs: ["AI Coding Agents/CLI Tools", "AI Coding Leaderboards", "AI Coding Models"],
              benchmarkRefs: ["leaderboard-category"],
              toolOrModelRefs: ["agent-cli-cohort", "coding-model-cohort"],
              status: "satisfied",
              evidenceRefs: ["ev-landscape-csv", "ev-landscape-cohort"],
              rejectedEvidenceRefs: ["ev-landscape-reject"],
              repairHint: "Refresh the CSV or HF dataset hash, verify bimonthly freshness, and keep cohort refs attached before externalizing this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/joylarkin/AI-Coding-Landscape");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      acceptedEvidenceIds: ["ev-landscape-csv", "ev-landscape-cohort"],
      landscapeLens: [
        {
          landscapeId: "ai-coding-landscape-2026",
          sourceRef: "https://github.com/joylarkin/AI-Coding-Landscape",
          category: "ai_coding_leaderboard",
          updateCadence: "bimonthly",
          freshnessDays: 7,
          maxAllowedFreshnessDays: 62,
          cohortRefs: ["AI Coding Agents/CLI Tools", "AI Coding Leaderboards", "AI Coding Models"],
          benchmarkRefs: ["leaderboard-category"],
          toolOrModelRefs: ["agent-cli-cohort", "coding-model-cohort"],
          status: "satisfied",
          evidenceRefs: ["ev-landscape-csv", "ev-landscape-cohort"],
          rejectedEvidenceRefs: ["ev-landscape-reject"],
          repairHint: expect.stringContaining("bimonthly freshness"),
        },
      ],
    });
    expect(report.rows[0]?.landscapeLens[0]?.datasetHashes).toEqual(["d".repeat(64), "e".repeat(64)]);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("dataset hash");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when AI-Coding-Landscape question proof is stale or missing dataset/cohort bindings", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "coding-landscape-agent",
      runId: "run-ai-coding-landscape-stale",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/joylarkin/AI-Coding-Landscape"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-landscape-listing"],
          }),
          acceptedEvidence: [
            {
              id: "ev-landscape-listing",
              event_hash: "f".repeat(64),
              writer_sig: "sig-landscape-listing",
              event_type: "audit",
              session_id: "session-landscape",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-landscape-stale",
                event_hash: "1".repeat(64),
                writer_sig: "sig-landscape-stale",
                event_type: "review",
                session_id: "session-landscape-review",
                ts: 20,
                trustTier: "ATTESTED",
              },
              reason: "landscape entry was stale and did not include a dataset hash or cohort reference",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "ai-coding-landscape-source-binding",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-landscape-listing"],
              judgeRef: "judge://amc/ai-coding-landscape",
              repairHint: "Attach dataset hashes, cohort refs, and freshness proof before relying on the category score.",
            },
          ],
          landscapeLens: [
            {
              landscapeId: "ai-coding-landscape-2026",
              sourceRef: "https://github.com/joylarkin/AI-Coding-Landscape",
              category: "ai_coding_agent",
              datasetRefs: [],
              datasetHashes: [],
              updateCadence: "bimonthly",
              lastVerifiedAt: null,
              freshnessDays: 120,
              maxAllowedFreshnessDays: 62,
              cohortRefs: [],
              benchmarkRefs: [],
              toolOrModelRefs: [],
              status: "satisfied",
              evidenceRefs: ["ev-landscape-listing"],
              rejectedEvidenceRefs: ["ev-landscape-stale"],
              repairHint: "Refresh the source, bind CSV/HF dataset hashes, and attach category cohort refs before this question can be external proof.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      landscapeLens: [
        {
          datasetRefs: [],
          datasetHashes: [],
          lastVerifiedAt: null,
          freshnessDays: 120,
          maxAllowedFreshnessDays: 62,
          cohortRefs: [],
          status: "satisfied",
          repairHint: expect.stringContaining("CSV/HF dataset hashes"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("stale");
  });

  test("binds PinchBench-style benchmark submission, task, criterion, status, and leaderboard proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "benchmark-submission-agent",
      runId: "run-pinchbench-style-submission",
      generatedAt: "2026-06-14T00:00:00.000Z",
      sourceRefs: ["https://github.com/pinchbench/leaderboard"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-submission-detail", "ev-task-breakdown", "ev-criterion-grade"],
            narrative: "AMC-2.3: benchmark submission proof includes signed task breakdown, criterion scoring, and leaderboard context.",
          }),
          acceptedEvidence: [
            {
              id: "ev-submission-detail",
              event_hash: "a".repeat(64),
              writer_sig: "sig-submission-detail",
              event_type: "artifact",
              session_id: "session-submission",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-task-breakdown",
              event_hash: "b".repeat(64),
              writer_sig: "sig-task-breakdown",
              event_type: "metric",
              session_id: "session-submission",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-criterion-grade",
              event_hash: "c".repeat(64),
              writer_sig: "sig-criterion-grade",
              event_type: "review",
              session_id: "session-grader",
              ts: 12,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-submission-summary-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-summary-only",
                event_type: "review",
                session_id: "session-submission-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "aggregate submission summary lacked task-level criterion scoring and accepted evidence IDs",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "benchmark-submission-task-proof",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-submission-detail", "ev-task-breakdown", "ev-criterion-grade"],
              rejectedEvidenceRefs: ["ev-submission-summary-only"],
              judgeRef: "judge://amc/benchmark-submission",
              repairHint: "Keep the submission, task breakdown, criterion grading, and leaderboard snapshot proof linked to this question.",
            },
          ],
          benchmarkSubmissionLens: [
            {
              benchmarkId: "pinchbench-style-synthetic",
              sourceRef: "https://github.com/pinchbench/leaderboard",
              submissionId: "synthetic-submission-001",
              submissionVersion: "2026.06.14",
              agentVersion: "openclaw-synthetic-agent@1.0.0",
              submittedAt: "2026-06-14T00:00:00.000Z",
              taskId: "synthetic-task-research-001",
              taskCategory: "research",
              taskStatus: "success",
              gradingType: "hybrid",
              overallScore0to100: 87.456,
              categoryScore0to100: 84.321,
              speedMs: 125000,
              costUsd: 0.42,
              leaderboardMetricViews: ["success_rate", "speed", "cost"],
              submissionMetadataHash: "e".repeat(64),
              taskBreakdownHash: "f".repeat(64),
              leaderboardSnapshotHash: "1".repeat(64),
              criterionScores: [
                {
                  criterionId: "research-source-grounding",
                  criterionType: "objective_quality",
                  score0to1: 0.91,
                  weight: 2,
                  status: "satisfied",
                  gradingType: "automated",
                  evidenceRefs: ["ev-task-breakdown"],
                  rejectedEvidenceRefs: [],
                  repairHint: "Keep source-grounding evidence bound to the task criterion.",
                },
                {
                  criterionId: "research-synthesis-quality",
                  criterionType: "subjective_quality",
                  score0to1: 0.78,
                  weight: 1,
                  status: "satisfied",
                  gradingType: "llm_judge",
                  evidenceRefs: ["ev-criterion-grade"],
                  rejectedEvidenceRefs: ["ev-submission-summary-only"],
                  repairHint: "Keep the judge rationale and rejected summary-only proof linked.",
                },
              ],
              status: "satisfied",
              evidenceRefs: ["ev-submission-detail", "ev-task-breakdown", "ev-criterion-grade"],
              rejectedEvidenceRefs: ["ev-submission-summary-only"],
              repairHint: "Preserve submission metadata, task breakdown, criterion grading, status, and leaderboard snapshot hashes before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/pinchbench/leaderboard");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      acceptedEvidenceIds: ["ev-submission-detail", "ev-task-breakdown", "ev-criterion-grade"],
      benchmarkSubmissionLens: [
        {
          benchmarkId: "pinchbench-style-synthetic",
          sourceRef: "https://github.com/pinchbench/leaderboard",
          submissionId: "synthetic-submission-001",
          taskId: "synthetic-task-research-001",
          taskCategory: "research",
          taskStatus: "success",
          gradingType: "hybrid",
          overallScore0to100: 87.46,
          categoryScore0to100: 84.32,
          speedMs: 125000,
          costUsd: 0.42,
          leaderboardMetricViews: ["success_rate", "speed", "cost"],
          criterionScores: [
            expect.objectContaining({
              criterionId: "research-source-grounding",
              criterionType: "objective_quality",
              status: "satisfied",
              gradingType: "automated",
              evidenceRefs: ["ev-task-breakdown"],
            }),
            expect.objectContaining({
              criterionId: "research-synthesis-quality",
              criterionType: "subjective_quality",
              status: "satisfied",
              gradingType: "llm_judge",
              rejectedEvidenceRefs: ["ev-submission-summary-only"],
            }),
          ],
          evidenceRefs: ["ev-submission-detail", "ev-task-breakdown", "ev-criterion-grade"],
          rejectedEvidenceRefs: ["ev-submission-summary-only"],
          repairHint: expect.stringContaining("leaderboard snapshot hashes"),
        },
      ],
    });
    expect(report.rows[0]?.benchmarkSubmissionLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("criterion scoring");
  });

  test("fails closed when benchmark submission proof omits task breakdown, criterion scoring, status, or hashes", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "benchmark-submission-agent",
      runId: "run-pinchbench-style-submission-incomplete",
      generatedAt: "2026-06-14T00:00:00.000Z",
      sourceRefs: ["https://github.com/pinchbench/leaderboard"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-submission-summary-only"],
          }),
          acceptedEvidence: [
            {
              id: "ev-submission-summary-only",
              event_hash: "2".repeat(64),
              writer_sig: "sig-submission-summary-only",
              event_type: "audit",
              session_id: "session-submission",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-missing-task-breakdown",
                event_hash: "3".repeat(64),
                writer_sig: "sig-missing-task-breakdown",
                event_type: "review",
                session_id: "session-submission-review",
                ts: 20,
                trustTier: "ATTESTED",
              },
              reason: "submission evidence did not include signed task cards, criterion scores, status indicators, or replay hashes",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "benchmark-submission-task-proof",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-submission-summary-only"],
              rejectedEvidenceRefs: ["ev-missing-task-breakdown"],
              judgeRef: "judge://amc/benchmark-submission",
              repairHint: "Attach task breakdown, criterion scoring, status, and replay hashes before relying on the submission score.",
            },
          ],
          benchmarkSubmissionLens: [
            {
              benchmarkId: "pinchbench-style-synthetic",
              sourceRef: "https://github.com/pinchbench/leaderboard",
              submissionId: "synthetic-submission-002",
              submissionVersion: "",
              agentVersion: "",
              submittedAt: null,
              taskId: "synthetic-task-research-002",
              taskCategory: "research",
              taskStatus: "timeout",
              gradingType: "hybrid",
              overallScore0to100: 92,
              categoryScore0to100: null,
              speedMs: null,
              costUsd: null,
              leaderboardMetricViews: [],
              submissionMetadataHash: null,
              taskBreakdownHash: "not-a-sha",
              leaderboardSnapshotHash: null,
              criterionScores: [],
              status: "satisfied",
              evidenceRefs: ["ev-submission-summary-only"],
              rejectedEvidenceRefs: ["ev-missing-task-breakdown"],
              repairHint: "Bind submission version, agent version, timestamp, task-breakdown hash, leaderboard snapshot, and criterion scores before this question can become external proof.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      benchmarkSubmissionLens: [
        {
          submissionVersion: null,
          agentVersion: null,
          submittedAt: null,
          taskStatus: "timeout",
          categoryScore0to100: null,
          speedMs: null,
          costUsd: null,
          leaderboardMetricViews: [],
          taskBreakdownHash: "not-a-sha",
          criterionScores: [],
          repairHint: expect.stringContaining("criterion scores"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("replay hashes");
  });

  test("binds Multi-User-LLM-Agent-style scenario, role, policy, trace, evaluator, metric, and repair proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "multi-user-agent",
      runId: "run-multi-user-llm-agent",
      generatedAt: "2026-06-16T00:00:00.000Z",
      sourceRefs: ["https://github.com/Kordi-AI/Multi-User-LLM-Agent"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-multiuser-scenario", "ev-multiuser-policy", "ev-multiuser-metric"],
            narrative: "AMC-2.3: multi-user scenario proof includes roles, access policy, trace, evaluator, metrics, and repair evidence.",
          }),
          acceptedEvidence: [
            {
              id: "ev-multiuser-scenario",
              event_hash: "a".repeat(64),
              writer_sig: "sig-multiuser-scenario",
              event_type: "artifact",
              session_id: "session-multiuser",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-multiuser-policy",
              event_hash: "b".repeat(64),
              writer_sig: "sig-multiuser-policy",
              event_type: "audit",
              session_id: "session-multiuser",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-multiuser-metric",
              event_hash: "c".repeat(64),
              writer_sig: "sig-multiuser-metric",
              event_type: "metric",
              session_id: "session-multiuser-metric",
              ts: 12,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-multiuser-readme-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-multiuser-readme-only",
                event_type: "review",
                session_id: "session-multiuser-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "README scenario summary did not bind role, policy, trace, evaluator, metric, or repair evidence",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "multi-user-access-control-proof",
              criterionType: "multi_agent_orchestration",
              status: "satisfied",
              evidenceRefs: ["ev-multiuser-scenario", "ev-multiuser-policy", "ev-multiuser-metric"],
              rejectedEvidenceRefs: ["ev-multiuser-readme-only"],
              judgeRef: "judge://amc/multi-user-llm-agent",
              repairHint: "Keep multi-user role, permission policy, interaction trace, evaluator, metric, and rejected-evidence reasons linked to this question.",
            },
          ],
          multiUserBenchmarkLens: [
            {
              benchmarkId: "multi-user-llm-agent-style-synthetic",
              sourceRef: "https://github.com/Kordi-AI/Multi-User-LLM-Agent",
              scenarioId: "synthetic-access-control-001",
              scenarioFamily: "access_control",
              capability: "privacy_access_control",
              datasetManifestHash: "e".repeat(64),
              userRoleManifestHash: "f".repeat(64),
              permissionPolicyHash: "1".repeat(64),
              preferenceProfileHash: null,
              resourceQueuePolicyHash: null,
              instructionSetHash: "2".repeat(64),
              interactionTraceHash: "3".repeat(64),
              evaluatorConfigHash: "4".repeat(64),
              resultArtifactHash: "5".repeat(64),
              metricReportHash: "6".repeat(64),
              userRoleCount: 3,
              turnCount: 8,
              privacyPassRate0to1: 0.96,
              minPrivacyPassRate0to1: 0.9,
              coordinationSuccessRate0to1: null,
              minCoordinationSuccessRate0to1: null,
              queueFairnessScore0to1: null,
              minQueueFairnessScore0to1: null,
              instructionFollowingScore0to1: 0.92,
              minInstructionFollowingScore0to1: 0.85,
              status: "satisfied",
              evidenceRefs: ["ev-multiuser-scenario", "ev-multiuser-policy", "ev-multiuser-metric"],
              rejectedEvidenceRefs: ["ev-multiuser-readme-only"],
              repairHint: "Preserve dataset, role, permission-policy, instruction, trace, evaluator, result, metric, and rejected-evidence proof before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/Kordi-AI/Multi-User-LLM-Agent");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      acceptedEvidenceIds: ["ev-multiuser-scenario", "ev-multiuser-policy", "ev-multiuser-metric"],
      multiUserBenchmarkLens: [
        {
          benchmarkId: "multi-user-llm-agent-style-synthetic",
          sourceRef: "https://github.com/Kordi-AI/Multi-User-LLM-Agent",
          scenarioId: "synthetic-access-control-001",
          scenarioFamily: "access_control",
          capability: "privacy_access_control",
          userRoleCount: 3,
          turnCount: 8,
          privacyPassRate0to1: 0.96,
          minPrivacyPassRate0to1: 0.9,
          instructionFollowingScore0to1: 0.92,
          evidenceRefs: ["ev-multiuser-scenario", "ev-multiuser-policy", "ev-multiuser-metric"],
          rejectedEvidenceRefs: ["ev-multiuser-readme-only"],
          repairHint: expect.stringContaining("permission-policy"),
        },
      ],
    });
    expect(report.rows[0]?.multiUserBenchmarkLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("role, policy, trace");
  });

  test("fails closed when Multi-User-LLM-Agent question proof omits scenario hashes, roles, or scenario-specific metrics", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "multi-user-agent",
      runId: "run-multi-user-llm-agent-incomplete",
      generatedAt: "2026-06-16T00:00:00.000Z",
      sourceRefs: ["https://github.com/Kordi-AI/Multi-User-LLM-Agent"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-multiuser-summary-only"],
          }),
          acceptedEvidence: [
            {
              id: "ev-multiuser-summary-only",
              event_hash: "7".repeat(64),
              writer_sig: "sig-multiuser-summary-only",
              event_type: "audit",
              session_id: "session-multiuser",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-multiuser-missing-proof",
                event_hash: "8".repeat(64),
                writer_sig: "sig-multiuser-missing-proof",
                event_type: "review",
                session_id: "session-multiuser-review",
                ts: 20,
                trustTier: "ATTESTED",
              },
              reason: "multi-user benchmark evidence lacked user-role manifest, scenario policy, trace, evaluator, result, metric threshold, and repair proof",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "multi-user-shared-queue-proof",
              criterionType: "multi_agent_orchestration",
              status: "satisfied",
              evidenceRefs: ["ev-multiuser-summary-only"],
              rejectedEvidenceRefs: ["ev-multiuser-missing-proof"],
              judgeRef: "judge://amc/multi-user-llm-agent",
              repairHint: "Attach user-role, queue-policy, trace, evaluator, result, and fairness metric hashes before relying on this question score.",
            },
          ],
          multiUserBenchmarkLens: [
            {
              benchmarkId: "multi-user-llm-agent-style-synthetic",
              sourceRef: "https://github.com/Kordi-AI/Multi-User-LLM-Agent",
              scenarioId: "synthetic-shared-queue-002",
              scenarioFamily: "shared_queue",
              capability: "resource_optimization",
              datasetManifestHash: null,
              userRoleManifestHash: "not-a-sha",
              permissionPolicyHash: null,
              preferenceProfileHash: null,
              resourceQueuePolicyHash: null,
              instructionSetHash: "9".repeat(64),
              interactionTraceHash: null,
              evaluatorConfigHash: null,
              resultArtifactHash: null,
              metricReportHash: null,
              userRoleCount: 1,
              turnCount: 0,
              privacyPassRate0to1: null,
              minPrivacyPassRate0to1: null,
              coordinationSuccessRate0to1: null,
              minCoordinationSuccessRate0to1: null,
              queueFairnessScore0to1: 0.62,
              minQueueFairnessScore0to1: 0.8,
              instructionFollowingScore0to1: null,
              minInstructionFollowingScore0to1: null,
              status: "satisfied",
              evidenceRefs: ["ev-multiuser-summary-only"],
              rejectedEvidenceRefs: ["ev-multiuser-missing-proof"],
              repairHint: "Bind queue policy, at least two user roles, interaction trace, evaluator/result/metric hashes, and fairness threshold proof before this question can be external evidence.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      multiUserBenchmarkLens: [
        {
          scenarioFamily: "shared_queue",
          capability: "resource_optimization",
          datasetManifestHash: null,
          userRoleManifestHash: "not-a-sha",
          resourceQueuePolicyHash: null,
          interactionTraceHash: null,
          evaluatorConfigHash: null,
          resultArtifactHash: null,
          metricReportHash: null,
          userRoleCount: 1,
          turnCount: null,
          queueFairnessScore0to1: 0.62,
          minQueueFairnessScore0to1: 0.8,
          repairHint: expect.stringContaining("at least two user roles"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("metric threshold");
  });

  test("binds Dokimos-style test-suite, JUnit, CI, dataset, evaluator, trace, and export proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "jvm-eval-agent",
      runId: "run-dokimos-style-suite",
      generatedAt: "2026-06-14T00:00:00.000Z",
      sourceRefs: ["https://github.com/dokimos-dev/dokimos"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-junit-suite", "ev-ci-run", "ev-agent-trace"],
            narrative: "AMC-2.3: question-level proof includes test-suite, CI, dataset, evaluator, trace, export, and repair evidence.",
          }),
          acceptedEvidence: [
            {
              id: "ev-junit-suite",
              event_hash: "a".repeat(64),
              writer_sig: "sig-junit-suite",
              event_type: "artifact",
              session_id: "session-junit",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-ci-run",
              event_hash: "b".repeat(64),
              writer_sig: "sig-ci-run",
              event_type: "metric",
              session_id: "session-ci",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-agent-trace",
              event_hash: "c".repeat(64),
              writer_sig: "sig-agent-trace",
              event_type: "audit",
              session_id: "session-agent-trace",
              ts: 12,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-console-summary",
                event_hash: "d".repeat(64),
                writer_sig: "sig-console-summary",
                event_type: "review",
                session_id: "session-junit-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "console-only evaluation output lacked dataset hash, CI run, evaluator config, and export artifact proof",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "jvm-test-suite-eval-proof",
              criterionType: "unit_test",
              status: "satisfied",
              evidenceRefs: ["ev-junit-suite", "ev-ci-run", "ev-agent-trace"],
              rejectedEvidenceRefs: ["ev-console-summary"],
              judgeRef: "judge://amc/test-suite-evaluation",
              repairHint: "Keep test-suite, dataset, evaluator, CI, trace, and export proof linked to this question.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "dokimos-style-synthetic-suite",
              sourceRef: "https://github.com/dokimos-dev/dokimos",
              language: "kotlin",
              testFramework: "junit",
              adapter: "spring_ai",
              datasetRef: "classpath:datasets/synthetic-agent-eval.json",
              datasetHash: "e".repeat(64),
              testCaseId: "synthetic-agent-task-completion",
              testCaseHash: "f".repeat(64),
              evaluatorIds: ["faithfulness", "tool-call-validation", "llm-judge-correctness"],
              evaluatorConfigHash: "1".repeat(64),
              judgeModelRef: "judge://synthetic/local-llm",
              experimentRunId: "junit-ci-run-001",
              experimentResultHash: "2".repeat(64),
              exportArtifactHash: "3".repeat(64),
              ciRunId: "ci-2026-06-14-001",
              ciConfigHash: "4".repeat(64),
              traceArtifactHash: "5".repeat(64),
              toolCallValidationHash: "6".repeat(64),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.94,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.88,
              threshold0to1: 0.8,
              costUsd: 0.15,
              latencyMs: 2400,
              tokenCount: 1800,
              status: "satisfied",
              evidenceRefs: ["ev-junit-suite", "ev-ci-run", "ev-agent-trace"],
              rejectedEvidenceRefs: ["ev-console-summary"],
              repairHint: "Preserve the dataset, evaluator config, CI run, trace/tool-call validation, experiment result, and export artifact hashes before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/dokimos-dev/dokimos");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      testSuiteEvaluationLens: [
        {
          suiteId: "dokimos-style-synthetic-suite",
          language: "kotlin",
          testFramework: "junit",
          adapter: "spring_ai",
          datasetRef: "classpath:datasets/synthetic-agent-eval.json",
          testCaseId: "synthetic-agent-task-completion",
          evaluatorIds: ["faithfulness", "tool-call-validation", "llm-judge-correctness"],
          judgeModelRef: "judge://synthetic/local-llm",
          experimentRunId: "junit-ci-run-001",
          ciRunId: "ci-2026-06-14-001",
          agentBehaviorEvaluation: true,
          passRate0to1: 0.94,
          averageScore0to1: 0.88,
          costUsd: 0.15,
          latencyMs: 2400,
          tokenCount: 1800,
          status: "satisfied",
          evidenceRefs: ["ev-junit-suite", "ev-ci-run", "ev-agent-trace"],
          rejectedEvidenceRefs: ["ev-console-summary"],
        },
      ],
    });
    expect(report.rows[0]?.testSuiteEvaluationLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("dataset hash");
  });

  test("fails closed when Dokimos-style test-suite question proof lacks dataset, CI, evaluator, trace, or export evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "jvm-eval-agent",
      runId: "run-dokimos-style-suite-incomplete",
      generatedAt: "2026-06-14T00:00:00.000Z",
      sourceRefs: ["https://github.com/dokimos-dev/dokimos"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-console-summary"],
          }),
          acceptedEvidence: [
            {
              id: "ev-console-summary",
              event_hash: "7".repeat(64),
              writer_sig: "sig-console-summary",
              event_type: "artifact",
              session_id: "session-junit",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-missing-suite-proof",
                event_hash: "8".repeat(64),
                writer_sig: "sig-missing-suite-proof",
                event_type: "review",
                session_id: "session-junit-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "test-suite row lacked signed dataset, evaluator config, CI, trace/tool-call, and export evidence",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "jvm-test-suite-eval-proof",
              criterionType: "unit_test",
              status: "satisfied",
              evidenceRefs: ["ev-console-summary"],
              rejectedEvidenceRefs: ["ev-missing-suite-proof"],
              judgeRef: "judge://amc/test-suite-evaluation",
              repairHint: "Attach dataset hash, evaluator config, CI run, trace/tool-call validation, and export artifact proof.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "dokimos-style-synthetic-suite",
              sourceRef: "https://github.com/dokimos-dev/dokimos",
              language: "java",
              testFramework: "junit",
              adapter: "langchain4j",
              datasetRef: "classpath:datasets/synthetic-agent-eval.json",
              datasetHash: null,
              testCaseId: "synthetic-agent-task-completion",
              testCaseHash: "not-a-sha",
              evaluatorIds: [],
              evaluatorConfigHash: null,
              judgeModelRef: null,
              experimentRunId: null,
              experimentResultHash: null,
              exportArtifactHash: null,
              ciRunId: null,
              ciConfigHash: null,
              traceArtifactHash: null,
              toolCallValidationHash: null,
              agentBehaviorEvaluation: true,
              passRate0to1: 0.7,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.62,
              threshold0to1: 0.8,
              costUsd: null,
              latencyMs: null,
              tokenCount: null,
              status: "satisfied",
              evidenceRefs: ["ev-console-summary"],
              rejectedEvidenceRefs: ["ev-missing-suite-proof"],
              repairHint: "Bind dataset/test-case hashes, evaluator ids, evaluator config, CI run/config, trace/tool-call validation, experiment result, and export artifact evidence before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      testSuiteEvaluationLens: [
        {
          datasetHash: null,
          testCaseHash: "not-a-sha",
          evaluatorIds: [],
          evaluatorConfigHash: null,
          experimentRunId: null,
          experimentResultHash: null,
          exportArtifactHash: null,
          ciRunId: null,
          ciConfigHash: null,
          traceArtifactHash: null,
          toolCallValidationHash: null,
          passRate0to1: 0.7,
          averageScore0to1: 0.62,
          status: "satisfied",
          repairHint: expect.stringContaining("dataset/test-case hashes"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("trace/tool-call");
  });

  test("fails closed when rage4j-style source metadata is presented without replayable JVM eval corpus proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "jvm-eval-agent",
      runId: "run-rage4j-metadata-only",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/explore-de/rage4j"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-rage4j-repo-metadata"],
          }),
          acceptedEvidence: [
            {
              id: "ev-rage4j-repo-metadata",
              event_hash: "9".repeat(64),
              writer_sig: "sig-rage4j-repo-metadata",
              event_type: "audit",
              session_id: "session-rage4j-source-review",
              ts: 20,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-rage4j-missing-corpus-proof",
                event_hash: "0".repeat(64),
                writer_sig: "sig-rage4j-missing-corpus-proof",
                event_type: "review",
                session_id: "session-rage4j-source-review",
                ts: 21,
                trustTier: "ATTESTED",
              },
              reason: "repository metadata did not include signed dataset/test-case hashes, evaluator config, CI run/config, experiment result/export, or trace proof for a replayable JVM eval corpus",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "jvm-eval-corpus-proof",
              criterionType: "unit_test",
              status: "satisfied",
              evidenceRefs: ["ev-rage4j-repo-metadata"],
              rejectedEvidenceRefs: ["ev-rage4j-missing-corpus-proof"],
              judgeRef: "judge://amc/test-suite-evaluation",
              repairHint: "Attach dataset/test-case hashes, evaluator config, CI run/config, experiment result/export, and trace proof before relying on rage4j-style Java evaluation claims.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "rage4j-style-jvm-eval-corpus",
              sourceRef: "https://github.com/explore-de/rage4j",
              language: "java",
              testFramework: "junit",
              adapter: "langchain4j",
              datasetRef: "source-metadata-only",
              datasetHash: null,
              testCaseId: "source-metadata-only",
              testCaseHash: null,
              evaluatorIds: [],
              evaluatorConfigHash: null,
              judgeModelRef: null,
              experimentRunId: null,
              experimentResultHash: null,
              exportArtifactHash: null,
              ciRunId: null,
              ciConfigHash: null,
              traceArtifactHash: null,
              toolCallValidationHash: null,
              agentBehaviorEvaluation: true,
              passRate0to1: null,
              minPassRate0to1: 1,
              averageScore0to1: null,
              threshold0to1: 0.8,
              costUsd: null,
              latencyMs: null,
              tokenCount: null,
              status: "satisfied",
              evidenceRefs: ["ev-rage4j-repo-metadata"],
              rejectedEvidenceRefs: ["ev-rage4j-missing-corpus-proof"],
              repairHint: "Bind source metadata to concrete JVM eval dataset, test-case, evaluator, CI, result/export, trace/tool-call, and row-hash proof before using it as Score, Shield, or Watch evidence.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.sourceRefs).toContain("https://github.com/explore-de/rage4j");
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      testSuiteEvaluationLens: [
        {
          suiteId: "rage4j-style-jvm-eval-corpus",
          sourceRef: "https://github.com/explore-de/rage4j",
          datasetHash: null,
          testCaseHash: null,
          evaluatorIds: [],
          evaluatorConfigHash: null,
          experimentRunId: null,
          experimentResultHash: null,
          exportArtifactHash: null,
          ciRunId: null,
          ciConfigHash: null,
          traceArtifactHash: null,
          toolCallValidationHash: null,
          passRate0to1: null,
          averageScore0to1: null,
          repairHint: expect.stringContaining("concrete JVM eval dataset"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("repository metadata");
  });

  test("binds AgentTrial-style statistical trials, confidence intervals, regression, and failure attribution into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "statistical-eval-agent",
      runId: "run-agentrial-style-statistical-eval",
      generatedAt: "2026-06-19T00:00:00.000Z",
      sourceRefs: ["https://github.com/alepot55/agentrial", "https://pypi.org/project/agentrial/"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-agentrial-suite", "ev-agentrial-trials", "ev-agentrial-statistics"],
            narrative: "AMC-2.3: statistical agent evaluation proof includes trial counts, confidence interval, regression, trajectory, and failure attribution evidence.",
          }),
          acceptedEvidence: [
            {
              id: "ev-agentrial-suite",
              event_hash: "a".repeat(64),
              writer_sig: "sig-agentrial-suite",
              event_type: "artifact",
              session_id: "session-agentrial",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-agentrial-trials",
              event_hash: "b".repeat(64),
              writer_sig: "sig-agentrial-trials",
              event_type: "test",
              session_id: "session-agentrial",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-agentrial-statistics",
              event_hash: "c".repeat(64),
              writer_sig: "sig-agentrial-statistics",
              event_type: "metric",
              session_id: "session-agentrial-ci",
              ts: 12,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-agentrial-summary-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-agentrial-summary-only",
                event_type: "review",
                session_id: "session-agentrial-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "aggregate pass-rate summary lacked trial manifest, confidence interval, regression receipt, and failure-attribution proof",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "statistical-agent-eval-proof",
              criterionType: "reliability_improvement_measure",
              status: "satisfied",
              evidenceRefs: ["ev-agentrial-suite", "ev-agentrial-trials", "ev-agentrial-statistics"],
              rejectedEvidenceRefs: ["ev-agentrial-summary-only"],
              judgeRef: "judge://amc/statistical-agent-eval",
              repairHint: "Keep trial manifests, CI receipts, confidence intervals, regression proof, and failure attribution linked to this question.",
            },
          ],
          statisticalAgentTrialLens: [
            {
              suiteId: "agentrial-style-synthetic-suite",
              sourceRef: "https://github.com/alepot55/agentrial",
              packageRef: "pypi:agentrial@0.2.0",
              adapter: "langgraph",
              caseId: "support-policy-research",
              caseName: "Support policy research synthesis",
              suiteManifestHash: "e".repeat(64),
              caseManifestHash: "f".repeat(64),
              runManifestHash: "1".repeat(64),
              trialManifestHash: "2".repeat(64),
              statisticalReportHash: "3".repeat(64),
              trajectoryBundleHash: "4".repeat(64),
              failureAttributionHash: "5".repeat(64),
              baselineResultHash: "6".repeat(64),
              candidateResultHash: "7".repeat(64),
              ciConfigHash: "8".repeat(64),
              dashboardSnapshotHash: "9".repeat(64),
              ciRunId: "ci-agentrial-2026-06-19-001",
              trialCount: 12,
              minTrialCount: 10,
              passCount: 11,
              passRate0to1: 0.91666,
              minPassRate0to1: 0.85,
              wilsonConfidenceLevel: 0.95,
              wilsonLower0to1: 0.6461,
              minWilsonLower0to1: 0.6,
              wilsonUpper0to1: 0.9851,
              bootstrapCostMeanUsd: 0.09234,
              maxCostMeanUsd: 0.2,
              bootstrapLatencyMeanMs: 1840.456,
              maxLatencyMeanMs: 3000,
              agentReliabilityScore0to1: 0.8833,
              minAgentReliabilityScore0to1: 0.8,
              failureAttributionStepId: "tool.search:policy-lookup",
              failureAttributionPValue: 0.018,
              maxFailureAttributionPValue: 0.05,
              regressionTestName: "fisher_exact_pass_rate",
              regressionPValue: 0.42,
              minRegressionPValue: 0.05,
              status: "satisfied",
              evidenceRefs: ["ev-agentrial-suite", "ev-agentrial-trials", "ev-agentrial-statistics"],
              rejectedEvidenceRefs: ["ev-agentrial-summary-only"],
              repairHint: "Preserve trial count, Wilson interval, bootstrap cost/latency, regression, failure attribution, trajectory bundle, CI, and dashboard proof before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/alepot55/agentrial");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      statisticalAgentTrialLens: [
        {
          suiteId: "agentrial-style-synthetic-suite",
          sourceRef: "https://github.com/alepot55/agentrial",
          packageRef: "pypi:agentrial@0.2.0",
          adapter: "langgraph",
          caseId: "support-policy-research",
          caseName: "Support policy research synthesis",
          trialCount: 12,
          passCount: 11,
          passRate0to1: 0.9167,
          wilsonConfidenceLevel: 0.95,
          wilsonLower0to1: 0.6461,
          wilsonUpper0to1: 0.9851,
          bootstrapCostMeanUsd: 0.0923,
          bootstrapLatencyMeanMs: 1840.456,
          agentReliabilityScore0to1: 0.8833,
          failureAttributionStepId: "tool.search:policy-lookup",
          failureAttributionPValue: 0.018,
          regressionTestName: "fisher_exact_pass_rate",
          regressionPValue: 0.42,
          ciRunId: "ci-agentrial-2026-06-19-001",
          status: "satisfied",
          evidenceRefs: ["ev-agentrial-suite", "ev-agentrial-trials", "ev-agentrial-statistics"],
          rejectedEvidenceRefs: ["ev-agentrial-summary-only"],
        },
      ],
    });
    expect(report.rows[0]?.statisticalAgentTrialLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("confidence interval");
  });

  test("fails closed when AgentTrial-style statistical proof lacks trials, hashes, CI proof, or non-regression evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "statistical-eval-agent",
      runId: "run-agentrial-style-statistical-eval-incomplete",
      generatedAt: "2026-06-19T00:00:00.000Z",
      sourceRefs: ["https://github.com/alepot55/agentrial"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-agentrial-summary-only"],
          }),
          acceptedEvidence: [
            {
              id: "ev-agentrial-summary-only",
              event_hash: "a".repeat(64),
              writer_sig: "sig-agentrial-summary-only",
              event_type: "artifact",
              session_id: "session-agentrial",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-agentrial-missing-statistics",
                event_hash: "b".repeat(64),
                writer_sig: "sig-agentrial-missing-statistics",
                event_type: "review",
                session_id: "session-agentrial-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "statistical evaluation row lacked repeated trial evidence, Wilson interval, CI receipt, regression comparison, and failure-attribution hash",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "statistical-agent-eval-proof",
              criterionType: "reliability_improvement_measure",
              status: "satisfied",
              evidenceRefs: ["ev-agentrial-summary-only"],
              rejectedEvidenceRefs: ["ev-agentrial-missing-statistics"],
              judgeRef: "judge://amc/statistical-agent-eval",
              repairHint: "Attach trial manifests, confidence intervals, baseline/candidate comparison, CI config, and trajectory/failure-attribution hashes.",
            },
          ],
          statisticalAgentTrialLens: [
            {
              suiteId: "agentrial-style-synthetic-suite",
              sourceRef: "https://github.com/alepot55/agentrial",
              packageRef: "pypi:agentrial@0.2.0",
              adapter: "langgraph",
              caseId: "support-policy-research",
              caseName: "Support policy research synthesis",
              suiteManifestHash: "not-a-sha",
              caseManifestHash: null,
              runManifestHash: null,
              trialManifestHash: null,
              statisticalReportHash: null,
              trajectoryBundleHash: null,
              failureAttributionHash: null,
              baselineResultHash: null,
              candidateResultHash: null,
              ciConfigHash: null,
              dashboardSnapshotHash: null,
              ciRunId: null,
              trialCount: 3,
              minTrialCount: 10,
              passCount: 2,
              passRate0to1: 0.6666,
              minPassRate0to1: 0.85,
              wilsonConfidenceLevel: 0.95,
              wilsonLower0to1: 0.2076,
              minWilsonLower0to1: 0.6,
              wilsonUpper0to1: 0.9385,
              bootstrapCostMeanUsd: 0.41,
              maxCostMeanUsd: 0.2,
              bootstrapLatencyMeanMs: 3900,
              maxLatencyMeanMs: 3000,
              agentReliabilityScore0to1: 0.58,
              minAgentReliabilityScore0to1: 0.8,
              failureAttributionStepId: "",
              failureAttributionPValue: 0.2,
              maxFailureAttributionPValue: 0.05,
              regressionTestName: "fisher_exact_pass_rate",
              regressionPValue: 0.01,
              minRegressionPValue: 0.05,
              status: "satisfied",
              evidenceRefs: ["ev-agentrial-summary-only"],
              rejectedEvidenceRefs: ["ev-agentrial-missing-statistics"],
              repairHint: "Bind valid hashes, enough repeated trials, Wilson lower bound, no-regression p-value, CI run/config, trajectory bundle, and failure-attribution proof before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      statisticalAgentTrialLens: [
        {
          suiteManifestHash: "not-a-sha",
          caseManifestHash: null,
          trialManifestHash: null,
          statisticalReportHash: null,
          trajectoryBundleHash: null,
          failureAttributionHash: null,
          ciRunId: null,
          ciConfigHash: null,
          trialCount: 3,
          minTrialCount: 10,
          passRate0to1: 0.6666,
          wilsonLower0to1: 0.2076,
          bootstrapCostMeanUsd: 0.41,
          bootstrapLatencyMeanMs: 3900,
          agentReliabilityScore0to1: 0.58,
          failureAttributionStepId: null,
          regressionPValue: 0.01,
          repairHint: expect.stringContaining("enough repeated trials"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("regression comparison");
  });

  test("binds CodeQuest-style evaluator and optimizer quality dimensions into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "code-quality-agent",
      runId: "run-codequest-style-code-quality",
      generatedAt: "2026-06-19T00:00:00.000Z",
      sourceRefs: ["https://github.com/jpmorganchase/CodeQuest"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-codequest-source", "ev-codequest-evaluator", "ev-codequest-optimizer"],
            narrative: "AMC-2.3: code-quality question proof includes evaluator feedback, optimizer grounding, dimension scores, and replay evidence.",
          }),
          acceptedEvidence: [
            {
              id: "ev-codequest-source",
              event_hash: "a".repeat(64),
              writer_sig: "sig-codequest-source",
              event_type: "artifact",
              session_id: "session-codequest",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-codequest-evaluator",
              event_hash: "b".repeat(64),
              writer_sig: "sig-codequest-evaluator",
              event_type: "metric",
              session_id: "session-codequest",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-codequest-optimizer",
              event_hash: "c".repeat(64),
              writer_sig: "sig-codequest-optimizer",
              event_type: "test",
              session_id: "session-codequest-ci",
              ts: 12,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-codequest-readme-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-codequest-readme-only",
                event_type: "review",
                session_id: "session-codequest-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "README-level evaluator/optimizer description lacked per-dimension feedback, optimizer grounding, replay, CI, and no-copy proof",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "code-quality-evaluator-optimizer-proof",
              criterionType: "optimization_cycle_trace",
              status: "satisfied",
              evidenceRefs: ["ev-codequest-source", "ev-codequest-evaluator", "ev-codequest-optimizer"],
              rejectedEvidenceRefs: ["ev-codequest-readme-only"],
              judgeRef: "judge://amc/code-quality-dimensions",
              repairHint: "Keep evaluator feedback, optimizer grounding, dimension deltas, replay, CI, and no-copy proof linked to this question.",
            },
          ],
          codeQuestQualityLens: [
            {
              frameworkId: "codequest-style-quality-loop",
              sourceRef: "https://github.com/jpmorganchase/CodeQuest",
              repositoryRef: "github:jpmorganchase/CodeQuest@5944bebf874b481ed8c47dde4d4c35f7e7f20818",
              licenseRef: "Apache-2.0",
              sourceStatusHash: "e".repeat(64),
              archivedSource: true,
              taskId: "python-quality-loop",
              language: "python",
              codeArtifactHash: "f".repeat(64),
              evaluatorPromptHash: "1".repeat(64),
              evaluatorConfigHash: "2".repeat(64),
              optimizerPromptHash: "3".repeat(64),
              optimizerConfigHash: "4".repeat(64),
              baselineEvaluationHash: "5".repeat(64),
              candidateEvaluationHash: "6".repeat(64),
              evaluatorFeedbackHash: "7".repeat(64),
              optimizerGroundingHash: "8".repeat(64),
              improvementPatchHash: "9".repeat(64),
              actorCriticLoopTraceHash: "0".repeat(64),
              regressionSuiteHash: "a".repeat(64),
              replayCommandHash: "b".repeat(64),
              ciRunId: "ci-codequest-2026-06-19-001",
              ciConfigHash: "c".repeat(64),
              noSourceCopyBoundaryHash: "d".repeat(64),
              dimensionCount: 4,
              minDimensionCount: 4,
              baselineOverallScore0to1: 0.62,
              candidateOverallScore0to1: 0.81,
              minOverallScoreDelta0to1: 0.1,
              dimensionRegressionCount: 0,
              maxDimensionRegressionCount: 0,
              evaluatorFeedbackCoverage0to1: 1,
              minEvaluatorFeedbackCoverage0to1: 0.95,
              optimizerGroundingCoverage0to1: 0.97,
              minOptimizerGroundingCoverage0to1: 0.95,
              dimensions: [
                {
                  dimensionId: "readability",
                  dimensionLabel: "Readability",
                  baselineScore0to1: 0.58,
                  candidateScore0to1: 0.83,
                  minScoreDelta0to1: 0.1,
                  status: "improved",
                  evidenceRefs: ["ev-codequest-evaluator"],
                  rejectedEvidenceRefs: ["ev-codequest-readme-only"],
                  repairHint: "Keep readability feedback and the optimizer patch linked to this score movement.",
                },
                {
                  dimensionId: "security",
                  dimensionLabel: "Security",
                  baselineScore0to1: 0.66,
                  candidateScore0to1: 0.78,
                  minScoreDelta0to1: 0.05,
                  status: "improved",
                  evidenceRefs: ["ev-codequest-evaluator", "ev-codequest-optimizer"],
                  rejectedEvidenceRefs: [],
                  repairHint: "Keep security feedback tied to the accepted patch and regression suite.",
                },
                {
                  dimensionId: "maintainability",
                  dimensionLabel: "Maintainability",
                  baselineScore0to1: 0.6,
                  candidateScore0to1: 0.8,
                  minScoreDelta0to1: 0.1,
                  status: "improved",
                  evidenceRefs: ["ev-codequest-evaluator"],
                  rejectedEvidenceRefs: [],
                  repairHint: "Preserve maintainability rationale and before/after evaluation hashes.",
                },
                {
                  dimensionId: "efficiency",
                  dimensionLabel: "Efficiency",
                  baselineScore0to1: 0.64,
                  candidateScore0to1: 0.82,
                  minScoreDelta0to1: 0.1,
                  status: "improved",
                  evidenceRefs: ["ev-codequest-evaluator", "ev-codequest-optimizer"],
                  rejectedEvidenceRefs: [],
                  repairHint: "Preserve efficiency rationale and regression evidence before publishing.",
                },
              ],
              status: "satisfied",
              evidenceRefs: ["ev-codequest-source", "ev-codequest-evaluator", "ev-codequest-optimizer"],
              rejectedEvidenceRefs: ["ev-codequest-readme-only"],
              repairHint: "Preserve source status, evaluator and optimizer hashes, per-dimension score deltas, replay command, CI receipt, and no-source-copy proof before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/jpmorganchase/CodeQuest");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      codeQuestQualityLens: [
        {
          frameworkId: "codequest-style-quality-loop",
          sourceRef: "https://github.com/jpmorganchase/CodeQuest",
          repositoryRef: "github:jpmorganchase/CodeQuest@5944bebf874b481ed8c47dde4d4c35f7e7f20818",
          licenseRef: "Apache-2.0",
          archivedSource: true,
          language: "python",
          dimensionCount: 4,
          baselineOverallScore0to1: 0.62,
          candidateOverallScore0to1: 0.81,
          overallScoreDelta0to1: 0.19,
          evaluatorFeedbackCoverage0to1: 1,
          optimizerGroundingCoverage0to1: 0.97,
          dimensions: expect.arrayContaining([
            expect.objectContaining({
              dimensionId: "readability",
              scoreDelta0to1: 0.25,
              status: "improved",
            }),
          ]),
        },
      ],
    });
    expect(report.rows[0]?.codeQuestQualityLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.codeQuestQualityLens[0]?.dimensions[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("per-dimension feedback");
  });

  test("fails closed when CodeQuest-style quality proof is README-only or dimension-regressing", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "code-quality-agent",
      runId: "run-codequest-style-code-quality-incomplete",
      generatedAt: "2026-06-19T00:00:00.000Z",
      sourceRefs: ["https://github.com/jpmorganchase/CodeQuest"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-codequest-readme-only"],
          }),
          acceptedEvidence: [
            {
              id: "ev-codequest-readme-only",
              event_hash: "a".repeat(64),
              writer_sig: "sig-codequest-readme-only",
              event_type: "artifact",
              session_id: "session-codequest",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-codequest-missing-loop",
                event_hash: "b".repeat(64),
                writer_sig: "sig-codequest-missing-loop",
                event_type: "review",
                session_id: "session-codequest-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "code-quality claim lacked source status, evaluator/optimizer hashes, dimension deltas, replay command, CI proof, and no-source-copy boundary",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "code-quality-evaluator-optimizer-proof",
              criterionType: "optimization_cycle_trace",
              status: "satisfied",
              evidenceRefs: ["ev-codequest-readme-only"],
              rejectedEvidenceRefs: ["ev-codequest-missing-loop"],
              judgeRef: "judge://amc/code-quality-dimensions",
              repairHint: "Attach evaluator and optimizer manifests, dimension-level before/after scores, replay command, and CI/no-copy proof.",
            },
          ],
          codeQuestQualityLens: [
            {
              frameworkId: "codequest-style-quality-loop",
              sourceRef: "https://github.com/jpmorganchase/CodeQuest",
              repositoryRef: "",
              licenseRef: "",
              sourceStatusHash: "not-a-sha",
              archivedSource: true,
              taskId: "python-quality-loop",
              language: "python",
              codeArtifactHash: null,
              evaluatorPromptHash: null,
              evaluatorConfigHash: null,
              optimizerPromptHash: null,
              optimizerConfigHash: null,
              baselineEvaluationHash: null,
              candidateEvaluationHash: null,
              evaluatorFeedbackHash: null,
              optimizerGroundingHash: null,
              improvementPatchHash: null,
              actorCriticLoopTraceHash: null,
              regressionSuiteHash: null,
              replayCommandHash: null,
              ciRunId: null,
              ciConfigHash: null,
              noSourceCopyBoundaryHash: null,
              dimensionCount: 2,
              minDimensionCount: 4,
              baselineOverallScore0to1: 0.72,
              candidateOverallScore0to1: 0.68,
              minOverallScoreDelta0to1: 0.1,
              dimensionRegressionCount: 1,
              maxDimensionRegressionCount: 0,
              evaluatorFeedbackCoverage0to1: 0.5,
              minEvaluatorFeedbackCoverage0to1: 0.95,
              optimizerGroundingCoverage0to1: 0.2,
              minOptimizerGroundingCoverage0to1: 0.95,
              dimensions: [
                {
                  dimensionId: "readability",
                  dimensionLabel: "Readability",
                  baselineScore0to1: 0.72,
                  candidateScore0to1: 0.66,
                  minScoreDelta0to1: 0.1,
                  status: "regressed",
                  evidenceRefs: [],
                  rejectedEvidenceRefs: ["ev-codequest-missing-loop"],
                  repairHint: "Attach dimension feedback and rerun the optimizer loop before publishing.",
                },
              ],
              status: "satisfied",
              evidenceRefs: ["ev-codequest-readme-only"],
              rejectedEvidenceRefs: ["ev-codequest-missing-loop"],
              repairHint: "Bind valid source, evaluator, optimizer, replay, CI, no-copy, and dimension proof before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      codeQuestQualityLens: [
        {
          repositoryRef: "unknown-repository",
          licenseRef: null,
          sourceStatusHash: "not-a-sha",
          codeArtifactHash: null,
          evaluatorPromptHash: null,
          optimizerConfigHash: null,
          replayCommandHash: null,
          ciRunId: null,
          dimensionCount: 2,
          minDimensionCount: 4,
          overallScoreDelta0to1: -0.04,
          dimensionRegressionCount: 1,
          evaluatorFeedbackCoverage0to1: 0.5,
          optimizerGroundingCoverage0to1: 0.2,
          dimensions: [
            expect.objectContaining({
              dimensionId: "readability",
              scoreDelta0to1: -0.06,
              status: "regressed",
            }),
          ],
          repairHint: expect.stringContaining("valid source"),
        },
      ],
    });
  });

  test("binds eval-ai-library source, metric, question, evidence, and repair proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "eval-ai-library-agent",
      runId: "run-eval-ai-library-question-explainability",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/firstlinesoftware/eval-ai-library"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-eval-ai-source", "ev-eval-ai-metric", "ev-eval-ai-ci"],
            narrative: "AMC-1.1: eval-ai-library proof links question score movement to source, metric, accepted evidence, rejected evidence, CI, and repair hints.",
          }),
          acceptedEvidence: [
            {
              id: "ev-eval-ai-source",
              event_hash: "a".repeat(64),
              writer_sig: "sig-eval-ai-source",
              event_type: "artifact",
              session_id: "session-eval-ai-source",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-eval-ai-metric",
              event_hash: "b".repeat(64),
              writer_sig: "sig-eval-ai-metric",
              event_type: "metric",
              session_id: "session-eval-ai-metric",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-eval-ai-ci",
              event_hash: "c".repeat(64),
              writer_sig: "sig-eval-ai-ci",
              event_type: "test",
              session_id: "session-eval-ai-ci",
              ts: 12,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-eval-ai-readme-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-eval-ai-readme",
                event_type: "review",
                session_id: "session-eval-ai-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "repository metadata alone lacked per-question accepted evidence, rejected evidence reasons, metric config, result artifact, CI proof, and repair hint",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "eval-ai-library-question-score-proof",
              criterionType: "evaluation_metric",
              status: "satisfied",
              evidenceRefs: ["ev-eval-ai-source", "ev-eval-ai-metric", "ev-eval-ai-ci"],
              rejectedEvidenceRefs: ["ev-eval-ai-readme-only"],
              judgeRef: "judge://amc/eval-ai-library-question-explainability",
              repairHint: "Keep eval-ai-library source, metric config, question id, accepted/rejected evidence refs, CI, and repair hint linked to this question.",
            },
          ],
          evalAiLibraryQuestionLens: [
            {
              frameworkId: "eval-ai-library-question-explainability",
              sourceRef: "https://github.com/firstlinesoftware/eval-ai-library",
              repositoryRef: "firstlinesoftware/eval-ai-library",
              licenseRef: "Apache License 2.0",
              licenseSpdxId: "Apache-2.0",
              defaultBranch: "main",
              sourceCommitSha: "b2c9cdaa2bdfff8343b238a03fac81767e8b1cd7",
              sourceTreeSha: "b2c9cdaa2bdfff8343b238a03fac81767e8b1cd7",
              sourceStatusHash: "e".repeat(64),
              readmeArtifactHash: "0d794e6ad4ba72ccab07fefd4e9ed0711fc0d18b",
              licenseArtifactHash: "46da3d44d85c7f20e036f7efbcfeadb294e99208",
              noticeArtifactHash: "1be4c2b0e1804a6992b63e3024a3db63138edf87",
              pyprojectArtifactHash: "93c9192763ad3d824b21f708465146c79ddc6e05",
              requirementsArtifactHash: "4cd647c6e3ca9a980abfd4003328e82d84f6127d",
              evalLibTreeHash: "57cd28e4087a11e6e7e7fcda693c9c83bd2d3cd1",
              metricsTreeHash: "340ff06033b18d835db42e942d3adfc76a4ba93b",
              agentMetricsTreeHash: "79932873e27038510e01d6a56d41af90c48d595f",
              securityMetricsTreeHash: "1075f083f32684db9b9d05dabf9df5fd0aa57510",
              tracingTreeHash: "37b5e360b6c7e9cbd000920e9172bcc2ea50ed38",
              dashboardArtifactHash: "fba0926d19d847a1f8ee0e845fc1f80d41c74c24",
              evaluationSchemaHash: "24960105d6f76b4fe4a7837744355ff277cf8ebd",
              testcasesSchemaHash: "d87c29274752bdea6a4b5b755b100f87200a86c3",
              metricPatternHash: "321398b9bd6e0feb2099bd6f9a9f63eb36623e80",
              llmClientHash: "fc534f99531fe261aa7802a5c2e326e5a7902e0e",
              evalPackManifestHash: "1".repeat(64),
              datasetManifestHash: "2".repeat(64),
              questionSetHash: "3".repeat(64),
              questionTraceHash: "4".repeat(64),
              evaluatorConfigHash: "5".repeat(64),
              metricResultHash: "6".repeat(64),
              scoreBreakdownHash: "7".repeat(64),
              acceptedEvidenceLedgerHash: "c".repeat(64),
              rejectedEvidenceLedgerHash: "8".repeat(64),
              repairHintHash: "9".repeat(64),
              regressionThresholdHash: "0".repeat(64),
              ciRunId: "github-actions:eval-ai-library-question-proof:2026-06-20",
              ciConfigHash: "a".repeat(64),
              noSourceCopyBoundaryHash: "b".repeat(64),
              metricFamily: "mixed",
              metricIds: ["answer_relevancy", "faithfulness", "task_success", "prompt_injection_detection"],
              providerCount: 3,
              minProviderCount: 2,
              metricCount: 18,
              minMetricCount: 15,
              questionCount: 12,
              minQuestionCount: 10,
              evidenceCoverage0to1: 1,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 1,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 1,
              minRepairHintCoverage0to1: 0.9,
              regressionPassRate0to1: 1,
              minRegressionPassRate0to1: 0.99,
              scoreConfidence0to1: 0.91,
              minScoreConfidence0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-eval-ai-source", "ev-eval-ai-metric", "ev-eval-ai-ci"],
              rejectedEvidenceRefs: ["ev-eval-ai-readme-only"],
              repairHint: "Preserve question id, accepted evidence ids, rejected evidence reasons, metric result, score breakdown, CI, and repair hints before externalizing this eval-ai-library-style question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      acceptedEvidenceIds: ["ev-eval-ai-source", "ev-eval-ai-metric", "ev-eval-ai-ci"],
      rejectedEvidence: [
        expect.objectContaining({
          evidenceId: "ev-eval-ai-readme-only",
          reason: expect.stringContaining("repository metadata alone"),
        }),
      ],
      repairHint: expect.stringContaining("Target L5"),
      evalAiLibraryQuestionLens: [
        {
          frameworkId: "eval-ai-library-question-explainability",
          sourceRef: "https://github.com/firstlinesoftware/eval-ai-library",
          repositoryRef: "firstlinesoftware/eval-ai-library",
          licenseSpdxId: "Apache-2.0",
          defaultBranch: "main",
          sourceCommitSha: "b2c9cdaa2bdfff8343b238a03fac81767e8b1cd7",
          metricFamily: "mixed",
          metricCount: 18,
          minMetricCount: 15,
          evidenceCoverage0to1: 1,
          rejectedEvidenceReasonCoverage0to1: 1,
          repairHintCoverage0to1: 1,
          regressionPassRate0to1: 1,
          status: "satisfied",
        },
      ],
    });
    expect(report.rows[0]?.evalAiLibraryQuestionLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when eval-ai-library proof is source metadata without question-level evidence reasons", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "eval-ai-library-agent",
      runId: "run-eval-ai-library-question-explainability-incomplete",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/firstlinesoftware/eval-ai-library"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-eval-ai-metadata"],
          }),
          acceptedEvidence: [
            {
              id: "ev-eval-ai-metadata",
              event_hash: "a".repeat(64),
              writer_sig: "sig-eval-ai-metadata",
              event_type: "artifact",
              session_id: "session-eval-ai-metadata",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-eval-ai-missing-question-proof",
                event_hash: "b".repeat(64),
                writer_sig: "sig-eval-ai-missing-question-proof",
                event_type: "review",
                session_id: "session-eval-ai-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "eval-ai-library claim lacked per-question accepted evidence ids, rejected evidence reasons, repair hints, result hashes, and CI thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "eval-ai-library-question-score-proof",
              criterionType: "evaluation_metric",
              status: "satisfied",
              evidenceRefs: ["ev-eval-ai-metadata"],
              rejectedEvidenceRefs: ["ev-eval-ai-missing-question-proof"],
              judgeRef: "judge://amc/eval-ai-library-question-explainability",
              repairHint: "Attach per-question accepted evidence, rejected evidence reasons, repair hints, metric results, and CI thresholds.",
            },
          ],
          evalAiLibraryQuestionLens: [
            {
              frameworkId: "eval-ai-library-question-explainability",
              sourceRef: "https://github.com/firstlinesoftware/eval-ai-library",
              repositoryRef: "firstlinesoftware/eval-ai-library",
              licenseRef: "Apache License 2.0",
              licenseSpdxId: "Apache-2.0",
              defaultBranch: "main",
              sourceCommitSha: "b2c9cdaa2bdfff8343b238a03fac81767e8b1cd7",
              sourceTreeSha: "b2c9cdaa2bdfff8343b238a03fac81767e8b1cd7",
              sourceStatusHash: "e".repeat(64),
              readmeArtifactHash: "0d794e6ad4ba72ccab07fefd4e9ed0711fc0d18b",
              licenseArtifactHash: "46da3d44d85c7f20e036f7efbcfeadb294e99208",
              noticeArtifactHash: null,
              pyprojectArtifactHash: null,
              requirementsArtifactHash: null,
              evalLibTreeHash: "57cd28e4087a11e6e7e7fcda693c9c83bd2d3cd1",
              metricsTreeHash: null,
              agentMetricsTreeHash: null,
              securityMetricsTreeHash: null,
              tracingTreeHash: null,
              dashboardArtifactHash: null,
              evaluationSchemaHash: null,
              testcasesSchemaHash: null,
              metricPatternHash: null,
              llmClientHash: null,
              evalPackManifestHash: null,
              datasetManifestHash: null,
              questionSetHash: null,
              questionTraceHash: null,
              evaluatorConfigHash: null,
              metricResultHash: null,
              scoreBreakdownHash: null,
              rejectedEvidenceLedgerHash: null,
              repairHintHash: null,
              regressionThresholdHash: null,
              ciRunId: null,
              ciConfigHash: null,
              noSourceCopyBoundaryHash: null,
              metricFamily: "mixed",
              metricIds: ["answer_relevancy"],
              providerCount: 1,
              minProviderCount: 2,
              metricCount: 1,
              minMetricCount: 15,
              questionCount: 1,
              minQuestionCount: 10,
              evidenceCoverage0to1: 0.35,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 0.25,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 0.1,
              minRepairHintCoverage0to1: 0.9,
              regressionPassRate0to1: 0.5,
              minRegressionPassRate0to1: 0.99,
              scoreConfidence0to1: 0.4,
              minScoreConfidence0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-eval-ai-metadata"],
              rejectedEvidenceRefs: ["ev-eval-ai-missing-question-proof"],
              repairHint: "Bind per-question accepted evidence ids, rejected reasons, repair hints, metric result hashes, and CI thresholds before using this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      evalAiLibraryQuestionLens: [
        {
          pyprojectArtifactHash: null,
          metricsTreeHash: null,
          questionTraceHash: null,
          metricResultHash: null,
          repairHintHash: null,
          ciRunId: null,
          metricCount: 1,
          minMetricCount: 15,
          evidenceCoverage0to1: 0.35,
          rejectedEvidenceReasonCoverage0to1: 0.25,
          repairHintCoverage0to1: 0.1,
          regressionPassRate0to1: 0.5,
          scoreConfidence0to1: 0.4,
          repairHint: expect.stringContaining("per-question accepted evidence"),
        },
      ],
    });
  });

  test("GAP-0616 binds DOI/OpenAlex metadata-only review to eval-score explainability pack rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0616-agent",
      runId: "run-gap-0616-eval-score-explainability",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: [
        "https://doi.org/10.1007/s10462-025-11471-9",
        "https://openalex.org/W7118468219",
        "crossref:journal-article:Artificial Intelligence Review:2026",
        "amc:no-paper-prose-or-data-copied",
      ],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-gap-0616-eval-pack", "ev-gap-0616-result", "ev-gap-0616-ci"],
            narrative: "AMC-2.3: eval-score explainability links question id, evidence decisions, result hashes, and repair guidance.",
          }),
          acceptedEvidence: [
            {
              id: "ev-gap-0616-eval-pack",
              event_hash: "a".repeat(64),
              writer_sig: "sig-gap-0616-eval-pack",
              event_type: "artifact",
              session_id: "session-gap-0616-eval",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap-0616-result",
              event_hash: "b".repeat(64),
              writer_sig: "sig-gap-0616-result",
              event_type: "metric",
              session_id: "session-gap-0616-eval",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap-0616-ci",
              event_hash: "c".repeat(64),
              writer_sig: "sig-gap-0616-ci",
              event_type: "test",
              session_id: "session-gap-0616-ci",
              ts: 12,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap-0616-paper-metadata-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-gap-0616-paper-metadata-only",
                event_type: "review",
                session_id: "session-gap-0616-source-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "paper metadata confirms relevance but is not accepted as question score evidence without per-question accepted evidence ids, rejected evidence reasons, result hashes, CI thresholds, and repair hints",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0616-eval-score-explainability-proof",
              criterionType: "objective_quality",
              status: "satisfied",
              evidenceRefs: ["ev-gap-0616-eval-pack", "ev-gap-0616-result", "ev-gap-0616-ci"],
              rejectedEvidenceRefs: ["ev-gap-0616-paper-metadata-only"],
              judgeRef: "judge://amc/gap-0616-eval-score-explainability",
              repairHint: "Keep the question id, accepted evidence ids, rejected evidence reasons, result hashes, CI thresholds, and repair hint together.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap-0616-eval-score-explainability",
              sourceRef: "https://doi.org/10.1007/s10462-025-11471-9",
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "amc-owned-gap-0616-eval-score-fixture",
              datasetHash: "1".repeat(64),
              testCaseId: "gap-0616-question-row-proof",
              testCaseHash: "2".repeat(64),
              evaluatorIds: ["amc-question-score-explainability"],
              evaluatorConfigHash: "3".repeat(64),
              judgeModelRef: "deterministic-amc-rubric",
              experimentRunId: "gap-0616-run-001",
              experimentResultHash: "4".repeat(64),
              exportArtifactHash: "5".repeat(64),
              ciRunId: "vitest:questionScoreExplainability:gap-0616",
              ciConfigHash: "6".repeat(64),
              traceArtifactHash: "7".repeat(64),
              toolCallValidationHash: "8".repeat(64),
              agentBehaviorEvaluation: true,
              passRate0to1: 1,
              minPassRate0to1: 0.99,
              averageScore0to1: 0.94,
              threshold0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-gap-0616-eval-pack", "ev-gap-0616-result", "ev-gap-0616-ci"],
              rejectedEvidenceRefs: ["ev-gap-0616-paper-metadata-only"],
              repairHint: "Preserve question id, accepted evidence ids, rejected reason ledger, repair hint, CI, and result hashes before using this eval-score explanation.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(pack.sourceRefs).toEqual(expect.arrayContaining([
      "https://doi.org/10.1007/s10462-025-11471-9",
      "https://openalex.org/W7118468219",
      "amc:no-paper-prose-or-data-copied",
    ]));
    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      acceptedEvidenceIds: ["ev-gap-0616-eval-pack", "ev-gap-0616-result", "ev-gap-0616-ci"],
      rejectedEvidenceReasons: [
        {
          evidenceId: "ev-gap-0616-paper-metadata-only",
          reason: expect.stringContaining("paper metadata confirms relevance"),
        },
      ],
      repairHint: expect.stringContaining("Target L5"),
      status: "ready",
    });
  });

  test("binds auto-bench-audit reproducible eval pack rows to signed evidence and fail-closed thresholds", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "auto-bench-audit-agent",
      runId: "run-auto-bench-audit-question-explainability",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/IsThatYou/auto-bench-audit"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-auto-bench-pack", "ev-auto-bench-row", "ev-auto-bench-ci"],
            narrative: "AMC-1.1: auto-bench-audit-style proof links each question score row to signed evidence, rejected reasons, repair hints, and regression thresholds.",
          }),
          acceptedEvidence: [
            {
              id: "ev-auto-bench-pack",
              event_hash: "a".repeat(64),
              writer_sig: "sig-auto-bench-pack",
              event_type: "artifact",
              session_id: "session-auto-bench-pack",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-auto-bench-row",
              event_hash: "b".repeat(64),
              writer_sig: "sig-auto-bench-row",
              event_type: "metric",
              session_id: "session-auto-bench-row",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-auto-bench-ci",
              event_hash: "c".repeat(64),
              writer_sig: "sig-auto-bench-ci",
              event_type: "test",
              session_id: "session-auto-bench-ci",
              ts: 12,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-auto-bench-metadata-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-auto-bench-metadata-only",
                event_type: "review",
                session_id: "session-auto-bench-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "source metadata alone did not bind a reproducible eval pack row to accepted evidence ids, rejected evidence reasons, repair hints, score breakdown, and CI regression threshold",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "auto-bench-audit-question-score-proof",
              criterionType: "evaluation_metric",
              status: "satisfied",
              evidenceRefs: ["ev-auto-bench-pack", "ev-auto-bench-row", "ev-auto-bench-ci"],
              rejectedEvidenceRefs: ["ev-auto-bench-metadata-only"],
              judgeRef: "judge://amc/auto-bench-audit-question-explainability",
              repairHint: "Keep the eval-pack manifest, per-question row evidence, rejected reason ledger, repair hint, score breakdown, and regression threshold linked to this question.",
            },
          ],
          evalAiLibraryQuestionLens: [
            {
              frameworkId: "auto-bench-audit-question-explainability",
              sourceRef: "https://github.com/IsThatYou/auto-bench-audit",
              repositoryRef: "IsThatYou/auto-bench-audit",
              licenseRef: "NOASSERTION",
              licenseSpdxId: "NOASSERTION",
              defaultBranch: "main",
              sourceCommitSha: "f74341939a0dbb7a67fe1643609214f4e546df87",
              sourceTreeSha: "f74341939a0dbb7a67fe1643609214f4e546df87",
              sourceStatusHash: "e".repeat(64),
              readmeArtifactHash: "f".repeat(64),
              licenseArtifactHash: "1".repeat(64),
              noticeArtifactHash: "2".repeat(64),
              pyprojectArtifactHash: "3".repeat(64),
              requirementsArtifactHash: "4".repeat(64),
              evalLibTreeHash: "5".repeat(64),
              metricsTreeHash: "6".repeat(64),
              agentMetricsTreeHash: "7".repeat(64),
              securityMetricsTreeHash: "8".repeat(64),
              tracingTreeHash: "9".repeat(64),
              dashboardArtifactHash: "0".repeat(64),
              evaluationSchemaHash: "a".repeat(64),
              testcasesSchemaHash: "b".repeat(64),
              metricPatternHash: "c".repeat(64),
              llmClientHash: "d".repeat(64),
              evalPackManifestHash: "e".repeat(64),
              datasetManifestHash: "f".repeat(64),
              questionSetHash: "1".repeat(64),
              questionTraceHash: "2".repeat(64),
              evaluatorConfigHash: "3".repeat(64),
              metricResultHash: "4".repeat(64),
              scoreBreakdownHash: "5".repeat(64),
              acceptedEvidenceLedgerHash: "a".repeat(64),
              rejectedEvidenceLedgerHash: "6".repeat(64),
              repairHintHash: "7".repeat(64),
              regressionThresholdHash: "8".repeat(64),
              ciRunId: "github-actions:auto-bench-audit-question-proof:2026-06-20",
              ciConfigHash: "9".repeat(64),
              noSourceCopyBoundaryHash: "0".repeat(64),
              metricFamily: "agent",
              metricIds: ["question_row_linkage", "signed_evidence_coverage", "regression_threshold_gate"],
              providerCount: 2,
              minProviderCount: 1,
              metricCount: 9,
              minMetricCount: 6,
              questionCount: 3,
              minQuestionCount: 3,
              evidenceCoverage0to1: 1,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 1,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 1,
              minRepairHintCoverage0to1: 0.9,
              regressionPassRate0to1: 1,
              minRegressionPassRate0to1: 0.99,
              scoreConfidence0to1: 0.9,
              minScoreConfidence0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-auto-bench-pack", "ev-auto-bench-row", "ev-auto-bench-ci"],
              rejectedEvidenceRefs: ["ev-auto-bench-metadata-only"],
              repairHint: "Preserve question id, accepted evidence ids, rejected reasons, repair hint, score breakdown, and CI regression threshold before using this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/IsThatYou/auto-bench-audit");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      acceptedEvidenceIds: ["ev-auto-bench-pack", "ev-auto-bench-row", "ev-auto-bench-ci"],
      rejectedEvidence: [
        expect.objectContaining({
          evidenceId: "ev-auto-bench-metadata-only",
          reason: expect.stringContaining("source metadata alone"),
        }),
      ],
      evalAiLibraryQuestionLens: [
        {
          frameworkId: "auto-bench-audit-question-explainability",
          repositoryRef: "IsThatYou/auto-bench-audit",
          licenseSpdxId: "NOASSERTION",
          defaultBranch: "main",
          sourceCommitSha: "f74341939a0dbb7a67fe1643609214f4e546df87",
          metricFamily: "agent",
          metricIds: ["question_row_linkage", "signed_evidence_coverage", "regression_threshold_gate"],
          evidenceCoverage0to1: 1,
          rejectedEvidenceReasonCoverage0to1: 1,
          repairHintCoverage0to1: 1,
          regressionPassRate0to1: 1,
          minRegressionPassRate0to1: 0.99,
          status: "satisfied",
          evidenceRefs: ["ev-auto-bench-pack", "ev-auto-bench-row", "ev-auto-bench-ci"],
          rejectedEvidenceRefs: ["ev-auto-bench-metadata-only"],
          repairHint: expect.stringContaining("accepted evidence ids"),
        },
      ],
    });
    expect(report.rows[0]?.evalAiLibraryQuestionLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when auto-bench-audit proof is source metadata without row-level evidence or regression thresholds", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "auto-bench-audit-agent",
      runId: "run-auto-bench-audit-metadata-only",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/IsThatYou/auto-bench-audit"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-auto-bench-source-metadata"],
          }),
          acceptedEvidence: [
            {
              id: "ev-auto-bench-source-metadata",
              event_hash: "a".repeat(64),
              writer_sig: "sig-auto-bench-source-metadata",
              event_type: "artifact",
              session_id: "session-auto-bench-source-metadata",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-auto-bench-row-proof-missing",
                event_hash: "b".repeat(64),
                writer_sig: "sig-auto-bench-row-proof-missing",
                event_type: "review",
                session_id: "session-auto-bench-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "metadata-only source review lacked a reproducible eval pack, signed row evidence, rejected evidence reasons, repair hint hash, score breakdown hash, CI run, and regression threshold hash",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "auto-bench-audit-question-score-proof",
              criterionType: "evaluation_metric",
              status: "satisfied",
              evidenceRefs: ["ev-auto-bench-source-metadata"],
              rejectedEvidenceRefs: ["ev-auto-bench-row-proof-missing"],
              judgeRef: "judge://amc/auto-bench-audit-question-explainability",
              repairHint: "Attach a reproducible eval pack with signed row evidence, rejected evidence reasons, repair hints, score breakdown, CI, and fail-closed regression thresholds.",
            },
          ],
          evalAiLibraryQuestionLens: [
            {
              frameworkId: "auto-bench-audit-question-explainability",
              sourceRef: "https://github.com/IsThatYou/auto-bench-audit",
              repositoryRef: "IsThatYou/auto-bench-audit",
              licenseRef: null,
              licenseSpdxId: null,
              defaultBranch: "main",
              sourceCommitSha: "f74341939a0dbb7a67fe1643609214f4e546df87",
              sourceTreeSha: "f74341939a0dbb7a67fe1643609214f4e546df87",
              sourceStatusHash: "e".repeat(64),
              readmeArtifactHash: "f".repeat(64),
              licenseArtifactHash: null,
              noticeArtifactHash: null,
              pyprojectArtifactHash: null,
              requirementsArtifactHash: null,
              evalLibTreeHash: null,
              metricsTreeHash: null,
              agentMetricsTreeHash: null,
              securityMetricsTreeHash: null,
              tracingTreeHash: null,
              dashboardArtifactHash: null,
              evaluationSchemaHash: null,
              testcasesSchemaHash: null,
              metricPatternHash: null,
              llmClientHash: null,
              evalPackManifestHash: null,
              datasetManifestHash: null,
              questionSetHash: null,
              questionTraceHash: null,
              evaluatorConfigHash: null,
              metricResultHash: null,
              scoreBreakdownHash: null,
              rejectedEvidenceLedgerHash: null,
              repairHintHash: null,
              regressionThresholdHash: null,
              ciRunId: null,
              ciConfigHash: null,
              noSourceCopyBoundaryHash: null,
              metricFamily: "agent",
              metricIds: ["question_row_linkage"],
              providerCount: 1,
              minProviderCount: 1,
              metricCount: 1,
              minMetricCount: 6,
              questionCount: 1,
              minQuestionCount: 3,
              evidenceCoverage0to1: 0.2,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 0.25,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 0.25,
              minRepairHintCoverage0to1: 0.9,
              regressionPassRate0to1: 0.5,
              minRegressionPassRate0to1: 0.99,
              scoreConfidence0to1: 0.4,
              minScoreConfidence0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-auto-bench-source-metadata"],
              rejectedEvidenceRefs: ["ev-auto-bench-row-proof-missing"],
              repairHint: "Bind signed question rows, accepted evidence ids, rejected reasons, repair hints, score breakdown, and fail-closed regression thresholds before using this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      acceptedEvidenceIds: ["ev-auto-bench-source-metadata"],
      rejectedEvidence: [
        expect.objectContaining({
          evidenceId: "ev-auto-bench-row-proof-missing",
          reason: expect.stringContaining("metadata-only source review"),
        }),
      ],
      evalAiLibraryQuestionLens: [
        {
          licenseRef: null,
          licenseSpdxId: null,
          evalPackManifestHash: null,
          questionTraceHash: null,
          metricResultHash: null,
          scoreBreakdownHash: null,
          regressionThresholdHash: null,
          ciRunId: null,
          metricCount: 1,
          minMetricCount: 6,
          questionCount: 1,
          minQuestionCount: 3,
          evidenceCoverage0to1: 0.2,
          rejectedEvidenceReasonCoverage0to1: 0.25,
          repairHintCoverage0to1: 0.25,
          regressionPassRate0to1: 0.5,
          minRegressionPassRate0to1: 0.99,
          scoreConfidence0to1: 0.4,
          repairHint: expect.stringContaining("fail-closed regression thresholds"),
        },
      ],
    });
  });

  test("binds Incident Triage SRE task, root-cause, red-herring, remediation, and deterministic grader proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "sre-incident-agent",
      runId: "run-incident-triage",
      generatedAt: "2026-06-14T00:00:00.000Z",
      sourceRefs: ["https://github.com/Harikishanth/Incident-Triage-Environment"],
      rows: [
        {
          question: question("AMC-3.3.1"),
          score: score({
            questionId: "AMC-3.3.1",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-incident-report", "ev-incident-grader"],
            narrative: "AMC-3.3.1: SRE incident triage proof includes deterministic root cause, red-herring, and ordered remediation evidence.",
          }),
          acceptedEvidence: [
            {
              id: "ev-incident-report",
              event_hash: "a".repeat(64),
              writer_sig: "sig-incident-report",
              event_type: "artifact",
              session_id: "session-incident",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-incident-grader",
              event_hash: "b".repeat(64),
              writer_sig: "sig-incident-grader",
              event_type: "metric",
              session_id: "session-incident",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "sre-incident-root-cause",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-incident-report", "ev-incident-grader"],
              judgeRef: "judge://amc/sre-incident-triage",
              repairHint: "Keep the incident report, deterministic grader, and remediation evidence bound to this question.",
            },
          ],
          incidentTriageLens: [
            {
              environmentId: "incident-triage-openenv",
              sourceRef: "https://github.com/Harikishanth/Incident-Triage-Environment",
              taskId: "medium",
              scenarioId: "p1-cascading-failure",
              difficulty: "medium",
              severity: "p1",
              openEnvConfigHash: "c".repeat(64),
              scenarioManifestHash: "d".repeat(64),
              incidentReportHash: "e".repeat(64),
              rawLogBundleHash: "f".repeat(64),
              metricSnapshotHash: "1".repeat(64),
              userReportHash: "2".repeat(64),
              actionPayloadHash: "3".repeat(64),
              graderConfigHash: "4".repeat(64),
              feedbackHash: "5".repeat(64),
              reward0to1: 0.91,
              minReward0to1: 0.8,
              rootCauseScore0to1: 1,
              minRootCauseScore0to1: 0.8,
              redHerringFilterScore0to1: 0.88,
              minRedHerringFilterScore0to1: 0.75,
              orderedRemediationScore0to1: 0.86,
              minOrderedRemediationScore0to1: 0.75,
              maxSteps: 1,
              stepCount: 1,
              deterministicGrader: true,
              status: "satisfied",
              evidenceRefs: ["ev-incident-report", "ev-incident-grader"],
              rejectedEvidenceRefs: [],
              repairHint: "Preserve the task tier, log/metric/user report hashes, grader config, reward, and remediation-order proof before raising this question.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/Harikishanth/Incident-Triage-Environment");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-3.3.1",
      status: "passed",
      incidentTriageLens: [
        {
          environmentId: "incident-triage-openenv",
          taskId: "medium",
          scenarioId: "p1-cascading-failure",
          difficulty: "medium",
          severity: "p1",
          reward0to1: 0.91,
          rootCauseScore0to1: 1,
          redHerringFilterScore0to1: 0.88,
          orderedRemediationScore0to1: 0.86,
          deterministicGrader: true,
          status: "satisfied",
          evidenceRefs: ["ev-incident-report", "ev-incident-grader"],
        },
      ],
    });
    expect(report.rows[0]?.incidentTriageLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when Incident Triage SRE question proof lacks logs, metrics, grader, reward, or ordered remediation evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "sre-incident-agent",
      runId: "run-incident-triage-missing-proof",
      generatedAt: "2026-06-14T00:00:00.000Z",
      sourceRefs: ["https://github.com/Harikishanth/Incident-Triage-Environment"],
      rows: [
        {
          question: question("AMC-3.3.1"),
          score: score({
            questionId: "AMC-3.3.1",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-incident-report"],
          }),
          acceptedEvidence: [
            {
              id: "ev-incident-report",
              event_hash: "6".repeat(64),
              writer_sig: "sig-incident-report",
              event_type: "artifact",
              session_id: "session-incident",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-incident-reject",
                event_hash: "7".repeat(64),
                writer_sig: "sig-incident-reject",
                event_type: "review",
                session_id: "session-incident-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "incident row lacked raw log, metric snapshot, deterministic grader, and ordered remediation proof",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "sre-incident-root-cause",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-incident-report"],
              rejectedEvidenceRefs: ["ev-incident-reject"],
              judgeRef: "judge://amc/sre-incident-triage",
              repairHint: "Attach raw logs, metrics, deterministic grader, and remediation-order evidence.",
            },
          ],
          incidentTriageLens: [
            {
              environmentId: "incident-triage-openenv",
              sourceRef: "https://github.com/Harikishanth/Incident-Triage-Environment",
              taskId: "hard",
              scenarioId: "p0-catastrophic-crash",
              difficulty: "hard",
              severity: "p0",
              openEnvConfigHash: "bad-openenv-hash",
              scenarioManifestHash: "8".repeat(64),
              incidentReportHash: "9".repeat(64),
              rawLogBundleHash: null,
              metricSnapshotHash: null,
              userReportHash: null,
              actionPayloadHash: "0".repeat(64),
              graderConfigHash: null,
              feedbackHash: null,
              reward0to1: 0.42,
              minReward0to1: 0.8,
              rootCauseScore0to1: 0.5,
              minRootCauseScore0to1: 0.8,
              redHerringFilterScore0to1: 0.4,
              minRedHerringFilterScore0to1: 0.75,
              orderedRemediationScore0to1: 0.25,
              minOrderedRemediationScore0to1: 0.75,
              maxSteps: 1,
              stepCount: 2,
              deterministicGrader: false,
              status: "satisfied",
              evidenceRefs: ["ev-incident-report"],
              rejectedEvidenceRefs: ["ev-incident-reject"],
              repairHint: "Bind raw logs, metrics, user reports, deterministic grader config, feedback, reward, and ordered remediation evidence before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      incidentTriageLens: [
        {
          taskId: "hard",
          difficulty: "hard",
          severity: "p0",
          rawLogBundleHash: null,
          metricSnapshotHash: null,
          userReportHash: null,
          graderConfigHash: null,
          feedbackHash: null,
          reward0to1: 0.42,
          deterministicGrader: false,
          status: "satisfied",
          repairHint: expect.stringContaining("deterministic grader"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("ordered remediation");
  });

  test("binds OccuBench-style professional task, LWM environment, fault, verifier, trajectory, and repair evidence into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "professional-task-agent",
      runId: "run-occubench-professional-task",
      generatedAt: "2026-06-16T00:00:00.000Z",
      sourceRefs: ["https://github.com/GregxmHu/OccuBench"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-occubench-task", "ev-occubench-verifier"],
          }),
          acceptedEvidence: [
            {
              id: "ev-occubench-task",
              event_hash: "a".repeat(64),
              writer_sig: "sig-occubench-task",
              event_type: "artifact",
              session_id: "session-occubench-task",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-occubench-verifier",
              event_hash: "b".repeat(64),
              writer_sig: "sig-occubench-verifier",
              event_type: "verifier",
              session_id: "session-occubench-verifier",
              ts: 11,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-occubench-readme-only",
                event_hash: "c".repeat(64),
                writer_sig: "sig-occubench-readme",
                event_type: "review",
                session_id: "session-occubench-review",
                ts: 12,
                trustTier: "ATTESTED",
              },
              reason: "README feature summary did not bind task scenario, LWM environment, verifier votes, trajectory, or replay config",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "occubench-professional-task",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-occubench-task", "ev-occubench-verifier"],
              rejectedEvidenceRefs: ["ev-occubench-readme-only"],
              judgeRef: "judge://amc/occubench-professional-task",
              repairHint: "Keep task scenario, LWM environment, verifier-vote, trajectory, and replay proof attached.",
            },
          ],
          professionalTaskLens: [
            {
              benchmarkId: "occubench-professional-task",
              sourceRef: "https://github.com/GregxmHu/OccuBench",
              taskId: "professional-task-001",
              scenarioId: "domain-scenario-001",
              industryCategory: "business-enterprise",
              professionalDomain: "real-estate",
              difficultyLevel: 2,
              datasetManifestHash: "d".repeat(64),
              scenarioManifestHash: "e".repeat(64),
              worldModelConfigHash: "f".repeat(64),
              toolSchemaHash: "1".repeat(64),
              agentConfigHash: "2".repeat(64),
              faultInjectionConfigHash: "3".repeat(64),
              verifierRubricHash: "4".repeat(64),
              verifierVoteManifestHash: "5".repeat(64),
              trajectoryHash: "6".repeat(64),
              resultArtifactHash: "7".repeat(64),
              replayConfigHash: "8".repeat(64),
              debugTraceHash: "9".repeat(64),
              environmentMode: "E2",
              faultMode: "implicit",
              verifierVoteCount: 3,
              minVerifierVoteCount: 3,
              passRate0to1: 0.86,
              minPassRate0to1: 0.8,
              robustnessScore0to1: 0.82,
              minRobustnessScore0to1: 0.75,
              trajectoryStepCount: 5,
              maxTrajectoryStepCount: 12,
              status: "satisfied",
              evidenceRefs: ["ev-occubench-task", "ev-occubench-verifier"],
              rejectedEvidenceRefs: ["ev-occubench-readme-only"],
              repairHint: "Preserve professional-task scenario, LWM, verifier, fault, trajectory, and replay evidence before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "passed",
      professionalTaskLens: [
        {
          benchmarkId: "occubench-professional-task",
          sourceRef: "https://github.com/GregxmHu/OccuBench",
          taskId: "professional-task-001",
          scenarioId: "domain-scenario-001",
          industryCategory: "business-enterprise",
          professionalDomain: "real-estate",
          environmentMode: "E2",
          faultMode: "implicit",
          verifierVoteCount: 3,
          passRate0to1: 0.86,
          robustnessScore0to1: 0.82,
          trajectoryStepCount: 5,
          status: "satisfied",
        },
      ],
    });
    expect(report.rows[0]?.professionalTaskLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when OccuBench-style professional task question proof lacks scenario, verifier, trajectory, or replay evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "professional-task-agent",
      runId: "run-occubench-missing-proof",
      generatedAt: "2026-06-16T00:00:00.000Z",
      sourceRefs: ["https://github.com/GregxmHu/OccuBench"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-occubench-summary"],
          }),
          acceptedEvidence: [
            {
              id: "ev-occubench-summary",
              event_hash: "a".repeat(64),
              writer_sig: "sig-occubench-summary",
              event_type: "artifact",
              session_id: "session-occubench-summary",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-occubench-readme-only",
                event_hash: "c".repeat(64),
                writer_sig: "sig-occubench-readme",
                event_type: "review",
                session_id: "session-occubench-review",
                ts: 12,
                trustTier: "ATTESTED",
              },
              reason: "professional task proof lacked verifier votes, trajectory hash, replay config, and robustness threshold",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "occubench-professional-task",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-occubench-summary"],
              rejectedEvidenceRefs: ["ev-occubench-readme-only"],
              judgeRef: "judge://amc/occubench-professional-task",
              repairHint: "Attach verifier votes, trajectory, replay config, and robustness threshold evidence.",
            },
          ],
          professionalTaskLens: [
            {
              benchmarkId: "occubench-professional-task",
              sourceRef: "https://github.com/GregxmHu/OccuBench",
              taskId: "professional-task-001",
              scenarioId: "",
              industryCategory: "business-enterprise",
              professionalDomain: "real-estate",
              difficultyLevel: 2,
              datasetManifestHash: "d".repeat(64),
              scenarioManifestHash: null,
              worldModelConfigHash: "not-a-hash",
              toolSchemaHash: "1".repeat(64),
              agentConfigHash: "2".repeat(64),
              faultInjectionConfigHash: null,
              verifierRubricHash: "4".repeat(64),
              verifierVoteManifestHash: null,
              trajectoryHash: null,
              resultArtifactHash: "7".repeat(64),
              replayConfigHash: null,
              debugTraceHash: null,
              environmentMode: "E2",
              faultMode: "implicit",
              verifierVoteCount: 1,
              minVerifierVoteCount: 3,
              passRate0to1: 0.7,
              minPassRate0to1: 0.8,
              robustnessScore0to1: 0.5,
              minRobustnessScore0to1: 0.75,
              trajectoryStepCount: 14,
              maxTrajectoryStepCount: 12,
              status: "satisfied",
              evidenceRefs: ["ev-occubench-summary"],
              rejectedEvidenceRefs: ["ev-occubench-readme-only"],
              repairHint: "Bind scenario, LWM config, fault injection, verifier vote, trajectory, replay, and robustness evidence before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      professionalTaskLens: [
        {
          scenarioId: "unknown-scenario",
          scenarioManifestHash: null,
          worldModelConfigHash: null,
          verifierVoteManifestHash: null,
          trajectoryHash: null,
          replayConfigHash: null,
          verifierVoteCount: 1,
          passRate0to1: 0.7,
          robustnessScore0to1: 0.5,
          trajectoryStepCount: 14,
          repairHint: expect.stringContaining("scenario"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("verifier votes");
  });

  test("binds Adsum-style IoT firmware hardware evidence into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "iot-firmware-agent",
      runId: "run-adsum-iot-firmware",
      generatedAt: "2026-06-17T00:00:00.000Z",
      sourceRefs: ["https://github.com/adsumnetworks/Adsum-IoT-Coder"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-iot-hardware-session", "ev-iot-device-logs", "ev-iot-metric-report"],
            narrative: "AMC-2.3: IoT firmware proof includes hardware runs, device logs, build/flash/test artifacts, and metric thresholds.",
          }),
          acceptedEvidence: [
            {
              id: "ev-iot-hardware-session",
              event_hash: "a".repeat(64),
              writer_sig: "sig-iot-hardware-session",
              event_type: "artifact",
              session_id: "session-iot-hardware",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-iot-device-logs",
              event_hash: "b".repeat(64),
              writer_sig: "sig-iot-device-logs",
              event_type: "audit",
              session_id: "session-iot-hardware",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-iot-metric-report",
              event_hash: "c".repeat(64),
              writer_sig: "sig-iot-metric-report",
              event_type: "metric",
              session_id: "session-iot-metrics",
              ts: 12,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-iot-readme-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-iot-readme",
                event_type: "review",
                session_id: "session-iot-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "README feature summary did not bind board, chip, hardware session, device logs, toolchain, artifacts, or threshold evidence",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "adsum-iot-hardware-question-proof",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-iot-hardware-session", "ev-iot-device-logs", "ev-iot-metric-report"],
              rejectedEvidenceRefs: ["ev-iot-readme-only"],
              judgeRef: "judge://amc/adsum-iot-firmware",
              repairHint: "Keep the firmware task, hardware session, device logs, build/flash/test artifacts, and metric proof linked to this question.",
            },
          ],
          iotFirmwareQuestionLens: [
            {
              benchmarkId: "adsum-iot-firmware-style-synthetic",
              sourceRef: "https://github.com/adsumnetworks/Adsum-IoT-Coder",
              taskId: "ble-device-log-fix-001",
              platform: "nrf",
              boardId: "nrf52-dk",
              chipFamily: "nrf52",
              firmwareProjectHash: "e".repeat(64),
              toolchainManifestHash: "f".repeat(64),
              sdkVersionManifestHash: "1".repeat(64),
              hardwareSessionHash: "2".repeat(64),
              deviceLogBundleHash: "3".repeat(64),
              buildArtifactHash: "4".repeat(64),
              flashArtifactHash: "5".repeat(64),
              testArtifactHash: "6".repeat(64),
              knowledgePackManifestHash: "7".repeat(64),
              taskManifestHash: "8".repeat(64),
              evaluatorConfigHash: "9".repeat(64),
              resultArtifactHash: "a".repeat(64),
              privacyBoundaryHash: "b".repeat(64),
              benchmarkReportHash: "c".repeat(64),
              hardwareRunCount: 6,
              deviceCount: 2,
              bugClosureRate0to1: 0.83,
              minBugClosureRate0to1: 0.8,
              tokenEfficiencyRatio: 3.8,
              minTokenEfficiencyRatio: 1,
              logCaptureCoverage0to1: 0.95,
              minLogCaptureCoverage0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-iot-hardware-session", "ev-iot-device-logs", "ev-iot-metric-report"],
              rejectedEvidenceRefs: ["ev-iot-readme-only"],
              repairHint: "Preserve firmware project, toolchain/SDK, hardware session, device logs, build/flash/test artifacts, evaluator, privacy boundary, and benchmark report hashes before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/adsumnetworks/Adsum-IoT-Coder");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      acceptedEvidenceIds: ["ev-iot-hardware-session", "ev-iot-device-logs", "ev-iot-metric-report"],
      iotFirmwareQuestionLens: [
        {
          benchmarkId: "adsum-iot-firmware-style-synthetic",
          sourceRef: "https://github.com/adsumnetworks/Adsum-IoT-Coder",
          taskId: "ble-device-log-fix-001",
          platform: "nrf",
          boardId: "nrf52-dk",
          chipFamily: "nrf52",
          hardwareRunCount: 6,
          deviceCount: 2,
          bugClosureRate0to1: 0.83,
          minBugClosureRate0to1: 0.8,
          tokenEfficiencyRatio: 3.8,
          minTokenEfficiencyRatio: 1,
          logCaptureCoverage0to1: 0.95,
          minLogCaptureCoverage0to1: 0.9,
          status: "satisfied",
          evidenceRefs: ["ev-iot-hardware-session", "ev-iot-device-logs", "ev-iot-metric-report"],
          rejectedEvidenceRefs: ["ev-iot-readme-only"],
        },
      ],
    });
    expect(report.rows[0]?.iotFirmwareQuestionLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("hardware session");
  });

  test("fails closed when Adsum-style IoT firmware proof lacks hardware, artifact, privacy, or metric evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "iot-firmware-agent",
      runId: "run-adsum-iot-firmware-incomplete",
      generatedAt: "2026-06-17T00:00:00.000Z",
      sourceRefs: ["https://github.com/adsumnetworks/Adsum-IoT-Coder"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-iot-summary-only"],
          }),
          acceptedEvidence: [
            {
              id: "ev-iot-summary-only",
              event_hash: "e".repeat(64),
              writer_sig: "sig-iot-summary-only",
              event_type: "artifact",
              session_id: "session-iot-summary",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-iot-missing-proof",
                event_hash: "f".repeat(64),
                writer_sig: "sig-iot-missing-proof",
                event_type: "review",
                session_id: "session-iot-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "IoT firmware row lacked hardware session, device-log bundle, build/flash/test artifacts, privacy boundary, benchmark report, and metric thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "adsum-iot-hardware-question-proof",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-iot-summary-only"],
              rejectedEvidenceRefs: ["ev-iot-missing-proof"],
              judgeRef: "judge://amc/adsum-iot-firmware",
              repairHint: "Attach board/chip, hardware session, device logs, build/flash/test artifacts, privacy boundary, and metric threshold evidence.",
            },
          ],
          iotFirmwareQuestionLens: [
            {
              benchmarkId: "adsum-iot-firmware-style-synthetic",
              sourceRef: "https://github.com/adsumnetworks/Adsum-IoT-Coder",
              taskId: "ble-device-log-fix-002",
              platform: "custom",
              boardId: "",
              chipFamily: "",
              firmwareProjectHash: "not-a-sha",
              toolchainManifestHash: null,
              sdkVersionManifestHash: null,
              hardwareSessionHash: null,
              deviceLogBundleHash: null,
              buildArtifactHash: "1".repeat(64),
              flashArtifactHash: null,
              testArtifactHash: null,
              knowledgePackManifestHash: null,
              taskManifestHash: "2".repeat(64),
              evaluatorConfigHash: null,
              resultArtifactHash: null,
              privacyBoundaryHash: null,
              benchmarkReportHash: null,
              hardwareRunCount: 0,
              deviceCount: 1,
              bugClosureRate0to1: 0.5,
              minBugClosureRate0to1: 0.8,
              tokenEfficiencyRatio: 0.6,
              minTokenEfficiencyRatio: 1,
              logCaptureCoverage0to1: 0.4,
              minLogCaptureCoverage0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-iot-summary-only"],
              rejectedEvidenceRefs: ["ev-iot-missing-proof"],
              repairHint: "Bind platform, board/chip, firmware project, toolchain/SDK, hardware session, device logs, build/flash/test artifacts, knowledge pack, evaluator, result, privacy boundary, benchmark report, and metric thresholds before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      iotFirmwareQuestionLens: [
        {
          platform: "custom",
          boardId: "unknown-board",
          chipFamily: "unknown-chip",
          firmwareProjectHash: null,
          toolchainManifestHash: null,
          hardwareSessionHash: null,
          deviceLogBundleHash: null,
          flashArtifactHash: null,
          testArtifactHash: null,
          privacyBoundaryHash: null,
          benchmarkReportHash: null,
          hardwareRunCount: null,
          deviceCount: 1,
          bugClosureRate0to1: 0.5,
          tokenEfficiencyRatio: 0.6,
          logCaptureCoverage0to1: 0.4,
          repairHint: expect.stringContaining("board/chip"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("privacy boundary");
  });

  test("binds ShampooSalesAgent-style retail sales evidence into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "retail-sales-agent",
      runId: "run-shampoo-sales-agent",
      generatedAt: "2026-06-17T00:00:00.000Z",
      sourceRefs: ["https://github.com/jackfsuia/ShampooSalesAgent"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-retail-product", "ev-retail-conversation", "ev-retail-order-ledger"],
            narrative: "AMC-2.3: retail sales proof includes product, customer conversation, order capture, policy, provider, and privacy evidence.",
          }),
          acceptedEvidence: [
            {
              id: "ev-retail-product",
              event_hash: "a".repeat(64),
              writer_sig: "sig-retail-product",
              event_type: "artifact",
              session_id: "session-retail-sales",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-retail-conversation",
              event_hash: "b".repeat(64),
              writer_sig: "sig-retail-conversation",
              event_type: "audit",
              session_id: "session-retail-sales",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-retail-order-ledger",
              event_hash: "c".repeat(64),
              writer_sig: "sig-retail-order-ledger",
              event_type: "metric",
              session_id: "session-retail-metrics",
              ts: 12,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-retail-readme-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-retail-readme",
                event_type: "review",
                session_id: "session-retail-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "README/source metadata did not bind product catalog, customer scenario, conversation, order ledger, provider matrix, policy, privacy, or threshold evidence",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "shampoo-sales-agent-retail-question-proof",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-retail-product", "ev-retail-conversation", "ev-retail-order-ledger"],
              rejectedEvidenceRefs: ["ev-retail-readme-only"],
              judgeRef: "judge://amc/shampoo-sales-agent",
              repairHint: "Keep product, conversation, order-capture, provider, policy, privacy, and metric proof linked to this question.",
            },
          ],
          retailSalesQuestionLens: [
            {
              benchmarkId: "shampoo-sales-agent-style-synthetic",
              sourceRef: "https://github.com/jackfsuia/ShampooSalesAgent",
              taskId: "shampoo-consultative-sale-001",
              salesChannel: "cli",
              productCatalogHash: "e".repeat(64),
              productDescriptionHash: "f".repeat(64),
              customerScenarioHash: "1".repeat(64),
              conversationTraceHash: "2".repeat(64),
              customerIntentManifestHash: "3".repeat(64),
              orderCaptureSchemaHash: "4".repeat(64),
              orderLedgerHash: "5".repeat(64),
              pricingPolicyHash: "6".repeat(64),
              discountPolicyHash: "7".repeat(64),
              modelAdapterManifestHash: "8".repeat(64),
              modelProviderMatrixHash: "9".repeat(64),
              promptPolicyHash: "a".repeat(64),
              recommendationPolicyHash: "b".repeat(64),
              safetyPolicyHash: "c".repeat(64),
              privacyBoundaryHash: "d".repeat(64),
              evaluatorConfigHash: "e".repeat(64),
              resultArtifactHash: "f".repeat(64),
              benchmarkReportHash: "1".repeat(64),
              modelProviderCount: 4,
              customerScenarioCount: 3,
              orderCount: 12,
              orderCaptureAccuracy0to1: 0.96,
              minOrderCaptureAccuracy0to1: 0.9,
              policyComplianceRate0to1: 0.94,
              minPolicyComplianceRate0to1: 0.9,
              recommendationGrounding0to1: 0.92,
              minRecommendationGrounding0to1: 0.88,
              piiRedactionRate0to1: 1,
              minPiiRedactionRate0to1: 0.98,
              status: "satisfied",
              evidenceRefs: ["ev-retail-product", "ev-retail-conversation", "ev-retail-order-ledger"],
              rejectedEvidenceRefs: ["ev-retail-readme-only"],
              repairHint: "Preserve retail product, customer scenario, conversation trace, order ledger, provider matrix, prompt/recommendation/safety/privacy policy, evaluator, result, and benchmark report hashes before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/jackfsuia/ShampooSalesAgent");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.3",
      status: "passed",
      acceptedEvidenceIds: ["ev-retail-product", "ev-retail-conversation", "ev-retail-order-ledger"],
      retailSalesQuestionLens: [
        {
          benchmarkId: "shampoo-sales-agent-style-synthetic",
          sourceRef: "https://github.com/jackfsuia/ShampooSalesAgent",
          taskId: "shampoo-consultative-sale-001",
          salesChannel: "cli",
          modelProviderCount: 4,
          customerScenarioCount: 3,
          orderCount: 12,
          orderCaptureAccuracy0to1: 0.96,
          minOrderCaptureAccuracy0to1: 0.9,
          policyComplianceRate0to1: 0.94,
          minPolicyComplianceRate0to1: 0.9,
          recommendationGrounding0to1: 0.92,
          minRecommendationGrounding0to1: 0.88,
          piiRedactionRate0to1: 1,
          minPiiRedactionRate0to1: 0.98,
          status: "satisfied",
          evidenceRefs: ["ev-retail-product", "ev-retail-conversation", "ev-retail-order-ledger"],
          rejectedEvidenceRefs: ["ev-retail-readme-only"],
        },
      ],
    });
    expect(report.rows[0]?.retailSalesQuestionLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata");
  });

  test("fails closed when ShampooSalesAgent-style retail sales proof lacks order, policy, provider, privacy, or metric evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "retail-sales-agent",
      runId: "run-shampoo-sales-agent-incomplete",
      generatedAt: "2026-06-17T00:00:00.000Z",
      sourceRefs: ["https://github.com/jackfsuia/ShampooSalesAgent"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-retail-summary-only"],
          }),
          acceptedEvidence: [
            {
              id: "ev-retail-summary-only",
              event_hash: "e".repeat(64),
              writer_sig: "sig-retail-summary-only",
              event_type: "artifact",
              session_id: "session-retail-summary",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-retail-missing-proof",
                event_hash: "f".repeat(64),
                writer_sig: "sig-retail-missing-proof",
                event_type: "review",
                session_id: "session-retail-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "Retail sales row lacked product catalog, customer scenario, order schema, order ledger, provider matrix, safety/privacy policies, benchmark report, and metric thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "shampoo-sales-agent-retail-question-proof",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-retail-summary-only"],
              rejectedEvidenceRefs: ["ev-retail-missing-proof"],
              judgeRef: "judge://amc/shampoo-sales-agent",
              repairHint: "Attach product/customer/order/policy/provider/privacy proof and threshold evidence.",
            },
          ],
          retailSalesQuestionLens: [
            {
              benchmarkId: "shampoo-sales-agent-style-synthetic",
              sourceRef: "https://github.com/jackfsuia/ShampooSalesAgent",
              taskId: "shampoo-consultative-sale-002",
              salesChannel: "custom",
              productCatalogHash: "not-a-sha",
              productDescriptionHash: null,
              customerScenarioHash: null,
              conversationTraceHash: "1".repeat(64),
              customerIntentManifestHash: null,
              orderCaptureSchemaHash: null,
              orderLedgerHash: null,
              pricingPolicyHash: null,
              discountPolicyHash: null,
              modelAdapterManifestHash: "2".repeat(64),
              modelProviderMatrixHash: null,
              promptPolicyHash: null,
              recommendationPolicyHash: null,
              safetyPolicyHash: null,
              privacyBoundaryHash: null,
              evaluatorConfigHash: null,
              resultArtifactHash: null,
              benchmarkReportHash: null,
              modelProviderCount: 1,
              customerScenarioCount: 0,
              orderCount: 0,
              orderCaptureAccuracy0to1: 0.6,
              minOrderCaptureAccuracy0to1: 0.9,
              policyComplianceRate0to1: 0.5,
              minPolicyComplianceRate0to1: 0.9,
              recommendationGrounding0to1: 0.7,
              minRecommendationGrounding0to1: 0.88,
              piiRedactionRate0to1: 0.8,
              minPiiRedactionRate0to1: 0.98,
              status: "satisfied",
              evidenceRefs: ["ev-retail-summary-only"],
              rejectedEvidenceRefs: ["ev-retail-missing-proof"],
              repairHint: "Bind product catalog, customer scenario, conversation trace, order schema, order ledger, pricing/discount, model provider matrix, prompt/recommendation/safety/privacy policies, evaluator, result, benchmark report, and metric thresholds before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      retailSalesQuestionLens: [
        {
          salesChannel: "custom",
          productCatalogHash: null,
          productDescriptionHash: null,
          customerScenarioHash: null,
          customerIntentManifestHash: null,
          orderCaptureSchemaHash: null,
          orderLedgerHash: null,
          modelProviderMatrixHash: null,
          safetyPolicyHash: null,
          privacyBoundaryHash: null,
          benchmarkReportHash: null,
          modelProviderCount: 1,
          customerScenarioCount: null,
          orderCount: null,
          orderCaptureAccuracy0to1: 0.6,
          policyComplianceRate0to1: 0.5,
          recommendationGrounding0to1: 0.7,
          piiRedactionRate0to1: 0.8,
          repairHint: expect.stringContaining("product catalog"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("provider matrix");
  });

  test("binds CL-Bench-style continual learning stateful workflow proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "cl-bench-agent",
      runId: "run-cl-bench-stateful",
      generatedAt: "2026-06-17T00:00:00.000Z",
      sourceRefs: ["https://github.com/Arc-Computer/CL-Bench"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-clbench-state", "ev-clbench-quality"],
          }),
          acceptedEvidence: [
            {
              id: "ev-clbench-state",
              event_hash: "a".repeat(64),
              writer_sig: "sig-clbench-state",
              event_type: "artifact",
              session_id: "session-clbench-state",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-clbench-quality",
              event_hash: "b".repeat(64),
              writer_sig: "sig-clbench-quality",
              event_type: "metric",
              session_id: "session-clbench-quality",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-clbench-readme-only",
                event_hash: "c".repeat(64),
                writer_sig: "sig-clbench-readme",
                event_type: "review",
                session_id: "session-clbench-review",
                ts: 12,
                trustTier: "ATTESTED",
              },
              reason: "repository feature summary did not bind state mutation traces, entity relationships, replay commands, or metric thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "clbench-continual-learning-stateful-workflow",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-clbench-state", "ev-clbench-quality"],
              rejectedEvidenceRefs: ["ev-clbench-readme-only"],
              judgeRef: "judge://amc/clbench-continual-learning",
              repairHint: "Keep stateful workflow, state mutation, conversation, entity graph, tool execution, and replay proof attached.",
            },
          ],
          continualLearningBenchmarkLens: [
            {
              benchmarkId: "cl-bench-stateful-crm",
              sourceRef: "https://github.com/Arc-Computer/CL-Bench",
              domainId: "crm",
              workflowId: "stateful-account-management",
              datasetManifestHash: "d".repeat(64),
              stateSchemaHash: "e".repeat(64),
              initialStateHash: "f".repeat(64),
              stateMutationTraceHash: "1".repeat(64),
              conversationTraceHash: "2".repeat(64),
              entityRelationshipGraphHash: "3".repeat(64),
              toolExecutionTraceHash: "4".repeat(64),
              evaluatorConfigHash: "5".repeat(64),
              resultArtifactHash: "6".repeat(64),
              replayCommandHash: "7".repeat(64),
              memoryPolicyHash: "8".repeat(64),
              adaptiveLearningTraceHash: "9".repeat(64),
              scenarioCount: 4,
              turnCount: 12,
              stateMutationCount: 9,
              entityCount: 6,
              taskCompletionRate0to1: 0.86,
              minTaskCompletionRate0to1: 0.8,
              responseQualityScore0to1: 0.84,
              minResponseQualityScore0to1: 0.75,
              stateAccuracy0to1: 0.9,
              minStateAccuracy0to1: 0.85,
              retentionScore0to1: 0.82,
              minRetentionScore0to1: 0.8,
              tokenCostUsd: 0.14,
              maxTokenCostUsd: 0.2,
              status: "satisfied",
              evidenceRefs: ["ev-clbench-state", "ev-clbench-quality"],
              rejectedEvidenceRefs: ["ev-clbench-readme-only"],
              repairHint: "Preserve stateful workflow, memory, replay, and metric threshold evidence before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "passed",
      continualLearningBenchmarkLens: [
        {
          benchmarkId: "cl-bench-stateful-crm",
          sourceRef: "https://github.com/Arc-Computer/CL-Bench",
          domainId: "crm",
          workflowId: "stateful-account-management",
          scenarioCount: 4,
          turnCount: 12,
          stateMutationCount: 9,
          entityCount: 6,
          taskCompletionRate0to1: 0.86,
          responseQualityScore0to1: 0.84,
          stateAccuracy0to1: 0.9,
          retentionScore0to1: 0.82,
          tokenCostUsd: 0.14,
          status: "satisfied",
        },
      ],
    });
    expect(report.rows[0]?.continualLearningBenchmarkLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when CL-Bench-style continual learning question proof lacks stateful replay evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "cl-bench-agent",
      runId: "run-cl-bench-missing-proof",
      generatedAt: "2026-06-17T00:00:00.000Z",
      sourceRefs: ["https://github.com/Arc-Computer/CL-Bench"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-clbench-summary"],
          }),
          acceptedEvidence: [
            {
              id: "ev-clbench-summary",
              event_hash: "a".repeat(64),
              writer_sig: "sig-clbench-summary",
              event_type: "artifact",
              session_id: "session-clbench-summary",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-clbench-metadata-only",
                event_hash: "b".repeat(64),
                writer_sig: "sig-clbench-metadata",
                event_type: "review",
                session_id: "session-clbench-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "metadata did not include state schema, mutation trace, conversation trace, entity graph, replay command, or threshold evidence",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "clbench-continual-learning-stateful-workflow",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-clbench-summary"],
              rejectedEvidenceRefs: ["ev-clbench-metadata-only"],
              judgeRef: "judge://amc/clbench-continual-learning",
              repairHint: "Attach state schema, mutation trace, conversation trace, entity graph, replay command, and threshold evidence.",
            },
          ],
          continualLearningBenchmarkLens: [
            {
              benchmarkId: "cl-bench-stateful-crm",
              sourceRef: "https://github.com/Arc-Computer/CL-Bench",
              domainId: "crm",
              workflowId: "",
              datasetManifestHash: "d".repeat(64),
              stateSchemaHash: "not-a-hash",
              initialStateHash: null,
              stateMutationTraceHash: null,
              conversationTraceHash: null,
              entityRelationshipGraphHash: null,
              toolExecutionTraceHash: "4".repeat(64),
              evaluatorConfigHash: "5".repeat(64),
              resultArtifactHash: "6".repeat(64),
              replayCommandHash: null,
              memoryPolicyHash: null,
              adaptiveLearningTraceHash: null,
              scenarioCount: 1,
              turnCount: 0,
              stateMutationCount: 0,
              entityCount: 0,
              taskCompletionRate0to1: 0.6,
              minTaskCompletionRate0to1: 0.8,
              responseQualityScore0to1: 0.7,
              minResponseQualityScore0to1: 0.75,
              stateAccuracy0to1: 0.65,
              minStateAccuracy0to1: 0.85,
              retentionScore0to1: 0.5,
              minRetentionScore0to1: 0.8,
              tokenCostUsd: 0.24,
              maxTokenCostUsd: 0.2,
              status: "satisfied",
              evidenceRefs: ["ev-clbench-summary"],
              rejectedEvidenceRefs: ["ev-clbench-metadata-only"],
              repairHint: "Bind workflow, state schema, state mutations, conversation trace, entity graph, replay command, retention, and cost evidence before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      continualLearningBenchmarkLens: [
        {
          workflowId: "unknown-workflow",
          stateSchemaHash: null,
          initialStateHash: null,
          stateMutationTraceHash: null,
          conversationTraceHash: null,
          entityRelationshipGraphHash: null,
          replayCommandHash: null,
          turnCount: null,
          stateMutationCount: null,
          entityCount: null,
          taskCompletionRate0to1: 0.6,
          responseQualityScore0to1: 0.7,
          stateAccuracy0to1: 0.65,
          retentionScore0to1: 0.5,
          tokenCostUsd: 0.24,
          repairHint: expect.stringContaining("state"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("state schema");
  });

  test("binds Hermes Turbo performance dashboard proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "hermes-turbo-agent",
      runId: "run-hermes-turbo-performance",
      generatedAt: "2026-06-19T00:00:00.000Z",
      sourceRefs: ["https://github.com/wesleysimplicio/hermes-turbo-agent"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            questionId: "AMC-4.1",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-hermes-source", "ev-hermes-benchmark", "ev-hermes-dashboard"],
            narrative: "AMC-4.1: Hermes Turbo proof includes source, benchmark workflow, performance trace, dashboard, CI, and threshold receipts.",
          }),
          acceptedEvidence: [
            {
              id: "ev-hermes-source",
              event_hash: "a".repeat(64),
              writer_sig: "sig-hermes-source",
              event_type: "artifact",
              session_id: "session-hermes-source",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-hermes-benchmark",
              event_hash: "b".repeat(64),
              writer_sig: "sig-hermes-benchmark",
              event_type: "metric",
              session_id: "session-hermes-benchmark",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-hermes-dashboard",
              event_hash: "c".repeat(64),
              writer_sig: "sig-hermes-dashboard",
              event_type: "audit",
              session_id: "session-hermes-dashboard",
              ts: 12,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-hermes-readme-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-hermes-readme",
                event_type: "review",
                session_id: "session-hermes-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "repository metadata did not bind benchmark workflow, perf-budget workflow, traces, dashboard, score manifest, or regression thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "hermes-turbo-performance-dashboard-proof",
              criterionType: "reliability_improvement_measure",
              status: "satisfied",
              evidenceRefs: ["ev-hermes-source", "ev-hermes-benchmark", "ev-hermes-dashboard"],
              rejectedEvidenceRefs: ["ev-hermes-readme-only"],
              judgeRef: "judge://amc/hermes-turbo-performance",
              repairHint: "Keep Hermes Turbo source, benchmark workflow, dashboard, CI, and performance-threshold receipts linked to this question.",
            },
          ],
          hermesTurboPerformanceLens: [
            {
              benchmarkId: "hermes-turbo-default-branch-performance",
              sourceRef: "https://github.com/wesleysimplicio/hermes-turbo-agent",
              repositoryRef: "wesleysimplicio/hermes-turbo-agent",
              licenseRef: "MIT License",
              licenseSpdxId: "MIT",
              defaultBranch: "codex/hermes-agent-100x-fast",
              sourceCommitSha: "5c86bd737d201101487258ee2c1fa8c91649ae02",
              sourceTreeSha: "f91ace05523ca08e03566cf7036320aacd0eb6e8",
              sourceStatusHash: "e".repeat(64),
              readmeArtifactHash: "f".repeat(64),
              packageManifestHash: "1".repeat(64),
              benchmarkWorkflowHash: "2".repeat(64),
              perfBudgetWorkflowHash: "3".repeat(64),
              dailyScoreWorkflowHash: "4".repeat(64),
              turboScoreScriptHash: "5".repeat(64),
              performanceDashboardHash: "6".repeat(64),
              benchmarkReportHash: "7".repeat(64),
              baselineResultHash: "8".repeat(64),
              candidateResultHash: "9".repeat(64),
              latencyTraceHash: "a".repeat(64),
              throughputTraceHash: "b".repeat(64),
              scoreManifestHash: "c".repeat(64),
              regressionThresholdHash: "d".repeat(64),
              ciRunId: "github-actions:perf-budgets:2026-06-19",
              ciConfigHash: "e".repeat(64),
              performanceFacet: "mixed",
              runCount: 7,
              minRunCount: 5,
              latencyP50Ms: 42,
              maxLatencyP50Ms: 75,
              latencyP95Ms: 96,
              maxLatencyP95Ms: 150,
              throughputOpsPerSec: 280,
              minThroughputOpsPerSec: 200,
              speedupFactor: 12.4,
              minSpeedupFactor: 10,
              scoreDelta0to1: 0.08,
              minScoreDelta0to1: 0.02,
              dashboardCoverage0to1: 0.96,
              minDashboardCoverage0to1: 0.9,
              regressionPassRate0to1: 1,
              minRegressionPassRate0to1: 0.99,
              status: "satisfied",
              evidenceRefs: ["ev-hermes-source", "ev-hermes-benchmark", "ev-hermes-dashboard"],
              rejectedEvidenceRefs: ["ev-hermes-readme-only"],
              repairHint: "Preserve source snapshot, benchmark workflow, perf budget, daily score, dashboard, traces, score manifest, CI, and regression-threshold receipts before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-4.1",
      status: "passed",
      acceptedEvidenceIds: ["ev-hermes-source", "ev-hermes-benchmark", "ev-hermes-dashboard"],
      hermesTurboPerformanceLens: [
        {
          benchmarkId: "hermes-turbo-default-branch-performance",
          repositoryRef: "wesleysimplicio/hermes-turbo-agent",
          licenseSpdxId: "MIT",
          defaultBranch: "codex/hermes-agent-100x-fast",
          sourceCommitSha: "5c86bd737d201101487258ee2c1fa8c91649ae02",
          performanceFacet: "mixed",
          runCount: 7,
          latencyP50Ms: 42,
          latencyP95Ms: 96,
          throughputOpsPerSec: 280,
          speedupFactor: 12.4,
          dashboardCoverage0to1: 0.96,
          regressionPassRate0to1: 1,
          status: "satisfied",
        },
      ],
    });
    expect(report.rows[0]?.hermesTurboPerformanceLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("repository metadata");
  });

  test("fails closed when Hermes Turbo proof is source metadata without benchmark traces or thresholds", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "hermes-turbo-agent",
      runId: "run-hermes-turbo-metadata-only",
      generatedAt: "2026-06-19T00:00:00.000Z",
      sourceRefs: ["https://github.com/wesleysimplicio/hermes-turbo-agent"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            questionId: "AMC-4.1",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-hermes-metadata"],
          }),
          acceptedEvidence: [
            {
              id: "ev-hermes-metadata",
              event_hash: "a".repeat(64),
              writer_sig: "sig-hermes-metadata",
              event_type: "artifact",
              session_id: "session-hermes-metadata",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-hermes-missing-performance",
                event_hash: "b".repeat(64),
                writer_sig: "sig-hermes-missing-performance",
                event_type: "review",
                session_id: "session-hermes-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "Hermes row lacked perf budget workflow, benchmark traces, dashboard snapshot, score manifest, CI config, and thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "hermes-turbo-performance-dashboard-proof",
              criterionType: "reliability_improvement_measure",
              status: "satisfied",
              evidenceRefs: ["ev-hermes-metadata"],
              rejectedEvidenceRefs: ["ev-hermes-missing-performance"],
              judgeRef: "judge://amc/hermes-turbo-performance",
              repairHint: "Attach benchmark traces, dashboard snapshot, score manifest, CI config, and thresholds.",
            },
          ],
          hermesTurboPerformanceLens: [
            {
              benchmarkId: "hermes-turbo-default-branch-performance",
              sourceRef: "https://github.com/wesleysimplicio/hermes-turbo-agent",
              repositoryRef: "wesleysimplicio/hermes-turbo-agent",
              licenseRef: "MIT License",
              licenseSpdxId: "MIT",
              defaultBranch: "codex/hermes-agent-100x-fast",
              sourceCommitSha: "not-a-git-sha",
              sourceTreeSha: null,
              sourceStatusHash: "c".repeat(64),
              readmeArtifactHash: "not-a-sha",
              packageManifestHash: null,
              benchmarkWorkflowHash: null,
              perfBudgetWorkflowHash: null,
              dailyScoreWorkflowHash: null,
              turboScoreScriptHash: null,
              performanceDashboardHash: null,
              benchmarkReportHash: null,
              baselineResultHash: null,
              candidateResultHash: null,
              latencyTraceHash: null,
              throughputTraceHash: null,
              scoreManifestHash: null,
              regressionThresholdHash: null,
              ciRunId: null,
              ciConfigHash: null,
              performanceFacet: "custom",
              runCount: 1,
              minRunCount: 5,
              latencyP50Ms: 160,
              maxLatencyP50Ms: 75,
              latencyP95Ms: 260,
              maxLatencyP95Ms: 150,
              throughputOpsPerSec: 90,
              minThroughputOpsPerSec: 200,
              speedupFactor: 1.2,
              minSpeedupFactor: 10,
              scoreDelta0to1: -0.03,
              minScoreDelta0to1: 0.02,
              dashboardCoverage0to1: 0.4,
              minDashboardCoverage0to1: 0.9,
              regressionPassRate0to1: 0.8,
              minRegressionPassRate0to1: 0.99,
              status: "satisfied",
              evidenceRefs: ["ev-hermes-metadata"],
              rejectedEvidenceRefs: ["ev-hermes-missing-performance"],
              repairHint: "Bind valid source commit/tree, benchmark workflows, traces, dashboard, score manifest, CI, and thresholds before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      hermesTurboPerformanceLens: [
        {
          sourceCommitSha: null,
          sourceTreeSha: null,
          readmeArtifactHash: null,
          benchmarkWorkflowHash: null,
          performanceDashboardHash: null,
          scoreManifestHash: null,
          ciConfigHash: null,
          performanceFacet: "custom",
          runCount: 1,
          latencyP50Ms: 160,
          throughputOpsPerSec: 90,
          speedupFactor: 1.2,
          dashboardCoverage0to1: 0.4,
          regressionPassRate0to1: 0.8,
          repairHint: expect.stringContaining("benchmark workflows"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("perf budget workflow");
  });

  test("binds Scorable SDK Studio drilldown source, artifact, state, and preview proof into question rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "scorable-studio-agent",
      runId: "run-scorable-studio-drilldown",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/root-signals/scorable-sdk"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            questionId: "AMC-4.1",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-scorable-source", "ev-scorable-trace", "ev-scorable-ui"],
            narrative: "AMC-4.1: Scorable SDK proof binds Studio drilldown UI route, traces, receipts, policy rules, source artifacts, and empty/error states.",
          }),
          acceptedEvidence: [
            {
              id: "ev-scorable-source",
              event_hash: "a".repeat(64),
              writer_sig: "sig-scorable-source",
              event_type: "artifact",
              session_id: "session-scorable-source",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-scorable-trace",
              event_hash: "b".repeat(64),
              writer_sig: "sig-scorable-trace",
              event_type: "audit",
              session_id: "session-scorable-trace",
              ts: 11,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-scorable-ui",
              event_hash: "c".repeat(64),
              writer_sig: "sig-scorable-ui",
              event_type: "test",
              session_id: "session-scorable-ui",
              ts: 12,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-scorable-metadata-only",
                event_hash: "d".repeat(64),
                writer_sig: "sig-scorable-metadata",
                event_type: "review",
                session_id: "session-scorable-review",
                ts: 13,
                trustTier: "ATTESTED",
              },
              reason: "repository metadata did not bind CLI execution-log, OTEL trace, file upload, receipt preview, policy rule, empty-state, or error-state proof",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "scorable-studio-drilldown-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-scorable-source", "ev-scorable-trace", "ev-scorable-ui"],
              rejectedEvidenceRefs: ["ev-scorable-metadata-only"],
              judgeRef: "judge://amc/scorable-studio-drilldown",
              repairHint: "Keep Scorable SDK source, Studio drilldown route, trace, receipt, policy, source-artifact, empty-state, and error-state proof linked.",
            },
          ],
          scorableStudioDrilldownLens: [
            {
              drilldownId: "scorable-sdk-studio-drilldown",
              sourceRef: "https://github.com/root-signals/scorable-sdk",
              repositoryRef: "root-signals/scorable-sdk",
              licenseRef: "Apache License 2.0",
              licenseSpdxId: "Apache-2.0",
              defaultBranch: "main",
              sourceCommitSha: "3498486b9d567099d6ec9849a7391537233752d2",
              sourceTreeSha: "393540b215825e05c8976bdfae2084a8feb480c7",
              readmeArtifactHash: "e".repeat(64),
              pythonPackageManifestHash: "f".repeat(64),
              pythonOpenApiHash: "1".repeat(64),
              pythonClientHash: "2".repeat(64),
              pythonExecutionLogsHash: "3".repeat(64),
              pythonEvaluatorApiHash: "4".repeat(64),
              pythonExecutionLogApiHash: "5".repeat(64),
              cliPackageManifestHash: "6".repeat(64),
              cliLockfileHash: "7".repeat(64),
              cliEvaluatorCommandHash: "8".repeat(64),
              cliJudgeCommandHash: "9".repeat(64),
              cliExecutionLogCommandHash: "a".repeat(64),
              cliOtelTraceCommandHash: "b".repeat(64),
              cliFileUploadCommandHash: "c".repeat(64),
              typescriptPackageManifestHash: "d".repeat(64),
              typescriptLockfileHash: "e".repeat(64),
              typescriptSourceTreeHash: "f".repeat(64),
              npmPackageRef: "@root-signals/scorable@0.11.0",
              npmPackageIntegrity: "sha512-DuGI39YHi2ZOO5kRYgvJbvsBNxBS642Pkg2rNq0sz3mSdhJvCvr3nlrzMkNK0NVPMOSy5oDoExVzG8HVPNGiTw==",
              npmCliPackageRef: "@root-signals/scorable-cli@0.14.0",
              npmCliPackageIntegrity: "sha512-aWloGCEEfcP3kMFiIweKiOHPVA7BS4SN10GkXE4NX6wOoM+SS9+2PquJ5y8XVK3k0PlmDcwrrZljd0NNUsyJ4w==",
              studioSurface: "cli",
              uiRoutePath: "/api/v1/score/evidence-drilldown/run-scorable-studio-drilldown/AMC-4.1",
              sourceArtifactLinks: [
                "https://github.com/root-signals/scorable-sdk/tree/3498486b9d567099d6ec9849a7391537233752d2",
                "https://www.npmjs.com/package/@root-signals/scorable/v/0.11.0",
                "https://www.npmjs.com/package/@root-signals/scorable-cli/v/0.14.0",
              ],
              tracePreviewHash: "1".repeat(64),
              receiptPreviewHash: "2".repeat(64),
              policyRulePreviewHash: "3".repeat(64),
              sourceArtifactPreviewHash: "4".repeat(64),
              emptyStateHash: "5".repeat(64),
              errorStateHash: "6".repeat(64),
              evidencePreviewState: "ready",
              evidencePreviewCount: 4,
              minEvidencePreviewCount: 2,
              minSourceArtifactLinkCount: 3,
              status: "satisfied",
              evidenceRefs: ["ev-scorable-source", "ev-scorable-trace", "ev-scorable-ui"],
              rejectedEvidenceRefs: ["ev-scorable-metadata-only"],
              repairHint: "Preserve Scorable source snapshots, SDK manifests, execution logs, OTEL trace command, file-upload command, Studio route, preview state, and empty/error receipts before externalizing this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toContain("https://github.com/root-signals/scorable-sdk");
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-4.1",
      status: "passed",
      acceptedEvidenceIds: ["ev-scorable-source", "ev-scorable-trace", "ev-scorable-ui"],
      scorableStudioDrilldownLens: [
        {
          drilldownId: "scorable-sdk-studio-drilldown",
          repositoryRef: "root-signals/scorable-sdk",
          licenseSpdxId: "Apache-2.0",
          defaultBranch: "main",
          sourceCommitSha: "3498486b9d567099d6ec9849a7391537233752d2",
          sourceTreeSha: "393540b215825e05c8976bdfae2084a8feb480c7",
          npmPackageRef: "@root-signals/scorable@0.11.0",
          npmCliPackageRef: "@root-signals/scorable-cli@0.14.0",
          studioSurface: "cli",
          evidencePreviewState: "ready",
          evidencePreviewCount: 4,
          minEvidencePreviewCount: 2,
          sourceArtifactLinkCount: 3,
          minSourceArtifactLinkCount: 3,
          status: "satisfied",
        },
      ],
    });
    expect(report.rows[0]?.scorableStudioDrilldownLens[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.scorableStudioDrilldownLens[0]?.sourceArtifactLinks).toHaveLength(3);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("execution-log");
  });

  test("fails closed when Scorable Studio drilldown proof is metadata without route, preview, or state receipts", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "scorable-studio-agent",
      runId: "run-scorable-studio-metadata-only",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/root-signals/scorable-sdk"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            questionId: "AMC-4.1",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-scorable-metadata"],
          }),
          acceptedEvidence: [
            {
              id: "ev-scorable-metadata",
              event_hash: "a".repeat(64),
              writer_sig: "sig-scorable-metadata",
              event_type: "artifact",
              session_id: "session-scorable-metadata",
              ts: 10,
              trustTier: "OBSERVED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-scorable-missing-ui-state",
                event_hash: "b".repeat(64),
                writer_sig: "sig-scorable-missing-ui-state",
                event_type: "review",
                session_id: "session-scorable-review",
                ts: 11,
                trustTier: "ATTESTED",
              },
              reason: "Scorable row lacked execution-log/OTEL trace proof, source artifact links, evidence preview count, route proof, empty state, and error state",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "scorable-studio-drilldown-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-scorable-metadata"],
              rejectedEvidenceRefs: ["ev-scorable-missing-ui-state"],
              judgeRef: "judge://amc/scorable-studio-drilldown",
              repairHint: "Attach route, trace, receipt, source artifact, empty-state, and error-state receipts.",
            },
          ],
          scorableStudioDrilldownLens: [
            {
              drilldownId: "scorable-sdk-studio-drilldown",
              sourceRef: "https://github.com/root-signals/scorable-sdk",
              repositoryRef: "root-signals/scorable-sdk",
              licenseRef: "Apache License 2.0",
              licenseSpdxId: "Apache-2.0",
              defaultBranch: "main",
              sourceCommitSha: "not-a-git-sha",
              sourceTreeSha: null,
              readmeArtifactHash: "c".repeat(64),
              pythonPackageManifestHash: null,
              pythonOpenApiHash: null,
              pythonClientHash: null,
              pythonExecutionLogsHash: null,
              pythonEvaluatorApiHash: null,
              pythonExecutionLogApiHash: null,
              cliPackageManifestHash: null,
              cliLockfileHash: null,
              cliEvaluatorCommandHash: null,
              cliJudgeCommandHash: null,
              cliExecutionLogCommandHash: null,
              cliOtelTraceCommandHash: null,
              cliFileUploadCommandHash: null,
              typescriptPackageManifestHash: null,
              typescriptLockfileHash: null,
              typescriptSourceTreeHash: null,
              npmPackageRef: "@root-signals/scorable@0.11.0",
              npmPackageIntegrity: null,
              npmCliPackageRef: null,
              npmCliPackageIntegrity: null,
              studioSurface: "custom",
              uiRoutePath: "/docs/SCORING_METHODOLOGY.md",
              sourceArtifactLinks: ["https://github.com/root-signals/scorable-sdk"],
              tracePreviewHash: null,
              receiptPreviewHash: null,
              policyRulePreviewHash: null,
              sourceArtifactPreviewHash: null,
              emptyStateHash: null,
              errorStateHash: null,
              evidencePreviewState: "empty",
              evidencePreviewCount: 1,
              minEvidencePreviewCount: 2,
              minSourceArtifactLinkCount: 3,
              status: "satisfied",
              evidenceRefs: ["ev-scorable-metadata"],
              rejectedEvidenceRefs: ["ev-scorable-missing-ui-state"],
              repairHint: "Bind valid source commit/tree, SDK manifests, CLI traces, source artifact links, route proof, preview counts, and empty/error state receipts before using this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      scorableStudioDrilldownLens: [
        {
          sourceCommitSha: null,
          sourceTreeSha: null,
          pythonPackageManifestHash: null,
          cliExecutionLogCommandHash: null,
          typescriptSourceTreeHash: null,
          npmCliPackageRef: null,
          studioSurface: "custom",
          uiRoutePath: "/docs/SCORING_METHODOLOGY.md",
          sourceArtifactLinkCount: 1,
          evidencePreviewState: "empty",
          evidencePreviewCount: 1,
          repairHint: expect.stringContaining("empty/error state"),
        },
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("empty state");
  });

  test("builds deterministic rows with accepted evidence, rejected evidence reasons, and repair hints", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "agent-a",
      runId: "run-a",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://www.braintrust.dev/docs/evaluate"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-pass",
              event_hash: "a".repeat(64),
              writer_sig: "sig-pass",
              event_type: "audit",
              session_id: "session-pass",
              ts: 1,
              trustTier: "OBSERVED"
            }
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-reject",
                event_hash: "b".repeat(64),
                writer_sig: "sig-reject",
                event_type: "review",
                session_id: "session-review",
                ts: 2,
                trustTier: "ATTESTED"
              },
              reason: "not accepted by the selected L3 gate evidence set"
            }
          ],
          componentDiagnostics: [
            {
              componentId: "rag-retrieval",
              componentType: "retrieval",
              status: "accepted",
              evidenceRefs: ["ev-pass"],
              repairHint: "Keep retrieval evidence signed and rerun the question gate."
            },
            {
              componentId: "rag-generation",
              componentType: "generation",
              status: "rejected",
              rejectedEvidenceRefs: ["ev-reject"],
              repairHint: "Attach grounded generation evidence before raising the maturity level."
            }
          ],
          criteriaDiagnostics: [
            {
              criterionId: "prd-unit-test-criteria",
              criterionType: "unit_test",
              status: "satisfied",
              evidenceRefs: ["ev-pass"],
              judgeRef: "judge://eval-agent/unit",
              repairHint: "Keep the executable unit criterion linked to the signed score receipt."
            },
            {
              criterionId: "prd-shell-interaction-criteria",
              criterionType: "shell_interaction",
              status: "failed",
              rejectedEvidenceRefs: ["ev-reject"],
              judgeRef: "judge://eval-agent/shell",
              repairHint: "Attach shell interaction output that satisfies the question criterion."
            },
            {
              criterionId: "long-horizon-state-check",
              criterionType: "long_horizon_state",
              status: "satisfied",
              evidenceRefs: ["ev-pass"],
              judgeRef: "judge://planning/state",
              repairHint: "Collect sustained state-transition evidence before raising this planning question."
            }
          ],
          missingGateReasons: ["failed gate 4: events=9/12, sessions=3/5, days=3/7"]
        }
      ]
    });

    expect(report.agentId).toBe("agent-a");
    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(true);
    expect(report.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows).toHaveLength(1);

    const row = report.rows[0]!;
    expect(row.questionId).toBe("AMC-1.1");
    expect(row.status).toBe("unsupported_claim");
    expect(row.evidenceWindow).toEqual({
      eventCount: 1,
      distinctSessionCount: 1,
      firstTs: 1,
      lastTs: 1,
      durationMs: 0
    });
    expect(row.acceptedEvidenceIds).toEqual(["ev-pass"]);
    expect(row.signedEvidenceRefs).toEqual([
      expect.objectContaining({
        evidenceId: "ev-pass",
        eventHash: "a".repeat(64),
        writerSig: "sig-pass"
      })
    ]);
    expect(row.rejectedEvidence).toEqual([
      expect.objectContaining({
        evidenceId: "ev-reject",
        reason: expect.stringContaining("not accepted")
      })
    ]);
    expect(row.componentDiagnostics).toEqual([
      expect.objectContaining({
        componentId: "rag-retrieval",
        componentType: "retrieval",
        status: "accepted",
        evidenceRefs: ["ev-pass"]
      }),
      expect.objectContaining({
        componentId: "rag-generation",
        componentType: "generation",
        status: "rejected",
        rejectedEvidenceRefs: ["ev-reject"]
      })
    ]);
    expect(row.criteriaDiagnostics).toEqual([
      expect.objectContaining({
        criterionId: "prd-unit-test-criteria",
        criterionType: "unit_test",
        status: "satisfied",
        evidenceRefs: ["ev-pass"],
        judgeRef: "judge://eval-agent/unit"
      }),
      expect.objectContaining({
        criterionId: "prd-shell-interaction-criteria",
        criterionType: "shell_interaction",
        status: "failed",
        rejectedEvidenceRefs: ["ev-reject"],
        judgeRef: "judge://eval-agent/shell"
      }),
      expect.objectContaining({
        criterionId: "long-horizon-state-check",
        criterionType: "long_horizon_state",
        status: "satisfied",
        evidenceRefs: ["ev-pass"],
        judgeRef: "judge://planning/state"
      })
    ]);
    expect(row.missingGateReasons[0]).toContain("failed gate 4");
    expect(row.repairHint).toContain("Create mission");
    expect(row.rowHash).toMatch(/^[a-f0-9]{64}$/);

    const second = buildQuestionExplainabilityReport({
      agentId: "agent-a",
      runId: "run-a",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://www.braintrust.dev/docs/evaluate"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-pass",
              event_hash: "a".repeat(64),
              writer_sig: "sig-pass",
              event_type: "audit",
              session_id: "session-pass",
              ts: 1,
              trustTier: "OBSERVED"
            }
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-reject",
                event_hash: "b".repeat(64),
                writer_sig: "sig-reject",
                event_type: "review",
                session_id: "session-review",
                ts: 2,
                trustTier: "ATTESTED"
              },
              reason: "not accepted by the selected L3 gate evidence set"
            }
          ],
          componentDiagnostics: [
            {
              componentId: "rag-retrieval",
              componentType: "retrieval",
              status: "accepted",
              evidenceRefs: ["ev-pass"],
              repairHint: "Keep retrieval evidence signed and rerun the question gate."
            },
            {
              componentId: "rag-generation",
              componentType: "generation",
              status: "rejected",
              rejectedEvidenceRefs: ["ev-reject"],
              repairHint: "Attach grounded generation evidence before raising the maturity level."
            }
          ],
          criteriaDiagnostics: [
            {
              criterionId: "prd-unit-test-criteria",
              criterionType: "unit_test",
              status: "satisfied",
              evidenceRefs: ["ev-pass"],
              judgeRef: "judge://eval-agent/unit",
              repairHint: "Keep the executable unit criterion linked to the signed score receipt."
            },
            {
              criterionId: "prd-shell-interaction-criteria",
              criterionType: "shell_interaction",
              status: "failed",
              rejectedEvidenceRefs: ["ev-reject"],
              judgeRef: "judge://eval-agent/shell",
              repairHint: "Attach shell interaction output that satisfies the question criterion."
            },
            {
              criterionId: "long-horizon-state-check",
              criterionType: "long_horizon_state",
              status: "satisfied",
              evidenceRefs: ["ev-pass"],
              judgeRef: "judge://planning/state",
              repairHint: "Collect sustained state-transition evidence before raising this planning question."
            }
          ],
          missingGateReasons: ["failed gate 4: events=9/12, sessions=3/5, days=3/7"]
        }
      ]
    });
    expect(second.manifestHash).toBe(report.manifestHash);
  });

  test("fails closed when prompt-artifact criteria include a failed objective check", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "t2i-prompter-agent",
      runId: "run-atelier-eval",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://arxiv.org/abs/2605.22645"],
      rows: [
        {
          question: question("AMC-2.2"),
          score: score({
            questionId: "AMC-2.2",
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.81,
            evidenceEventIds: ["ev-prompt-artifact", "ev-task-category"],
            flags: [],
            narrative: "AMC-2.2: prompt artifact evidence supports the claim, but one objective criterion failed."
          }),
          acceptedEvidence: [
            {
              id: "ev-prompt-artifact",
              event_hash: "c".repeat(64),
              writer_sig: "sig-prompt-artifact",
              event_type: "artifact",
              session_id: "session-t2i",
              ts: 10,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-task-category",
              event_hash: "d".repeat(64),
              writer_sig: "sig-task-category",
              event_type: "metric",
              session_id: "session-t2i",
              ts: 20,
              trustTier: "OBSERVED"
            }
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-objective-fail",
                event_hash: "e".repeat(64),
                writer_sig: "sig-objective-fail",
                event_type: "review",
                session_id: "session-t2i-review",
                ts: 30,
                trustTier: "ATTESTED"
              },
              reason: "objective artifact check failed the image-prompt consistency criterion"
            }
          ],
          criteriaDiagnostics: [
            {
              criterionId: "prompt-artifact-alignment",
              criterionType: "prompt_artifact_alignment",
              status: "satisfied",
              evidenceRefs: ["ev-prompt-artifact"],
              judgeRef: "judge://atelier/prompt-artifact",
              repairHint: "Keep prompt-output artifacts paired in signed evidence before raising this maturity claim."
            },
            {
              criterionId: "subjective-quality-review",
              criterionType: "subjective_quality",
              status: "satisfied",
              evidenceRefs: ["ev-prompt-artifact"],
              judgeRef: "judge://atelier/subjective",
              repairHint: "Retain subjective quality review evidence with the score receipt."
            },
            {
              criterionId: "objective-quality-check",
              criterionType: "objective_quality",
              status: "failed",
              rejectedEvidenceRefs: ["ev-objective-fail"],
              judgeRef: "judge://atelier/objective",
              repairHint: "Attach objective artifact evidence that satisfies the failed criterion before externalizing the score."
            },
            {
              criterionId: "task-category-coverage",
              criterionType: "task_category_coverage",
              status: "satisfied",
              evidenceRefs: ["ev-task-category"],
              judgeRef: "judge://atelier/task-category",
              repairHint: "Keep task-category evidence linked so the question score is not flattened to a generic aggregate."
            }
          ],
          missingGateReasons: []
        }
      ]
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(true);
    const row = report.rows[0]!;
    expect(row.status).toBe("passed");
    expect(row.evidenceWindow).toMatchObject({
      eventCount: 2,
      distinctSessionCount: 1,
      firstTs: 10,
      lastTs: 20,
      durationMs: 10
    });
    expect(row.criteriaDiagnostics.map((criterion) => criterion.criterionType)).toEqual([
      "prompt_artifact_alignment",
      "subjective_quality",
      "objective_quality",
      "task_category_coverage"
    ]);
    expect(row.criteriaDiagnostics[2]).toMatchObject({
      status: "failed",
      rejectedEvidenceRefs: ["ev-objective-fail"],
      judgeRef: "judge://atelier/objective"
    });
    expect(row.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when off-policy optimization evidence is missing a baseline comparison", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "ope-growth-agent",
      runId: "run-ope-growth",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://arxiv.org/abs/2511.00802"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.84,
            evidenceEventIds: [
              "ev-ope-protocol",
              "ev-logged-dataset",
              "ev-code-diff",
              "ev-cycle-trace",
              "ev-reliability"
            ],
            flags: [],
            narrative: "AMC-1.1: OPE optimization evidence is present, but the baseline comparison was rejected."
          }),
          acceptedEvidence: [
            {
              id: "ev-ope-protocol",
              event_hash: "d".repeat(64),
              writer_sig: "sig-ope-protocol",
              event_type: "artifact",
              session_id: "session-ope",
              ts: 10,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-logged-dataset",
              event_hash: "e".repeat(64),
              writer_sig: "sig-logged-dataset",
              event_type: "artifact",
              session_id: "session-ope",
              ts: 11,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-code-diff",
              event_hash: "f".repeat(64),
              writer_sig: "sig-code-diff",
              event_type: "code",
              session_id: "session-ope",
              ts: 12,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-cycle-trace",
              event_hash: "1".repeat(64),
              writer_sig: "sig-cycle-trace",
              event_type: "audit",
              session_id: "session-ope",
              ts: 13,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-reliability",
              event_hash: "2".repeat(64),
              writer_sig: "sig-reliability",
              event_type: "metric",
              session_id: "session-ope",
              ts: 14,
              trustTier: "OBSERVED_HARDENED"
            }
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-baseline-weak",
                event_hash: "3".repeat(64),
                writer_sig: "sig-baseline-weak",
                event_type: "metric",
                session_id: "session-ope-review",
                ts: 15,
                trustTier: "ATTESTED"
              },
              reason: "baseline comparison did not bind the logged-policy baseline and candidate code run"
            }
          ],
          componentDiagnostics: [
            {
              componentId: "ope-optimization-loop",
              componentType: "evaluation",
              status: "rejected",
              evidenceRefs: ["ev-cycle-trace"],
              rejectedEvidenceRefs: ["ev-baseline-weak"],
              repairHint: "Attach a signed baseline-vs-candidate OPE comparison before raising this score."
            }
          ],
          criteriaDiagnostics: [
            {
              criterionId: "ope-protocol",
              criterionType: "off_policy_evaluation_protocol",
              status: "satisfied",
              evidenceRefs: ["ev-ope-protocol"],
              judgeRef: "judge://ope/protocol",
              repairHint: "Keep the OPE estimator protocol and evaluation settings bound to the question score."
            },
            {
              criterionId: "logged-dataset",
              criterionType: "logged_dataset_trace",
              status: "satisfied",
              evidenceRefs: ["ev-logged-dataset"],
              judgeRef: "judge://ope/dataset",
              repairHint: "Preserve the logged data snapshot and policy provenance for replay."
            },
            {
              criterionId: "baseline-comparison",
              criterionType: "baseline_comparison",
              status: "failed",
              rejectedEvidenceRefs: ["ev-baseline-weak"],
              judgeRef: "judge://ope/baseline",
              repairHint: "Attach signed baseline and candidate OPE scores using the same logged dataset and protocol."
            },
            {
              criterionId: "code-modification",
              criterionType: "code_modification_trace",
              status: "satisfied",
              evidenceRefs: ["ev-code-diff"],
              judgeRef: "judge://ope/code",
              repairHint: "Bind the code diff, dependency hash, and executed command to the optimization result."
            },
            {
              criterionId: "optimization-cycle",
              criterionType: "optimization_cycle_trace",
              status: "satisfied",
              evidenceRefs: ["ev-cycle-trace"],
              judgeRef: "judge://ope/cycle",
              repairHint: "Keep each optimize/evaluate cycle trace signed and ordered."
            },
            {
              criterionId: "reliability-improvement",
              criterionType: "reliability_improvement_measure",
              status: "satisfied",
              evidenceRefs: ["ev-reliability"],
              judgeRef: "judge://ope/reliability",
              repairHint: "Attach reliability and positive-improvement measurements before claiming optimization quality."
            }
          ],
          missingGateReasons: []
        }
      ]
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(true);
    expect(report.sourceRefs).toContain("https://arxiv.org/abs/2511.00802");
    expect(report.rows[0]?.criteriaDiagnostics.map((criterion) => criterion.criterionType)).toEqual([
      "off_policy_evaluation_protocol",
      "logged_dataset_trace",
      "baseline_comparison",
      "code_modification_trace",
      "optimization_cycle_trace",
      "reliability_improvement_measure"
    ]);
    expect(report.rows[0]?.criteriaDiagnostics.find((criterion) => criterion.criterionType === "baseline_comparison")).toMatchObject({
      status: "failed",
      rejectedEvidenceRefs: ["ev-baseline-weak"],
      repairHint: expect.stringContaining("same logged dataset and protocol")
    });
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("explains event-forecasting questions with temporal, source, and tool criteria", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "forecasting-agent",
      runId: "run-mirai-forecast",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/yecchen/MIRAI"],
      rows: [
        {
          question: question("AMC-3.3.1"),
          score: score({
            questionId: "AMC-3.3.1",
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.84,
            evidenceEventIds: ["ev-temporal-horizon", "ev-source-integration", "ev-tool-trace"],
            flags: [],
            narrative: "AMC-3.4: forecasting evidence includes horizon, source integration, and tool trace checks."
          }),
          acceptedEvidence: [
            {
              id: "ev-temporal-horizon",
              event_hash: "e".repeat(64),
              writer_sig: "sig-temporal-horizon",
              event_type: "metric",
              session_id: "session-forecast",
              ts: 20,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-source-integration",
              event_hash: "f".repeat(64),
              writer_sig: "sig-source-integration",
              event_type: "audit",
              session_id: "session-forecast",
              ts: 21,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-tool-trace",
              event_hash: "1".repeat(64),
              writer_sig: "sig-tool-trace",
              event_type: "tool",
              session_id: "session-tool",
              ts: 22,
              trustTier: "OBSERVED_HARDENED"
            }
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "forecast-horizon-check",
              criterionType: "temporal_forecast_horizon",
              status: "satisfied",
              evidenceRefs: ["ev-temporal-horizon"],
              judgeRef: "judge://forecasting/temporal-horizon",
              repairHint: "Keep the forecast horizon and target date evidence attached to this question."
            },
            {
              criterionId: "forecast-source-integration",
              criterionType: "multi_source_integration",
              status: "satisfied",
              evidenceRefs: ["ev-source-integration"],
              judgeRef: "judge://forecasting/source-integration",
              repairHint: "Keep evidence that the forecast used the required structured and text sources."
            },
            {
              criterionId: "forecast-tool-trace",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-tool-trace"],
              judgeRef: "judge://forecasting/tool-trace",
              repairHint: "Keep signed API/tool execution evidence linked to the final forecast."
            }
          ],
          missingGateReasons: []
        }
      ]
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.criteriaDiagnostics.map((criterion) => criterion.criterionType)).toEqual([
      "temporal_forecast_horizon",
      "multi_source_integration",
      "tool_use_trace"
    ]);
    expect(report.rows[0]?.acceptedEvidenceIds).toEqual([
      "ev-temporal-horizon",
      "ev-source-integration",
      "ev-tool-trace"
    ]);
    expect(report.rows[0]?.evidenceWindow).toMatchObject({
      eventCount: 3,
      distinctSessionCount: 2,
      durationMs: 2
    });
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("explains SDK-style agent runtime questions with orchestration, session, auth, and sandbox criteria", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "go-agent-runtime",
      runId: "run-adk-go-runtime",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/go-a2a/adk-go"],
      rows: [
        {
          question: question("AMC-3.2.1"),
          score: score({
            questionId: "AMC-3.2.1",
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.86,
            evidenceEventIds: [
              "ev-orchestration",
              "ev-session-state",
              "ev-auth-boundary",
              "ev-code-sandbox"
            ],
            flags: [],
            narrative: "AMC-3.2.1: runtime evidence includes orchestration, session, auth, and sandbox criteria."
          }),
          acceptedEvidence: [
            {
              id: "ev-orchestration",
              event_hash: "2".repeat(64),
              writer_sig: "sig-orchestration",
              event_type: "trace",
              session_id: "session-runtime",
              ts: 30,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-session-state",
              event_hash: "3".repeat(64),
              writer_sig: "sig-session-state",
              event_type: "audit",
              session_id: "session-runtime",
              ts: 31,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-auth-boundary",
              event_hash: "4".repeat(64),
              writer_sig: "sig-auth-boundary",
              event_type: "review",
              session_id: "session-security",
              ts: 32,
              trustTier: "ATTESTED"
            },
            {
              id: "ev-code-sandbox",
              event_hash: "5".repeat(64),
              writer_sig: "sig-code-sandbox",
              event_type: "audit",
              session_id: "session-security",
              ts: 33,
              trustTier: "OBSERVED_HARDENED"
            }
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "runtime-multi-agent-flow",
              criterionType: "multi_agent_orchestration",
              status: "satisfied",
              evidenceRefs: ["ev-orchestration"],
              judgeRef: "judge://runtime/orchestration",
              repairHint: "Keep signed flow evidence for parent, child, sequential, parallel, or loop agent execution."
            },
            {
              criterionId: "runtime-session-state",
              criterionType: "session_state_trace",
              status: "satisfied",
              evidenceRefs: ["ev-session-state"],
              judgeRef: "judge://runtime/session-state",
              repairHint: "Keep signed session-state evidence linked to the scored runtime question."
            },
            {
              criterionId: "runtime-tool-auth-boundary",
              criterionType: "tool_auth_boundary",
              status: "satisfied",
              evidenceRefs: ["ev-auth-boundary"],
              judgeRef: "judge://runtime/tool-auth",
              repairHint: "Keep tool authentication and authorization boundary evidence attached."
            },
            {
              criterionId: "runtime-code-execution-sandbox",
              criterionType: "code_execution_sandbox",
              status: "satisfied",
              evidenceRefs: ["ev-code-sandbox"],
              judgeRef: "judge://runtime/code-sandbox",
              repairHint: "Keep sandbox, resource-limit, and execution isolation evidence attached."
            }
          ],
          missingGateReasons: []
        }
      ]
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.criteriaDiagnostics.map((criterion) => criterion.criterionType)).toEqual([
      "multi_agent_orchestration",
      "session_state_trace",
      "tool_auth_boundary",
      "code_execution_sandbox"
    ]);
    expect(report.rows[0]?.acceptedEvidenceIds).toEqual([
      "ev-orchestration",
      "ev-session-state",
      "ev-auth-boundary",
      "ev-code-sandbox"
    ]);
    expect(report.rows[0]?.evidenceWindow).toMatchObject({
      eventCount: 4,
      distinctSessionCount: 2,
      durationMs: 3
    });
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("explains untrusted-tool questions with trajectory trust and final-action risk criteria", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "tool-using-agent",
      runId: "run-trust-no-tool",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://arxiv.org/abs/2605.17453"],
      rows: [
        {
          question: question("AMC-3.3.4"),
          score: score({
            questionId: "AMC-3.3.4",
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.83,
            evidenceEventIds: [
              "ev-tool-feedback",
              "ev-trust-trajectory",
              "ev-hidden-trigger",
              "ev-final-action-risk",
              "ev-safe-control"
            ],
            flags: [],
            narrative: "AMC-3.3.4: tool trust evidence includes hidden-trigger and final-action risk checks."
          }),
          acceptedEvidence: [
            {
              id: "ev-tool-feedback",
              event_hash: "6".repeat(64),
              writer_sig: "sig-tool-feedback",
              event_type: "tool",
              session_id: "session-tool-risk",
              ts: 40,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-trust-trajectory",
              event_hash: "7".repeat(64),
              writer_sig: "sig-trust-trajectory",
              event_type: "trace",
              session_id: "session-tool-risk",
              ts: 41,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-hidden-trigger",
              event_hash: "8".repeat(64),
              writer_sig: "sig-hidden-trigger",
              event_type: "metric",
              session_id: "session-tool-risk",
              ts: 42,
              trustTier: "OBSERVED_HARDENED"
            },
            {
              id: "ev-final-action-risk",
              event_hash: "9".repeat(64),
              writer_sig: "sig-final-action-risk",
              event_type: "audit",
              session_id: "session-final-action",
              ts: 43,
              trustTier: "OBSERVED_HARDENED"
            },
            {
              id: "ev-safe-control",
              event_hash: "a".repeat(64),
              writer_sig: "sig-safe-control",
              event_type: "review",
              session_id: "session-final-action",
              ts: 44,
              trustTier: "ATTESTED"
            }
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "tool-feedback-trust-boundary",
              criterionType: "untrusted_tool_feedback",
              status: "satisfied",
              evidenceRefs: ["ev-tool-feedback"],
              judgeRef: "judge://tool-risk/untrusted-feedback",
              repairHint: "Keep signed evidence showing tool feedback was treated as untrusted input."
            },
            {
              criterionId: "trajectory-trust-formation",
              criterionType: "trajectory_trust_formation",
              status: "satisfied",
              evidenceRefs: ["ev-trust-trajectory"],
              judgeRef: "judge://tool-risk/trust-trajectory",
              repairHint: "Keep trajectory evidence that shows how trust accumulated across tool interactions."
            },
            {
              criterionId: "hidden-trigger-tool-compromise",
              criterionType: "hidden_trigger_detection",
              status: "satisfied",
              evidenceRefs: ["ev-hidden-trigger"],
              judgeRef: "judge://tool-risk/hidden-trigger",
              repairHint: "Keep evidence for hidden-trigger checks before final action."
            },
            {
              criterionId: "final-executable-action-risk",
              criterionType: "final_action_risk",
              status: "satisfied",
              evidenceRefs: ["ev-final-action-risk"],
              judgeRef: "judge://tool-risk/final-action",
              repairHint: "Keep final executable action risk evidence linked to the score receipt."
            },
            {
              criterionId: "matched-safe-control",
              criterionType: "safe_control_comparison",
              status: "satisfied",
              evidenceRefs: ["ev-safe-control"],
              judgeRef: "judge://tool-risk/safe-control",
              repairHint: "Keep matched safe-control evidence available for replay."
            }
          ],
          missingGateReasons: []
        }
      ]
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.criteriaDiagnostics.map((criterion) => criterion.criterionType)).toEqual([
      "untrusted_tool_feedback",
      "trajectory_trust_formation",
      "hidden_trigger_detection",
      "final_action_risk",
      "safe_control_comparison"
    ]);
    expect(report.rows[0]?.acceptedEvidenceIds).toEqual([
      "ev-tool-feedback",
      "ev-trust-trajectory",
      "ev-hidden-trigger",
      "ev-final-action-risk",
      "ev-safe-control"
    ]);
    expect(report.rows[0]?.evidenceWindow).toMatchObject({
      eventCount: 5,
      distinctSessionCount: 2,
      durationMs: 4
    });
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("explains step-level routing questions with prefix, model choice, trajectory, success, and cost criteria", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "routing-agent",
      runId: "run-step-routing",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://arxiv.org/abs/2605.18859"],
      rows: [
        {
          question: question("AMC-2.3"),
          score: score({
            questionId: "AMC-2.3",
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.82,
            evidenceEventIds: [
              "ev-router-prefix",
              "ev-model-choice",
              "ev-trajectory-membership",
              "ev-downstream-success",
              "ev-cost-accounting"
            ],
            flags: [],
            narrative: "AMC-2.3.1: step-level routing evidence covers prefix, model choice, trajectory, outcome, and cost."
          }),
          acceptedEvidence: [
            {
              id: "ev-router-prefix",
              event_hash: "b".repeat(64),
              writer_sig: "sig-router-prefix",
              event_type: "llm_request",
              session_id: "session-routing",
              ts: 50,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-model-choice",
              event_hash: "c".repeat(64),
              writer_sig: "sig-model-choice",
              event_type: "metric",
              session_id: "session-routing",
              ts: 51,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-trajectory-membership",
              event_hash: "d".repeat(64),
              writer_sig: "sig-trajectory-membership",
              event_type: "audit",
              session_id: "session-routing",
              ts: 52,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-downstream-success",
              event_hash: "e".repeat(64),
              writer_sig: "sig-downstream-success",
              event_type: "outcome",
              session_id: "session-routing-outcome",
              ts: 53,
              trustTier: "OBSERVED_HARDENED"
            },
            {
              id: "ev-cost-accounting",
              event_hash: "f".repeat(64),
              writer_sig: "sig-cost-accounting",
              event_type: "metric",
              session_id: "session-routing-outcome",
              ts: 54,
              trustTier: "ATTESTED"
            }
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "router-visible-prefix",
              criterionType: "router_visible_prefix",
              status: "satisfied",
              evidenceRefs: ["ev-router-prefix"],
              judgeRef: "judge://routing/prefix",
              repairHint: "Keep signed prefix evidence for the routed step."
            },
            {
              criterionId: "step-level-model-choice",
              criterionType: "step_level_model_choice",
              status: "satisfied",
              evidenceRefs: ["ev-model-choice"],
              judgeRef: "judge://routing/model-choice",
              repairHint: "Keep the selected model or tier evidence linked to the step receipt."
            },
            {
              criterionId: "trajectory-membership",
              criterionType: "trajectory_membership",
              status: "satisfied",
              evidenceRefs: ["ev-trajectory-membership"],
              judgeRef: "judge://routing/trajectory",
              repairHint: "Keep evidence that the routed step belongs to the replayed trajectory."
            },
            {
              criterionId: "downstream-success-preservation",
              criterionType: "downstream_success_preservation",
              status: "satisfied",
              evidenceRefs: ["ev-downstream-success"],
              judgeRef: "judge://routing/downstream-success",
              repairHint: "Keep signed downstream outcome evidence for the routed trajectory."
            },
            {
              criterionId: "cost-accounting-trace",
              criterionType: "cost_accounting_trace",
              status: "satisfied",
              evidenceRefs: ["ev-cost-accounting"],
              judgeRef: "judge://routing/cost-accounting",
              repairHint: "Keep cost and token-accounting evidence bound to the routing decision."
            }
          ],
          missingGateReasons: []
        }
      ]
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.criteriaDiagnostics.map((criterion) => criterion.criterionType)).toEqual([
      "router_visible_prefix",
      "step_level_model_choice",
      "trajectory_membership",
      "downstream_success_preservation",
      "cost_accounting_trace"
    ]);
    expect(report.rows[0]?.acceptedEvidenceIds).toEqual([
      "ev-router-prefix",
      "ev-model-choice",
      "ev-trajectory-membership",
      "ev-downstream-success",
      "ev-cost-accounting"
    ]);
    expect(report.rows[0]?.evidenceWindow).toMatchObject({
      eventCount: 5,
      distinctSessionCount: 2,
      durationMs: 4
    });
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("explains autonomous red-team benchmark questions with challenge, sandbox, exploit, outcome, and step-budget criteria", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "redteam-agent",
      runId: "run-redteam-benchmark",
      generatedAt: "2026-06-13T00:00:00.000Z",
      sourceRefs: ["https://github.com/dreadnode/AIRTBench-Code"],
      rows: [
        {
          question: question("AMC-3.3.4"),
          score: score({
            questionId: "AMC-3.3.4",
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.84,
            evidenceEventIds: [
              "ev-redteam-scope",
              "ev-redteam-sandbox",
              "ev-exploit-trace",
              "ev-flag-outcome",
              "ev-step-budget"
            ],
            flags: [],
            narrative: "AMC-3.3.4: autonomous red-team benchmark evidence covers scope, sandbox, exploit trace, outcome, and termination budget."
          }),
          acceptedEvidence: [
            {
              id: "ev-redteam-scope",
              event_hash: "1".repeat(64),
              writer_sig: "sig-redteam-scope",
              event_type: "audit",
              session_id: "session-redteam",
              ts: 60,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-redteam-sandbox",
              event_hash: "2".repeat(64),
              writer_sig: "sig-redteam-sandbox",
              event_type: "agent_process_started",
              session_id: "session-redteam",
              ts: 61,
              trustTier: "OBSERVED_HARDENED"
            },
            {
              id: "ev-exploit-trace",
              event_hash: "3".repeat(64),
              writer_sig: "sig-exploit-trace",
              event_type: "tool_action",
              session_id: "session-redteam",
              ts: 62,
              trustTier: "OBSERVED_HARDENED"
            },
            {
              id: "ev-flag-outcome",
              event_hash: "4".repeat(64),
              writer_sig: "sig-flag-outcome",
              event_type: "outcome",
              session_id: "session-redteam-outcome",
              ts: 63,
              trustTier: "OBSERVED"
            },
            {
              id: "ev-step-budget",
              event_hash: "5".repeat(64),
              writer_sig: "sig-step-budget",
              event_type: "metric",
              session_id: "session-redteam-outcome",
              ts: 64,
              trustTier: "ATTESTED"
            }
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "redteam-challenge-scope",
              criterionType: "redteam_challenge_scope",
              status: "satisfied",
              evidenceRefs: ["ev-redteam-scope"],
              judgeRef: "judge://redteam/challenge-scope",
              repairHint: "Keep signed challenge scope and filtering evidence linked to the score receipt."
            },
            {
              criterionId: "sandboxed-execution-environment",
              criterionType: "sandboxed_execution_environment",
              status: "satisfied",
              evidenceRefs: ["ev-redteam-sandbox"],
              judgeRef: "judge://redteam/sandbox",
              repairHint: "Keep sandbox or container isolation evidence linked to the attempt."
            },
            {
              criterionId: "exploit-attempt-trace",
              criterionType: "exploit_attempt_trace",
              status: "satisfied",
              evidenceRefs: ["ev-exploit-trace"],
              judgeRef: "judge://redteam/exploit-trace",
              repairHint: "Keep exploit attempt traces and tool actions signed for replay."
            },
            {
              criterionId: "flag-submission-outcome",
              criterionType: "flag_submission_outcome",
              status: "satisfied",
              evidenceRefs: ["ev-flag-outcome"],
              judgeRef: "judge://redteam/outcome",
              repairHint: "Keep flag or objective submission outcome evidence tied to the challenge."
            },
            {
              criterionId: "step-budget-termination",
              criterionType: "step_budget_termination",
              status: "satisfied",
              evidenceRefs: ["ev-step-budget"],
              judgeRef: "judge://redteam/step-budget",
              repairHint: "Keep max-step, give-up, error, or timeout termination evidence available for replay."
            }
          ],
          missingGateReasons: []
        }
      ]
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.criteriaDiagnostics.map((criterion) => criterion.criterionType)).toEqual([
      "redteam_challenge_scope",
      "sandboxed_execution_environment",
      "exploit_attempt_trace",
      "flag_submission_outcome",
      "step_budget_termination"
    ]);
    expect(report.rows[0]?.acceptedEvidenceIds).toEqual([
      "ev-redteam-scope",
      "ev-redteam-sandbox",
      "ev-exploit-trace",
      "ev-flag-outcome",
      "ev-step-budget"
    ]);
    expect(report.rows[0]?.evidenceWindow).toMatchObject({
      eventCount: 5,
      distinctSessionCount: 2,
      durationMs: 4
    });
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("diagnostic reports include question explainability receipts in JSON and markdown", async () => {
    const ws = workspace();
    const ledger = openLedger(ws);
    const now = Date.now();

    for (let i = 0; i < 3; i += 1) {
      const sessionId = `alignment-${i}`;
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "fixture-runtime",
        binarySha256: "fixture-sha"
      });
      const ts = now - i * DAY_MS;
      ledger.appendEvidence({
        id: `ev-stdout-${i}`,
        sessionId,
        runtime: "unknown",
        eventType: "stdout",
        payload: "preflight alignment check completed",
        inline: true,
        ts,
        meta: { questionId: "AMC-1.1", trustTier: "OBSERVED" }
      });
      ledger.appendEvidence({
        id: `ev-metric-${i}`,
        sessionId,
        runtime: "unknown",
        eventType: "metric",
        payload: JSON.stringify({ alignmentScore: 0.9 }),
        inline: true,
        ts,
        meta: { questionId: "AMC-1.1", trustTier: "OBSERVED", metricKey: "alignment_score" }
      });
      ledger.appendEvidence({
        id: `ev-audit-${i}`,
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: JSON.stringify({ auditType: "ALIGNMENT_CHECK_PASS" }),
        inline: true,
        ts,
        meta: { questionId: "AMC-1.1", trustTier: "OBSERVED", auditType: "ALIGNMENT_CHECK_PASS" }
      });
      ledger.sealSession(sessionId);
    }

    ledger.startSession({
      sessionId: "alignment-review",
      runtime: "unknown",
      binaryPath: "fixture-runtime",
      binarySha256: "fixture-sha"
    });
    ledger.appendEvidence({
      id: "ev-review-rejected",
      sessionId: "alignment-review",
      runtime: "unknown",
      eventType: "review",
      payload: "manual review observed but not part of the selected L3 evidence types",
      inline: true,
      ts: now,
      meta: { questionId: "AMC-1.1", trustTier: "ATTESTED" }
    });
    ledger.sealSession("alignment-review");
    ledger.close();

    const report = await runDiagnostic({
      workspace: ws,
      agentId: "default",
      window: "14d",
      targetName: "default",
      claimMode: "auto",
      noSign: true
    });

    const receipt = report.questionExplainability;
    expect(receipt?.rows.length).toBeGreaterThan(0);
    expect(receipt?.manifestHash).toMatch(/^[a-f0-9]{64}$/);

    const row = receipt?.rows.find((item) => item.questionId === "AMC-1.1");
    expect(row).toBeDefined();
    expect(row?.acceptedEvidenceIds.length).toBeGreaterThanOrEqual(8);
    expect(row?.evidenceWindow.eventCount).toBe(row?.acceptedEvidenceIds.length);
    expect(row?.evidenceWindow.distinctSessionCount).toBeGreaterThanOrEqual(3);
    expect(row?.evidenceWindow.durationMs).toBeGreaterThan(0);
    expect(row?.signedEvidenceRefs.every((ref) => ref.eventHash.length === 64 && ref.writerSig.length > 0)).toBe(true);
    expect(row?.rejectedEvidence).toEqual([
      expect.objectContaining({
        evidenceId: "ev-review-rejected",
        reason: expect.stringContaining("not accepted")
      })
    ]);
    expect(row?.missingGateReasons.some((reason) => reason.includes("failed gate 4"))).toBe(true);
    expect(row?.componentDiagnostics.map((component) => component.componentId)).toEqual([
      "evidence-ledger",
      "evidence-filter",
      "maturity-gates"
    ]);
    expect(row?.criteriaDiagnostics.map((criterion) => criterion.criterionId)).toEqual([
      "signed-evidence-policy-gate",
      "rejected-evidence-review",
      "maturity-level-gate"
    ]);
    expect(row?.repairHint).toContain("Create mission");

    const markdown = generateReport(report, "md") as string;
    expect(markdown).toContain("## Question Score Explainability");
    expect(markdown).toContain("Evidence Window");
    expect(markdown).toContain("Component Diagnostics");
    expect(markdown).toContain("Evaluation Criteria");
    expect(markdown).toContain("Rubric Lens");
    expect(markdown).toContain("signed-evidence-policy-gate");
    expect(markdown).toContain("evidence-filter");
    expect(markdown).toContain("ev-review-rejected");
    expect(markdown).toContain("Repair Hint");
  }, 120_000);

  test("binds Open Models LangChain4j/Ollama RAG source proof into question-explainability rows", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "open-model-rag-agent",
      runId: "open-model-rag-run",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://github.com/bbenz/gen-ai-with-open-models"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({ flags: [], claimedLevel: 4, supportedMaxLevel: 4, finalLevel: 4 }),
          acceptedEvidence: [
            {
              id: "ev-open-model-rag-pass",
              event_hash: "a".repeat(64),
              writer_sig: "sig-open-model-rag-pass",
              event_type: "metric",
              session_id: "session-open-model-rag",
              ts: 20,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-open-model-rag-reject",
                event_hash: "b".repeat(64),
                writer_sig: "sig-open-model-rag-reject",
                event_type: "review",
                session_id: "session-open-model-rag-review",
                ts: 22,
                trustTier: "ATTESTED",
              },
              reason: "upstream demo output was not accepted as product evidence without a source-boundary receipt",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "open-model-rag-question-proof",
              criterionType: "deterministic_check",
              status: "satisfied",
              evidenceRefs: ["ev-open-model-rag-pass"],
              rejectedEvidenceRefs: ["ev-open-model-rag-reject"],
              repairHint: "Attach source snapshot, LangChain4j/Ollama/RAG eval proof, score breakdown, rejected evidence, and per-question repair hint.",
            },
          ],
          openModelRagQuestionLens: [
            {
              frameworkId: "gen-ai-with-open-models",
              sourceRef: "https://github.com/bbenz/gen-ai-with-open-models",
              repositoryRef: "github:bbenz/gen-ai-with-open-models",
              licenseBoundaryHash: "c".repeat(64),
              defaultBranch: "main",
              sourceCommitSha: "d".repeat(40),
              sourceTreeSha: "e".repeat(40),
              sourceStatusHash: "f".repeat(64),
              readmeArtifactHash: "1".repeat(64),
              javaSourceTreeHash: "2".repeat(64),
              buildConfigHash: "3".repeat(64),
              dependencyManifestHash: "4".repeat(64),
              langChain4jIntegrationHash: "5".repeat(64),
              ollamaRuntimeConfigHash: "6".repeat(64),
              ragPipelineHash: "7".repeat(64),
              ragCorpusManifestHash: "8".repeat(64),
              embeddingConfigHash: "9".repeat(64),
              retrievalTraceHash: "a".repeat(64),
              evaluationManifestHash: "b".repeat(64),
              questionSetHash: "c".repeat(64),
              questionTraceHash: "d".repeat(64),
              evaluatorConfigHash: "e".repeat(64),
              metricResultHash: "f".repeat(64),
              scoreBreakdownHash: "0".repeat(64),
              rejectedEvidenceLedgerHash: "1".repeat(64),
              repairHintHash: "2".repeat(64),
              regressionThresholdHash: "3".repeat(64),
              ciRunId: "ci-open-model-rag-001",
              ciConfigHash: "4".repeat(64),
              noSourceCopyBoundaryHash: "5".repeat(64),
              runtime: "ollama_langchain4j",
              openModelIds: ["ollama:llama3.1", "ollama:nomic-embed-text"],
              evaluationMetricIds: ["retrieval_grounding", "answer_relevance", "question_repair_hint_coverage"],
              ragQueryCount: 12,
              minRagQueryCount: 10,
              retrievalGroundingScore0to1: 0.93,
              minRetrievalGroundingScore0to1: 0.9,
              answerRelevanceScore0to1: 0.91,
              minAnswerRelevanceScore0to1: 0.9,
              evidenceCoverage0to1: 0.98,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 0.95,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 0.96,
              minRepairHintCoverage0to1: 0.9,
              regressionPassRate0to1: 1,
              minRegressionPassRate0to1: 0.99,
              status: "satisfied",
              evidenceRefs: ["ev-open-model-rag-pass"],
              rejectedEvidenceRefs: ["ev-open-model-rag-reject"],
              repairHint: "Keep the Open Models RAG source snapshot, local model runtime, retrieval trace, evaluation manifest, score breakdown, and repair hint linked to this question.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      openModelRagQuestionLens: [
        expect.objectContaining({
          frameworkId: "gen-ai-with-open-models",
          runtime: "ollama_langchain4j",
          openModelIds: ["ollama:llama3.1", "ollama:nomic-embed-text"],
          evaluationMetricIds: ["retrieval_grounding", "answer_relevance", "question_repair_hint_coverage"],
          ragQueryCount: 12,
          rowHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ],
    });

    const incomplete = buildQuestionExplainabilityReport({
      agentId: "open-model-rag-agent",
      runId: "open-model-rag-run-incomplete",
      generatedAt: "2026-06-20T00:00:00.000Z",
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({ flags: [], claimedLevel: 4, supportedMaxLevel: 4, finalLevel: 4 }),
          acceptedEvidence: [
            {
              id: "ev-open-model-rag-pass",
              event_hash: "a".repeat(64),
              writer_sig: "sig-open-model-rag-pass",
              event_type: "metric",
              session_id: "session-open-model-rag",
              ts: 20,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [],
          openModelRagQuestionLens: [
            {
              frameworkId: "gen-ai-with-open-models",
              sourceRef: "https://github.com/bbenz/gen-ai-with-open-models",
              repositoryRef: "github:bbenz/gen-ai-with-open-models",
              defaultBranch: "main",
              sourceCommitSha: "d".repeat(40),
              sourceTreeSha: "e".repeat(40),
              readmeArtifactHash: "1".repeat(64),
              runtime: "ollama_langchain4j",
              openModelIds: ["ollama:llama3.1"],
              evaluationMetricIds: ["retrieval_grounding"],
              ragQueryCount: 1,
              minRagQueryCount: 10,
              status: "satisfied",
              evidenceRefs: ["ev-open-model-rag-pass"],
              repairHint: "Complete missing LangChain4j/Ollama/RAG proof before relying on this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    expect(incomplete.replayable).toBe(false);
    expect(incomplete.failClosed).toBe(true);
  });

  test("binds W&B Weave-style eval exports into eval-score explainability packs without standalone subsystem", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "weave-eval-agent",
      runId: "run-weave-eval-score-explainability",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://wandb.ai/site/weave/"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-weave-export", "ev-weave-thresholds"],
          }),
          acceptedEvidence: [
            {
              id: "ev-weave-export",
              event_hash: "a".repeat(64),
              writer_sig: "sig-weave-export",
              event_type: "artifact",
              session_id: "session-weave-export",
              ts: 10,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-weave-thresholds",
              event_hash: "b".repeat(64),
              writer_sig: "sig-weave-thresholds",
              event_type: "metric",
              session_id: "session-weave-eval",
              ts: 20,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-weave-metadata-only",
                event_hash: "c".repeat(64),
                writer_sig: "sig-weave-metadata-only",
                event_type: "review",
                session_id: "session-weave-review",
                ts: 30,
                trustTier: "ATTESTED",
              },
              reason: "metadata-only Weave export lacked question id, accepted evidence ids, rejected reasons, repair hint, eval pack hashes, signed rows, and thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "weave-eval-score-explainability",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-weave-export", "ev-weave-thresholds"],
              rejectedEvidenceRefs: ["ev-weave-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep the Weave export as evidence only after it is bound to AMC question IDs, signed evidence rows, rejected reasons, repair hints, and thresholds.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "weave-eval-score-pack",
              sourceRef: "https://wandb.ai/site/weave/",
              language: "python",
              testFramework: "pytest",
              adapter: "generic_llm_client",
              datasetRef: "weave://evals/customer-support",
              datasetHash: "d".repeat(64),
              testCaseId: "AMC-1.1:traceable-score-row",
              testCaseHash: "e".repeat(64),
              evaluatorIds: ["answer-quality", "tool-call-policy"],
              evaluatorConfigHash: "f".repeat(64),
              judgeModelRef: "judge://amc/local-eval",
              experimentRunId: "weave-run-2026-06-20",
              experimentResultHash: "0".repeat(64),
              exportArtifactHash: "1".repeat(64),
              ciRunId: "ci-weave-eval-score-001",
              ciConfigHash: "2".repeat(64),
              traceArtifactHash: "3".repeat(64),
              toolCallValidationHash: "4".repeat(64),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.96,
              minPassRate0to1: 0.95,
              averageScore0to1: 0.91,
              threshold0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-weave-export", "ev-weave-thresholds"],
              rejectedEvidenceRefs: ["ev-weave-metadata-only"],
              repairHint: "Preserve question ID, signed evidence rows, accepted/rejected evidence references, replayable export hashes, and threshold config before relying on this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      acceptedEvidenceIds: ["ev-weave-export", "ev-weave-thresholds"],
      rejectedEvidenceReasons: [
        expect.objectContaining({
          evidenceId: "ev-weave-metadata-only",
          reason: expect.stringContaining("metadata-only Weave export"),
        }),
      ],
      status: "ready",
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "weave-eval-score-pack",
          sourceRef: "https://wandb.ai/site/weave/",
          kind: "test_suite_evaluation",
          ciRunId: "ci-weave-eval-score-001",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "weave-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "weave-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.signedEvidenceRows).toHaveLength(2);
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);

    const metadataOnly = buildQuestionExplainabilityReport({
      agentId: "weave-eval-agent",
      runId: "run-weave-eval-score-metadata-only",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://wandb.ai/site/weave/"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({ flags: [], claimedLevel: 4, supportedMaxLevel: 4, finalLevel: 4 }),
          acceptedEvidence: [
            {
              id: "ev-weave-metadata",
              event_hash: "a".repeat(64),
              writer_sig: "sig-weave-metadata",
              event_type: "artifact",
              session_id: "session-weave-metadata",
              ts: 10,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [],
          criteriaDiagnostics: [
            {
              criterionId: "weave-metadata-only",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-weave-metadata"],
              repairHint: "Attach per-question eval pack hashes, signed evidence rows, rejected reasons, and thresholds.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(buildEvalScoreExplainabilityPack(metadataOnly)).toMatchObject({
      failClosed: true,
      rows: [expect.objectContaining({ status: "fail_closed", reproducibleEvalPacks: [] })],
    });
  });

  test("GAP-0625 binds Confident AI DeepEval-style metadata to AMC-owned question score proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "deepeval-style-agent",
      runId: "run-gap-0625-deepeval-score-explainability",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://www.confident-ai.com", "amc:no-deepeval-sdk-importer-or-parity-claim", "amc:no-website-prose-or-ui-copied"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-gap-0625-eval-pack", "ev-gap-0625-signed-rows", "ev-gap-0625-ci"],
            narrative: "AMC-1.1: DeepEval-style source review is bounded to AMC-owned question score explainability evidence.",
          }),
          acceptedEvidence: [
            { id: "ev-gap-0625-eval-pack", event_hash: "a".repeat(64), writer_sig: "sig-gap-0625-eval-pack", event_type: "artifact", session_id: "session-gap-0625-eval", ts: 10, trustTier: "OBSERVED" },
            { id: "ev-gap-0625-signed-rows", event_hash: "b".repeat(64), writer_sig: "sig-gap-0625-signed-rows", event_type: "metric", session_id: "session-gap-0625-eval", ts: 11, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap-0625-ci", event_hash: "c".repeat(64), writer_sig: "sig-gap-0625-ci", event_type: "test", session_id: "session-gap-0625-ci", ts: 12, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap-0625-website-metadata-only", event_hash: "d".repeat(64), writer_sig: "sig-gap-0625-website-metadata-only", event_type: "review", session_id: "session-gap-0625-source-review", ts: 13, trustTier: "ATTESTED" },
              reason: "Confident AI website metadata confirms relevance but lacks AMC question ID binding, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, and fail-closed thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0625-deepeval-score-explainability-proof",
              criterionType: "objective_quality",
              status: "satisfied",
              evidenceRefs: ["ev-gap-0625-eval-pack", "ev-gap-0625-signed-rows", "ev-gap-0625-ci"],
              rejectedEvidenceRefs: ["ev-gap-0625-website-metadata-only"],
              judgeRef: "judge://amc/gap-0625-deepeval-score-explainability",
              repairHint: "Keep question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, thresholds, and no-DeepEval-SDK/importer/parity proof linked.",
            },
          ],
          deepEvalQuestionLens: [
            {
              lensId: "gap-0625-deepeval-style-question-proof",
              sourceRef: "https://www.confident-ai.com",
              productUrl: "https://www.confident-ai.com",
              liveSourceMetadataHash: "318c59f3bcf05f7e937ddd5777b9681d2e9ee45be0987a331617307a4d7467c3",
              evalPackManifestHash: "e".repeat(64),
              datasetManifestHash: "f".repeat(64),
              testCaseManifestHash: "0".repeat(64),
              questionSetHash: "1".repeat(64),
              questionIdRef: "AMC-1.1",
              questionTraceHash: "2".repeat(64),
              evaluatorConfigHash: "3".repeat(64),
              metricResultHash: "4".repeat(64),
              scoreBreakdownHash: "5".repeat(64),
              acceptedEvidenceLedgerHash: "6".repeat(64),
              rejectedEvidenceLedgerHash: "7".repeat(64),
              repairHintHash: "8".repeat(64),
              thresholdPolicyHash: "9".repeat(64),
              signedEvidenceRowsHash: "a".repeat(64),
              ciRunId: "vitest:gap-0625-deepeval-score-explainability",
              ciConfigHash: "b".repeat(64),
              noDeepEvalSubsystemHash: "c".repeat(64),
              noSdkImporterHash: "d".repeat(64),
              noParityClaimHash: "e".repeat(64),
              noSourceCopyBoundaryHash: "f".repeat(64),
              metricFamily: "llm_evaluation",
              metricIds: ["question_score_breakdown", "accepted_evidence_coverage", "repair_hint_coverage"],
              testCaseCount: 12,
              minTestCaseCount: 10,
              questionCount: 3,
              minQuestionCount: 3,
              evidenceCoverage0to1: 1,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 1,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 1,
              minRepairHintCoverage0to1: 0.9,
              thresholdPassRate0to1: 1,
              minThresholdPassRate0to1: 0.99,
              scoreConfidence0to1: 0.91,
              minScoreConfidence0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-gap-0625-eval-pack", "ev-gap-0625-signed-rows", "ev-gap-0625-ci"],
              rejectedEvidenceRefs: ["ev-gap-0625-website-metadata-only"],
              repairHint: "Preserve question ID, accepted evidence IDs, rejected reasons, repair hint, signed evidence rows, fail-closed thresholds, and no-SDK/importer/parity/no-copy proof before using this score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    const pack = buildEvalScoreExplainabilityPack(report);
    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      acceptedEvidenceIds: ["ev-gap-0625-eval-pack", "ev-gap-0625-signed-rows", "ev-gap-0625-ci"],
      rejectedEvidence: [
        expect.objectContaining({
          evidenceId: "ev-gap-0625-website-metadata-only",
          reason: expect.stringContaining("website metadata confirms relevance"),
        }),
      ],
      deepEvalQuestionLens: [
        expect.objectContaining({
          lensId: "gap-0625-deepeval-style-question-proof",
          sourceRef: "https://www.confident-ai.com",
          questionIdRef: "AMC-1.1",
          metricFamily: "llm_evaluation",
          rowHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ],
    });
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      acceptedEvidenceIds: ["ev-gap-0625-eval-pack", "ev-gap-0625-signed-rows", "ev-gap-0625-ci"],
      rejectedEvidenceReasons: [
        {
          evidenceId: "ev-gap-0625-website-metadata-only",
          reason: expect.stringContaining("accepted evidence IDs"),
        },
      ],
      repairHint: expect.stringContaining("Target L5"),
      status: "ready",
    });
    expect(pack.rows[0]?.reproducibleEvalPacks).toEqual([
      expect.objectContaining({ kind: "deepeval_question", sourceRef: "https://www.confident-ai.com" }),
    ]);
  });

  test("GAP-0625 fails closed when Confident AI metadata is presented without AMC-owned score evidence", () => {
    const metadataOnly = buildQuestionExplainabilityReport({
      agentId: "deepeval-style-agent",
      runId: "run-gap-0625-metadata-only",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://www.confident-ai.com"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({ flags: [], claimedLevel: 4, supportedMaxLevel: 4, finalLevel: 4, evidenceEventIds: ["ev-gap-0625-source-metadata"] }),
          acceptedEvidence: [
            { id: "ev-gap-0625-source-metadata", event_hash: "a".repeat(64), writer_sig: "sig-gap-0625-source-metadata", event_type: "artifact", session_id: "session-gap-0625-source", ts: 20, trustTier: "OBSERVED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap-0625-missing-row-proof", event_hash: "b".repeat(64), writer_sig: "sig-gap-0625-missing-row-proof", event_type: "review", session_id: "session-gap-0625-review", ts: 21, trustTier: "ATTESTED" },
              reason: "metadata-only source review lacked question score row proof, accepted evidence ids, rejected evidence reasons, repair hint hash, signed evidence rows, and threshold policy",
            },
          ],
          deepEvalQuestionLens: [
            {
              lensId: "gap-0625-deepeval-style-question-proof",
              sourceRef: "https://www.confident-ai.com",
              liveSourceMetadataHash: "318c59f3bcf05f7e937ddd5777b9681d2e9ee45be0987a331617307a4d7467c3",
              questionIdRef: "AMC-1.1",
              metricFamily: "llm_evaluation",
              metricIds: ["metadata_relevance"],
              testCaseCount: 1,
              minTestCaseCount: 10,
              questionCount: 1,
              minQuestionCount: 3,
              evidenceCoverage0to1: 0.1,
              minEvidenceCoverage0to1: 0.95,
              status: "satisfied",
              evidenceRefs: ["ev-gap-0625-source-metadata"],
              rejectedEvidenceRefs: ["ev-gap-0625-missing-row-proof"],
              repairHint: "Replace metadata-only relevance with AMC-owned question score rows, signed evidence, rejected reasons, repair hints, and thresholds.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(metadataOnly.replayable).toBe(false);
    expect(metadataOnly.failClosed).toBe(true);
    expect(metadataOnly.rows[0]?.deepEvalQuestionLens[0]).toMatchObject({
      evalPackManifestHash: null,
      signedEvidenceRowsHash: null,
      thresholdPolicyHash: null,
      noDeepEvalSubsystemHash: null,
      noSdkImporterHash: null,
      noParityClaimHash: null,
      noSourceCopyBoundaryHash: null,
      repairHint: expect.stringContaining("metadata-only"),
    });
    expect(buildEvalScoreExplainabilityPack(metadataOnly).rows[0]).toMatchObject({ status: "fail_closed" });
  });

  test("binds Opik-style eval score explainability without allowing metadata-only evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "opik-eval-agent",
      runId: "run-opik-eval-score-explainability",
      generatedAt: "2026-06-20T00:00:00.000Z",
      sourceRefs: ["https://www.comet.com/site/products/opik/"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-opik-eval-pack", "ev-opik-signed-rows"],
          }),
          acceptedEvidence: [
            { id: "ev-opik-eval-pack", event_hash: "a".repeat(64), writer_sig: "sig-opik-eval-pack", event_type: "metric", session_id: "session-opik-eval", ts: 30, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-opik-signed-rows", event_hash: "b".repeat(64), writer_sig: "sig-opik-signed-rows", event_type: "artifact", session_id: "session-opik-eval", ts: 31, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-opik-product-page-only", event_hash: "c".repeat(64), writer_sig: "sig-opik-product-page-only", event_type: "review", session_id: "session-opik-review", ts: 32, trustTier: "ATTESTED" },
              reason: "Comet Opik product-page metadata is relevant to eval observability but lacks AMC question id, accepted evidence ids, rejected reasons, repair hint, reproducible eval pack, signed evidence rows, and fail-closed thresholds",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "opik-eval-score-explainability-proof",
              criterionType: "evaluation_metric",
              status: "satisfied",
              evidenceRefs: ["ev-opik-eval-pack", "ev-opik-signed-rows"],
              rejectedEvidenceRefs: ["ev-opik-product-page-only"],
              judgeRef: "judge://amc/opik-eval-score-explainability",
              repairHint: "Attach AMC-owned eval pack, signed evidence rows, question trace, threshold policy, accepted/rejected ledgers, and no-parity/no-copy proof.",
            },
          ],
          opikEvaluationQuestionLens: [
            {
              lensId: "opik-eval-score-explainability",
              sourceRef: "https://www.comet.com/site/products/opik/",
              productUrl: "https://www.comet.com/site/products/opik/",
              liveRelevanceCheckHash: "d".repeat(64),
              projectRef: "amc-opik-style-project",
              experimentRef: "amc-opik-style-experiment-001",
              datasetManifestHash: "e".repeat(64),
              traceExportHash: "f".repeat(64),
              evalPackManifestHash: "0".repeat(64),
              questionSetHash: "1".repeat(64),
              questionIdRef: "AMC-1.1",
              questionTraceHash: "2".repeat(64),
              evaluatorConfigHash: "3".repeat(64),
              metricResultHash: "4".repeat(64),
              scoreBreakdownHash: "5".repeat(64),
              acceptedEvidenceLedgerHash: "6".repeat(64),
              rejectedEvidenceLedgerHash: "7".repeat(64),
              repairHintHash: "8".repeat(64),
              thresholdPolicyHash: "9".repeat(64),
              signedEvidenceRowsHash: "a".repeat(64),
              ciRunId: "ci:opik-eval-score-explainability:001",
              ciConfigHash: "b".repeat(64),
              noParityClaimHash: "c".repeat(64),
              noSourceCopyBoundaryHash: "d".repeat(64),
              metricFamily: "offline_experiment",
              metricIds: ["question_score_breakdown", "accepted_evidence_coverage", "repair_hint_coverage"],
              traceCount: 25,
              minTraceCount: 20,
              questionCount: 12,
              minQuestionCount: 10,
              evidenceCoverage0to1: 1,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 1,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 1,
              minRepairHintCoverage0to1: 0.9,
              thresholdPassRate0to1: 1,
              minThresholdPassRate0to1: 0.99,
              scoreConfidence0to1: 0.92,
              minScoreConfidence0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-opik-eval-pack", "ev-opik-signed-rows"],
              rejectedEvidenceRefs: ["ev-opik-product-page-only"],
              repairHint: "Keep question ID, accepted evidence IDs, rejected reasons, repair hint, eval pack, signed rows, thresholds, and no-parity/no-copy proof attached.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.opikEvaluationQuestionLens[0]).toMatchObject({
      lensId: "opik-eval-score-explainability",
      questionIdRef: "AMC-1.1",
      metricFamily: "offline_experiment",
      thresholdPassRate0to1: 1,
      rowHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const metadataOnly = buildQuestionExplainabilityReport({
      agentId: "opik-eval-agent",
      runId: "run-opik-metadata-only",
      generatedAt: "2026-06-20T00:00:00.000Z",
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({ flags: [], claimedLevel: 4, supportedMaxLevel: 4, finalLevel: 4 }),
          acceptedEvidence: [
            { id: "ev-opik-product-metadata", event_hash: "a".repeat(64), writer_sig: "sig-opik-product-metadata", event_type: "artifact", session_id: "session-opik-metadata", ts: 40, trustTier: "OBSERVED" },
          ],
          rejectedEvidence: [],
          opikEvaluationQuestionLens: [
            {
              lensId: "opik-eval-score-explainability",
              sourceRef: "https://www.comet.com/site/products/opik/",
              questionIdRef: "AMC-1.1",
              metricFamily: "trace_observability",
              metricIds: ["metadata_relevance"],
              traceCount: 1,
              minTraceCount: 20,
              questionCount: 1,
              minQuestionCount: 10,
              evidenceCoverage0to1: 0.1,
              minEvidenceCoverage0to1: 0.95,
              status: "satisfied",
              evidenceRefs: ["ev-opik-product-metadata"],
              repairHint: "Metadata-only Opik relevance must be replaced with AMC-owned signed eval rows and thresholds.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(metadataOnly.replayable).toBe(false);
    expect(metadataOnly.failClosed).toBe(true);
    expect(metadataOnly.rows[0]?.opikEvaluationQuestionLens[0]).toMatchObject({
      evalPackManifestHash: null,
      signedEvidenceRowsHash: null,
      thresholdPolicyHash: null,
      noParityClaimHash: null,
      noSourceCopyBoundaryHash: null,
      traceCount: 1,
      minTraceCount: 20,
      repairHint: expect.stringContaining("Metadata-only"),
    });
  });

  test("binds UpTrain repository metadata to existing eval score explainability primitives", () => {
    const uptrainRepo = "https://github.com/uptrain-ai/uptrain";
    const report = buildQuestionExplainabilityReport({
      agentId: "uptrain-eval-agent",
      runId: "run-gap-0628-uptrain-eval-score-explainability",
      generatedAt: "2026-06-21T00:00:00.000Z",
      sourceRefs: [uptrainRepo],
      rows: [
        {
          question: question("AMC-1.3"),
          score: score({
            questionId: "AMC-1.3",
            flags: [],
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            evidenceEventIds: ["ev-uptrain-eval-pack", "ev-uptrain-signed-ledgers"],
          }),
          acceptedEvidence: [
            { id: "ev-uptrain-eval-pack", event_hash: "a".repeat(64), writer_sig: "sig-uptrain-eval-pack", event_type: "artifact", session_id: "session-uptrain-eval", ts: 50, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-uptrain-signed-ledgers", event_hash: "b".repeat(64), writer_sig: "sig-uptrain-signed-ledgers", event_type: "metric", session_id: "session-uptrain-eval", ts: 51, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-uptrain-repo-metadata-only", event_hash: "c".repeat(64), writer_sig: "sig-uptrain-repo-metadata-only", event_type: "review", session_id: "session-uptrain-review", ts: 52, trustTier: "ATTESTED" },
              reason: "UpTrain repository metadata is source context only; it lacks AMC question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, and fail-closed thresholds.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0628-uptrain-eval-score-explainability",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-uptrain-eval-pack", "ev-uptrain-signed-ledgers"],
              rejectedEvidenceRefs: ["ev-uptrain-repo-metadata-only"],
              judgeRef: "judge://amc/gap-0628-uptrain-eval-score-explainability",
              repairHint: "Keep the AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, thresholds, and source-boundary proof together.",
            },
          ],
          evalAiLibraryQuestionLens: [
            {
              frameworkId: "uptrain-eval-score-explainability",
              sourceRef: uptrainRepo,
              repositoryRef: "github:uptrain-ai/uptrain",
              licenseRef: "Apache License 2.0",
              licenseSpdxId: "Apache-2.0",
              defaultBranch: "main",
              sourceCommitSha: "a31cc14eddcb6c0b0b12cbed15f086d98c441c6f",
              sourceTreeSha: "8816d2eeb9118f7c3852a1d9e0b133b8d1fff942",
              sourceStatusHash: "d".repeat(64),
              readmeArtifactHash: "096802282e606371b9aa359ca67a48fe9a7a64e0",
              licenseArtifactHash: "261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64",
              noticeArtifactHash: "e".repeat(64),
              pyprojectArtifactHash: "66f2e210d7c9a5d62172693e79d30ffd7e4ce03c",
              requirementsArtifactHash: "f".repeat(64),
              evalLibTreeHash: "00c5ebc9a46d4f2a9071d6b0e980aabf0905ca8b",
              metricsTreeHash: "0".repeat(64),
              agentMetricsTreeHash: "1".repeat(64),
              securityMetricsTreeHash: "2".repeat(64),
              tracingTreeHash: "3".repeat(64),
              dashboardArtifactHash: "4".repeat(64),
              evaluationSchemaHash: "5".repeat(64),
              testcasesSchemaHash: "6".repeat(64),
              metricPatternHash: "7".repeat(64),
              llmClientHash: "8".repeat(64),
              evalPackManifestHash: "9".repeat(64),
              datasetManifestHash: "a".repeat(64),
              questionSetHash: "b".repeat(64),
              questionTraceHash: "c".repeat(64),
              evaluatorConfigHash: "d".repeat(64),
              metricResultHash: "e".repeat(64),
              scoreBreakdownHash: "f".repeat(64),
              acceptedEvidenceLedgerHash: "0".repeat(64),
              rejectedEvidenceLedgerHash: "1".repeat(64),
              repairHintHash: "2".repeat(64),
              regressionThresholdHash: "3".repeat(64),
              ciRunId: "ci:gap-0628-uptrain-eval-score-explainability:001",
              ciConfigHash: "4".repeat(64),
              noSourceCopyBoundaryHash: "5".repeat(64),
              metricFamily: "mixed",
              metricIds: ["question_score_breakdown", "accepted_evidence_coverage", "repair_hint_coverage"],
              providerCount: 2,
              minProviderCount: 1,
              metricCount: 3,
              minMetricCount: 3,
              questionCount: 14,
              minQuestionCount: 10,
              evidenceCoverage0to1: 1,
              minEvidenceCoverage0to1: 0.95,
              rejectedEvidenceReasonCoverage0to1: 1,
              minRejectedEvidenceReasonCoverage0to1: 0.9,
              repairHintCoverage0to1: 1,
              minRepairHintCoverage0to1: 0.9,
              regressionPassRate0to1: 1,
              minRegressionPassRate0to1: 0.99,
              scoreConfidence0to1: 0.91,
              minScoreConfidence0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-uptrain-eval-pack", "ev-uptrain-signed-ledgers"],
              rejectedEvidenceRefs: ["ev-uptrain-repo-metadata-only"],
              repairHint: "Keep question ID, accepted evidence IDs, rejected reasons, repair hint, signed rows, thresholds, and no-source-copy proof attached; do not claim an UpTrain subsystem or copy upstream code/config.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.surfaces).toEqual(expect.arrayContaining(["Score", "Shield", "Watch"]));
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.3",
      acceptedEvidenceIds: ["ev-uptrain-eval-pack", "ev-uptrain-signed-ledgers"],
      rejectedEvidenceReasons: [
        expect.objectContaining({
          evidenceId: "ev-uptrain-repo-metadata-only",
          reason: expect.stringContaining("repository metadata is source context only"),
        }),
      ],
      repairHint: expect.stringContaining("release gates"),
      status: "ready",
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "uptrain-eval-score-explainability",
          sourceRef: uptrainRepo,
          kind: "eval_ai_library_question",
          ciRunId: "ci:gap-0628-uptrain-eval-score-explainability:001",
          manifestHashes: expect.objectContaining({ acceptedEvidenceLedgerHash: "0".repeat(64) }),
        }),
      ],
    });
    expect(pack.failClosed).toBe(false);

    const guide = generateGuide({
      overall: 3,
      agentId: "uptrain-eval-agent",
      targetLevel: 4,
      questionScores: [score({ questionId: "AMC-1.3", claimedLevel: 3, supportedMaxLevel: 3, finalLevel: 3, flags: [] })],
      evalScoreExplainabilityPack: pack,
    });
    const guideMarkdown = guideToHumanMarkdown(guide);
    expect(guideMarkdown).toContain("Question ID: AMC-1.3");
    expect(guideMarkdown).toContain("Accepted evidence IDs: ev-uptrain-eval-pack, ev-uptrain-signed-ledgers");
    expect(guideMarkdown).toContain("ev-uptrain-repo-metadata-only");
    expect(guideMarkdown).toContain("Repair hint:");
    expect(guide.sections[0]?.evidenceNeeded.join("\n")).toContain("UpTrain repository metadata");

    const passport = passportJsonSchema.parse({
      v: 1,
      passportId: "pass_uptrain0628",
      generatedTs: 1,
      scope: { type: "AGENT", idHash: "abc12345" },
      trust: {
        integrityIndex: 1,
        correlationRatio: 1,
        trustLabel: "HIGH",
        evidenceCoverage: { observedShare: 1, attestedShare: 0, selfReportedShare: 0 },
        notary: { enabled: false },
      },
      status: { label: "VERIFIED", reasons: [] },
      maturity: {
        status: "OK",
        overall: 4,
        byFiveLayers: { strategicOps: 4, leadership: 4, culture: 4, resilience: 4, skills: 4 },
        unknownQuestionsCount: 0,
        questionExplainabilityHash: report.manifestHash,
        questionExplainabilitySummary: {
          replayable: pack.replayable,
          failClosed: pack.failClosed,
          rowCount: pack.rows.length,
          signedEvidenceRowCount: pack.rows[0]?.signedEvidenceRows.length ?? 0,
          acceptedEvidenceCount: pack.rows[0]?.acceptedEvidenceIds.length ?? 0,
          rejectedEvidenceCount: pack.rows[0]?.rejectedEvidenceReasons.length ?? 0,
          rejectedEvidenceReasonCount: pack.rows[0]?.rejectedEvidenceReasons.length ?? 0,
          reproducibleEvalPackCount: pack.rows[0]?.reproducibleEvalPacks.length ?? 0,
          failClosedThresholdCount: pack.rows[0]?.failClosedThresholds.length ?? 0,
          surfaces: report.rows[0]?.surfaces ?? [],
          sourceRefs: pack.sourceRefs,
          rows: pack.rows.map((row) => ({
            questionId: row.questionId,
            acceptedEvidenceIds: row.acceptedEvidenceIds,
            rejectedEvidenceReasons: row.rejectedEvidenceReasons,
            repairHint: row.repairHint,
            status: row.status,
            rowHash: row.rowHash,
          })),
        },
      },
      strategyFailureRisks: { ecosystemFocusRisk: null, clarityPathRisk: null, economicSignificanceRisk: null, riskAssuranceRisk: null, digitalDualityRisk: null },
      valueDimensions: { emotionalValue: null, functionalValue: null, economicValue: null, brandValue: null, lifetimeValue: null, valueScore: null },
      checkpoints: {
        cgxPackSha256: "6".repeat(64),
        lastAssuranceCert: { status: "PASS" },
        lastBench: {},
        lastAuditBinder: {},
        lastValueSnapshot: {},
      },
      governanceSummary: { promptEnforcement: "ON", truthguard: "ENFORCE", providerAllowlist: "PASS", modelAllowlist: "PASS", toolAllowlist: "PASS", approvals: "PASS", leases: "PASS", pluginsIntegrity: "PASS" },
      bindings: { passportPolicySha256: "7".repeat(64), canonSha256: "8".repeat(64), bankSha256: "9".repeat(64), trustMode: "LOCAL_VAULT" },
      proofBindings: { transparencyRootSha256: "a".repeat(64), merkleRootSha256: "b".repeat(64), includedEventProofIds: ["ev-uptrain-eval-pack"], calculationManifestSha256: "c".repeat(64) },
    });
    expect(passport.maturity.questionExplainabilitySummary?.sourceRefs).toContain(uptrainRepo);
    expect(passport.maturity.questionExplainabilitySummary?.rows?.[0]).toMatchObject({
      questionId: "AMC-1.3",
      acceptedEvidenceIds: ["ev-uptrain-eval-pack", "ev-uptrain-signed-ledgers"],
      rejectedEvidenceReasons: [expect.objectContaining({ evidenceId: "ev-uptrain-repo-metadata-only" })],
      repairHint: expect.stringContaining("release gates"),
    });
  });

});

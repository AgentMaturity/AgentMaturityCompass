import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0941-langsmith-question-explainability.md";
const SOURCE = "LangSmith";
const URL = "https://www.langchain.com/langsmith";
const OBSERVABILITY_URL = "https://www.langchain.com/langsmith/observability";
const EVALUATION_URL = "https://www.langchain.com/langsmith/evaluation";

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportArtifact.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) throw new Error(`missing test question ${id}`);
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-1.1",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.91,
    evidenceEventIds: ["ev-gap0941-question-trace", "ev-gap0941-eval-thresholds"],
    flags: [],
    narrative: "LangSmith competitor context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0941 LangSmith question-explainability boundary", () => {
  it("documents live product metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0941");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(URL);
    expect(doc).toContain(OBSERVABILITY_URL);
    expect(doc).toContain(EVALUATION_URL);
    expect(doc).toContain("live LangSmith Observability page");
    expect(doc).toContain("AI Agent Observability Platform");
    expect(doc).toContain("Know what your agents are really doing");
    expect(doc).toContain("complete visibility into agent behavior");
    expect(doc).toContain("Python, Typescript, Go, or Java SDKs");
    expect(doc).toContain("Tracing");
    expect(doc).toContain("Monitoring");
    expect(doc).toContain("Insights");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Message threading");
    expect(doc).toContain("Online LLM-as-judge and code evals");
    expect(doc).toContain("Tool and agent trajectory monitoring");
    expect(doc).toContain("Webhook and Pagerduty alerts");
    expect(doc).toContain("Unsupervised topic clustering");
    expect(doc).toContain("P50, P99");
    expect(doc).toContain("feedback scores");
    expect(doc).toContain("live LangSmith Evaluation page");
    expect(doc).toContain("LLM & AI Agent Evaluation Platform");
    expect(doc).toContain("Continuously improve agent quality");
    expect(doc).toContain("Run evals before and after shipping");
    expect(doc).toContain("curated datasets");
    expect(doc).toContain("benchmark performance");
    expect(doc).toContain("catch regressions");
    expect(doc).toContain("Calibrate llm-as-judge evals with human feedback");
    expect(doc).toContain("Conversation evals");
    expect(doc).toContain("Multi-modal evals");
    expect(doc).toContain("Shared scoring criteria");
    expect(doc).toContain("annotation queues");
    expect(doc).toContain("heuristic checks");
    expect(doc).toContain("pairwise comparisons");
    expect(doc).toContain("pytest, Vitest, and GitHub workflows");
    expect(doc).toContain("fail pipelines");
    expect(doc).toContain("comparison view dashboards");
    expect(doc).toContain("context precision");
    expect(doc).toContain("faithfulness");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("fail-closed thresholds");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts LangSmith context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0941-langsmith-reviewed-agent",
      runId: "run-gap-0941-question-explainability",
      generatedAt: "2026-06-22T16:41:00.000Z",
      sourceRefs: [OBSERVABILITY_URL, EVALUATION_URL, "amc:no-langsmith-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0941-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0941-question-trace",
              event_type: "test",
              session_id: "session-gap0941-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0941-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0941-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0941-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0941-langsmith-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0941-metadata",
                event_type: "review",
                session_id: "session-gap0941-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "LangSmith product metadata identifies relevant competitor context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0941-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0941-question-trace", "ev-gap0941-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0941-langsmith-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep LangSmith as competitor source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0941-langsmith-eval-score-pack",
              sourceRef: EVALUATION_URL,
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0941/langsmith-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0941-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0941-langsmith-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0941-langsmith-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.93,
              minPassRate0to1: 0.86,
              averageScore0to1: 0.89,
              threshold0to1: 0.82,
              status: "satisfied",
              evidenceRefs: ["ev-gap0941-question-trace", "ev-gap0941-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0941-langsmith-metadata-only"],
              repairHint: "Preserve question-tagged eval rows, thresholds, accepted evidence IDs, rejected evidence reasons, repair hints, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap0941-question-trace", "ev-gap0941-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0941-langsmith-eval-score-pack",
          sourceRef: EVALUATION_URL,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0941-langsmith-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0941-langsmith-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0941-langsmith-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("competitor context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when LangSmith metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0941-langsmith-metadata-agent",
      runId: "run-gap-0941-metadata-only",
      generatedAt: "2026-06-22T16:41:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "LangSmith metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0941-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0941-missing",
                event_type: "review",
                session_id: "session-gap0941-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["LangSmith source metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add LangSmith identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("langsmith_question_explainability");
    }
  });
});

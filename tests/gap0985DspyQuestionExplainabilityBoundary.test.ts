import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0985-dspy-question-explainability.md";
const DSPY_SITE = "https://dspy.ai";
const GITHUB = "https://github.com/stanfordnlp/dspy";
const README = "https://raw.githubusercontent.com/stanfordnlp/dspy/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/stanfordnlp/dspy/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/stanfordnlp/dspy/main/pyproject.toml";
const METRICS = "https://dspy.ai/getting-started/metrics/";
const METRICS_EVAL = "https://dspy.ai/diving-deeper/metrics-and-evaluation/";
const HEAD = "498760149b230f402c56bece2aa45df6e1ba946b";
const RELEASE = "3.2.1";
const IDENTIFIER = "dspy-question-explainability";

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
    confidence: 0.92,
    evidenceEventIds: ["ev-gap0985-dspy-trace", "ev-gap0985-eval-thresholds"],
    flags: [],
    narrative: "DSPy source context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0985 DSPy question-explainability boundary", () => {
  it("documents live DSPy metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0985");
    expect(doc).toContain("DSPy");
    expect(doc).toContain(DSPY_SITE);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(METRICS);
    expect(doc).toContain(METRICS_EVAL);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("35,347 stars");
    expect(doc).toContain("3,000 forks");
    expect(doc).toContain("536 open issues");
    expect(doc).toContain("pushed_at `2026-06-18T16:57:05Z`");
    expect(doc).toContain("Program, don't prompt");
    expect(doc).toContain("python >= 3.10");
    expect(doc).toContain("6.4M+ monthly downloads");
    expect(doc).toContain("433+ contributors");
    expect(doc).toContain("Signatures");
    expect(doc).toContain("Modules");
    expect(doc).toContain("Optimizers");
    expect(doc).toContain("Evaluate");
    expect(doc).toContain("EvaluationResult");
    expect(doc).toContain("dspy.Prediction(score, feedback)");
    expect(doc).toContain("trace");
    expect(doc).toContain("failure_score");
    expect(doc).toContain("question ID");
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

  it("accepts DSPy context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0985-dspy-reviewed-agent",
      runId: "run-gap-0985-question-explainability",
      generatedAt: "2026-06-24T13:00:00.000Z",
      sourceRefs: [DSPY_SITE, GITHUB, METRICS, METRICS_EVAL, "amc:no-dspy-adapter-or-metric-importer"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0985-dspy-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0985-dspy-trace",
              event_type: "test",
              session_id: "session-gap0985-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0985-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0985-thresholds",
              event_type: "audit",
              session_id: "session-gap0985-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0985-dspy-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0985-metadata",
                event_type: "review",
                session_id: "session-gap0985-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "DSPy website, repository, metrics, Evaluate, trace, feedback, optimizer, and production-use labels identify relevant score-explainability context only; they lack AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0985-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0985-dspy-trace", "ev-gap0985-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0985-dspy-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep DSPy as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0985-dspy-eval-score-pack",
              sourceRef: METRICS_EVAL,
              language: "python",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0985/dspy-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0985-dspy-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0985-dspy-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0985-dspy-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.95,
              minPassRate0to1: 0.87,
              averageScore0to1: 0.93,
              threshold0to1: 0.84,
              status: "satisfied",
              evidenceRefs: ["ev-gap0985-dspy-trace", "ev-gap0985-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0985-dspy-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap0985-dspy-trace", "ev-gap0985-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0985-dspy-eval-score-pack",
          sourceRef: METRICS_EVAL,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0985-dspy-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0985-dspy-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0985-dspy-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when DSPy metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0985-dspy-metadata-agent",
      runId: "run-gap-0985-metadata-only",
      generatedAt: "2026-06-24T13:00:00.000Z",
      sourceRefs: [DSPY_SITE, GITHUB, METRICS_EVAL],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "DSPy metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0985-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0985-missing",
                event_type: "review",
                session_id: "session-gap0985-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["DSPy source metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("DSPy source metadata is not question-level score explainability proof.");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add DSPy identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain(DSPY_SITE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("stanfordnlp/dspy");
    }
  });
});

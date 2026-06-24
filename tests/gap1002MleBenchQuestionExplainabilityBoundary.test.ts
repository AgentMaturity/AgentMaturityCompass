import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1002-mle-bench-question-explainability.md";
const REPO = "https://github.com/openai/mle-bench";
const API = "https://api.github.com/repos/openai/mle-bench";
const README = "https://raw.githubusercontent.com/openai/mle-bench/main/README.md";
const LICENSE_API = "https://api.github.com/repos/openai/mle-bench/license";
const LICENSE = "https://raw.githubusercontent.com/openai/mle-bench/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/openai/mle-bench/main/pyproject.toml";
const ARXIV = "https://arxiv.org/abs/2410.07095";
const AGENTS_README = "https://raw.githubusercontent.com/openai/mle-bench/main/agents/README.md";
const RUN_AGENT = "https://raw.githubusercontent.com/openai/mle-bench/main/run_agent.py";
const AGGREGATE =
  "https://raw.githubusercontent.com/openai/mle-bench/main/experiments/aggregate_grading_reports.py";
const SPLITS = "https://github.com/openai/mle-bench/tree/main/experiments/splits";
const HEAD = "507f92e1138bb6e40dac5c6ee7a6758e6424bf97";
const IDENTIFIER = "mle_bench_question_explainability";

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
    claimedLevel: 5,
    supportedMaxLevel: 5,
    finalLevel: 5,
    confidence: 0.94,
    evidenceEventIds: ["ev-gap1002-agent-trace", "ev-gap1002-thresholds"],
    flags: [],
    narrative: "MLE-bench context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1002 MLE-bench question-explainability boundary", () => {
  it("documents live MLE-bench metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1002");
    expect(doc).toContain("openai/mle-bench");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(AGENTS_README);
    expect(doc).toContain(RUN_AGENT);
    expect(doc).toContain(AGGREGATE);
    expect(doc).toContain(SPLITS);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("NOASSERTION");
    expect(doc).toContain("code license reviewed as MIT");
    expect(doc).toContain("external datasets");
    expect(doc).toContain("Python");
    expect(doc).toContain("1,590 stars");
    expect(doc).toContain("255 forks");
    expect(doc).toContain("8 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-04-24T17:33:44Z`");
    expect(doc).toContain("updated_at `2026-06-24T10:47:05Z`");
    expect(doc).toContain("latest GitHub release not found");
    expect(doc).toContain("MLE-Bench: Evaluating Machine Learning Agents on Machine Learning Engineering");
    expect(doc).toContain("75 Kaggle competitions");
    expect(doc).toContain("22 competitions");
    expect(doc).toContain("3.3TB");
    expect(doc).toContain("158GB");
    expect(doc).toContain("3 seeds");
    expect(doc).toContain("Any Medal");
    expect(doc).toContain("mean");
    expect(doc).toContain("SEM");
    expect(doc).toContain("grading reports");
    expect(doc).toContain("runs/");
    expect(doc).toContain("competition_id");
    expect(doc).toContain("submission_path");
    expect(doc).toContain("mlebench grade");
    expect(doc).toContain("mlebench-env");
    expect(doc).toContain("Conda");
    expect(doc).toContain("grading server");
    expect(doc).toContain("agents/README.md");
    expect(doc).toContain("aide");
    expect(doc).toContain("mlagentbench");
    expect(doc).toContain("opendevin");
    expect(doc).toContain("rule violation detector");
    expect(doc).toContain("known issues");
    expect(doc).toContain("v2");
    expect(doc).toContain("version column");
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

  it("accepts MLE-bench context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1002-mle-bench-reviewed-agent",
      runId: "run-gap-1002-question-explainability",
      generatedAt: "2026-06-24T14:20:00.000Z",
      sourceRefs: [REPO, README, ARXIV, AGENTS_README, AGGREGATE, "amc:no-mle-bench-runner-or-adapter"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1002-agent-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap1002-agent-trace",
              event_type: "test",
              session_id: "session-gap1002-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1002-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap1002-thresholds",
              event_type: "audit",
              session_id: "session-gap1002-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1002-mle-bench-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1002-metadata",
                event_type: "review",
                session_id: "session-gap1002-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "MLE-bench repository metadata, README, grading reports, Kaggle dataset size, Docker image, agent wrappers, leaderboard notes, and release status identify relevant context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1002-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1002-agent-trace", "ev-gap1002-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1002-mle-bench-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep MLE-bench as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1002-mle-bench-eval-score-pack",
              sourceRef: REPO,
              language: "python",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1002/mle-bench-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1002-mle-bench-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1002-mle-bench-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1002-mle-bench-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.96,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.94,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1002-agent-trace", "ev-gap1002-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1002-mle-bench-metadata-only"],
              repairHint:
                "Preserve question-tagged eval rows, signed evidence IDs, rejected reasons, repair hints, thresholds, and row hashes.",
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
      acceptedEvidenceIds: ["ev-gap1002-agent-trace", "ev-gap1002-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1002-mle-bench-eval-score-pack",
          sourceRef: REPO,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1002-mle-bench-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1002-mle-bench-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1002-mle-bench-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when MLE-bench metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1002-mle-bench-metadata-agent",
      runId: "run-gap-1002-metadata-only",
      generatedAt: "2026-06-24T14:20:00.000Z",
      sourceRefs: [REPO, README, ARXIV],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "MLE-bench metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1002-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1002-missing",
                event_type: "review",
                session_id: "session-gap1002-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["MLE-bench source metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "MLE-bench source metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add MLE-bench identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("openai/mle-bench");
      expect(source).not.toContain("MLE-bench");
    }
  });
});

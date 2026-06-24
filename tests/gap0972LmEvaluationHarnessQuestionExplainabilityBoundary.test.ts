import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0972-lm-evaluation-harness-question-explainability.md";
const GITHUB = "https://github.com/EleutherAI/lm-evaluation-harness";
const DOCS = "https://github.com/EleutherAI/lm-evaluation-harness/tree/main/docs";
const INTERFACE = "https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/interface.md";
const TASK_GUIDE = "https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/task_guide.md";
const TITLE = "EleutherAI lm-evaluation-harness";

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
    confidence: 0.9,
    evidenceEventIds: ["ev-gap0972-question-trace", "ev-gap0972-eval-thresholds"],
    flags: [],
    narrative: "LM Evaluation Harness source context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0972 LM Evaluation Harness question-explainability boundary", () => {
  it("documents live lm-evaluation-harness metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0972");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(INTERFACE);
    expect(doc).toContain(TASK_GUIDE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("13k stars");
    expect(doc).toContain("3.4k forks");
    expect(doc).toContain("573 issues");
    expect(doc).toContain("301 pull requests");
    expect(doc).toContain("4,025 commits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Language Model Evaluation Harness");
    expect(doc).toContain("unified framework to test generative language models");
    expect(doc).toContain("Over 60 standard academic benchmarks");
    expect(doc).toContain("hundreds of subtasks and variants");
    expect(doc).toContain("transformers");
    expect(doc).toContain("vLLM");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("TextSynth");
    expect(doc).toContain("publicly available prompts");
    expect(doc).toContain("custom prompts and evaluation metrics");
    expect(doc).toContain("Open LLM Leaderboard");
    expect(doc).toContain("CLI refactored with subcommands");
    expect(doc).toContain("run, ls, validate");
    expect(doc).toContain("YAML config file support");
    expect(doc).toContain("Task Guide");
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

  it("accepts lm-evaluation-harness context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0972-lm-eval-harness-reviewed-agent",
      runId: "run-gap-0972-question-explainability",
      generatedAt: "2026-06-22T06:12:00.000Z",
      sourceRefs: [GITHUB, DOCS, INTERFACE, TASK_GUIDE, "amc:no-lm-eval-harness-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0972-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0972-question-trace",
              event_type: "test",
              session_id: "session-gap0972-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0972-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0972-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0972-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0972-lm-eval-harness-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0972-metadata",
                event_type: "review",
                session_id: "session-gap0972-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "lm-evaluation-harness repository and docs metadata identifies relevant evaluation-harness context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0972-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0972-question-trace", "ev-gap0972-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0972-lm-eval-harness-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep lm-evaluation-harness as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0972-lm-eval-harness-eval-score-pack",
              sourceRef: GITHUB,
              language: "python",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0972/lm-eval-harness-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0972-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0972-lm-eval-harness-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0972-lm-eval-harness-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.93,
              minPassRate0to1: 0.86,
              averageScore0to1: 0.91,
              threshold0to1: 0.82,
              status: "satisfied",
              evidenceRefs: ["ev-gap0972-question-trace", "ev-gap0972-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0972-lm-eval-harness-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap0972-question-trace", "ev-gap0972-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0972-lm-eval-harness-eval-score-pack",
          sourceRef: GITHUB,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0972-lm-eval-harness-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0972-lm-eval-harness-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0972-lm-eval-harness-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("evaluation-harness context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when lm-evaluation-harness metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0972-lm-eval-harness-metadata-agent",
      runId: "run-gap-0972-metadata-only",
      generatedAt: "2026-06-22T06:12:00.000Z",
      sourceRefs: [GITHUB],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "lm-evaluation-harness metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0972-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0972-missing",
                event_type: "review",
                session_id: "session-gap0972-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["lm-evaluation-harness source metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("lm-evaluation-harness source metadata is not question-level score explainability proof.");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add lm-evaluation-harness identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain("lm_evaluation_harness_question_explainability");
    }
  });
});

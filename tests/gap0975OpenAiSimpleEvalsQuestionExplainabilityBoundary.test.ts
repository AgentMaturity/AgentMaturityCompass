import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0975-openai-simple-evals-question-explainability.md";
const GITHUB = "https://github.com/openai/simple-evals";
const OPENAI_EVALS = "https://github.com/openai/evals";
const SIMPLEQA = "https://arxiv.org/abs/2411.04368";
const BROWSECOMP = "https://arxiv.org/abs/2504.12516";
const TITLE = "OpenAI Simple Evals";

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
    evidenceEventIds: ["ev-gap0975-question-trace", "ev-gap0975-eval-thresholds"],
    flags: [],
    narrative: "OpenAI Simple Evals source context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0975 OpenAI Simple Evals question-explainability boundary", () => {
  it("documents live OpenAI Simple Evals metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0975");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(OPENAI_EVALS);
    expect(doc).toContain(SIMPLEQA);
    expect(doc).toContain(BROWSECOMP);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("GitHub repository API");
    expect(doc).toContain("4.5k stars");
    expect(doc).toContain("492 forks");
    expect(doc).toContain("34 issues");
    expect(doc).toContain("22 pull requests");
    expect(doc).toContain("86 commits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("July 2025");
    expect(doc).toContain("will no longer be updated for new models or benchmark results");
    expect(doc).toContain("reference implementations for HealthBench, BrowseComp, and SimpleQA");
    expect(doc).toContain("lightweight library for evaluating language models");
    expect(doc).toContain("transparent about the accuracy numbers");
    expect(doc).toContain("Benchmark Results");
    expect(doc).toContain("MMLU");
    expect(doc).toContain("GPQA");
    expect(doc).toContain("MATH");
    expect(doc).toContain("HumanEval");
    expect(doc).toContain("MGSM");
    expect(doc).toContain("DROP");
    expect(doc).toContain("SimpleQA");
    expect(doc).toContain("zero-shot, chain-of-thought setting");
    expect(doc).toContain("not accepting new evals");
    expect(doc).toContain("NOT intended as a replacement for");
    expect(doc).toContain("OpenAI and Claude sampling interfaces");
    expect(doc).toContain("python -m simple-evals.simple_evals --list-models");
    expect(doc).toContain("python -m simple-evals.simple_evals --model <model_name> --examples <num_examples>");
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

  it("accepts OpenAI Simple Evals context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0975-openai-simple-evals-reviewed-agent",
      runId: "run-gap-0975-question-explainability",
      generatedAt: "2026-06-24T12:15:00.000Z",
      sourceRefs: [GITHUB, SIMPLEQA, BROWSECOMP, "amc:no-openai-simple-evals-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0975-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0975-question-trace",
              event_type: "test",
              session_id: "session-gap0975-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0975-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0975-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0975-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0975-openai-simple-evals-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0975-metadata",
                event_type: "review",
                session_id: "session-gap0975-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "OpenAI Simple Evals repository metadata, benchmark table labels, deprecation labels, sampler labels, and run-command labels identify relevant evaluation context only; they lack AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0975-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0975-question-trace", "ev-gap0975-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0975-openai-simple-evals-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep OpenAI Simple Evals as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0975-openai-simple-evals-eval-score-pack",
              sourceRef: GITHUB,
              language: "python",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0975/openai-simple-evals-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0975-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0975-openai-simple-evals-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0975-openai-simple-evals-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.94,
              minPassRate0to1: 0.86,
              averageScore0to1: 0.92,
              threshold0to1: 0.82,
              status: "satisfied",
              evidenceRefs: ["ev-gap0975-question-trace", "ev-gap0975-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0975-openai-simple-evals-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap0975-question-trace", "ev-gap0975-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0975-openai-simple-evals-eval-score-pack",
          sourceRef: GITHUB,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0975-openai-simple-evals-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0975-openai-simple-evals-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0975-openai-simple-evals-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("evaluation context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when OpenAI Simple Evals metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0975-openai-simple-evals-metadata-agent",
      runId: "run-gap-0975-metadata-only",
      generatedAt: "2026-06-24T12:15:00.000Z",
      sourceRefs: [GITHUB],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "OpenAI Simple Evals metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0975-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0975-missing",
                event_type: "review",
                session_id: "session-gap0975-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["OpenAI Simple Evals source metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("OpenAI Simple Evals source metadata is not question-level score explainability proof.");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add OpenAI Simple Evals identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain("openai_simple_evals_question_explainability");
    }
  });
});

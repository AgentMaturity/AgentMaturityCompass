import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1007-anthropic-console-evals-question-explainability.md";
const SOURCE = "https://docs.anthropic.com";
const EVAL_TOOL_DOC = "https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool";
const EVAL_TOOL_CANONICAL = "https://platform.claude.com/docs/en/test-and-evaluate/eval-tool";
const DEVELOP_TESTS_DOC = "https://docs.anthropic.com/en/docs/build-with-claude/develop-tests";
const DEVELOP_TESTS_CANONICAL = "https://platform.claude.com/docs/en/test-and-evaluate/develop-tests";
const PROMPT_TOOLS_DOC =
  "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator";
const PROMPT_TOOLS_CANONICAL =
  "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools";
const IDENTIFIER = "anthropic_console_evals_question_explainability";

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
    questionId: "AMC-1.2",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.91,
    evidenceEventIds: ["ev-gap1007-eval-row", "ev-gap1007-thresholds"],
    flags: [],
    narrative: "Anthropic Console Evals context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1007 Anthropic Console Evals question-explainability boundary", () => {
  it("documents live official Anthropic docs metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1007");
    expect(doc).toContain("Anthropic Console Evals");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(EVAL_TOOL_DOC);
    expect(doc).toContain(EVAL_TOOL_CANONICAL);
    expect(doc).toContain(DEVELOP_TESTS_DOC);
    expect(doc).toContain(DEVELOP_TESTS_CANONICAL);
    expect(doc).toContain(PROMPT_TOOLS_DOC);
    expect(doc).toContain(PROMPT_TOOLS_CANONICAL);
    expect(doc).toContain("HTTP/2 301");
    expect(doc).toContain("HTTP/2 307");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("x-request-pathname: /docs/en/test-and-evaluate/eval-tool");
    expect(doc).toContain("Using the Evaluation Tool - Claude API Docs");
    expect(doc).toContain("Define success criteria and build evaluations - Claude API Docs");
    expect(doc).toContain("Console prompting tools - Claude API Docs");
    expect(doc).toContain("Evaluation tool");
    expect(doc).toContain("Evaluate tab");
    expect(doc).toContain("dynamic variables");
    expect(doc).toContain("Generate Test Case");
    expect(doc).toContain("CSV");
    expect(doc).toContain("side-by-side comparison");
    expect(doc).toContain("Quality grading");
    expect(doc).toContain("Prompt versioning");
    expect(doc).toContain("Specific");
    expect(doc).toContain("Measurable");
    expect(doc).toContain("Build evaluations");
    expect(doc).toContain("Eval design principles");
    expect(doc).toContain("Example evals");
    expect(doc).toContain("Grade your evaluations");
    expect(doc).toContain("LLM-based grading");
    expect(doc).toContain("Task fidelity");
    expect(doc).toContain("Consistency");
    expect(doc).toContain("Privacy preservation");
    expect(doc).toContain("Context utilization");
    expect(doc).toContain("Latency");
    expect(doc).toContain("Price");
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

  it("accepts Anthropic Console Evals context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1007-anthropic-console-reviewed-agent",
      runId: "run-gap-1007-question-explainability",
      generatedAt: "2026-06-24T15:00:00.000Z",
      sourceRefs: [
        EVAL_TOOL_CANONICAL,
        DEVELOP_TESTS_CANONICAL,
        PROMPT_TOOLS_CANONICAL,
        "amc:no-anthropic-console-integration-or-runner",
      ],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1007-eval-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1007-eval-row",
              event_type: "test",
              session_id: "session-gap1007-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1007-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap1007-thresholds",
              event_type: "audit",
              session_id: "session-gap1007-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1007-anthropic-docs-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1007-docs",
                event_type: "review",
                session_id: "session-gap1007-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "Anthropic Console Evals docs, redirect metadata, prompt-tool labels, CSV import, generated test cases, quality grading, and prompt versioning identify relevant context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1007-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1007-eval-row", "ev-gap1007-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1007-anthropic-docs-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep Anthropic Console Evals as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1007-anthropic-console-evals-pack",
              sourceRef: EVAL_TOOL_CANONICAL,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1007/anthropic-console-evals-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1007-anthropic-console-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1007-anthropic-console-evals",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1007-anthropic-console-evals",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.94,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.92,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1007-eval-row", "ev-gap1007-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1007-anthropic-docs-metadata-only"],
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
      questionId: "AMC-1.2",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap1007-eval-row", "ev-gap1007-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1007-anthropic-console-evals-pack",
          sourceRef: EVAL_TOOL_CANONICAL,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1007-anthropic-console-evals",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1007-anthropic-console-evals-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1007-anthropic-console-evals-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Anthropic docs metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1007-anthropic-console-metadata-agent",
      runId: "run-gap-1007-metadata-only",
      generatedAt: "2026-06-24T15:00:00.000Z",
      sourceRefs: [EVAL_TOOL_DOC, DEVELOP_TESTS_DOC, PROMPT_TOOLS_DOC],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Anthropic docs metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1007-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1007-missing",
                event_type: "review",
                session_id: "session-gap1007-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Anthropic Console Evals docs metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "Anthropic Console Evals docs metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add Anthropic Console Evals identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(EVAL_TOOL_DOC);
      expect(source).not.toContain(EVAL_TOOL_CANONICAL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("Anthropic Console Evals");
    }
  });
});

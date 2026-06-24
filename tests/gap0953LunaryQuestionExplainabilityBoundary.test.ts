import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0953-lunary-question-explainability.md";
const SOURCE = "Lunary";
const URL = "https://lunary.ai";
const DOCS_URL = "https://docs.lunary.ai/get-started";
const IDENTIFIER = "lunary_question_explainability";

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
    evidenceEventIds: ["ev-gap0953-question-trace", "ev-gap0953-eval-thresholds"],
    flags: [],
    narrative: "Lunary competitor context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0953 Lunary question-explainability boundary", () => {
  it("documents live Lunary metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0953");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS_URL);
    expect(doc).toContain("live Lunary homepage");
    expect(doc).toContain("Build AI agents with confidence");
    expect(doc).toContain("AI platform for enterprises");
    expect(doc).toContain("Understand the gap between your chatbot and your users");
    expect(doc).toContain("See how your LLMs performs in real-time");
    expect(doc).toContain("Deliver reliable AI experiences");
    expect(doc).toContain("Deploy autonomous agents");
    expect(doc).toContain("Monitor performance in real-time and catch errors early");
    expect(doc).toContain("Own Your Data");
    expect(doc).toContain("Self Hostable");
    expect(doc).toContain("1-line Integration");
    expect(doc).toContain("Prompt Templates");
    expect(doc).toContain("Chat Replays");
    expect(doc).toContain("Analytics");
    expect(doc).toContain("Topic Classification");
    expect(doc).toContain("Agent Tracing");
    expect(doc).toContain("Custom Dashboards");
    expect(doc).toContain("Score LLM responses");
    expect(doc).toContain("PII Masking");
    expect(doc).toContain("Feedback Tracking");
    expect(doc).toContain("Debug LLM agents");
    expect(doc).toContain("Log all your prompts and results");
    expect(doc).toContain("agents are performing in production");
    expect(doc).toContain("Traces & error stack traces");
    expect(doc).toContain("Label data for fine-tuning");
    expect(doc).toContain("Model usages & costs");
    expect(doc).toContain("User satisfaction");
    expect(doc).toContain("A/B testing");
    expect(doc).toContain("SOC 2 Type II and ISO 27001 certified");
    expect(doc).toContain("RBAC and SSO");
    expect(doc).toContain("Hosted in your Cloud");
    expect(doc).toContain("Any LLM. Any framework");
    expect(doc).toContain("Human reviews");
    expect(doc).toContain("Alerts system");
    expect(doc).toContain("Observability Monitor and debug your LLM calls and agents");
    expect(doc).toContain("Chats Track chatbot conversations and user feedback");
    expect(doc).toContain("Prompts Collaborate on prompt templates with versioning");
    expect(doc).toContain("Classification Setup topics classification for your chats");
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

  it("accepts Lunary context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0953-lunary-reviewed-agent",
      runId: "run-gap-0953-question-explainability",
      generatedAt: "2026-06-22T18:53:00.000Z",
      sourceRefs: [URL, DOCS_URL, "amc:no-lunary-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0953-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0953-question-trace",
              event_type: "test",
              session_id: "session-gap0953-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0953-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0953-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0953-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0953-lunary-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0953-metadata",
                event_type: "review",
                session_id: "session-gap0953-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "Lunary product/docs metadata identifies relevant competitor context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0953-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0953-question-trace", "ev-gap0953-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0953-lunary-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep Lunary as competitor source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0953-lunary-eval-score-pack",
              sourceRef: URL,
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0953/lunary-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0953-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0953-lunary-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0953-lunary-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.86,
              averageScore0to1: 0.9,
              threshold0to1: 0.82,
              status: "satisfied",
              evidenceRefs: ["ev-gap0953-question-trace", "ev-gap0953-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0953-lunary-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap0953-question-trace", "ev-gap0953-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0953-lunary-eval-score-pack",
          sourceRef: URL,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0953-lunary-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0953-lunary-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0953-lunary-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("competitor context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Lunary metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0953-lunary-metadata-agent",
      runId: "run-gap-0953-metadata-only",
      generatedAt: "2026-06-22T18:53:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Lunary metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0953-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0953-missing",
                event_type: "review",
                session_id: "session-gap0953-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Lunary source metadata is not question-level score explainability proof."],
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

  it("does not add Lunary identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

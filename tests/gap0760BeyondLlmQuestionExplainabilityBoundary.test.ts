import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0760-beyondllm-question-explainability.md";
const SOURCE = "https://github.com/aiplanethub/beyondllm";
const README = "https://github.com/aiplanethub/beyondllm/blob/main/README.md";
const DOCS = "https://beyondllm.aiplanet.com/";
const REPO = "aiplanethub/beyondllm";

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
    questionId: "AMC-4.1",
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.88,
    evidenceEventIds: [
      "ev-gap0760-accepted-rag-eval-row",
      "ev-gap0760-accepted-rejected-reasons",
      "ev-gap0760-accepted-repair-hint",
    ],
    flags: [],
    narrative: "BeyondLLM source-review context is bounded to AMC-owned question-level proof.",
    ...overrides,
  };
}

describe("GAP-0760 BeyondLLM question-explainability boundary", () => {
  it("documents live BeyondLLM metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0760");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(REPO);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("Build - Rapid Experiment - Evaluate - Observability");
    expect(doc).toContain("experimentation, evaluation, and deployment of RAG systems");
    expect(doc).toContain("custom data sources");
    expect(doc).toContain("document retrieval");
    expect(doc).toContain("LLM response generation");
    expect(doc).toContain("embedding evaluation");
    expect(doc).toContain("LLM response evaluation");
    expect(doc).toContain("Google Colab");
    expect(doc).toContain("YouTube RAG");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Google Gemini");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("package version `0.2.3`");
    expect(doc).toContain("Hit_rate");
    expect(doc).toContain("MRR");
    expect(doc).toContain("Context relevancy Score");
    expect(doc).toContain("Answer relevancy Score");
    expect(doc).toContain("Groundness score");
    expect(doc).toContain("RAG triad");
    expect(doc).toContain("Observer");
    expect(doc).toContain("latency and cost monitoring");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("question-level score explainability");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hints");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts BeyondLLM context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0760-beyondllm-reviewed-agent",
      runId: "run-gap-0760-question-explainability",
      generatedAt: "2026-06-21T23:00:00.000Z",
      sourceRefs: [SOURCE, README, DOCS],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0760-accepted-rag-eval-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap0760-rag-row",
              event_type: "artifact",
              session_id: "session-gap0760-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0760-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0760-rejected",
              event_type: "review",
              session_id: "session-gap0760-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0760-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0760-repair",
              event_type: "audit",
              session_id: "session-gap0760-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0760-repo-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0760-metadata",
                event_type: "review",
                session_id: "session-gap0760-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "BeyondLLM repository metadata identifies relevant RAG evaluation context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0760-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0760-accepted-rag-eval-row",
                "ev-gap0760-accepted-rejected-reasons",
                "ev-gap0760-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0760-repo-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep BeyondLLM as source-review context and rely on AMC-owned question evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
      acceptedEvidenceIds: [
        "ev-gap0760-accepted-rag-eval-row",
        "ev-gap0760-accepted-rejected-reasons",
        "ev-gap0760-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("repository metadata identifies relevant RAG evaluation context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when BeyondLLM metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0760-metadata-only-agent",
      runId: "run-gap-0760-metadata-only",
      generatedAt: "2026-06-21T23:00:00.000Z",
      sourceRefs: [SOURCE],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "BeyondLLM repository metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0760-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0760-missing",
                event_type: "review",
                session_id: "session-gap0760-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["BeyondLLM README metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "BeyondLLM README metadata is not question-level score explainability proof.",
    );
  });

  it("does not add BeyondLLM identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("beyondllm_question_explainability");
      expect(source).not.toContain("BeyondLLM");
    }
  });
});

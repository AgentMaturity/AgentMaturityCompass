import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0718-rag-driven-generative-ai-question-explainability.md";
const SOURCE = "https://github.com/Denis2054/RAG-Driven-Generative-AI";
const README = "https://github.com/Denis2054/RAG-Driven-Generative-AI/blob/main/README.md";
const REPO = "Denis2054/RAG-Driven-Generative-AI";

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
    confidence: 0.87,
    evidenceEventIds: [
      "ev-gap0718-accepted-rag-row",
      "ev-gap0718-accepted-rejected-reasons",
      "ev-gap0718-accepted-repair-hint",
    ],
    flags: [],
    narrative: "RAG-Driven-Generative-AI context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0718 RAG-Driven Generative AI question-explainability boundary", () => {
  it("documents live repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0718");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(REPO);
    expect(doc).toContain("repository id `789098173`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("size `331971`");
    expect(doc).toContain("not archived");
    expect(doc).toContain("2025-09-23T15:31:24Z");
    expect(doc).toContain("RAG-driven Generative AI, First Edition");
    expect(doc).toContain("Denis Rothman");
    expect(doc).toContain("Packt");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("Deep Lake");
    expect(doc).toContain("Pinecone");
    expect(doc).toContain("Chroma");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Hugging Face");
    expect(doc).toContain("Colab/Kaggle");
    expect(doc).toContain("adaptive RAG");
    expect(doc).toContain("knowledge-graph RAG");
    expect(doc).toContain("question-level score explainability");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts RAG notebook context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0718-rag-reviewed-agent",
      runId: "run-gap-0718-question-explainability",
      generatedAt: "2026-06-21T20:00:00.000Z",
      sourceRefs: [SOURCE, README],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0718-accepted-rag-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap0718-rag-row",
              event_type: "artifact",
              session_id: "session-gap0718-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0718-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0718-rejected",
              event_type: "review",
              session_id: "session-gap0718-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0718-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0718-repair",
              event_type: "audit",
              session_id: "session-gap0718-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0718-repo-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0718-metadata",
                event_type: "review",
                session_id: "session-gap0718-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "RAG-Driven-Generative-AI repository metadata identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0718-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0718-accepted-rag-row",
                "ev-gap0718-accepted-rejected-reasons",
                "ev-gap0718-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0718-repo-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep the RAG notebook repository as source-review context and rely on AMC-owned question evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0718-accepted-rag-row",
        "ev-gap0718-accepted-rejected-reasons",
        "ev-gap0718-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("repository metadata identifies relevant source context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when repository metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0718-metadata-only-agent",
      runId: "run-gap-0718-metadata-only",
      generatedAt: "2026-06-21T20:00:00.000Z",
      sourceRefs: [SOURCE],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "RAG repository metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0718-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0718-missing",
                event_type: "review",
                session_id: "session-gap0718-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Repository README metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "Repository README metadata is not question-level score explainability proof.",
    );
  });

  it("does not add RAG-Driven-Generative-AI identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("rag_driven_generative_ai_question_explainability");
      expect(source).not.toContain("Packt book adapter");
    }
  });
});

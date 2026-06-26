import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0898-custom-rag-evals-question-explainability.md";
const REPO = "ALucek/custom-rag-evals";
const URL = "https://github.com/ALucek/custom-rag-evals";
const TITLE = "Evaluating Domain Specific RAG Chunking & Embedding Strategies";

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
    questionId: "AMC-2.1",
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.86,
    evidenceEventIds: [
      "ev-gap0898-accepted-question-proof",
      "ev-gap0898-accepted-rejected-reasons",
      "ev-gap0898-accepted-repair-hint",
    ],
    flags: [],
    narrative: "custom-rag-evals source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0898 custom-rag-evals question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0898");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 18");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("2 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Jupyter Notebook 100.0%");
    expect(doc).toContain("domain_specific");
    expect(doc).toContain("media_2");
    expect(doc).toContain("chunking_evals.ipynb");
    expect(doc).toContain("Applying domain specific evaluations");
    expect(doc).toContain("RAG chunking");
    expect(doc).toContain("embedding functions");
    expect(doc).toContain("ChromaDB");
    expect(doc).toContain("Evaluating Chunking Strategies for Retrieval");
    expect(doc).toContain("text-embedding-3-large");
    expect(doc).toContain("Cluster Semantic Chunker");
    expect(doc).toContain("200 token chunk size");
    expect(doc).toContain("precision");
    expect(doc).toContain("recall");
    expect(doc).toContain("intersection over union");
    expect(doc).toContain("LLM Chunker");
    expect(doc).toContain("Recursive Character Text Splitter");
    expect(doc).toContain("custom chunking strategies");
    expect(doc).toContain("embedding strategies");
    expect(doc).toContain("synthetic dataset");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts custom-rag-evals context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0898-custom-rag-evals-reviewed-agent",
      runId: "run-gap-0898-question-explainability",
      generatedAt: "2026-06-22T20:45:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            { id: "ev-gap0898-accepted-question-proof", event_hash: hash("a"), writer_sig: "sig-gap0898-question-proof", event_type: "artifact", session_id: "session-gap0898-question", ts: 1, trustTier: "OBSERVED" },
            { id: "ev-gap0898-accepted-rejected-reasons", event_hash: hash("b"), writer_sig: "sig-gap0898-rejected", event_type: "review", session_id: "session-gap0898-reasons", ts: 2, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0898-accepted-repair-hint", event_hash: hash("c"), writer_sig: "sig-gap0898-repair", event_type: "audit", session_id: "session-gap0898-repair", ts: 3, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0898-source-metadata-only", event_hash: hash("d"), writer_sig: "sig-gap0898-metadata", event_type: "review", session_id: "session-gap0898-source", ts: 4, trustTier: "ATTESTED" },
              reason: "custom-rag-evals source metadata identifies relevant RAG chunking context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0898-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0898-accepted-question-proof", "ev-gap0898-accepted-rejected-reasons", "ev-gap0898-accepted-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap0898-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep RAG chunking and embedding metadata as source-review context and rely on AMC-owned accepted evidence, rejected reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.1",
      status: "passed",
      acceptedEvidenceIds: [
        "ev-gap0898-accepted-question-proof",
        "ev-gap0898-accepted-rejected-reasons",
        "ev-gap0898-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant RAG chunking context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when custom-rag-evals metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0898-metadata-only-agent",
      runId: "run-gap-0898-metadata-only",
      generatedAt: "2026-06-22T20:45:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "custom-rag-evals source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0898-missing-amc-question-proof", event_hash: hash("e"), writer_sig: "sig-gap0898-missing", event_type: "review", session_id: "session-gap0898-source", ts: 1, trustTier: "ATTESTED" },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/RAG-chunking metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/RAG-chunking metadata is not question-level score explainability proof.",
    );
  });

  it("does not add custom-rag-evals identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("custom_rag_evals_question_explainability");
    }
  });
});

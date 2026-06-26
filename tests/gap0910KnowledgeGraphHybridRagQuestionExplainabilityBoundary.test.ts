import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0910-knowledge-graph-hybrid-rag-question-explainability.md";
const REPO = "safishamsi/Knowledge-Graph-Based-Hybrid-RAG-System";
const URL = "https://github.com/safishamsi/Knowledge-Graph-Based-Hybrid-RAG-System";
const TITLE = "Knowledge Graph-Based Hybrid RAG System";

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
    confidence: 0.87,
    evidenceEventIds: [
      "ev-gap0910-accepted-question-proof",
      "ev-gap0910-accepted-rejected-reasons",
      "ev-gap0910-accepted-repair-hint",
    ],
    flags: [],
    narrative: "Knowledge Graph Hybrid RAG source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0910 Knowledge Graph Hybrid RAG question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0910");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 6");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("67 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("Data");
    expect(doc).toContain("Dissertation");
    expect(doc).toContain("Neo4jKG");
    expect(doc).toContain("RAG");
    expect(doc).toContain("embeddings");
    expect(doc).toContain("scopusscraping");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("LLMpoweredRAG.py");
    expect(doc).toContain("README_template.md");
    expect(doc).toContain("demowithinspector.pdf");
    expect(doc).toContain("queries.txt");
    expect(doc).toContain("uobkg.png");
    expect(doc).toContain("Academic search system");
    expect(doc).toContain("citation bias");
    expect(doc).toContain("hallucinations");
    expect(doc).toContain("NDCG@10: 0.814");
    expect(doc).toContain("57.5% reduction");
    expect(doc).toContain("67% fewer hallucinations");
    expect(doc).toContain("Sub-500ms");
    expect(doc).toContain("Neo4j");
    expect(doc).toContain("61,945 papers");
    expect(doc).toContain("189,972 authors");
    expect(doc).toContain("SBERT + FAISS indexing");
    expect(doc).toContain("LangChain/LangGraph + Claude-3.5-Sonnet");
    expect(doc).toContain("Scopus API");
    expect(doc).toContain("82% researcher preference");
    expect(doc).toContain("64% reduction");
    expect(doc).toContain("96% cost reduction");
    expect(doc).toContain("GPT-4");
    expect(doc).toContain("Anthropic API key");
    expect(doc).toContain("AcademicSearchSystem");
    expect(doc).toContain("find_collaborators");
    expect(doc).toContain("analyze_trends");
    expect(doc).toContain("University of Birmingham");
    expect(doc).toContain("Prof. Dr. Paolo Missier");
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

  it("accepts Knowledge Graph Hybrid RAG context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0910-kg-hybrid-rag-reviewed-agent",
      runId: "run-gap-0910-question-explainability",
      generatedAt: "2026-06-22T22:10:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            { id: "ev-gap0910-accepted-question-proof", event_hash: hash("a"), writer_sig: "sig-gap0910-question-proof", event_type: "artifact", session_id: "session-gap0910-question", ts: 1, trustTier: "OBSERVED" },
            { id: "ev-gap0910-accepted-rejected-reasons", event_hash: hash("b"), writer_sig: "sig-gap0910-rejected", event_type: "review", session_id: "session-gap0910-reasons", ts: 2, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0910-accepted-repair-hint", event_hash: hash("c"), writer_sig: "sig-gap0910-repair", event_type: "audit", session_id: "session-gap0910-repair", ts: 3, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0910-source-metadata-only", event_hash: hash("d"), writer_sig: "sig-gap0910-metadata", event_type: "review", session_id: "session-gap0910-source", ts: 4, trustTier: "ATTESTED" },
              reason: "Knowledge Graph Hybrid RAG source metadata identifies relevant RAG evidence context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0910-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0910-accepted-question-proof", "ev-gap0910-accepted-rejected-reasons", "ev-gap0910-accepted-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap0910-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep Neo4j/LangChain/LangGraph/Claude/Scopus metadata as source-review context and rely on AMC-owned accepted evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0910-accepted-question-proof",
        "ev-gap0910-accepted-rejected-reasons",
        "ev-gap0910-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant RAG evidence context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Knowledge Graph Hybrid RAG metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0910-metadata-only-agent",
      runId: "run-gap-0910-metadata-only",
      generatedAt: "2026-06-22T22:10:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Knowledge Graph Hybrid RAG source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0910-missing-amc-question-proof", event_hash: hash("e"), writer_sig: "sig-gap0910-missing", event_type: "review", session_id: "session-gap0910-source", ts: 1, trustTier: "ATTESTED" },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/Neo4j/LangChain/LangGraph/Scopus metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/Neo4j/LangChain/LangGraph/Scopus metadata is not question-level score explainability proof.",
    );
  });

  it("does not add Knowledge Graph Hybrid RAG identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("knowledge_graph_hybrid_rag_question_explainability");
    }
  });
});

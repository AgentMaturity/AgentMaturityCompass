import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0901-msmarco-genqa-question-explainability.md";
const REPO = "GioiaZheng/msmarco-genqa";
const URL = "https://github.com/GioiaZheng/msmarco-genqa";
const TITLE = "MS MARCO GenQA";

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
      "ev-gap0901-accepted-question-proof",
      "ev-gap0901-accepted-rejected-reasons",
      "ev-gap0901-accepted-repair-hint",
    ],
    flags: [],
    narrative: "msmarco-genqa source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0901 msmarco-genqa question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0901");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 18");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 34");
    expect(doc).toContain("Pull requests 5");
    expect(doc).toContain("187 Commits");
    expect(doc).toContain(".github");
    expect(doc).toContain("configs");
    expect(doc).toContain("data");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("experiments");
    expect(doc).toContain("figures");
    expect(doc).toContain("notebooks");
    expect(doc).toContain("outputs");
    expect(doc).toContain("reports");
    expect(doc).toContain("scripts");
    expect(doc).toContain("src");
    expect(doc).toContain("tests");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("REPRODUCIBILITY.md");
    expect(doc).toContain("RESULTS.md");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("metadata.json");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("requirements-lock.txt");
    expect(doc).toContain("MS MARCO");
    expect(doc).toContain("retrieval-augmented QA pipeline");
    expect(doc).toContain("lexical retrieval");
    expect(doc).toContain("dense retrieval");
    expect(doc).toContain("cross-encoder reranking");
    expect(doc).toContain("generation");
    expect(doc).toContain("statistical evaluation");
    expect(doc).toContain("grounding analysis");
    expect(doc).toContain("6,980 queries");
    expect(doc).toContain("Token-F1");
    expect(doc).toContain("ROUGE-L");
    expect(doc).toContain("paired-bootstrap 95% CIs");
    expect(doc).toContain("query-level diagnostics");
    expect(doc).toContain("BERTScore proxy");
    expect(doc).toContain("RAG triad reporting");
    expect(doc).toContain("regression taxonomy");
    expect(doc).toContain("manifest.json");
    expect(doc).toContain("output hashes");
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

  it("accepts MS MARCO GenQA context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0901-msmarco-genqa-reviewed-agent",
      runId: "run-gap-0901-question-explainability",
      generatedAt: "2026-06-22T21:15:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            { id: "ev-gap0901-accepted-question-proof", event_hash: hash("a"), writer_sig: "sig-gap0901-question-proof", event_type: "artifact", session_id: "session-gap0901-question", ts: 1, trustTier: "OBSERVED" },
            { id: "ev-gap0901-accepted-rejected-reasons", event_hash: hash("b"), writer_sig: "sig-gap0901-rejected", event_type: "review", session_id: "session-gap0901-reasons", ts: 2, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0901-accepted-repair-hint", event_hash: hash("c"), writer_sig: "sig-gap0901-repair", event_type: "audit", session_id: "session-gap0901-repair", ts: 3, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0901-source-metadata-only", event_hash: hash("d"), writer_sig: "sig-gap0901-metadata", event_type: "review", session_id: "session-gap0901-source", ts: 4, trustTier: "ATTESTED" },
              reason: "msmarco-genqa source metadata identifies relevant RAG evaluation context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0901-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0901-accepted-question-proof", "ev-gap0901-accepted-rejected-reasons", "ev-gap0901-accepted-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap0901-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep MS MARCO RAG evaluation metadata as source-review context and rely on AMC-owned accepted evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0901-accepted-question-proof",
        "ev-gap0901-accepted-rejected-reasons",
        "ev-gap0901-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant RAG evaluation context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when msmarco-genqa metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0901-metadata-only-agent",
      runId: "run-gap-0901-metadata-only",
      generatedAt: "2026-06-22T21:15:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "msmarco-genqa source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0901-missing-amc-question-proof", event_hash: hash("e"), writer_sig: "sig-gap0901-missing", event_type: "review", session_id: "session-gap0901-source", ts: 1, trustTier: "ATTESTED" },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/MS-MARCO/RAG-evaluation metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/MS-MARCO/RAG-evaluation metadata is not question-level score explainability proof.",
    );
  });

  it("does not add msmarco-genqa identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("msmarco_genqa_question_explainability");
    }
  });
});

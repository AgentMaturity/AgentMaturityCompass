import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0698-academic-library-reference-question-explainability-unavailable.md";
const DOI = "10.1108/rsr-05-2025-0030";
const OPENALEX = "W7125387752";
const TITLE = "Deploying and evaluating a conversational agent using LLMs for academic library reference";

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
    confidence: 0.86,
    evidenceEventIds: [
      "ev-gap0698-accepted-eval-row",
      "ev-gap0698-accepted-rejected-reasons",
      "ev-gap0698-accepted-repair-hint",
    ],
    flags: [],
    narrative: "Academic-library reference context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0698 academic library reference question-explainability unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0698");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, and publisher-domain searches");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("Agent evaluation and benchmarks");
    expect(doc).toContain("question-level score explainability");
    expect(doc).toContain("academic-library RAG/chatbot evaluation context");
    expect(doc).toContain("skipped as product-changing evidence");
    expect(doc).toContain("No `src/diagnostic/questionScoreExplainability.ts`");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts academic-library context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0698-library-reference-reviewed-agent",
      runId: "run-gap-0698-question-explainability",
      generatedAt: "2026-06-21T12:10:00.000Z",
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0698-accepted-eval-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap0698-eval-row",
              event_type: "artifact",
              session_id: "session-gap0698-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0698-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0698-rejected",
              event_type: "review",
              session_id: "session-gap0698-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0698-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0698-repair",
              event_type: "audit",
              session_id: "session-gap0698-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0698-paper-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0698-metadata",
                event_type: "review",
                session_id: "session-gap0698-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Academic-library paper metadata identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0698-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0698-accepted-eval-row",
                "ev-gap0698-accepted-rejected-reasons",
                "ev-gap0698-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0698-paper-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep the unavailable paper as source-review context and rely on AMC-owned question evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0698-accepted-eval-row",
        "ev-gap0698-accepted-rejected-reasons",
        "ev-gap0698-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("paper metadata identifies relevant source context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0698-metadata-only-agent",
      runId: "run-gap-0698-metadata-only",
      generatedAt: "2026-06-21T12:10:00.000Z",
      sourceRefs: [`doi:${DOI}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Academic-library paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0698-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0698-missing",
                event_type: "review",
                session_id: "session-gap0698-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Paper DOI/OpenAlex/title metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "Paper DOI/OpenAlex/title metadata is not question-level score explainability proof.",
    );
  });

  it("does not add academic-library identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("academic_library_reference_question_explainability");
      expect(source).not.toContain("Emerald importer");
    }
  });
});

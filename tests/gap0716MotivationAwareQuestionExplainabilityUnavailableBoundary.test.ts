import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0716-motivation-aware-ai-coaching-question-explainability-unavailable.md";
const DOI = "10.1145/3772318.3791123";
const OPENALEX = "W7154052379";
const TITLE = "An LLM-Based Motivation-Aware Framework For AI Coaching For Behaviour Change";

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
      "ev-gap0716-accepted-question-row",
      "ev-gap0716-accepted-rejected-reasons",
      "ev-gap0716-accepted-repair-hint",
    ],
    flags: [],
    narrative: "Motivation-aware coaching context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0716 motivation-aware coaching question-explainability unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0716");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("ACM DOI page");
    expect(doc).toContain("OpenAlex id search");
    expect(doc).toContain("shorter title-fragment search");
    expect(doc).toContain("question-level score explainability");
    expect(doc).toContain("motivational interviewing");
    expect(doc).toContain("behaviour change");
    expect(doc).toContain("health coaching");
    expect(doc).toContain("skipped as product-changing question-explainability evidence");
    expect(doc).toContain("No `src/diagnostic/questionScoreExplainability.ts`");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts AI-coaching context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0716-coaching-reviewed-agent",
      runId: "run-gap-0716-question-explainability",
      generatedAt: "2026-06-21T19:05:00.000Z",
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0716-accepted-question-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap0716-question-row",
              event_type: "artifact",
              session_id: "session-gap0716-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0716-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0716-rejected",
              event_type: "review",
              session_id: "session-gap0716-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0716-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0716-repair",
              event_type: "audit",
              session_id: "session-gap0716-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0716-paper-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0716-metadata",
                event_type: "review",
                session_id: "session-gap0716-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Motivation-aware coaching paper metadata identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0716-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0716-accepted-question-row",
                "ev-gap0716-accepted-rejected-reasons",
                "ev-gap0716-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0716-paper-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep the unavailable AI-coaching paper as source-review context and rely on AMC-owned question evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0716-accepted-question-row",
        "ev-gap0716-accepted-rejected-reasons",
        "ev-gap0716-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("paper metadata identifies relevant source context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0716-metadata-only-agent",
      runId: "run-gap-0716-metadata-only",
      generatedAt: "2026-06-21T19:05:00.000Z",
      sourceRefs: [`doi:${DOI}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Motivation-aware coaching paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0716-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0716-missing",
                event_type: "review",
                session_id: "session-gap0716-source",
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

  it("does not add AI-coaching identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("motivation_aware_coaching_question_explainability");
      expect(source).not.toContain("motivational_interviewing_importer");
    }
  });
});

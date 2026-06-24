import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0768-cogtrust-question-explainability-unavailable.md";
const DOI = "10.1016/j.eswa.2026.131535";
const OPENALEX = "W7128157408";
const TITLE = "CogTrust: Cognitive Logic-Based framework for dynamic trust evaluation in multi-agent systems";

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
      "ev-gap0768-accepted-eval-row",
      "ev-gap0768-accepted-rejected-reasons",
      "ev-gap0768-accepted-repair-hint",
    ],
    flags: [],
    narrative: "CogTrust dynamic-trust context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0768 CogTrust question-explainability unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0768");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, and CogTrust multi-agent trust searches");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("direct DOI opening was blocked");
    expect(doc).toContain("question-level score explainability");
    expect(doc).toContain("dynamic trust");
    expect(doc).toContain("multi-agent evaluation");
    expect(doc).toContain("reputation");
    expect(doc).toContain("trustworthiness");
    expect(doc).toContain("computational trust");
    expect(doc).toContain("No `src/diagnostic/questionScoreExplainability.ts`");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts CogTrust context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0768-cogtrust-reviewed-agent",
      runId: "run-gap-0768-question-explainability",
      generatedAt: "2026-06-21T14:28:00.000Z",
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0768-accepted-eval-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap0768-eval-row",
              event_type: "artifact",
              session_id: "session-gap0768-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0768-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0768-rejected",
              event_type: "review",
              session_id: "session-gap0768-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0768-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0768-repair",
              event_type: "audit",
              session_id: "session-gap0768-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0768-paper-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0768-metadata",
                event_type: "review",
                session_id: "session-gap0768-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "CogTrust paper metadata identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0768-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0768-accepted-eval-row",
                "ev-gap0768-accepted-rejected-reasons",
                "ev-gap0768-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0768-paper-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep the unavailable CogTrust source as context and rely on AMC-owned question evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0768-accepted-eval-row",
        "ev-gap0768-accepted-rejected-reasons",
        "ev-gap0768-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("paper metadata identifies relevant source context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when CogTrust metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0768-metadata-only-agent",
      runId: "run-gap-0768-metadata-only",
      generatedAt: "2026-06-21T14:28:00.000Z",
      sourceRefs: [`doi:${DOI}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "CogTrust paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0768-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0768-missing",
                event_type: "review",
                session_id: "session-gap0768-source",
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

  it("does not add CogTrust identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("cogtrust_question_explainability");
      expect(source).not.toContain("cognitive-logic trust engine");
    }
  });
});

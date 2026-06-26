import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0699-tee-adaptation-question-explainability-unavailable.md";
const DOI = "10.1109/tse.2026.3655766";
const OPENALEX = "W4407764161";
const TITLE = "Automated TEE Adaptation With LLMs: Identifying, Transforming, and Porting Sensitive Functions in Programs";

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
    confidence: 0.85,
    evidenceEventIds: [
      "ev-gap0699-accepted-sensitive-review",
      "ev-gap0699-accepted-rejected-reasons",
      "ev-gap0699-accepted-repair-hint",
    ],
    flags: [],
    narrative: "TEE adaptation context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0699 TEE adaptation question-explainability unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0699");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, IEEE publisher-domain");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("computer security");
    expect(doc).toContain("TEE adaptation with LLMs");
    expect(doc).toContain("question-level score explainability");
    expect(doc).toContain("skipped as product-changing evidence");
    expect(doc).toContain("No `src/diagnostic/questionScoreExplainability.ts`");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts TEE context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0699-tee-reviewed-agent",
      runId: "run-gap-0699-question-explainability",
      generatedAt: "2026-06-21T12:35:00.000Z",
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0699-accepted-sensitive-review",
              event_hash: hash("a"),
              writer_sig: "sig-gap0699-sensitive-review",
              event_type: "artifact",
              session_id: "session-gap0699-review",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0699-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0699-rejected",
              event_type: "review",
              session_id: "session-gap0699-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0699-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0699-repair",
              event_type: "audit",
              session_id: "session-gap0699-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0699-paper-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0699-metadata",
                event_type: "review",
                session_id: "session-gap0699-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "TEE adaptation paper metadata identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0699-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0699-accepted-sensitive-review",
                "ev-gap0699-accepted-rejected-reasons",
                "ev-gap0699-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0699-paper-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep the unavailable TEE paper as source-review context and rely on AMC-owned question evidence, rejected reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0699-accepted-sensitive-review",
        "ev-gap0699-accepted-rejected-reasons",
        "ev-gap0699-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("paper metadata identifies relevant source context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when TEE paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0699-metadata-only-agent",
      runId: "run-gap-0699-metadata-only",
      generatedAt: "2026-06-21T12:35:00.000Z",
      sourceRefs: [`doi:${DOI}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "TEE paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0699-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0699-missing",
                event_type: "review",
                session_id: "session-gap0699-source",
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

  it("does not add TEE identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("tee_adaptation_question_explainability");
      expect(source).not.toContain("Trusted Execution Environment adapter");
    }
  });
});

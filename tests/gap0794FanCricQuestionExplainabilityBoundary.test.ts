import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0794-fancric-question-explainability.md";
const ARXIV = "https://arxiv.org/abs/2410.01307";
const ARXIV_DOI = "10.48550/arXiv.2410.01307";
const RELATED_DOI = "10.1007/978-981-95-5441-6_23";
const OPENALEX = "W7128785636";
const TITLE = "Multi-agentic Framework for Crafting Fantasy 11 Cricket Teams";

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
      "ev-gap0794-accepted-question-proof",
      "ev-gap0794-accepted-rejected-reasons",
      "ev-gap0794-accepted-repair-hint",
    ],
    flags: [],
    narrative: "FanCric fantasy-cricket source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0794 FanCric question-explainability boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0794");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain(RELATED_DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("FanCric");
    expect(doc).toContain("submitted `2 Oct 2024`");
    expect(doc).toContain("Mohit Bhatnagar");
    expect(doc).toContain("IPL");
    expect(doc).toContain("Dream11");
    expect(doc).toContain("fantasy cricket");
    expect(doc).toContain("Large Language Models");
    expect(doc).toContain("orchestration framework");
    expect(doc).toContain("12.7 million unique entries");
    expect(doc).toContain("wisdom of crowds");
    expect(doc).toContain("Prompt Engineering");
    expect(doc).toContain("ablation studies");
    expect(doc).toContain("question ID");
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

  it("accepts fantasy-cricket context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0794-fancric-reviewed-agent",
      runId: "run-gap-0794-question-explainability",
      generatedAt: "2026-06-21T19:45:00.000Z",
      sourceRefs: [ARXIV, `doi:${ARXIV_DOI}`, `doi:${RELATED_DOI}`, `openalex:${OPENALEX}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0794-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0794-question-proof",
              event_type: "artifact",
              session_id: "session-gap0794-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0794-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0794-rejected",
              event_type: "review",
              session_id: "session-gap0794-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0794-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0794-repair",
              event_type: "audit",
              session_id: "session-gap0794-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0794-fancric-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0794-metadata",
                event_type: "review",
                session_id: "session-gap0794-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "FanCric paper metadata identifies relevant fantasy-cricket multi-agent context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0794-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0794-accepted-question-proof",
                "ev-gap0794-accepted-rejected-reasons",
                "ev-gap0794-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0794-fancric-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep FanCric as fantasy-sports benchmark context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0794-accepted-question-proof",
        "ev-gap0794-accepted-rejected-reasons",
        "ev-gap0794-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("paper metadata identifies relevant fantasy-cricket multi-agent context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when FanCric metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0794-metadata-only-agent",
      runId: "run-gap-0794-metadata-only",
      generatedAt: "2026-06-21T19:45:00.000Z",
      sourceRefs: [ARXIV],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "FanCric paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0794-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0794-missing",
                event_type: "review",
                session_id: "session-gap0794-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["arXiv/DOI/OpenAlex/title metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "arXiv/DOI/OpenAlex/title metadata is not question-level score explainability proof.",
    );
  });

  it("does not add FanCric identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(RELATED_DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("fancric_question_explainability");
      expect(source).not.toContain("Fantasy 11 Cricket Teams");
    }
  });
});

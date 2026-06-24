import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0817-chain-centric-question-explainability.md";
const DOI = "10.5281/zenodo.20439911";
const ZENODO_RECORD = "20439912";
const OPENALEX = "W7162762070";
const TITLE = "Chain-Centric Multi-Agent Framework: Layer-Separated LLM Collaboration Without Subjective Confidence Evaluation";

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
    confidence: 0.88,
    evidenceEventIds: [
      "ev-gap0817-accepted-question-proof",
      "ev-gap0817-accepted-rejected-reasons",
      "ev-gap0817-accepted-repair-hint",
    ],
    flags: [],
    narrative: "Chain-Centric source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0817 Chain-Centric question-explainability boundary", () => {
  it("documents DOI alias retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0817");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("same live source reviewed for GAP-0816");
    expect(doc).toContain("DOI returned HTTP 302");
    expect(doc).toContain("/records/20439912");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP 200");
    expect(doc).toContain("No abstract in OpenAlex metadata");
    expect(doc).toContain("layer-separated LLM collaboration");
    expect(doc).toContain("subjective confidence evaluation");
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

  it("accepts Chain-Centric context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0817-chain-centric-reviewed-agent",
      runId: "run-gap-0817-question-explainability",
      generatedAt: "2026-06-21T23:17:00.000Z",
      sourceRefs: [`https://doi.org/${DOI}`, `https://zenodo.org/records/${ZENODO_RECORD}`, `https://openalex.org/${OPENALEX}`],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0817-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0817-question-proof",
              event_type: "artifact",
              session_id: "session-gap0817-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0817-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0817-rejected",
              event_type: "review",
              session_id: "session-gap0817-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0817-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0817-repair",
              event_type: "audit",
              session_id: "session-gap0817-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0817-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0817-metadata",
                event_type: "review",
                session_id: "session-gap0817-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Chain-Centric source metadata identifies relevant multi-agent collaboration context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0817-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0817-accepted-question-proof",
                "ev-gap0817-accepted-rejected-reasons",
                "ev-gap0817-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0817-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep Chain-Centric framework metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0817-accepted-question-proof",
        "ev-gap0817-accepted-rejected-reasons",
        "ev-gap0817-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant multi-agent collaboration context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Chain-Centric metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0817-metadata-only-agent",
      runId: "run-gap-0817-metadata-only",
      generatedAt: "2026-06-21T23:17:00.000Z",
      sourceRefs: [`https://doi.org/${DOI}`],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Chain-Centric source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0817-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0817-missing",
                event_type: "review",
                session_id: "session-gap0817-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["DOI/Zenodo/OpenAlex/title/Chain-Centric metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "DOI/Zenodo/OpenAlex/title/Chain-Centric metadata is not question-level score explainability proof.",
    );
  });

  it("does not add Chain-Centric identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("chain_centric_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});

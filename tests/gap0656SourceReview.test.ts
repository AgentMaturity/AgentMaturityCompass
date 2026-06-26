import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOI_REF = "https://doi.org/10.3389/fdgth.2026.1756555";
const OPENALEX_REF = "https://openalex.org/W7139053837";

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) throw new Error(`missing test question ${id}`);
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-1.3",
    claimedLevel: 4,
    supportedMaxLevel: 0,
    finalLevel: 0,
    confidence: 0.31,
    evidenceEventIds: [],
    flags: ["FLAG_UNSUPPORTED_CLAIM"],
    narrative: "GAP-0656 healthcare harmonization metadata is source-review context only, not AMC-owned question-score evidence.",
    ...overrides,
  };
}

describe("GAP-0656 healthcare harmonization source review", () => {
  it("documents the weak relevance and no-bloat boundary", () => {
    const doc = readFileSync(
      "docs/source-reviews/GAP-0656-healthcare-harmonization-score-explainability.md",
      "utf8",
    );

    expect(doc).toContain("Metadata facts hash: `36fbaf604f508038d84a61bc8de394e01b5252a5d163ad171903d080651f6393`");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("Weakly relevant, but not implementation-relevant by itself");
    expect(doc).toContain("DOI/OpenAlex/Crossref metadata alone remains rejected as Score/Shield/Watch evidence");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("No healthcare ontology/federated-learning subsystem");
  });

  it("keeps DOI/OpenAlex metadata fail-closed without AMC-owned question-score evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0656-healthcare-harmonization-agent",
      runId: "run-gap-0656-healthcare-harmonization-source-review",
      generatedAt: "2026-06-21T00:00:00.000Z",
      sourceRefs: [DOI_REF, OPENALEX_REF],
      rows: [
        {
          question: question("AMC-1.3"),
          score: score(),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap-0656-paper-metadata-only",
                event_hash: "6".repeat(64),
                writer_sig: "sig-gap-0656-source-review",
                event_type: "review",
                session_id: "session-gap-0656-source-review",
                ts: 65,
                trustTier: "ATTESTED",
              },
              reason:
                "DOI/OpenAlex/Crossref metadata is healthcare harmonization context only; it lacks AMC-owned question IDs, accepted evidence IDs, signed rows, eval-pack hashes, thresholds, and release-gate repair hints.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0656-question-score-source-boundary",
              criterionType: "policy_gate",
              status: "missing",
              evidenceRefs: [],
              rejectedEvidenceRefs: ["ev-gap-0656-paper-metadata-only"],
              judgeRef: "judge://amc/gap-0656-source-review-boundary",
              repairHint:
                "Supply AMC-owned question-score explainability receipts before using healthcare harmonization metadata as Score/Shield/Watch evidence.",
            },
          ],
          missingGateReasons: [
            "metadata-only source review lacks AMC-owned question-score explainability receipts",
          ],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.sourceRefs).toEqual([DOI_REF, OPENALEX_REF]);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.3",
      status: "unsupported_claim",
      acceptedEvidenceIds: [],
      missingGateReasons: [
        "metadata-only source review lacks AMC-owned question-score explainability receipts",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]).toMatchObject({
      evidenceId: "ev-gap-0656-paper-metadata-only",
      reason: expect.stringContaining("metadata is healthcare harmonization context only"),
    });
    expect(pack).toMatchObject({
      sourceRefs: [DOI_REF, OPENALEX_REF],
      sourceRefCount: 2,
      replayable: false,
      failClosed: true,
    });
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.3",
      acceptedEvidenceIds: [],
      rejectedEvidenceReasons: [
        expect.objectContaining({ evidenceId: "ev-gap-0656-paper-metadata-only" }),
      ],
      status: "fail_closed",
      reproducibleEvalPacks: [],
      failClosedThresholds: [],
    });
  });
});

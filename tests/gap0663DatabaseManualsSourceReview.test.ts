import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOI_REF = "https://doi.org/10.14778/3797919.3797940";
const OPENALEX_REF = "https://openalex.org/W7140756610";
const CROSSREF_REF = "https://api.crossref.org/works/10.14778/3797919.3797940";
const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0663-database-manuals-score-explainability.md";

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
    confidence: 0.28,
    evidenceEventIds: [],
    flags: ["FLAG_UNSUPPORTED_CLAIM"],
    narrative:
      "GAP-0663 database-configuration paper metadata is source-review context only, not AMC-owned question-score evidence.",
    ...overrides,
  };
}

describe("GAP-0663 database-manual/configuration-tuning source review", () => {
  it("documents live DOI/OpenAlex/Crossref metadata, relevance decision, and no-bloat boundary", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("Metadata facts hash: `5e5c63c2b0d91db8db4a922714d9c0698272728d143a230715a8f878367a35e9`");
    expect(doc).toContain("W7140756610");
    expect(doc).toContain("10.14778/3797919.3797940");
    expect(doc).toContain("Why Database Manuals are Not Enough: Efficient and Reliable Configuration Tuning for DBMSs via Code-Driven LLM Agents");
    expect(doc).toContain("Proceedings of the VLDB Endowment");
    expect(doc).toContain("DOI CSL raw SHA-256 | `9a1e65ca5363744879620cdc8b0e6119b2ef07eb63e5b10cd85ddb11bb040fe3`");
    expect(doc).toContain("Crossref raw SHA-256 | `8eab6269d2ffb6a5f19e97ede7e0383661c94daabba1f7337671e1cd0e1bcc96`");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("Not relevant enough to bind as question-level score explainability evidence");
    expect(doc).toContain("DOI/OpenAlex/Crossref metadata alone remains rejected as Score, Shield, or Watch evidence");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("No database-manual subsystem, DBMS configuration-tuning subsystem");
    expect(doc).toContain("No paper prose, abstract text, figures, tables, benchmark rows, tuning rules");
  });

  it("keeps metadata-only citation fail-closed in existing question-score explainability packs", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0663-database-manuals-agent",
      runId: "run-gap-0663-database-manuals-source-review",
      generatedAt: "2026-06-21T04:54:17.000Z",
      sourceRefs: [DOI_REF, OPENALEX_REF, CROSSREF_REF],
      rows: [
        {
          question: question("AMC-1.3"),
          score: score(),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap-0663-paper-metadata-only",
                event_hash: "6".repeat(64),
                writer_sig: "sig-gap-0663-source-review",
                event_type: "review",
                session_id: "session-gap-0663-source-review",
                ts: 663,
                trustTier: "ATTESTED",
              },
              reason:
                "DOI/OpenAlex/Crossref metadata is DBMS configuration-tuning context only; it lacks AMC-owned question IDs, accepted evidence IDs, signed rows, eval-pack hashes, thresholds, rejected-evidence ledgers, and release-gate repair hints.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0663-question-score-source-boundary",
              criterionType: "policy_gate",
              status: "missing",
              evidenceRefs: [],
              rejectedEvidenceRefs: ["ev-gap-0663-paper-metadata-only"],
              judgeRef: "judge://amc/gap-0663-source-review-boundary",
              repairHint:
                "Supply AMC-owned question-score explainability receipts before using database configuration-tuning metadata as Score/Shield/Watch evidence.",
            },
          ],
          missingGateReasons: [
            "metadata-only database configuration-tuning source review lacks AMC-owned question-score explainability receipts",
          ],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.sourceRefs).toEqual([DOI_REF, OPENALEX_REF, CROSSREF_REF]);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.3",
      status: "unsupported_claim",
      acceptedEvidenceIds: [],
      missingGateReasons: [
        "metadata-only database configuration-tuning source review lacks AMC-owned question-score explainability receipts",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]).toMatchObject({
      evidenceId: "ev-gap-0663-paper-metadata-only",
      reason: expect.stringContaining("metadata is DBMS configuration-tuning context only"),
    });
    expect(pack).toMatchObject({
      sourceRefs: [DOI_REF, OPENALEX_REF, CROSSREF_REF],
      sourceRefCount: 3,
      replayable: false,
      failClosed: true,
    });
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.3",
      acceptedEvidenceIds: [],
      rejectedEvidenceReasons: [
        expect.objectContaining({ evidenceId: "ev-gap-0663-paper-metadata-only" }),
      ],
      status: "fail_closed",
      reproducibleEvalPacks: [],
      failClosedThresholds: [],
    });
  });
});

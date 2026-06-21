import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const LOGFIRE_SOURCE_REF = "https://github.com/pydantic/logfire";
const LOGFIRE_HEAD_SHA = "ced2fd2cd866784a11b3a8520b9ce0d3989a2c2b";
const LOGFIRE_METADATA_SHA256 = "7eeed1f9e0ed18dd28d72580a873f36d4b162e420f4a64912cee5aabfaf45765";

function h(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) throw new Error(`missing test question ${id}`);
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-4.1",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.88,
    evidenceEventIds: ["ev-logfire-source-review", "ev-logfire-drilldown", "ev-logfire-signed-receipt"],
    flags: [],
    narrative: "Logfire source-review context is bounded to AMC-owned question score drilldown proof.",
    ...overrides,
  };
}

describe("GAP-0653 pydantic/logfire question-score explainability source-review boundary", () => {
  it("documents live GitHub metadata, relevance, and no-Logfire-subsystem boundaries", () => {
    const doc = readFileSync("docs/source-reviews/GAP-0653-pydantic-logfire-question-score-explainability.md", "utf8");

    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("AI observability platform for production LLM and agent systems.");
    expect(doc).toContain("Default branch | `main`");
    expect(doc).toContain(`HEAD commit | \`${LOGFIRE_HEAD_SHA}\``);
    expect(doc).toContain(`GitHub API metadata SHA-256: \`${LOGFIRE_METADATA_SHA256}\``);
    expect(doc).toContain("Score | Yes, only through existing question-score explainability rows");
    expect(doc).toContain("Shield | Yes, only when unsupported metadata-only evidence is rejected");
    expect(doc).toContain("Watch | Yes, only when caller-owned observability traces");
    expect(doc).toContain("No Logfire subsystem, SDK integration, importer, adapter, dashboard clone, parity layer");
  });

  it("accepts Logfire only through existing observability drilldown question-score proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0653-logfire-agent",
      runId: "run-gap-0653-logfire-drilldown",
      generatedAt: "2026-06-21T00:00:00.000Z",
      sourceRefs: [LOGFIRE_SOURCE_REF, "github:pydantic/logfire"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-logfire-source-review",
              event_hash: h("a"),
              writer_sig: "sig-logfire-source-review",
              event_type: "review",
              session_id: "session-gap0653-source",
              ts: 1,
              trustTier: "ATTESTED",
            },
            {
              id: "ev-logfire-drilldown",
              event_hash: h("b"),
              writer_sig: "sig-logfire-drilldown",
              event_type: "artifact",
              session_id: "session-gap0653-drilldown",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-logfire-signed-receipt",
              event_hash: h("c"),
              writer_sig: "sig-logfire-signed-receipt",
              event_type: "audit",
              session_id: "session-gap0653-receipt",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-logfire-github-metadata-only",
                event_hash: h("d"),
                writer_sig: "sig-logfire-metadata-only",
                event_type: "review",
                session_id: "session-gap0653-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Logfire GitHub metadata confirms source identity only; it lacks AMC-owned question id proof, evidence drilldown route, trace/reasoning/receipt previews, signed evidence refs, row hashes, and repair hints.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0653-logfire-existing-drilldown-boundary",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-logfire-source-review", "ev-logfire-drilldown", "ev-logfire-signed-receipt"],
              rejectedEvidenceRefs: ["ev-logfire-github-metadata-only"],
              judgeRef: "judge://amc/obs-studio-drilldown",
              repairHint: "Keep Logfire source metadata bounded to AMC-owned drilldown routes, previews, empty/error states, signed receipts, and no-copy proof.",
            },
          ],
          obsStudioDrilldownLens: [
            {
              drilldownId: "gap-0653-logfire-obs-drilldown",
              sourceRef: LOGFIRE_SOURCE_REF,
              sourceKind: "repository",
              openAlexWorkId: null,
              doi: null,
              publisherRef: null,
              titleRef: "pydantic/logfire",
              venueRef: "GitHub",
              publicationDate: null,
              uiRoutePath: "/api/v1/score/evidence-drilldown/run-gap-0653-logfire-drilldown/AMC-4.1",
              sourceArtifactLinks: [
                LOGFIRE_SOURCE_REF,
                `${LOGFIRE_SOURCE_REF}/tree/${LOGFIRE_HEAD_SHA}`,
                "docs/source-reviews/GAP-0653-pydantic-logfire-question-score-explainability.md",
              ],
              tracePreviewHash: h("1"),
              reasoningTracePreviewHash: h("2"),
              receiptPreviewHash: h("3"),
              evidencePreviewHash: h("4"),
              sourceArtifactPreviewHash: h("5"),
              emptyStateHash: h("6"),
              errorStateHash: h("7"),
              evidencePreviewState: "ready",
              evidencePreviewCount: 3,
              minEvidencePreviewCount: 2,
              sourceArtifactLinkCount: 3,
              minSourceArtifactLinkCount: 2,
              status: "satisfied",
              evidenceRefs: ["ev-logfire-source-review", "ev-logfire-drilldown", "ev-logfire-signed-receipt"],
              rejectedEvidenceRefs: ["ev-logfire-github-metadata-only"],
              repairHint: "Preserve AMC-owned source-review, drilldown route, preview hashes, empty/error-state receipts, signed evidence, and no Logfire subsystem boundary.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toEqual([LOGFIRE_SOURCE_REF, "github:pydantic/logfire"]);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-4.1",
      status: "passed",
      acceptedEvidenceIds: ["ev-logfire-source-review", "ev-logfire-drilldown", "ev-logfire-signed-receipt"],
      obsStudioDrilldownLens: [
        {
          drilldownId: "gap-0653-logfire-obs-drilldown",
          sourceRef: LOGFIRE_SOURCE_REF,
          sourceKind: "repository",
          evidencePreviewState: "ready",
          evidencePreviewCount: 3,
          minEvidencePreviewCount: 2,
          sourceArtifactLinkCount: 3,
          minSourceArtifactLinkCount: 2,
          status: "satisfied",
        },
      ],
    });
    expect(report.rows[0]?.obsStudioDrilldownLens?.[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("metadata confirms source identity only");
  });

  it("fails closed when a Logfire claim is metadata-only and lacks AMC drilldown proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0653-logfire-agent",
      runId: "run-gap-0653-logfire-metadata-only",
      generatedAt: "2026-06-21T00:00:00.000Z",
      sourceRefs: [LOGFIRE_SOURCE_REF],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            evidenceEventIds: ["ev-logfire-github-metadata-only"],
            narrative: "Metadata-only Logfire source-review proof must fail closed.",
          }),
          acceptedEvidence: [
            {
              id: "ev-logfire-github-metadata-only",
              event_hash: h("e"),
              writer_sig: "sig-logfire-metadata-only",
              event_type: "review",
              session_id: "session-gap0653-source",
              ts: 1,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-logfire-missing-drilldown-proof",
                event_hash: h("f"),
                writer_sig: "sig-logfire-missing-drilldown-proof",
                event_type: "review",
                session_id: "session-gap0653-source",
                ts: 2,
                trustTier: "ATTESTED",
              },
              reason: "Logfire metadata-only row lacked AMC evidence drilldown route, source artifact links, preview hashes, preview thresholds, empty/error-state receipts, and signed score evidence.",
            },
          ],
          obsStudioDrilldownLens: [
            {
              drilldownId: "gap-0653-logfire-metadata-only",
              sourceRef: LOGFIRE_SOURCE_REF,
              sourceKind: "repository",
              uiRoutePath: "https://github.com/pydantic/logfire",
              sourceArtifactLinks: [LOGFIRE_SOURCE_REF],
              tracePreviewHash: null,
              reasoningTracePreviewHash: null,
              receiptPreviewHash: null,
              evidencePreviewHash: null,
              sourceArtifactPreviewHash: null,
              emptyStateHash: null,
              errorStateHash: null,
              evidencePreviewState: "empty",
              evidencePreviewCount: 1,
              minEvidencePreviewCount: 2,
              sourceArtifactLinkCount: 1,
              minSourceArtifactLinkCount: 2,
              status: "satisfied",
              evidenceRefs: ["ev-logfire-github-metadata-only"],
              rejectedEvidenceRefs: ["ev-logfire-missing-drilldown-proof"],
              repairHint: "Attach AMC-owned drilldown route, trace/reasoning/receipt/evidence previews, empty/error receipts, source artifact links, and signed evidence before using this question score.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.obsStudioDrilldownLens?.[0]).toMatchObject({
      uiRoutePath: "https://github.com/pydantic/logfire",
      evidencePreviewState: "empty",
      evidencePreviewCount: 1,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 1,
      minSourceArtifactLinkCount: 2,
      tracePreviewHash: null,
      emptyStateHash: null,
      errorStateHash: null,
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("metadata-only row lacked AMC evidence drilldown route");
  });
});

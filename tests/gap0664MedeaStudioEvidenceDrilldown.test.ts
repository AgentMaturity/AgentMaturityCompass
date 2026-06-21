import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const MEDEA_OPENALEX = "https://openalex.org/W7125151103";
const MEDEA_DOI = "https://doi.org/10.64898/2026.01.16.696667";
const MEDEA_DOI_LANDING = "https://www.biorxiv.org/content/10.64898/2026.01.16.696667v1";
const MEDEA_OPENALEX_API_SHA256 = "7fd6c98e29c1cdaadb8e39c8d81b11144564c6df14cabaa15b2ccf193729e48d";
const MEDEA_DOI_LANDING_SHA256 = "b8bfb786410b32ec4ce4bb21e9fef849b39f31f9dd03253392c7c509aa00f5de";

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
    confidence: 0.87,
    evidenceEventIds: ["ev-medea-source-review", "ev-medea-drilldown", "ev-medea-signed-receipt"],
    flags: [],
    narrative: "Medea paper metadata is bounded to AMC-owned Studio evidence drilldown proof.",
    ...overrides,
  };
}

describe("GAP-0664 Medea paper Studio evidence drilldown source-review boundary", () => {
  it("documents live OpenAlex/DOI metadata, relevance, and no biomedical subsystem boundary", () => {
    const doc = readFileSync("docs/source-reviews/GAP-0664-medea-studio-evidence-drilldown.md", "utf8");

    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("Medea: An omics AI agent for therapeutic discovery");
    expect(doc).toContain("Publication date | `2026-01-20`");
    expect(doc).toContain("Venue/source | `bioRxiv (Cold Spring Harbor Laboratory)`");
    expect(doc).toContain(`OpenAlex API response SHA-256: \`${MEDEA_OPENALEX_API_SHA256}\``);
    expect(doc).toContain(`DOI landing HTML SHA-256: \`${MEDEA_DOI_LANDING_SHA256}\``);
    expect(doc).toContain("Score | Yes, only through existing question-score explainability rows");
    expect(doc).toContain("Shield | Yes, only when metadata-only or biomedical-parity claims are rejected");
    expect(doc).toContain("Watch | Yes, only when caller-owned preview/empty/error-state receipts");
    expect(doc).toContain("No omics subsystem, therapeutic-discovery subsystem, biomedical importer");
  });

  it("accepts Medea only through existing paper observability drilldown proof", () => {
    const sourceArtifactLinks = buildWatchObsStudioSourceArtifactLinks({
      sourceUrl: MEDEA_DOI_LANDING,
      doi: MEDEA_DOI,
      openAlexWorkId: MEDEA_OPENALEX,
      publisherUrl: "https://www.biorxiv.org/",
    });

    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0664-medea-agent",
      runId: "run-gap-0664-medea-drilldown",
      generatedAt: "2026-06-21T00:00:00.000Z",
      sourceRefs: [MEDEA_OPENALEX, MEDEA_DOI],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-medea-source-review",
              event_hash: h("a"),
              writer_sig: "sig-medea-source-review",
              event_type: "review",
              session_id: "session-gap0664-source",
              ts: 1,
              trustTier: "ATTESTED",
            },
            {
              id: "ev-medea-drilldown",
              event_hash: h("b"),
              writer_sig: "sig-medea-drilldown",
              event_type: "artifact",
              session_id: "session-gap0664-drilldown",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-medea-signed-receipt",
              event_hash: h("c"),
              writer_sig: "sig-medea-signed-receipt",
              event_type: "audit",
              session_id: "session-gap0664-receipt",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-medea-metadata-only",
                event_hash: h("d"),
                writer_sig: "sig-medea-metadata-only",
                event_type: "review",
                session_id: "session-gap0664-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Medea OpenAlex/DOI metadata confirms paper identity only; it lacks AMC-owned question id proof, evidence drilldown route, trace/reasoning/receipt previews, signed evidence refs, row hashes, and repair hints.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0664-medea-existing-drilldown-boundary",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-medea-source-review", "ev-medea-drilldown", "ev-medea-signed-receipt"],
              rejectedEvidenceRefs: ["ev-medea-metadata-only"],
              judgeRef: "judge://amc/obs-studio-drilldown",
              repairHint: "Keep Medea paper metadata bounded to AMC-owned drilldown routes, previews, empty/error states, signed receipts, and no biomedical subsystem proof.",
            },
          ],
          obsStudioDrilldownLens: [
            {
              drilldownId: "gap-0664-medea-paper-drilldown",
              sourceRef: MEDEA_DOI,
              sourceKind: "paper",
              openAlexWorkId: MEDEA_OPENALEX,
              doi: MEDEA_DOI,
              publisherRef: "Cold Spring Harbor Laboratory",
              titleRef: "Medea: An omics AI agent for therapeutic discovery",
              venueRef: "bioRxiv (Cold Spring Harbor Laboratory)",
              publicationDate: "2026-01-20",
              uiRoutePath: "/api/v1/score/evidence-drilldown/run-gap-0664-medea-drilldown/AMC-4.1",
              sourceArtifactLinks: [
                ...sourceArtifactLinks,
                "docs/source-reviews/GAP-0664-medea-studio-evidence-drilldown.md",
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
              sourceArtifactLinkCount: 5,
              minSourceArtifactLinkCount: 3,
              status: "satisfied",
              evidenceRefs: ["ev-medea-source-review", "ev-medea-drilldown", "ev-medea-signed-receipt"],
              rejectedEvidenceRefs: ["ev-medea-metadata-only"],
              repairHint: "Preserve AMC-owned source-review, drilldown route, preview hashes, empty/error-state receipts, signed evidence, and no omics or therapeutic-discovery subsystem boundary.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(sourceArtifactLinks).toEqual([
      MEDEA_DOI_LANDING,
      MEDEA_DOI,
      MEDEA_OPENALEX,
      "https://www.biorxiv.org/",
    ]);
    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.sourceRefs).toEqual([MEDEA_OPENALEX, MEDEA_DOI]);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-4.1",
      status: "passed",
      acceptedEvidenceIds: ["ev-medea-source-review", "ev-medea-drilldown", "ev-medea-signed-receipt"],
      obsStudioDrilldownLens: [
        {
          drilldownId: "gap-0664-medea-paper-drilldown",
          sourceRef: MEDEA_DOI,
          sourceKind: "paper",
          openAlexWorkId: MEDEA_OPENALEX,
          doi: MEDEA_DOI,
          evidencePreviewState: "ready",
          evidencePreviewCount: 3,
          minEvidencePreviewCount: 2,
          sourceArtifactLinkCount: 5,
          minSourceArtifactLinkCount: 3,
          status: "satisfied",
        },
      ],
    });
    expect(report.rows[0]?.obsStudioDrilldownLens?.[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("metadata confirms paper identity only");
  });

  it("fails closed when a Medea claim is metadata-only and lacks AMC drilldown proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0664-medea-agent",
      runId: "run-gap-0664-medea-metadata-only",
      generatedAt: "2026-06-21T00:00:00.000Z",
      sourceRefs: [MEDEA_OPENALEX, MEDEA_DOI],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            evidenceEventIds: ["ev-medea-metadata-only"],
            narrative: "Metadata-only Medea paper source-review proof must fail closed.",
          }),
          acceptedEvidence: [
            {
              id: "ev-medea-metadata-only",
              event_hash: h("e"),
              writer_sig: "sig-medea-metadata-only",
              event_type: "review",
              session_id: "session-gap0664-source",
              ts: 1,
              trustTier: "ATTESTED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-medea-missing-drilldown-proof",
                event_hash: h("f"),
                writer_sig: "sig-medea-missing-drilldown-proof",
                event_type: "review",
                session_id: "session-gap0664-source",
                ts: 2,
                trustTier: "ATTESTED",
              },
              reason: "Medea metadata-only row lacked AMC evidence drilldown route, source artifact links, preview hashes, preview thresholds, empty/error-state receipts, and signed score evidence.",
            },
          ],
          obsStudioDrilldownLens: [
            {
              drilldownId: "gap-0664-medea-metadata-only",
              sourceRef: MEDEA_DOI,
              sourceKind: "paper",
              openAlexWorkId: MEDEA_OPENALEX,
              doi: MEDEA_DOI,
              publisherRef: "Cold Spring Harbor Laboratory",
              titleRef: "Medea: An omics AI agent for therapeutic discovery",
              venueRef: "bioRxiv (Cold Spring Harbor Laboratory)",
              publicationDate: "2026-01-20",
              uiRoutePath: MEDEA_DOI,
              sourceArtifactLinks: [MEDEA_OPENALEX, MEDEA_DOI],
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
              sourceArtifactLinkCount: 2,
              minSourceArtifactLinkCount: 3,
              status: "satisfied",
              evidenceRefs: ["ev-medea-metadata-only"],
              rejectedEvidenceRefs: ["ev-medea-missing-drilldown-proof"],
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
      uiRoutePath: MEDEA_DOI,
      evidencePreviewState: "empty",
      evidencePreviewCount: 1,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 2,
      minSourceArtifactLinkCount: 3,
      tracePreviewHash: null,
      emptyStateHash: null,
      errorStateHash: null,
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("metadata-only row lacked AMC evidence drilldown route");
  });
});

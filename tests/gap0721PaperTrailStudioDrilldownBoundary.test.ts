import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0721-papertrail-studio-drilldown.md";
const SOURCE = "https://arxiv.org/abs/2602.21045";
const DOI = "10.1145/3772318.3791101";
const DOI_URL = `https://doi.org/${DOI}`;
const OPENALEX = "W7131423702";
const OPENALEX_URL = `https://openalex.org/${OPENALEX}`;
const TITLE = "PaperTrail: A Claim-Evidence Interface for Grounding Provenance in LLM-based Scholarly Q&A";
const QUESTION_ID = "AMC-PAPERTRAIL-DRILLDOWN-01";

const implementationFiles = [
  "src/diagnostic/evidenceDrilldown.ts",
  "src/watch/evidenceDrilldown.ts",
  "src/console/assets/evidenceDrilldown.js",
  "src/studio/openapi.ts",
];

function hash(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function obsLens(overrides: Partial<QuestionScoreObsStudioDrilldownLensRef> = {}): QuestionScoreObsStudioDrilldownLensRef {
  const links = buildWatchObsStudioSourceArtifactLinks({
    sourceUrl: SOURCE,
    doi: DOI_URL,
    openAlexWorkId: OPENALEX_URL,
    publisherUrl: "https://dl.acm.org/doi/10.1145/3772318.3791101",
  });

  return {
    drilldownId: "papertrail-claim-evidence-studio-drilldown",
    sourceRef: SOURCE,
    sourceKind: "paper",
    openAlexWorkId: OPENALEX_URL,
    doi: DOI_URL,
    publisherRef: "ACM CHI 2026",
    titleRef: TITLE,
    venueRef: "Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems",
    publicationDate: "2026-02-24",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0721/${QUESTION_ID}`,
    sourceArtifactLinks: links,
    tracePreviewHash: hash("1"),
    reasoningTracePreviewHash: hash("2"),
    receiptPreviewHash: hash("3"),
    evidencePreviewHash: hash("4"),
    sourceArtifactPreviewHash: hash("5"),
    emptyStateHash: hash("6"),
    errorStateHash: hash("7"),
    evidencePreviewState: "ready",
    evidencePreviewCount: 4,
    minEvidencePreviewCount: 2,
    sourceArtifactLinkCount: links.length,
    minSourceArtifactLinkCount: 3,
    status: "satisfied",
    evidenceRefs: ["ev-papertrail-accepted"],
    rejectedEvidenceRefs: ["ev-papertrail-rejected"],
    repairHint: "Keep AMC-owned claim/evidence previews, source links, empty state, and error state receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "papertrail-context-agent",
    runId: "run-gap0721",
    ts: Date.UTC(2026, 5, 21),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-21T00:00:00.000Z",
      agentId: "papertrail-context-agent",
      runId: "run-gap0721",
      sourceRefs: [SOURCE, `doi:${DOI}`, `openalex:${OPENALEX}`],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "PaperTrail claim/evidence provenance drilldown",
          surfaces: ["Score", "Shield", "Watch"],
          claimedLevel: 3,
          supportedMaxLevel: 3,
          finalLevel: 3,
          status: "passed",
          evidenceWindow: {
            eventCount: 2,
            distinctSessionCount: 2,
            firstTs: Date.UTC(2026, 5, 21),
            lastTs: Date.UTC(2026, 5, 21) + 1000,
            durationMs: 1000,
          },
          acceptedEvidenceIds: ["ev-papertrail-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-papertrail-accepted",
              eventHash: hash("c"),
              writerSig: "papertrail-drilldown-writer",
              eventType: "audit",
              sessionId: "papertrail-session-1",
              ts: Date.UTC(2026, 5, 21),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-papertrail-rejected",
              eventHash: hash("d"),
              writerSig: "papertrail-drilldown-reviewer",
              eventType: "review",
              sessionId: "papertrail-session-2",
              ts: Date.UTC(2026, 5, 21) + 1000,
              trustTier: "ATTESTED",
              reason: "source metadata cannot replace AMC-owned evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-papertrail-accepted"],
              rejectedEvidenceRefs: ["ev-papertrail-rejected"],
              judgeRef: "judge://studio/evidence-drilldown",
              repairHint: "Keep route, source links, preview hashes, and empty/error receipts attached.",
            },
          ],
          rubricLens: [],
          ragFlowDiagnostics: [],
          landscapeLens: [],
          incidentTriageLens: [],
          benchmarkSubmissionLens: [],
          testSuiteEvaluationLens: [],
          evalAiLibraryQuestionLens: [],
          openModelRagQuestionLens: [],
          opikEvaluationQuestionLens: [],
          deepEvalQuestionLens: [],
          statisticalAgentTrialLens: [],
          codeQuestQualityLens: [],
          multiUserBenchmarkLens: [],
          professionalTaskLens: [],
          iotFirmwareQuestionLens: [],
          retailSalesQuestionLens: [],
          continualLearningBenchmarkLens: [],
          hermesTurboPerformanceLens: [],
          scorableStudioDrilldownLens: [],
          obsStudioDrilldownLens: [lens],
          missingGateReasons: [],
          repairHint: "Open the AMC evidence drilldown route before accepting PaperTrail-style provenance context.",
          scoreReceiptRef: `diagnostic://run-gap0721/question/${QUESTION_ID}`,
          rowHash: hash("e"),
        },
      ],
    },
    methodology: {
      publicUrl: "/docs/SCORING_METHODOLOGY.md",
      hash: hash("f"),
    },
  } as DiagnosticReport;
}

describe("GAP-0721 PaperTrail Studio evidence drilldown boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0721");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Anna Martin-Boyle");
    expect(doc).toContain("Cara A. C. Leckey");
    expect(doc).toContain("Martha C. Brown");
    expect(doc).toContain("Harmanpreet Kaur");
    expect(doc).toContain("2026-02-24");
    expect(doc).toContain("CHI 2026");
    expect(doc).toContain("within-subjects study with 26 researchers");
    expect(doc).toContain("claim/evidence provenance");
    expect(doc).toContain("empty/error-state receipts");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts PaperTrail context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-papertrail-accepted",
      writerSig: "papertrail-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-papertrail-rejected",
      reason: "source metadata cannot replace AMC-owned evidence previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "papertrail-claim-evidence-studio-drilldown",
      sourceRef: SOURCE,
      sourceKind: "paper",
      openAlexWorkId: OPENALEX_URL,
      doi: DOI_URL,
      publisherRef: "ACM CHI 2026",
      titleRef: TITLE,
      publicationDate: "2026-02-24",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0721/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 4,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 4,
      minSourceArtifactLinkCount: 3,
      status: "satisfied",
      evidenceRefs: ["ev-papertrail-accepted"],
      rejectedEvidenceRefs: ["ev-papertrail-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      SOURCE,
      DOI_URL,
      OPENALEX_URL,
      "https://dl.acm.org/doi/10.1145/3772318.3791101",
    ]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when paper metadata replaces drilldown evidence previews", () => {
    const metadataOnly = obsLens({
      evidenceRefs: [],
      rejectedEvidenceRefs: [],
      evidencePreviewState: "empty",
      evidencePreviewCount: 0,
      sourceArtifactLinkCount: 2,
      minSourceArtifactLinkCount: 3,
      tracePreviewHash: null,
      reasoningTracePreviewHash: null,
      receiptPreviewHash: null,
      evidencePreviewHash: null,
      sourceArtifactPreviewHash: null,
      emptyStateHash: hash("6"),
      errorStateHash: hash("7"),
    });

    const out = buildScoreEvidenceDrilldown(report(metadataOnly), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(true);
    expect(out.obsStudioDrilldownPreview[0]?.evidencePreviewState).toBe("empty");
    expect(out.obsStudioDrilldownPreview[0]?.evidenceRefs).toEqual([]);
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinkCount).toBe(2);
  });

  it("keeps empty drilldown state explicit when the question receipt pack is absent", () => {
    const out = buildScoreEvidenceDrilldown({ ...report(), questionExplainability: undefined } as DiagnosticReport, QUESTION_ID);

    expect(out.state).toBe("empty");
    expect(out.message).toContain("does not include question-level explainability receipts");
    expect(out.obsStudioDrilldownPreview).toEqual([]);
    expect(out.failClosed).toBe(true);
  });

  it("does not add PaperTrail identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("papertrail_claim_evidence_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

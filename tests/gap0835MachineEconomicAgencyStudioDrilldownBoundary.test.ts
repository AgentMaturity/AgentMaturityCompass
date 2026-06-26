import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0835-machine-economic-agency-studio-drilldown.md";
const DOI = "10.5281/zenodo.20102985";
const DOI_URL = `https://doi.org/${DOI}`;
const ZENODO = "https://zenodo.org/records/20102985";
const PDF = "P8_Machine_Economic_Agency_Risk_First_Financial_Agents_v1.pdf";
const OPENALEX = "https://openalex.org/W7160770892";
const TITLE = "Machine Economic Agency: Risk-First Longitudinal Evaluation of Financial LLM Agents";
const QUESTION_ID = "AMC-MACHINE-ECONOMIC-DRILLDOWN-01";

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
    sourceUrl: ZENODO,
    doi: DOI_URL,
    openAlexWorkId: OPENALEX,
  });

  return {
    drilldownId: "machine-economic-agency-studio-drilldown",
    sourceRef: ZENODO,
    sourceKind: "paper",
    openAlexWorkId: OPENALEX,
    doi: DOI_URL,
    publisherRef: "Zenodo",
    titleRef: TITLE,
    venueRef: "Zenodo",
    publicationDate: "2026-06-21",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0835/${QUESTION_ID}`,
    sourceArtifactLinks: links,
    tracePreviewHash: hash("1"),
    reasoningTracePreviewHash: hash("2"),
    receiptPreviewHash: hash("3"),
    evidencePreviewHash: hash("4"),
    sourceArtifactPreviewHash: hash("5"),
    emptyStateHash: hash("6"),
    errorStateHash: hash("7"),
    evidencePreviewState: "ready",
    evidencePreviewCount: 5,
    minEvidencePreviewCount: 2,
    sourceArtifactLinkCount: links.length,
    minSourceArtifactLinkCount: 3,
    status: "satisfied",
    evidenceRefs: ["ev-machine-economic-accepted"],
    rejectedEvidenceRefs: ["ev-machine-economic-rejected"],
    repairHint: "Keep AMC-owned route, source links, trace preview, receipt preview, evidence preview, empty state, and error state receipts attached.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "machine-economic-agency-context-agent",
    runId: "run-gap0835",
    ts: Date.UTC(2026, 5, 21),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-21T00:00:00.000Z",
      agentId: "machine-economic-agency-context-agent",
      runId: "run-gap0835",
      sourceRefs: [ZENODO, DOI_URL, OPENALEX],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Financial LLM agent evidence drilldown",
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
          acceptedEvidenceIds: ["ev-machine-economic-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-machine-economic-accepted",
              eventHash: hash("c"),
              writerSig: "machine-economic-drilldown-writer",
              eventType: "audit",
              sessionId: "machine-economic-session-1",
              ts: Date.UTC(2026, 5, 21),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-machine-economic-rejected",
              eventHash: hash("d"),
              writerSig: "machine-economic-drilldown-reviewer",
              eventType: "review",
              sessionId: "machine-economic-session-2",
              ts: Date.UTC(2026, 5, 21) + 1000,
              trustTier: "ATTESTED",
              reason: "Zenodo/OpenAlex/title metadata cannot replace AMC-owned evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-machine-economic-accepted"],
              rejectedEvidenceRefs: ["ev-machine-economic-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting financial-agent evaluation context.",
          scoreReceiptRef: `diagnostic://run-gap0835/question/${QUESTION_ID}`,
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

describe("GAP-0835 Machine Economic Agency Studio evidence drilldown boundary", () => {
  it("documents live DOI/Zenodo/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0835");
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("Zenodo returned HTTP/1.1 200 OK");
    expect(doc).toContain(PDF);
    expect(doc).toContain("creativecommons.org/licenses/by/4.0");
    expect(doc).toContain("OpenAlex page returned HTTP/2 403");
    expect(doc).toContain("Zenodo API body lookup failed");
    expect(doc).toContain("risk-first evaluation framework");
    expect(doc).toContain("machine economic actors");
    expect(doc).toContain("financial LLM agents");
    expect(doc).toContain("UI route, source artifact links, evidence preview, and empty/error states");
    expect(doc).toContain("trace preview");
    expect(doc).toContain("receipt preview");
    expect(doc).toContain("source artifact links");
    expect(doc).toContain("empty-state receipts");
    expect(doc).toContain("error-state receipts");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts financial-agent context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-machine-economic-accepted",
      writerSig: "machine-economic-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-machine-economic-rejected",
      reason: "Zenodo/OpenAlex/title metadata cannot replace AMC-owned evidence previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "machine-economic-agency-studio-drilldown",
      sourceRef: ZENODO,
      sourceKind: "paper",
      openAlexWorkId: OPENALEX,
      doi: DOI_URL,
      publisherRef: "Zenodo",
      titleRef: TITLE,
      venueRef: "Zenodo",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0835/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 3,
      minSourceArtifactLinkCount: 3,
      status: "satisfied",
      evidenceRefs: ["ev-machine-economic-accepted"],
      rejectedEvidenceRefs: ["ev-machine-economic-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      ZENODO,
      DOI_URL,
      OPENALEX,
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

  it("does not add Machine Economic Agency identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("machine_economic_agency_studio_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

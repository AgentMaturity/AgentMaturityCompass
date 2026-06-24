import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0958-laminar-studio-drilldown.md";
const SOURCE = "https://www.lmnr.ai";
const CANONICAL = "https://laminar.sh/";
const DOCS = "https://laminar.sh/docs/overview";
const SIGNALS = "https://laminar.sh/docs/signals/introduction";
const TRACES = "https://laminar.sh/docs/platform/viewing-traces";
const CLI_DOCS = "https://laminar.sh/docs/platform/cli";
const EVALS = "https://laminar.sh/docs/evaluations/introduction";
const REPO = "https://github.com/lmnr-ai/lmnr";
const TITLE = "Laminar - Open-source observability for AI agents";
const QUESTION_ID = "AMC-LAMINAR-DRILLDOWN-01";

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
    sourceUrl: CANONICAL,
    docsIndexUrl: DOCS,
    docsPageUrls: [SIGNALS, TRACES, CLI_DOCS, EVALS],
    publisherUrl: REPO,
  });

  return {
    drilldownId: "laminar-agent-observability-studio-drilldown",
    sourceRef: SOURCE,
    sourceKind: "product",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "Laminar",
    titleRef: TITLE,
    venueRef: "Laminar product and docs",
    publicationDate: null,
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0958/${QUESTION_ID}`,
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
    minSourceArtifactLinkCount: 4,
    status: "satisfied",
    evidenceRefs: ["ev-laminar-drilldown-accepted"],
    rejectedEvidenceRefs: ["ev-laminar-metadata-rejected"],
    repairHint: "Keep AMC-owned trace, receipt, source artifact links, evidence preview, empty state, and error state receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "laminar-context-agent",
    runId: "run-gap0958",
    ts: Date.UTC(2026, 5, 22),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-22T23:20:00.000Z",
      agentId: "laminar-context-agent",
      runId: "run-gap0958",
      sourceRefs: [SOURCE, CANONICAL, DOCS, SIGNALS, TRACES, EVALS, REPO],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Laminar agent run Studio evidence drilldown",
          surfaces: ["Score", "Shield", "Watch"],
          claimedLevel: 3,
          supportedMaxLevel: 3,
          finalLevel: 3,
          status: "passed",
          evidenceWindow: {
            eventCount: 2,
            distinctSessionCount: 2,
            firstTs: Date.UTC(2026, 5, 22),
            lastTs: Date.UTC(2026, 5, 22) + 1000,
            durationMs: 1000,
          },
          acceptedEvidenceIds: ["ev-laminar-drilldown-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-laminar-drilldown-accepted",
              eventHash: hash("c"),
              writerSig: "laminar-drilldown-writer",
              eventType: "audit",
              sessionId: "laminar-session-1",
              ts: Date.UTC(2026, 5, 22),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-laminar-metadata-rejected",
              eventHash: hash("d"),
              writerSig: "laminar-drilldown-reviewer",
              eventType: "review",
              sessionId: "laminar-session-2",
              ts: Date.UTC(2026, 5, 22) + 1000,
              trustTier: "ATTESTED",
              reason: "Laminar product metadata cannot replace AMC-owned trace, receipt, source artifact, empty-state, and error-state previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-laminar-drilldown-accepted"],
              rejectedEvidenceRefs: ["ev-laminar-metadata-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting Laminar-style agent observability context.",
          scoreReceiptRef: `diagnostic://run-gap0958/question/${QUESTION_ID}`,
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

describe("GAP-0958 Laminar Studio evidence drilldown boundary", () => {
  it("documents live Laminar metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0958");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(SIGNALS);
    expect(doc).toContain(TRACES);
    expect(doc).toContain(CLI_DOCS);
    expect(doc).toContain(EVALS);
    expect(doc).toContain(REPO);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("redirected to `https://laminar.sh/`");
    expect(doc).toContain("Ship reliable agents");
    expect(doc).toContain("agent failure");
    expect(doc).toContain("Signals");
    expect(doc).toContain("readable transcript and timeline");
    expect(doc).toContain("Ask any question about your agent run");
    expect(doc).toContain("Event clusters");
    expect(doc).toContain("Debugger");
    expect(doc).toContain("Evals");
    expect(doc).toContain("View Trace");
    expect(doc).toContain("open-source observability platform purpose-built for AI agents");
    expect(doc).toContain("trace every call to an LLM");
    expect(doc).toContain("raw SQL access");
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

  it("accepts Laminar context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-laminar-drilldown-accepted",
      writerSig: "laminar-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-laminar-metadata-rejected",
      reason: "Laminar product metadata cannot replace AMC-owned trace, receipt, source artifact, empty-state, and error-state previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "laminar-agent-observability-studio-drilldown",
      sourceRef: SOURCE,
      sourceKind: "product",
      publisherRef: "Laminar",
      titleRef: TITLE,
      venueRef: "Laminar product and docs",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0958/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 7,
      minSourceArtifactLinkCount: 4,
      status: "satisfied",
      evidenceRefs: ["ev-laminar-drilldown-accepted"],
      rejectedEvidenceRefs: ["ev-laminar-metadata-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      CANONICAL,
      DOCS,
      SIGNALS,
      TRACES,
      CLI_DOCS,
      EVALS,
      REPO,
    ]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Laminar metadata replaces drilldown evidence previews", () => {
    const metadataOnly = obsLens({
      evidenceRefs: [],
      rejectedEvidenceRefs: [],
      evidencePreviewState: "empty",
      evidencePreviewCount: 0,
      sourceArtifactLinkCount: 2,
      minSourceArtifactLinkCount: 4,
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

  it("does not add Laminar identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("lmnr.ai");
      expect(source).not.toContain("laminar_agent_observability_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

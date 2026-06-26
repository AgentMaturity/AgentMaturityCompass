import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0737-apo-studio-drilldown.md";
const SOURCE = "https://github.com/CloudDetail/apo";
const DOCS = "https://apo.pages.dev/";
const HELM_DOCS = "https://apo.pages.dev/install/kubernetes/";
const REPO = "CloudDetail/apo";
const QUESTION_ID = "AMC-APO-DRILLDOWN-01";

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
    docsIndexUrl: DOCS,
    docsPageUrls: [HELM_DOCS],
  });

  return {
    drilldownId: "apo-observability-studio-drilldown",
    sourceRef: SOURCE,
    sourceKind: "github_repo",
    titleRef: "APO observability source-review drilldown",
    publisherRef: "CloudDetail",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0737/${QUESTION_ID}`,
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
    evidenceRefs: ["ev-apo-accepted"],
    rejectedEvidenceRefs: ["ev-apo-rejected"],
    repairHint: "Keep AMC-owned route, observability source links, preview hashes, and empty/error receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "apo-context-agent",
    runId: "run-gap0737",
    ts: Date.UTC(2026, 5, 21),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-21T00:00:00.000Z",
      agentId: "apo-context-agent",
      runId: "run-gap0737",
      sourceRefs: [SOURCE, DOCS],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "APO observability source artifact drilldown",
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
          acceptedEvidenceIds: ["ev-apo-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-apo-accepted",
              eventHash: hash("c"),
              writerSig: "apo-drilldown-writer",
              eventType: "audit",
              sessionId: "apo-session-1",
              ts: Date.UTC(2026, 5, 21),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-apo-rejected",
              eventHash: hash("d"),
              writerSig: "apo-drilldown-reviewer",
              eventType: "review",
              sessionId: "apo-session-2",
              ts: Date.UTC(2026, 5, 21) + 1000,
              trustTier: "ATTESTED",
              reason: "source metadata cannot replace AMC-owned observability drilldown previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-apo-accepted"],
              rejectedEvidenceRefs: ["ev-apo-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting APO-style observability context.",
          scoreReceiptRef: `diagnostic://run-gap0737/question/${QUESTION_ID}`,
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

describe("GAP-0737 APO Studio evidence drilldown boundary", () => {
  it("documents live APO metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0737");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(REPO);
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("eBPF");
    expect(doc).toContain("LLM-assisted automated analysis");
    expect(doc).toContain("logs");
    expect(doc).toContain("metrics");
    expect(doc).toContain("traces");
    expect(doc).toContain("profiles");
    expect(doc).toContain("events");
    expect(doc).toContain("Kubernetes");
    expect(doc).toContain("Docker Compose");
    expect(doc).toContain("Helm");
    expect(doc).toContain("UI route, source artifact links, evidence preview, and empty/error states");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts APO context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-apo-accepted",
      writerSig: "apo-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-apo-rejected",
      reason: "source metadata cannot replace AMC-owned observability drilldown previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "apo-observability-studio-drilldown",
      sourceRef: SOURCE,
      sourceKind: "github_repo",
      publisherRef: "CloudDetail",
      titleRef: "APO observability source-review drilldown",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0737/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 4,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 3,
      minSourceArtifactLinkCount: 3,
      status: "satisfied",
      evidenceRefs: ["ev-apo-accepted"],
      rejectedEvidenceRefs: ["ev-apo-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      SOURCE,
      DOCS,
      HELM_DOCS,
    ]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when APO metadata replaces drilldown evidence previews", () => {
    const metadataOnly = obsLens({
      evidenceRefs: [],
      rejectedEvidenceRefs: [],
      evidencePreviewState: "empty",
      evidencePreviewCount: 0,
      sourceArtifactLinkCount: 1,
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
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinkCount).toBe(1);
  });

  it("keeps empty drilldown state explicit when the question receipt pack is absent", () => {
    const out = buildScoreEvidenceDrilldown({ ...report(), questionExplainability: undefined } as DiagnosticReport, QUESTION_ID);

    expect(out.state).toBe("empty");
    expect(out.message).toContain("does not include question-level explainability receipts");
    expect(out.obsStudioDrilldownPreview).toEqual([]);
    expect(out.failClosed).toBe(true);
  });

  it("does not add APO identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("apo_observability_studio_drilldown");
      expect(source).not.toContain("CloudDetail/apo");
      expect(source).not.toContain("APO observability source-review drilldown");
    }
  });
});

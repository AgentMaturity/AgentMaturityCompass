import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0860-go-openllmetry-studio-drilldown.md";
const REPO = "traceloop/go-openllmetry";
const URL = "https://github.com/traceloop/go-openllmetry";
const TITLE = "go-openllmetry";
const QUESTION_ID = "AMC-GO-OPENLLMETRY-DRILLDOWN-01";

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
    sourceUrl: URL,
  });

  return {
    drilldownId: "go-openllmetry-studio-drilldown",
    sourceRef: URL,
    sourceKind: "github_repo",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "GitHub",
    titleRef: TITLE,
    venueRef: "GitHub",
    publicationDate: "2026-06-21",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0860/${QUESTION_ID}`,
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
    minSourceArtifactLinkCount: 1,
    status: "satisfied",
    evidenceRefs: ["ev-go-openllmetry-accepted"],
    rejectedEvidenceRefs: ["ev-go-openllmetry-rejected"],
    repairHint: "Keep AMC-owned trace, receipt, evidence preview, source link, empty state, and error state receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "go-openllmetry-context-agent",
    runId: "run-gap0860",
    ts: Date.UTC(2026, 5, 21),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-21T00:00:00.000Z",
      agentId: "go-openllmetry-context-agent",
      runId: "run-gap0860",
      sourceRefs: [URL],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "go-openllmetry observability evidence drilldown",
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
          acceptedEvidenceIds: ["ev-go-openllmetry-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-go-openllmetry-accepted",
              eventHash: hash("c"),
              writerSig: "go-openllmetry-drilldown-writer",
              eventType: "audit",
              sessionId: "go-openllmetry-session-1",
              ts: Date.UTC(2026, 5, 21),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-go-openllmetry-rejected",
              eventHash: hash("d"),
              writerSig: "go-openllmetry-drilldown-reviewer",
              eventType: "review",
              sessionId: "go-openllmetry-session-2",
              ts: Date.UTC(2026, 5, 21) + 1000,
              trustTier: "ATTESTED",
              reason: "GitHub observability metadata cannot replace AMC-owned evidence previews.",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-go-openllmetry-accepted"],
              rejectedEvidenceRefs: ["ev-go-openllmetry-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting go-openllmetry-style observability context.",
          scoreReceiptRef: `diagnostic://run-gap0860/question/${QUESTION_ID}`,
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

describe("GAP-0860 go-openllmetry Studio evidence drilldown boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0860");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 44");
    expect(doc).toContain("Fork 10");
    expect(doc).toContain("Issues 10");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("127 Commits");
    expect(doc).toContain("v0.12.1 Latest Feb 2, 2025");
    expect(doc).toContain("Go 100.0%");
    expect(doc).toContain("datascience");
    expect(doc).toContain("generative-ai");
    expect(doc).toContain("golang");
    expect(doc).toContain("llmops");
    expect(doc).toContain("metrics");
    expect(doc).toContain("monitoring");
    expect(doc).toContain("observability");
    expect(doc).toContain("open-telemetry");
    expect(doc).toContain("OpenLLMetry");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("traces and metrics");
    expect(doc).toContain("Manual Instrumentation");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("Azure OpenAI");
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

  it("accepts go-openllmetry context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-go-openllmetry-accepted",
      writerSig: "go-openllmetry-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-go-openllmetry-rejected",
      reason: "GitHub observability metadata cannot replace AMC-owned evidence previews.",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "go-openllmetry-studio-drilldown",
      sourceRef: URL,
      sourceKind: "github_repo",
      publisherRef: "GitHub",
      titleRef: TITLE,
      venueRef: "GitHub",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0860/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 4,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 1,
      minSourceArtifactLinkCount: 1,
      status: "satisfied",
      evidenceRefs: ["ev-go-openllmetry-accepted"],
      rejectedEvidenceRefs: ["ev-go-openllmetry-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([URL]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when GitHub observability metadata replaces drilldown evidence previews", () => {
    const metadataOnly = obsLens({
      evidenceRefs: [],
      rejectedEvidenceRefs: [],
      evidencePreviewState: "empty",
      evidencePreviewCount: 0,
      sourceArtifactLinkCount: 0,
      minSourceArtifactLinkCount: 1,
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
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinkCount).toBe(0);
  });

  it("keeps empty drilldown state explicit when the question receipt pack is absent", () => {
    const out = buildScoreEvidenceDrilldown({ ...report(), questionExplainability: undefined } as DiagnosticReport, QUESTION_ID);

    expect(out.state).toBe("empty");
    expect(out.message).toContain("does not include question-level explainability receipts");
    expect(out.obsStudioDrilldownPreview).toEqual([]);
    expect(out.failClosed).toBe(true);
  });

  it("does not add go-openllmetry identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("go_openllmetry_studio_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

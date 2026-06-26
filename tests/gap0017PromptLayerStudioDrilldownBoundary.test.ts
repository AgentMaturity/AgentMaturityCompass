import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0017-promptlayer-studio-drilldown.md";
const SOURCE = "https://www.promptlayer.com/";
const OVERVIEW = "https://docs.promptlayer.com/overview";
const TRACES = "https://docs.promptlayer.com/running-requests/traces";
const EVALS = "https://docs.promptlayer.com/features/evaluations/overview";
const PIPELINES = "https://docs.promptlayer.com/features/evaluations/building-pipelines";
const CI = "https://docs.promptlayer.com/features/evaluations/continuous-integration";
const HISTORY = "https://docs.promptlayer.com/features/evaluations/datasets-create-from-history";
const ANALYTICS = "https://docs.promptlayer.com/why-promptlayer/analytics";
const API = "https://docs.promptlayer.com/reference/introduction";
const TITLE = "PromptLayer";
const QUESTION_ID = "AMC-PROMPTLAYER-DRILLDOWN-01";

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
    docsIndexUrl: OVERVIEW,
    docsPageUrls: [TRACES, EVALS, PIPELINES, CI, HISTORY, ANALYTICS, API],
  });

  return {
    drilldownId: "promptlayer-agent-eval-studio-drilldown",
    sourceRef: SOURCE,
    sourceKind: "product",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "PromptLayer",
    titleRef: TITLE,
    venueRef: "Prompt management, evaluation, and observability product",
    publicationDate: null,
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0017/${QUESTION_ID}`,
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
    minSourceArtifactLinkCount: 5,
    status: "satisfied",
    evidenceRefs: ["ev-promptlayer-drilldown-accepted"],
    rejectedEvidenceRefs: ["ev-promptlayer-metadata-rejected"],
    repairHint: "Keep AMC-owned trace, receipt, source artifact links, evidence preview, empty state, and error state receipts attached to this PromptLayer drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "promptlayer-context-agent",
    runId: "run-gap0017",
    ts: Date.UTC(2026, 5, 26),
    reportJsonSha256: hash("9"),
    questionExplainability: {
      generatedAt: "2026-06-26T00:00:00.000Z",
      agentId: "promptlayer-context-agent",
      runId: "run-gap0017",
      sourceRefs: [SOURCE, OVERVIEW, TRACES, EVALS, PIPELINES, CI, HISTORY, ANALYTICS, API],
      replayable: true,
      failClosed: false,
      manifestHash: hash("a"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "PromptLayer agent-evaluation Studio evidence drilldown",
          surfaces: ["Score", "Shield", "Watch"],
          claimedLevel: 3,
          supportedMaxLevel: 3,
          finalLevel: 3,
          status: "passed",
          evidenceWindow: {
            eventCount: 2,
            distinctSessionCount: 2,
            firstTs: Date.UTC(2026, 5, 26),
            lastTs: Date.UTC(2026, 5, 26) + 1000,
            durationMs: 1000,
          },
          acceptedEvidenceIds: ["ev-promptlayer-drilldown-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-promptlayer-drilldown-accepted",
              eventHash: hash("b"),
              writerSig: "promptlayer-drilldown-writer",
              eventType: "audit",
              sessionId: "promptlayer-session-1",
              ts: Date.UTC(2026, 5, 26),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-promptlayer-metadata-rejected",
              eventHash: hash("c"),
              writerSig: "promptlayer-drilldown-reviewer",
              eventType: "review",
              sessionId: "promptlayer-session-2",
              ts: Date.UTC(2026, 5, 26) + 1000,
              trustTier: "ATTESTED",
              reason: "PromptLayer product metadata cannot replace AMC-owned trace, receipt, source artifact, empty-state, and error-state previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-promptlayer-drilldown-accepted"],
              rejectedEvidenceRefs: ["ev-promptlayer-metadata-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting PromptLayer-style evaluation and observability context.",
          scoreReceiptRef: `diagnostic://run-gap0017/question/${QUESTION_ID}`,
          rowHash: hash("d"),
        },
      ],
    },
    methodology: {
      publicUrl: "/docs/SCORING_METHODOLOGY.md",
      hash: hash("e"),
    },
  } as DiagnosticReport;
}

describe("GAP-0017 PromptLayer Studio evidence drilldown boundary", () => {
  it("documents live PromptLayer metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0017");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(OVERVIEW);
    expect(doc).toContain(TRACES);
    expect(doc).toContain(EVALS);
    expect(doc).toContain(PIPELINES);
    expect(doc).toContain(CI);
    expect(doc).toContain(HISTORY);
    expect(doc).toContain(ANALYTICS);
    expect(doc).toContain(API);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Version, test, and monitor every prompt and agent");
    expect(doc).toContain("Trace, evaluate, release");
    expect(doc).toContain("requests, responses, metadata, cost, latency, and feedback");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("inputs and outputs");
    expect(doc).toContain("Evaluations page");
    expect(doc).toContain("batch evaluations");
    expect(doc).toContain("regression testing");
    expect(doc).toContain("real production or staging traffic");
    expect(doc).toContain("average latency");
    expect(doc).toContain("total cost");
    expect(doc).toContain("request logs");
    expect(doc).toContain("UI route, source artifact links, evidence preview, and empty/error states");
    expect(doc).toContain("trace preview");
    expect(doc).toContain("receipt preview");
    expect(doc).toContain("empty-state receipts");
    expect(doc).toContain("error-state receipts");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts PromptLayer context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-promptlayer-drilldown-accepted",
      writerSig: "promptlayer-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-promptlayer-metadata-rejected",
      reason: "PromptLayer product metadata cannot replace AMC-owned trace, receipt, source artifact, empty-state, and error-state previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "promptlayer-agent-eval-studio-drilldown",
      sourceRef: SOURCE,
      sourceKind: "product",
      publisherRef: "PromptLayer",
      titleRef: TITLE,
      venueRef: "Prompt management, evaluation, and observability product",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0017/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 9,
      minSourceArtifactLinkCount: 5,
      status: "satisfied",
      evidenceRefs: ["ev-promptlayer-drilldown-accepted"],
      rejectedEvidenceRefs: ["ev-promptlayer-metadata-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      SOURCE,
      OVERVIEW,
      TRACES,
      EVALS,
      PIPELINES,
      CI,
      HISTORY,
      ANALYTICS,
      API,
    ]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when PromptLayer metadata replaces drilldown evidence previews", () => {
    const metadataOnly = obsLens({
      evidenceRefs: [],
      rejectedEvidenceRefs: [],
      evidencePreviewState: "empty",
      evidencePreviewCount: 0,
      sourceArtifactLinkCount: 2,
      minSourceArtifactLinkCount: 5,
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

  it("does not add PromptLayer identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("promptlayer.com");
      expect(source).not.toContain("promptlayer_agent_eval_drilldown");
      expect(source).not.toContain("PromptLayer");
    }
  });
});

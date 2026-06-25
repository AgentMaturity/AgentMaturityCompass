import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0010-galileo-studio-drilldown.md";
const SOURCE = "https://www.galileo.ai";
const CANONICAL = "https://galileo.ai/";
const PRODUCTS = "https://galileo.ai/products";
const SIGNALS = "https://galileo.ai/signals";
const PROTECT = "https://galileo.ai/protect";
const DOCS = "https://docs.galileo.ai/what-is-galileo";
const OBSERVABILITY = "https://docs.galileo.ai/concepts/logging/overview";
const EVALUATE = "https://docs.galileo.ai/getting-started/evaluate-and-improve/evaluate-and-improve";
const EXPERIMENTS = "https://docs.galileo.ai/sdk-api/experiments/experiments";
const COMPARE = "https://docs.galileo.ai/concepts/experiments/compare";
const AGENT_CONTROL = "https://docs.galileo.ai/concepts/agent-control/overview";
const TITLE = "Galileo";
const QUESTION_ID = "AMC-GALILEO-DRILLDOWN-01";

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
    docsPageUrls: [PRODUCTS, SIGNALS, PROTECT, OBSERVABILITY, EVALUATE, EXPERIMENTS, COMPARE, AGENT_CONTROL],
  });

  return {
    drilldownId: "galileo-agent-eval-studio-drilldown",
    sourceRef: SOURCE,
    sourceKind: "product",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "Galileo",
    titleRef: TITLE,
    venueRef: "AI observability and eval engineering platform",
    publicationDate: null,
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0010/${QUESTION_ID}`,
    sourceArtifactLinks: links,
    tracePreviewHash: hash("1"),
    reasoningTracePreviewHash: hash("2"),
    receiptPreviewHash: hash("3"),
    evidencePreviewHash: hash("4"),
    sourceArtifactPreviewHash: hash("5"),
    emptyStateHash: hash("6"),
    errorStateHash: hash("7"),
    evidencePreviewState: "ready",
    evidencePreviewCount: 6,
    minEvidencePreviewCount: 2,
    sourceArtifactLinkCount: links.length,
    minSourceArtifactLinkCount: 5,
    status: "satisfied",
    evidenceRefs: ["ev-galileo-drilldown-accepted"],
    rejectedEvidenceRefs: ["ev-galileo-metadata-rejected"],
    repairHint: "Keep AMC-owned trace, receipt, source artifact links, evidence preview, empty state, and error state receipts attached to this Galileo drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "galileo-context-agent",
    runId: "run-gap0010",
    ts: Date.UTC(2026, 5, 25),
    reportJsonSha256: hash("9"),
    questionExplainability: {
      generatedAt: "2026-06-25T00:00:00.000Z",
      agentId: "galileo-context-agent",
      runId: "run-gap0010",
      sourceRefs: [SOURCE, CANONICAL, DOCS, PRODUCTS, OBSERVABILITY, EVALUATE, EXPERIMENTS, COMPARE, AGENT_CONTROL],
      replayable: true,
      failClosed: false,
      manifestHash: hash("a"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Galileo agent-evaluation Studio evidence drilldown",
          surfaces: ["Score", "Shield", "Watch"],
          claimedLevel: 3,
          supportedMaxLevel: 3,
          finalLevel: 3,
          status: "passed",
          evidenceWindow: {
            eventCount: 2,
            distinctSessionCount: 2,
            firstTs: Date.UTC(2026, 5, 25),
            lastTs: Date.UTC(2026, 5, 25) + 1000,
            durationMs: 1000,
          },
          acceptedEvidenceIds: ["ev-galileo-drilldown-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-galileo-drilldown-accepted",
              eventHash: hash("b"),
              writerSig: "galileo-drilldown-writer",
              eventType: "audit",
              sessionId: "galileo-session-1",
              ts: Date.UTC(2026, 5, 25),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-galileo-metadata-rejected",
              eventHash: hash("c"),
              writerSig: "galileo-drilldown-reviewer",
              eventType: "review",
              sessionId: "galileo-session-2",
              ts: Date.UTC(2026, 5, 25) + 1000,
              trustTier: "ATTESTED",
              reason: "Galileo product metadata cannot replace AMC-owned trace, receipt, source artifact, empty-state, and error-state previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-galileo-drilldown-accepted"],
              rejectedEvidenceRefs: ["ev-galileo-metadata-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting Galileo-style evaluation and guardrail context.",
          scoreReceiptRef: `diagnostic://run-gap0010/question/${QUESTION_ID}`,
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

describe("GAP-0010 Galileo Studio evidence drilldown boundary", () => {
  it("documents live Galileo metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0010");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(PRODUCTS);
    expect(doc).toContain(SIGNALS);
    expect(doc).toContain(PROTECT);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(OBSERVABILITY);
    expect(doc).toContain(EVALUATE);
    expect(doc).toContain(EXPERIMENTS);
    expect(doc).toContain(COMPARE);
    expect(doc).toContain(AGENT_CONTROL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Don't just monitor AI failures. Stop them.");
    expect(doc).toContain("AI observability and eval engineering platform");
    expect(doc).toContain("offline evals become production guardrails");
    expect(doc).toContain("synthetic, development, and live production data");
    expect(doc).toContain("RAG Evals");
    expect(doc).toContain("Agent Evals");
    expect(doc).toContain("Safety Evals");
    expect(doc).toContain("Security Evals");
    expect(doc).toContain("Custom Evals");
    expect(doc).toContain("insights engine analyzes agent behavior");
    expect(doc).toContain("failure modes");
    expect(doc).toContain("models, prompts, functions, context, datasets, traces, and MCP server");
    expect(doc).toContain("unit testing and CI/CD rigor");
    expect(doc).toContain("Eval scores automatically control agent actions, tool access, and escalation paths");
    expect(doc).toContain("What Is Galileo?");
    expect(doc).toContain("observability, evaluation, and production guardrail platform");
    expect(doc).toContain("sessions, traces, and spans");
    expect(doc).toContain("LLM calls, tool calls, or a retrieval step");
    expect(doc).toContain("Select the trace to drill down");
    expect(doc).toContain("explanation of the metric");
    expect(doc).toContain("experiment Log stream");
    expect(doc).toContain("one trace per dataset row");
    expect(doc).toContain("drill into each experiment");
    expect(doc).toContain("metrics, inputs, and outputs");
    expect(doc).toContain("hover over a metric");
    expect(doc).toContain("Agent Control");
    expect(doc).toContain("audit-ready traces");
    expect(doc).toContain("Find issues after first signal");
    expect(doc).toContain("Click any row to pivot deeper or export the evidence for audits");
    expect(doc).toContain("Root cause, in one click");
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

  it("accepts Galileo context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-galileo-drilldown-accepted",
      writerSig: "galileo-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-galileo-metadata-rejected",
      reason: "Galileo product metadata cannot replace AMC-owned trace, receipt, source artifact, empty-state, and error-state previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "galileo-agent-eval-studio-drilldown",
      sourceRef: SOURCE,
      sourceKind: "product",
      publisherRef: "Galileo",
      titleRef: TITLE,
      venueRef: "AI observability and eval engineering platform",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0010/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 6,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 10,
      minSourceArtifactLinkCount: 5,
      status: "satisfied",
      evidenceRefs: ["ev-galileo-drilldown-accepted"],
      rejectedEvidenceRefs: ["ev-galileo-metadata-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      CANONICAL,
      DOCS,
      PRODUCTS,
      SIGNALS,
      PROTECT,
      OBSERVABILITY,
      EVALUATE,
      EXPERIMENTS,
      COMPARE,
      AGENT_CONTROL,
    ]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Galileo metadata replaces drilldown evidence previews", () => {
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

  it("does not add Galileo identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("galileo.ai");
      expect(source).not.toContain("galileo_agent_eval_drilldown");
      expect(source).not.toContain("Galileo Signals");
    }
  });
});

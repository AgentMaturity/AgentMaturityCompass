import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0943-braintrust-studio-drilldown.md";
const SOURCE = "https://www.braintrust.dev";
const DOCS = `${SOURCE}/docs`;
const EVALS = `${SOURCE}/docs/evaluation-quickstart`;
const DATASETS = `${SOURCE}/docs/annotate/datasets`;
const OBSERVE = `${SOURCE}/docs/guides/logs`;
const TITLE = "Braintrust";
const QUESTION_ID = "AMC-BRAINTRUST-DRILLDOWN-01";

const implementationFiles = [
  "src/diagnostic/evidenceDrilldown.ts",
  "src/watch/evidenceDrilldown.ts",
  "src/console/assets/evidenceDrilldown.js",
  "src/studio/openapi.ts",
];

function hash(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function lens(overrides: Partial<QuestionScoreObsStudioDrilldownLensRef> = {}): QuestionScoreObsStudioDrilldownLensRef {
  const links = buildWatchObsStudioSourceArtifactLinks({
    sourceUrl: SOURCE,
    docsIndexUrl: DOCS,
    docsPageUrls: [EVALS, DATASETS, OBSERVE],
  });

  return {
    drilldownId: "braintrust-studio-drilldown",
    sourceRef: SOURCE,
    sourceKind: "product",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "Braintrust Data, Inc.",
    titleRef: TITLE,
    venueRef: "AI observability and evaluation platform",
    publicationDate: "2026-06-22",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0943/${QUESTION_ID}`,
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
    minSourceArtifactLinkCount: 4,
    status: "satisfied",
    evidenceRefs: ["ev-braintrust-accepted"],
    rejectedEvidenceRefs: ["ev-braintrust-rejected"],
    repairHint: "Keep AMC-owned trace previews, receipts, source links, and empty/error states attached to this Braintrust drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(drilldown: QuestionScoreObsStudioDrilldownLensRef = lens()): DiagnosticReport {
  return {
    agentId: "braintrust-context-agent",
    runId: "run-gap0943",
    ts: Date.UTC(2026, 5, 22),
    reportJsonSha256: hash("9"),
    questionExplainability: {
      generatedAt: "2026-06-22T23:44:00.000Z",
      agentId: "braintrust-context-agent",
      runId: "run-gap0943",
      sourceRefs: [SOURCE, DOCS, EVALS],
      replayable: true,
      failClosed: false,
      manifestHash: hash("a"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Braintrust product evidence drilldown",
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
          acceptedEvidenceIds: ["ev-braintrust-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-braintrust-accepted",
              eventHash: hash("b"),
              writerSig: "braintrust-drilldown-writer",
              eventType: "audit",
              sessionId: "braintrust-session-1",
              ts: Date.UTC(2026, 5, 22),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-braintrust-rejected",
              eventHash: hash("c"),
              writerSig: "braintrust-drilldown-reviewer",
              eventType: "review",
              sessionId: "braintrust-session-2",
              ts: Date.UTC(2026, 5, 22) + 1000,
              trustTier: "ATTESTED",
              reason: "Braintrust product metadata cannot replace AMC-owned evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [],
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
          obsStudioDrilldownLens: [drilldown],
          missingGateReasons: [],
          repairHint: "Open the AMC evidence drilldown route before accepting Braintrust observability context.",
          scoreReceiptRef: `diagnostic://run-gap0943/question/${QUESTION_ID}`,
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

describe("GAP-0943 Braintrust Studio evidence drilldown boundary", () => {
  it("documents live Braintrust metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0943");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live Braintrust homepage");
    expect(doc).toContain("Ship quality AI at scale");
    expect(doc).toContain("Surface patterns in production");
    expect(doc).toContain("Inspect traces in real time");
    expect(doc).toContain("Trace everything");
    expect(doc).toContain("prompts, responses, and tool calls");
    expect(doc).toContain("Measure quality with evals");
    expect(doc).toContain("Score outputs with LLMs, code, or humans");
    expect(doc).toContain("Block bad releases before they hit production");
    expect(doc).toContain("Observability");
    expect(doc).toContain("Evals");
    expect(doc).toContain("Automation");
    expect(doc).toContain("Topics");
    expect(doc).toContain("online scoring catches regressions");
    expect(doc).toContain("quality gates block bad releases");
    expect(doc).toContain("Loop agent");
    expect(doc).toContain("Custom facets");
    expect(doc).toContain("Task-specific trace views");
    expect(doc).toContain("Trace to dataset");
    expect(doc).toContain("MCP");
    expect(doc).toContain("Framework agnostic");
    expect(doc).toContain("Native SDKs");
    expect(doc).toContain("Brainstore");
    expect(doc).toContain("SOC 2 Type II");
    expect(doc).toContain("GDPR");
    expect(doc).toContain("HIPAA compliant");
    expect(doc).toContain("UI route");
    expect(doc).toContain("source artifact links");
    expect(doc).toContain("evidence preview");
    expect(doc).toContain("empty/error states");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Braintrust context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "braintrust-studio-drilldown",
      sourceRef: SOURCE,
      titleRef: TITLE,
      evidencePreviewState: "ready",
      sourceArtifactLinkCount: 5,
      status: "satisfied",
      evidenceRefs: ["ev-braintrust-accepted"],
      rejectedEvidenceRefs: ["ev-braintrust-rejected"],
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([SOURCE, DOCS, EVALS, DATASETS, OBSERVE]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Braintrust metadata replaces drilldown evidence previews", () => {
    const metadataOnly = lens({
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
    });

    const out = buildScoreEvidenceDrilldown(report(metadataOnly), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(true);
    expect(out.obsStudioDrilldownPreview[0]?.evidencePreviewState).toBe("empty");
    expect(out.obsStudioDrilldownPreview[0]?.evidenceRefs).toEqual([]);
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinkCount).toBe(2);
  });

  it("does not add Braintrust identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("https://www.braintrust.dev");
      expect(source).not.toContain("braintrust_studio_drilldown");
      expect(source).not.toContain("Braintrust Data, Inc.");
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0962-comet-opik-studio-drilldown.md";
const REPO = "https://github.com/comet-ml/opik";
const PRODUCT = "https://www.comet.com/site/products/opik/";
const DOCS = "https://www.comet.com/docs/opik/";
const COMET = "https://www.comet.com";
const TITLE = "Comet Opik";
const QUESTION_ID = "AMC-OPIK-DRILLDOWN-01";

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
    sourceUrl: REPO,
    docsIndexUrl: DOCS,
    docsPageUrls: [PRODUCT],
    publisherUrl: COMET,
  });

  return {
    drilldownId: "comet-opik-agent-evaluation-studio-drilldown",
    sourceRef: REPO,
    sourceKind: "github_repo",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "Comet",
    titleRef: TITLE,
    venueRef: "GitHub, product page, and docs",
    publicationDate: null,
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0962/${QUESTION_ID}`,
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
    minSourceArtifactLinkCount: 4,
    status: "satisfied",
    evidenceRefs: ["ev-opik-drilldown-accepted"],
    rejectedEvidenceRefs: ["ev-opik-metadata-rejected"],
    repairHint: "Keep AMC-owned trace, receipt, source artifact links, evidence preview, empty state, and error state receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "opik-context-agent",
    runId: "run-gap0962",
    ts: Date.UTC(2026, 5, 22),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-22T23:55:00.000Z",
      agentId: "opik-context-agent",
      runId: "run-gap0962",
      sourceRefs: [REPO, PRODUCT, DOCS, COMET],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Comet Opik Studio evidence drilldown",
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
          acceptedEvidenceIds: ["ev-opik-drilldown-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-opik-drilldown-accepted",
              eventHash: hash("c"),
              writerSig: "opik-drilldown-writer",
              eventType: "audit",
              sessionId: "opik-session-1",
              ts: Date.UTC(2026, 5, 22),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-opik-metadata-rejected",
              eventHash: hash("d"),
              writerSig: "opik-drilldown-reviewer",
              eventType: "review",
              sessionId: "opik-session-2",
              ts: Date.UTC(2026, 5, 22) + 1000,
              trustTier: "ATTESTED",
              reason: "Comet Opik product and repository metadata cannot replace AMC-owned Studio drilldown evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-opik-drilldown-accepted"],
              rejectedEvidenceRefs: ["ev-opik-metadata-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting Comet Opik observability context.",
          scoreReceiptRef: `diagnostic://run-gap0962/question/${QUESTION_ID}`,
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

describe("GAP-0962 Comet Opik Studio drilldown boundary", () => {
  it("documents live GitHub/product/docs metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0962");
    expect(doc).toContain(REPO);
    expect(doc).toContain(PRODUCT);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("Star 19.7k");
    expect(doc).toContain("Fork 1.5k");
    expect(doc).toContain("Issues 89");
    expect(doc).toContain("Pull requests 35");
    expect(doc).toContain("6,152 Commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Open-source AI Observability, Evaluation, and Optimization");
    expect(doc).toContain("comprehensive tracing, automated evaluations, and production-ready dashboards");
    expect(doc).toContain("Trace & Debug Any Step");
    expect(doc).toContain("Capture, visualize, and understand every action");
    expect(doc).toContain("annotate and fix underperforming traces");
    expect(doc).toContain("audit logs");
    expect(doc).toContain("Evaluate Outcomes with LLM-as-a-Judge Metrics");
    expect(doc).toContain("reference dataset or a plain-text assertion");
    expect(doc).toContain("30+ metrics");
    expect(doc).toContain("answer relevance, context precision, task completion, hallucination");
    expect(doc).toContain("Monitor Your Agents in Production");
    expect(doc).toContain("Evaluate production traces in real time");
    expect(doc).toContain("Apply guardrails");
    expect(doc).toContain("PII exposure");
    expect(doc).toContain("Track & Optimize Coding Agent Spend");
    expect(doc).toContain("Claude Code and Codex");
    expect(doc).toContain("MCP installs");
    expect(doc).toContain("Test Suites");
    expect(doc).toContain("Ollie");
    expect(doc).toContain("Agent Playground");
    expect(doc).toContain("Agent playground");
    expect(doc).toContain("Prompt playground");
    expect(doc).toContain("Optimization Studio");
    expect(doc).toContain("Datasets & Experiments");
    expect(doc).toContain("Online Evaluation rules");
    expect(doc).toContain("Gateway");
    expect(doc).toContain("Guardrails");
    expect(doc).toContain("Anonymizers");
    expect(doc).toContain("Alerts");
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

  it("accepts Opik context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-opik-drilldown-accepted",
      writerSig: "opik-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-opik-metadata-rejected",
      reason: "Comet Opik product and repository metadata cannot replace AMC-owned Studio drilldown evidence previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "comet-opik-agent-evaluation-studio-drilldown",
      sourceRef: REPO,
      sourceKind: "github_repo",
      publisherRef: "Comet",
      titleRef: TITLE,
      venueRef: "GitHub, product page, and docs",
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0962/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 4,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 4,
      minSourceArtifactLinkCount: 4,
      status: "satisfied",
      evidenceRefs: ["ev-opik-drilldown-accepted"],
      rejectedEvidenceRefs: ["ev-opik-metadata-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([REPO, DOCS, PRODUCT, COMET]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Opik metadata replaces drilldown evidence previews", () => {
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

  it("does not add Opik identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("comet-ml/opik");
      expect(source).not.toContain("comet_opik_studio_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

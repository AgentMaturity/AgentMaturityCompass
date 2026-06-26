import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-3747-comet-opik-studio-drilldown.md";
const REPO = "https://github.com/comet-ml/opik";
const REPO_API = "https://api.github.com/repos/comet-ml/opik";
const README = "https://raw.githubusercontent.com/comet-ml/opik/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/comet-ml/opik/main/LICENSE";
const CONTENTS = "https://api.github.com/repos/comet-ml/opik/contents?ref=main";
const PRIOR_REVIEW = "docs/source-reviews/GAP-0962-comet-opik-studio-drilldown.md";
const TITLE = "comet-ml/opik";
const QUESTION_ID = "AMC-OPIK-TOP100-DRILLDOWN-01";

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
    docsIndexUrl: README,
    docsPageUrls: [REPO_API, LICENSE, CONTENTS, PRIOR_REVIEW],
  });

  return {
    drilldownId: "top100-comet-opik-studio-drilldown",
    sourceRef: REPO,
    sourceKind: "github_repo",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "Comet",
    titleRef: TITLE,
    venueRef: "GitHub repository and prior AMC Opik source review",
    publicationDate: null,
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap3747/${QUESTION_ID}`,
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
    evidenceRefs: ["ev-gap3747-opik-drilldown-accepted"],
    rejectedEvidenceRefs: ["ev-gap3747-opik-metadata-rejected"],
    repairHint: "Keep AMC-owned route, source links, trace preview, receipt preview, evidence preview, empty state, and error state receipts attached to this Opik drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "gap3747-opik-context-agent",
    runId: "run-gap3747",
    ts: Date.UTC(2026, 5, 26),
    reportJsonSha256: hash("9"),
    questionExplainability: {
      generatedAt: "2026-06-26T00:00:00.000Z",
      agentId: "gap3747-opik-context-agent",
      runId: "run-gap3747",
      sourceRefs: [REPO, REPO_API, README, LICENSE, CONTENTS, PRIOR_REVIEW],
      replayable: true,
      failClosed: false,
      manifestHash: hash("a"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Top-100 Comet Opik Studio evidence drilldown",
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
          acceptedEvidenceIds: ["ev-gap3747-opik-drilldown-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-gap3747-opik-drilldown-accepted",
              eventHash: hash("b"),
              writerSig: "gap3747-opik-drilldown-writer",
              eventType: "audit",
              sessionId: "gap3747-opik-session-1",
              ts: Date.UTC(2026, 5, 26),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-gap3747-opik-metadata-rejected",
              eventHash: hash("c"),
              writerSig: "gap3747-opik-drilldown-reviewer",
              eventType: "review",
              sessionId: "gap3747-opik-session-2",
              ts: Date.UTC(2026, 5, 26) + 1000,
              trustTier: "ATTESTED",
              reason: "Comet Opik repository metadata cannot replace AMC-owned Studio drilldown evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap3747-opik-drilldown-accepted"],
              rejectedEvidenceRefs: ["ev-gap3747-opik-metadata-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting Opik observability context.",
          scoreReceiptRef: `diagnostic://run-gap3747/question/${QUESTION_ID}`,
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

describe("GAP-3747 Comet Opik Studio drilldown boundary", () => {
  it("documents live Opik metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3747");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(REPO_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain(PRIOR_REVIEW);
    expect(doc).toContain("default_branch `main`");
    expect(doc).toContain("license `Apache-2.0`");
    expect(doc).toContain("Python");
    expect(doc).toContain("Debug, evaluate, and monitor your LLM applications");
    expect(doc).toContain("RAG systems");
    expect(doc).toContain("agentic workflows");
    expect(doc).toContain("comprehensive tracing");
    expect(doc).toContain("automated evaluations");
    expect(doc).toContain("production-ready dashboards");
    expect(doc).toContain("Open-source AI Observability, Evaluation, and Optimization");
    expect(doc).toContain("LLM-as-a-Judge");
    expect(doc).toContain("Online Evaluation");
    expect(doc).toContain("Guardrails");
    expect(doc).toContain("Datasets");
    expect(doc).toContain("Experiments");
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

  it("accepts Opik context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "top100-comet-opik-studio-drilldown",
      sourceRef: REPO,
      sourceKind: "github_repo",
      publisherRef: "Comet",
      titleRef: TITLE,
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap3747/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 6,
      minSourceArtifactLinkCount: 5,
      status: "satisfied",
      evidenceRefs: ["ev-gap3747-opik-drilldown-accepted"],
      rejectedEvidenceRefs: ["ev-gap3747-opik-metadata-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([REPO, README, REPO_API, LICENSE, CONTENTS, PRIOR_REVIEW]);
    expect(out.evidencePreview.accepted[0]?.writerSig).toBe("gap3747-opik-drilldown-writer");
    expect(out.evidencePreview.rejected[0]?.reason).toContain("cannot replace AMC-owned Studio drilldown evidence previews");
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Opik metadata replaces drilldown evidence previews", () => {
    const metadataOnly = obsLens({
      evidenceRefs: [],
      rejectedEvidenceRefs: [],
      tracePreviewHash: null,
      receiptPreviewHash: null,
      evidencePreviewHash: null,
      emptyStateHash: null,
      errorStateHash: null,
      evidencePreviewState: "blocked",
      evidencePreviewCount: 0,
      status: "blocked",
    });

    const out = buildScoreEvidenceDrilldown(report(metadataOnly), QUESTION_ID);

    expect(out.failClosed).toBe(true);
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      sourceRef: REPO,
      evidencePreviewState: "blocked",
      evidencePreviewCount: 0,
      status: "blocked",
    });
  });

  it("does not add Opik identifiers to generic Studio, Console, Watch, or API modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("comet_opik_drilldown");
      expect(source).not.toContain("comet-ml/opik");
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0967-ragaai-catalyst-studio-drilldown.md";
const URL = "https://github.com/raga-ai-hub/RagaAI-Catalyst";
const DOCS = "https://github.com/raga-ai-hub/RagaAI-Catalyst/tree/main/docs";
const QUICKSTART = "https://github.com/raga-ai-hub/RagaAI-Catalyst/blob/main/Quickstart.md";
const LICENSE = "https://github.com/raga-ai-hub/RagaAI-Catalyst/blob/main/LICENSE";
const REPO = "raga-ai-hub/RagaAI-Catalyst";
const TITLE = "RagaAI Catalyst";
const QUESTION_ID = "AMC-RAGAAI-CATALYST-DRILLDOWN-01";

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
    sourceUrl: URL,
    docsIndexUrl: DOCS,
    docsPageUrls: [QUICKSTART, LICENSE],
  });

  return {
    drilldownId: "ragaai-catalyst-agent-observability-studio-drilldown",
    sourceRef: URL,
    sourceKind: "github_repo",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "RagaAI",
    titleRef: TITLE,
    venueRef: "GitHub repository, README, docs, and license",
    publicationDate: null,
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0967/${QUESTION_ID}`,
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
    evidenceRefs: ["ev-ragaai-catalyst-drilldown-accepted"],
    rejectedEvidenceRefs: ["ev-ragaai-catalyst-metadata-rejected"],
    repairHint: "Keep AMC-owned trace preview, receipt preview, source artifact links, evidence preview, empty-state, and error-state receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(drilldown: QuestionScoreObsStudioDrilldownLensRef = lens()): DiagnosticReport {
  return {
    agentId: "ragaai-catalyst-context-agent",
    runId: "run-gap0967",
    ts: Date.UTC(2026, 5, 22),
    reportJsonSha256: hash("9"),
    questionExplainability: {
      generatedAt: "2026-06-22T23:58:00.000Z",
      agentId: "ragaai-catalyst-context-agent",
      runId: "run-gap0967",
      sourceRefs: [URL, DOCS, QUICKSTART, LICENSE],
      replayable: true,
      failClosed: false,
      manifestHash: hash("a"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "RagaAI Catalyst Studio evidence drilldown",
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
          acceptedEvidenceIds: ["ev-ragaai-catalyst-drilldown-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-ragaai-catalyst-drilldown-accepted",
              eventHash: hash("b"),
              writerSig: "ragaai-catalyst-drilldown-writer",
              eventType: "audit",
              sessionId: "ragaai-catalyst-session-1",
              ts: Date.UTC(2026, 5, 22),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-ragaai-catalyst-metadata-rejected",
              eventHash: hash("c"),
              writerSig: "ragaai-catalyst-drilldown-reviewer",
              eventType: "review",
              sessionId: "ragaai-catalyst-session-2",
              ts: Date.UTC(2026, 5, 22) + 1000,
              trustTier: "ATTESTED",
              reason: "RagaAI Catalyst repository metadata cannot replace AMC-owned Studio drilldown evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-ragaai-catalyst-drilldown-accepted"],
              rejectedEvidenceRefs: ["ev-ragaai-catalyst-metadata-rejected"],
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
          obsStudioDrilldownLens: [drilldown],
          missingGateReasons: [],
          repairHint: "Open the AMC evidence drilldown route before accepting RagaAI Catalyst observability context.",
          scoreReceiptRef: `diagnostic://run-gap0967/question/${QUESTION_ID}`,
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

describe("GAP-0967 RagaAI Catalyst Studio drilldown boundary", () => {
  it("documents live RagaAI Catalyst metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0967");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(QUICKSTART);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("16.2k stars");
    expect(doc).toContain("3.6k forks");
    expect(doc).toContain("17 issues");
    expect(doc).toContain("17 pull requests");
    expect(doc).toContain("1,095 commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("project management");
    expect(doc).toContain("dataset management");
    expect(doc).toContain("evaluation management");
    expect(doc).toContain("trace management");
    expect(doc).toContain("agentic tracing");
    expect(doc).toContain("prompt management");
    expect(doc).toContain("synthetic data generation");
    expect(doc).toContain("guardrail management");
    expect(doc).toContain("red-teaming");
    expect(doc).toContain("timeline");
    expect(doc).toContain("execution graph");
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

  it("accepts RagaAI Catalyst context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-ragaai-catalyst-drilldown-accepted",
      writerSig: "ragaai-catalyst-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-ragaai-catalyst-metadata-rejected",
      reason: "RagaAI Catalyst repository metadata cannot replace AMC-owned Studio drilldown evidence previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "ragaai-catalyst-agent-observability-studio-drilldown",
      sourceRef: URL,
      sourceKind: "github_repo",
      publisherRef: "RagaAI",
      titleRef: TITLE,
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0967/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      sourceArtifactLinkCount: 4,
      status: "satisfied",
      evidenceRefs: ["ev-ragaai-catalyst-drilldown-accepted"],
      rejectedEvidenceRefs: ["ev-ragaai-catalyst-metadata-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([URL, DOCS, QUICKSTART, LICENSE]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when RagaAI Catalyst metadata replaces drilldown evidence previews", () => {
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

  it("does not add RagaAI Catalyst identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ragaai_catalyst_studio_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

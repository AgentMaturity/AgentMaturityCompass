import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0979-helicone-studio-drilldown.md";
const REPO = "Helicone/helicone";
const URL = "https://github.com/Helicone/helicone";
const README = "https://raw.githubusercontent.com/Helicone/helicone/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/Helicone/helicone/main/LICENSE";
const DOCS = "https://docs.helicone.ai/";
const HEAD = "4df16a30ab79bc6f31e4b3a29aca179d767db878";
const RELEASE = "v2025.08.21-1";
const TITLE = "Helicone";
const QUESTION_ID = "AMC-HELICONE-DRILLDOWN-01";

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
    docsPageUrls: [README, LICENSE],
  });

  return {
    drilldownId: "helicone-llm-observability-studio-drilldown",
    sourceRef: URL,
    sourceKind: "github_repo",
    openAlexWorkId: null,
    doi: null,
    publisherRef: TITLE,
    titleRef: TITLE,
    venueRef: "GitHub repository, README, docs, and license",
    publicationDate: null,
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0979/${QUESTION_ID}`,
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
    evidenceRefs: ["ev-helicone-drilldown-accepted"],
    rejectedEvidenceRefs: ["ev-helicone-metadata-rejected"],
    repairHint: "Keep AMC-owned trace preview, receipt preview, source artifact links, evidence preview, empty-state, and error-state receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(drilldown: QuestionScoreObsStudioDrilldownLensRef = lens()): DiagnosticReport {
  return {
    agentId: "helicone-context-agent",
    runId: "run-gap0979",
    ts: Date.UTC(2026, 5, 24),
    reportJsonSha256: hash("9"),
    questionExplainability: {
      generatedAt: "2026-06-24T15:30:00.000Z",
      agentId: "helicone-context-agent",
      runId: "run-gap0979",
      sourceRefs: [URL, README, LICENSE, DOCS],
      replayable: true,
      failClosed: false,
      manifestHash: hash("a"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Helicone Studio evidence drilldown",
          surfaces: ["Score", "Shield", "Watch"],
          claimedLevel: 3,
          supportedMaxLevel: 3,
          finalLevel: 3,
          status: "passed",
          evidenceWindow: {
            eventCount: 2,
            distinctSessionCount: 2,
            firstTs: Date.UTC(2026, 5, 24),
            lastTs: Date.UTC(2026, 5, 24) + 1000,
            durationMs: 1000,
          },
          acceptedEvidenceIds: ["ev-helicone-drilldown-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-helicone-drilldown-accepted",
              eventHash: hash("b"),
              writerSig: "helicone-drilldown-writer",
              eventType: "audit",
              sessionId: "helicone-session-1",
              ts: Date.UTC(2026, 5, 24),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-helicone-metadata-rejected",
              eventHash: hash("c"),
              writerSig: "helicone-drilldown-reviewer",
              eventType: "review",
              sessionId: "helicone-session-2",
              ts: Date.UTC(2026, 5, 24) + 1000,
              trustTier: "ATTESTED",
              reason: "Helicone repository metadata cannot replace AMC-owned Studio drilldown evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-helicone-drilldown-accepted"],
              rejectedEvidenceRefs: ["ev-helicone-metadata-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting Helicone observability context.",
          scoreReceiptRef: `diagnostic://run-gap0979/question/${QUESTION_ID}`,
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

describe("GAP-0979 Helicone Studio drilldown boundary", () => {
  it("documents live Helicone metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0979");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("5,854 stars");
    expect(doc).toContain("609 forks");
    expect(doc).toContain("33 open issues");
    expect(doc).toContain("55 watchers");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("AI Gateway");
    expect(doc).toContain("LLM Observability Platform");
    expect(doc).toContain("agent tracing");
    expect(doc).toContain("LLM routing");
    expect(doc).toContain("cost and latency tracking");
    expect(doc).toContain("datasets and fine-tuning");
    expect(doc).toContain("automatic fallbacks");
    expect(doc).toContain("traces and sessions");
    expect(doc).toContain("prompt management");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("Gemini");
    expect(doc).toContain("MCP server");
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

  it("accepts Helicone context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-helicone-drilldown-accepted",
      writerSig: "helicone-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-helicone-metadata-rejected",
      reason: "Helicone repository metadata cannot replace AMC-owned Studio drilldown evidence previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "helicone-llm-observability-studio-drilldown",
      sourceRef: URL,
      sourceKind: "github_repo",
      publisherRef: TITLE,
      titleRef: TITLE,
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0979/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      sourceArtifactLinkCount: 4,
      status: "satisfied",
      evidenceRefs: ["ev-helicone-drilldown-accepted"],
      rejectedEvidenceRefs: ["ev-helicone-metadata-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([URL, DOCS, README, LICENSE]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Helicone metadata replaces drilldown evidence previews", () => {
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
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      status: "satisfied",
      evidencePreviewState: "empty",
      evidencePreviewCount: 0,
      sourceArtifactLinkCount: 2,
      tracePreviewHash: null,
      receiptPreviewHash: null,
      evidencePreviewHash: null,
      sourceArtifactPreviewHash: null,
      evidenceRefs: [],
    });
  });

  it("keeps Helicone identifiers out of Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("helicone-llm-observability-studio-drilldown");
      expect(source).not.toContain("Helicone repository metadata");
    }
  });
});

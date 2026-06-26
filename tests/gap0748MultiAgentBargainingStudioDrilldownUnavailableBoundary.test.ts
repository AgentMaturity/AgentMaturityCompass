import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0748-multi-agent-bargaining-studio-drilldown-unavailable.md";
const DOI = "10.1145/3742413.3789078";
const OPENALEX = "W7133362381";
const TITLE = "Strategic Tradeoffs Between Humans and AI in Multi-Agent Bargaining";
const ACM = `https://dl.acm.org/doi/${DOI}`;
const QUESTION_ID = "AMC-BARGAINING-DRILLDOWN-01";

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
    doi: `https://doi.org/${DOI}`,
    openAlexWorkId: `https://openalex.org/${OPENALEX}`,
    publisherUrl: ACM,
  });

  return {
    drilldownId: "multi-agent-bargaining-studio-drilldown",
    sourceRef: `https://openalex.org/${OPENALEX}`,
    sourceKind: "paper",
    openAlexWorkId: `https://openalex.org/${OPENALEX}`,
    doi: `https://doi.org/${DOI}`,
    titleRef: TITLE,
    publisherRef: "ACM",
    venueRef: "ACM source unavailable in this environment",
    publicationDate: "2026-06-21",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0748/${QUESTION_ID}`,
    sourceArtifactLinks: links,
    tracePreviewHash: hash("1"),
    reasoningTracePreviewHash: hash("2"),
    receiptPreviewHash: hash("3"),
    evidencePreviewHash: hash("4"),
    sourceArtifactPreviewHash: hash("5"),
    emptyStateHash: hash("6"),
    errorStateHash: hash("7"),
    evidencePreviewState: "ready",
    evidencePreviewCount: 3,
    minEvidencePreviewCount: 2,
    sourceArtifactLinkCount: links.length,
    minSourceArtifactLinkCount: 3,
    status: "satisfied",
    evidenceRefs: ["ev-gap0748-accepted"],
    rejectedEvidenceRefs: ["ev-gap0748-rejected"],
    repairHint: "Keep AMC-owned route, bargaining source links, preview hashes, and empty/error receipts attached to this drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "multi-agent-bargaining-context-agent",
    runId: "run-gap0748",
    ts: Date.UTC(2026, 5, 21),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-21T00:00:00.000Z",
      agentId: "multi-agent-bargaining-context-agent",
      runId: "run-gap0748",
      sourceRefs: [`https://openalex.org/${OPENALEX}`, `https://doi.org/${DOI}`, ACM],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Multi-agent bargaining source artifact drilldown",
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
          acceptedEvidenceIds: ["ev-gap0748-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-gap0748-accepted",
              eventHash: hash("c"),
              writerSig: "gap0748-drilldown-writer",
              eventType: "audit",
              sessionId: "gap0748-session-1",
              ts: Date.UTC(2026, 5, 21),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-gap0748-rejected",
              eventHash: hash("d"),
              writerSig: "gap0748-drilldown-reviewer",
              eventType: "review",
              sessionId: "gap0748-session-2",
              ts: Date.UTC(2026, 5, 21) + 1000,
              trustTier: "ATTESTED",
              reason: "ACM/DOI/OpenAlex metadata cannot replace AMC-owned bargaining drilldown previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0748-accepted"],
              rejectedEvidenceRefs: ["ev-gap0748-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting multi-agent bargaining context.",
          scoreReceiptRef: `diagnostic://run-gap0748/question/${QUESTION_ID}`,
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

describe("GAP-0748 multi-agent bargaining Studio evidence drilldown boundary", () => {
  it("documents unavailable ACM metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0748");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title and DOI searches returned no primary result");
    expect(doc).toContain("returned `403`");
    expect(doc).toContain("Studio evidence drilldown");
    expect(doc).toContain("economics");
    expect(doc).toContain("microeconomics");
    expect(doc).toContain("Bayesian probability");
    expect(doc).toContain("Bayesian inference");
    expect(doc).toContain("empirical evidence");
    expect(doc).toContain("markets increasingly accommodating LLMs");
    expect(doc).toContain("UI route, source artifact links, evidence preview, and empty/error states");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts bargaining context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-gap0748-accepted",
      writerSig: "gap0748-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-gap0748-rejected",
      reason: "ACM/DOI/OpenAlex metadata cannot replace AMC-owned bargaining drilldown previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "multi-agent-bargaining-studio-drilldown",
      sourceKind: "paper",
      publisherRef: "ACM",
      titleRef: TITLE,
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0748/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 3,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 3,
      minSourceArtifactLinkCount: 3,
      status: "satisfied",
      evidenceRefs: ["ev-gap0748-accepted"],
      rejectedEvidenceRefs: ["ev-gap0748-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      `https://doi.org/${DOI}`,
      `https://openalex.org/${OPENALEX}`,
      ACM,
    ]);
  });

  it("fails closed when bargaining metadata replaces drilldown evidence previews", () => {
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
  });

  it("does not add source-specific identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("multi_agent_bargaining_studio_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

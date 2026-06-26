import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0918-tracemind-studio-drilldown.md";
const REPO = "https://github.com/Aayush-engineer/TraceMind";
const README = `${REPO}/blob/main/README.md`;
const DOCS = `${REPO}/tree/main/docs`;
const BACKEND = `${REPO}/tree/main/backend`;
const FRONTEND = `${REPO}/tree/main/frontend`;
const SDK = `${REPO}/tree/main/sdk`;
const PACKAGE_LOCK = `${REPO}/blob/main/package-lock.json`;
const TITLE = "TraceMind";
const QUESTION_ID = "AMC-TRACEMIND-DRILLDOWN-01";

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
    sourceUrl: REPO,
    docsIndexUrl: README,
    docsPageUrls: [DOCS, BACKEND, FRONTEND, SDK, PACKAGE_LOCK],
  });

  return {
    drilldownId: "tracemind-studio-drilldown",
    sourceRef: REPO,
    sourceKind: "repository",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "GitHub repository",
    titleRef: TITLE,
    venueRef: "LLM observability and evaluation platform repository",
    publicationDate: "2026-06-22",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0918/${QUESTION_ID}`,
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
    evidenceRefs: ["ev-tracemind-accepted"],
    rejectedEvidenceRefs: ["ev-tracemind-rejected"],
    repairHint: "Keep AMC-owned trace previews, receipts, source links, and empty/error states attached to this TraceMind drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(drilldown: QuestionScoreObsStudioDrilldownLensRef = lens()): DiagnosticReport {
  return {
    agentId: "tracemind-context-agent",
    runId: "run-gap0918",
    ts: Date.UTC(2026, 5, 22),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-22T22:18:00.000Z",
      agentId: "tracemind-context-agent",
      runId: "run-gap0918",
      sourceRefs: [REPO, README],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "TraceMind repository evidence drilldown",
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
          acceptedEvidenceIds: ["ev-tracemind-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-tracemind-accepted",
              eventHash: hash("c"),
              writerSig: "tracemind-drilldown-writer",
              eventType: "audit",
              sessionId: "tracemind-session-1",
              ts: Date.UTC(2026, 5, 22),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-tracemind-rejected",
              eventHash: hash("d"),
              writerSig: "tracemind-drilldown-reviewer",
              eventType: "review",
              sessionId: "tracemind-session-2",
              ts: Date.UTC(2026, 5, 22) + 1000,
              trustTier: "ATTESTED",
              reason: "TraceMind README metadata cannot replace AMC-owned evidence previews",
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
          repairHint: "Open the AMC evidence drilldown route before accepting TraceMind observability context.",
          scoreReceiptRef: `diagnostic://run-gap0918/question/${QUESTION_ID}`,
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

describe("GAP-0918 TraceMind Studio evidence drilldown boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0918");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("69 Commits");
    expect(doc).toContain(".github");
    expect(doc).toContain("backend");
    expect(doc).toContain("docs");
    expect(doc).toContain("frontend");
    expect(doc).toContain("sdk");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("package-lock.json");
    expect(doc).toContain("render.yaml");
    expect(doc).toContain("verify_all.py");
    expect(doc).toContain("Open-source AI evaluation and observability platform");
    expect(doc).toContain("self-hosted");
    expect(doc).toContain("no vendor lock-in");
    expect(doc).toContain("Quality drops from 87% to 61%");
    expect(doc).toContain("Score drops: 8.2");
    expect(doc).toContain("Alert fires within minutes");
    expect(doc).toContain("Automatic quality scoring");
    expect(doc).toContain("Eval suites against golden datasets");
    expect(doc).toContain("Regression alerts");
    expect(doc).toContain("Hallucination detection");
    expect(doc).toContain("Prompt A/B testing");
    expect(doc).toContain("Live trace streaming");
    expect(doc).toContain("Mann-Whitney U test");
    expect(doc).toContain("Cohen's d");
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

  it("accepts TraceMind context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "tracemind-studio-drilldown",
      sourceRef: REPO,
      titleRef: TITLE,
      evidencePreviewState: "ready",
      sourceArtifactLinkCount: 7,
      status: "satisfied",
      evidenceRefs: ["ev-tracemind-accepted"],
      rejectedEvidenceRefs: ["ev-tracemind-rejected"],
    });
  });

  it("fails closed when TraceMind metadata replaces drilldown evidence previews", () => {
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
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinkCount).toBe(2);
  });

  it("does not add TraceMind identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Aayush-engineer/TraceMind");
      expect(source).not.toContain("tracemind_studio_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

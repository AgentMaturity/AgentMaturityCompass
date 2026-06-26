import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0783-awesome-agent-evolution-studio-drilldown.md";
const REPO = "https://github.com/Shiyao-Huang/awesome-agent-evolution";
const README_EN = `${REPO}/blob/main/README-EN.md`;
const WEBSITE = "https://agent-evolution.com/";
const EAI_INDEX = `${REPO}/blob/main/analysis/evolve-agi-index.md`;
const PROJECT_INDEX = `${REPO}/blob/main/projects/INDEX.md`;
const SITE_PACKAGE = `${REPO}/blob/main/site/package.json`;
const TITLE = "Awesome Self-Evolving AI Agents";
const QUESTION_ID = "AMC-AWESOME-AGENT-EVOLUTION-DRILLDOWN-01";

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
    docsIndexUrl: README_EN,
    docsPageUrls: [WEBSITE, EAI_INDEX, PROJECT_INDEX, SITE_PACKAGE],
  });

  return {
    drilldownId: "awesome-agent-evolution-studio-drilldown",
    sourceRef: REPO,
    sourceKind: "repository",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "GitHub repository",
    titleRef: TITLE,
    venueRef: "Open survey repository",
    publicationDate: "2026-06-21",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0783/${QUESTION_ID}`,
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
    evidenceRefs: ["ev-awesome-agent-evolution-accepted"],
    rejectedEvidenceRefs: ["ev-awesome-agent-evolution-rejected"],
    repairHint: "Keep AMC-owned source links, previews, empty state, and error state receipts attached to this repository drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "awesome-agent-evolution-context-agent",
    runId: "run-gap0783",
    ts: Date.UTC(2026, 5, 21),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-21T00:00:00.000Z",
      agentId: "awesome-agent-evolution-context-agent",
      runId: "run-gap0783",
      sourceRefs: [REPO, README_EN, WEBSITE],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "Awesome Agent Evolution repository evidence drilldown",
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
          acceptedEvidenceIds: ["ev-awesome-agent-evolution-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-awesome-agent-evolution-accepted",
              eventHash: hash("c"),
              writerSig: "awesome-agent-evolution-drilldown-writer",
              eventType: "audit",
              sessionId: "awesome-agent-evolution-session-1",
              ts: Date.UTC(2026, 5, 21),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-awesome-agent-evolution-rejected",
              eventHash: hash("d"),
              writerSig: "awesome-agent-evolution-drilldown-reviewer",
              eventType: "review",
              sessionId: "awesome-agent-evolution-session-2",
              ts: Date.UTC(2026, 5, 21) + 1000,
              trustTier: "ATTESTED",
              reason: "repository README metadata cannot replace AMC-owned evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-awesome-agent-evolution-accepted"],
              rejectedEvidenceRefs: ["ev-awesome-agent-evolution-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting repository survey context.",
          scoreReceiptRef: `diagnostic://run-gap0783/question/${QUESTION_ID}`,
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

describe("GAP-0783 Awesome Agent Evolution Studio evidence drilldown boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0783");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README_EN);
    expect(doc).toContain(SITE_PACKAGE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("survey-first map");
    expect(doc).toContain("agent-evolution");
    expect(doc).toContain("self-evolving-agents");
    expect(doc).toContain("agent-swarm");
    expect(doc).toContain("memory-system");
    expect(doc).toContain("harness-engineering");
    expect(doc).toContain("benchmark");
    expect(doc).toContain("Observe -> Interpret -> Modify -> Verify -> Retain");
    expect(doc).toContain("Evolve-AGI Index");
    expect(doc).toContain("2026-06-21 17:05 +0800");
    expect(doc).toContain("root `LICENSE` and root `package.json` returned 404");
    expect(doc).toContain("Astro");
    expect(doc).toContain("React");
    expect(doc).toContain("Three");
    expect(doc).toContain("empty/error-state receipts");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts repository context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-awesome-agent-evolution-accepted",
      writerSig: "awesome-agent-evolution-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-awesome-agent-evolution-rejected",
      reason: "repository README metadata cannot replace AMC-owned evidence previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "awesome-agent-evolution-studio-drilldown",
      sourceRef: REPO,
      sourceKind: "repository",
      publisherRef: "GitHub repository",
      titleRef: TITLE,
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0783/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 6,
      minSourceArtifactLinkCount: 4,
      status: "satisfied",
      evidenceRefs: ["ev-awesome-agent-evolution-accepted"],
      rejectedEvidenceRefs: ["ev-awesome-agent-evolution-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      REPO,
      README_EN,
      WEBSITE,
      EAI_INDEX,
      PROJECT_INDEX,
      SITE_PACKAGE,
    ]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when repository metadata replaces drilldown evidence previews", () => {
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

  it("keeps empty drilldown state explicit when the question receipt pack is absent", () => {
    const out = buildScoreEvidenceDrilldown({ ...report(), questionExplainability: undefined } as DiagnosticReport, QUESTION_ID);

    expect(out.state).toBe("empty");
    expect(out.message).toContain("does not include question-level explainability receipts");
    expect(out.obsStudioDrilldownPreview).toEqual([]);
    expect(out.failClosed).toBe(true);
  });

  it("does not add Awesome Agent Evolution identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("awesome-agent-evolution");
      expect(source).not.toContain("self_evolving_agent_evidence_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

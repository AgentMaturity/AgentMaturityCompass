import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScoreEvidenceDrilldown } from "../src/diagnostic/evidenceDrilldown.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport, QuestionScoreObsStudioDrilldownLensRef } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0911-ares-dashboard-studio-drilldown.md";
const REPO = "https://github.com/Arnoldlarry15/ARES-Dashboard";
const README = `${REPO}/blob/main/README.md`;
const SECURITY = `${REPO}/blob/main/SECURITY.md`;
const DOCS = `${REPO}/tree/main/docs`;
const API = `${REPO}/tree/main/api`;
const COMPONENTS = `${REPO}/tree/main/components`;
const PACKAGE = `${REPO}/blob/main/package.json`;
const TITLE = "ARES Dashboard";
const QUESTION_ID = "AMC-ARES-DASHBOARD-DRILLDOWN-01";

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
    docsPageUrls: [SECURITY, DOCS, API, COMPONENTS, PACKAGE],
  });

  return {
    drilldownId: "ares-dashboard-studio-drilldown",
    sourceRef: REPO,
    sourceKind: "repository",
    openAlexWorkId: null,
    doi: null,
    publisherRef: "GitHub repository",
    titleRef: TITLE,
    venueRef: "AI red team operations console repository",
    publicationDate: "2026-06-22",
    uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0911/${QUESTION_ID}`,
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
    evidenceRefs: ["ev-ares-dashboard-accepted"],
    rejectedEvidenceRefs: ["ev-ares-dashboard-rejected"],
    repairHint: "Keep AMC-owned source links, previews, empty state, and error state receipts attached to this ARES drilldown row.",
    rowHash: hash("8"),
    ...overrides,
  };
}

function report(lens: QuestionScoreObsStudioDrilldownLensRef = obsLens()): DiagnosticReport {
  return {
    agentId: "ares-dashboard-context-agent",
    runId: "run-gap0911",
    ts: Date.UTC(2026, 5, 22),
    reportJsonSha256: hash("a"),
    questionExplainability: {
      generatedAt: "2026-06-22T22:11:00.000Z",
      agentId: "ares-dashboard-context-agent",
      runId: "run-gap0911",
      sourceRefs: [REPO, README, SECURITY],
      replayable: true,
      failClosed: false,
      manifestHash: hash("b"),
      rows: [
        {
          questionId: QUESTION_ID,
          title: "ARES Dashboard repository evidence drilldown",
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
          acceptedEvidenceIds: ["ev-ares-dashboard-accepted"],
          signedEvidenceRefs: [
            {
              evidenceId: "ev-ares-dashboard-accepted",
              eventHash: hash("c"),
              writerSig: "ares-dashboard-drilldown-writer",
              eventType: "audit",
              sessionId: "ares-dashboard-session-1",
              ts: Date.UTC(2026, 5, 22),
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              evidenceId: "ev-ares-dashboard-rejected",
              eventHash: hash("d"),
              writerSig: "ares-dashboard-drilldown-reviewer",
              eventType: "review",
              sessionId: "ares-dashboard-session-2",
              ts: Date.UTC(2026, 5, 22) + 1000,
              trustTier: "ATTESTED",
              reason: "ARES Dashboard README metadata cannot replace AMC-owned evidence previews",
            },
          ],
          componentDiagnostics: [],
          criteriaDiagnostics: [
            {
              criterionId: "studio-evidence-drilldown-route",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-ares-dashboard-accepted"],
              rejectedEvidenceRefs: ["ev-ares-dashboard-rejected"],
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
          repairHint: "Open the AMC evidence drilldown route before accepting ARES operations-console context.",
          scoreReceiptRef: `diagnostic://run-gap0911/question/${QUESTION_ID}`,
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

describe("GAP-0911 ARES Dashboard Studio evidence drilldown boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0911");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 16");
    expect(doc).toContain("Fork 7");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 6");
    expect(doc).toContain("332 Commits");
    expect(doc).toContain(".github");
    expect(doc).toContain("api");
    expect(doc).toContain("assets");
    expect(doc).toContain("components");
    expect(doc).toContain("config");
    expect(doc).toContain("database");
    expect(doc).toContain("docs");
    expect(doc).toContain("helm/ ares-dashboard");
    expect(doc).toContain("hooks");
    expect(doc).toContain("lib");
    expect(doc).toContain("prisma");
    expect(doc).toContain("public");
    expect(doc).toContain("repositories");
    expect(doc).toContain("scripts");
    expect(doc).toContain("services");
    expect(doc).toContain("tests");
    expect(doc).toContain("types");
    expect(doc).toContain("utils");
    expect(doc).toContain(".env.docker.example");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("App.tsx");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("constants.tsx");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("metadata.json");
    expect(doc).toContain("package-lock.json");
    expect(doc).toContain("package.json");
    expect(doc).toContain("playwright.config.ts");
    expect(doc).toContain("prisma.config.ts");
    expect(doc).toContain("AI Red Team Operations Console");
    expect(doc).toContain("structured adversarial testing");
    expect(doc).toContain("risk frameworks");
    expect(doc).toContain("role-based access control");
    expect(doc).toContain("audit logging");
    expect(doc).toContain("persistent campaign storage");
    expect(doc).toContain("AI-assisted scenario generation");
    expect(doc).toContain("OWASP LLM Top 10");
    expect(doc).toContain("MITRE ATLAS");
    expect(doc).toContain("ATT&CK");
    expect(doc).toContain("SOC 2");
    expect(doc).toContain("ISO 27001");
    expect(doc).toContain("GDPR");
    expect(doc).toContain("Auth0");
    expect(doc).toContain("Azure AD");
    expect(doc).toContain("Clerk");
    expect(doc).toContain("Okta");
    expect(doc).toContain("JWT");
    expect(doc).toContain("SSO");
    expect(doc).toContain("Team Workspaces");
    expect(doc).toContain("Google Gemini");
    expect(doc).toContain("JSON manifests");
    expect(doc).toContain("UI route");
    expect(doc).toContain("source artifact links");
    expect(doc).toContain("evidence preview");
    expect(doc).toContain("empty/error-state receipts");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts ARES context only through AMC-owned Studio drilldown receipts", () => {
    const out = buildScoreEvidenceDrilldown(report(), QUESTION_ID);

    expect(out.state).toBe("ready");
    expect(out.failClosed).toBe(false);
    expect(out.replayable).toBe(true);
    expect(out.evidencePreview.accepted[0]).toMatchObject({
      evidenceId: "ev-ares-dashboard-accepted",
      writerSig: "ares-dashboard-drilldown-writer",
    });
    expect(out.evidencePreview.rejected[0]).toMatchObject({
      evidenceId: "ev-ares-dashboard-rejected",
      reason: "ARES Dashboard README metadata cannot replace AMC-owned evidence previews",
    });
    expect(out.obsStudioDrilldownPreview[0]).toMatchObject({
      drilldownId: "ares-dashboard-studio-drilldown",
      sourceRef: REPO,
      sourceKind: "repository",
      publisherRef: "GitHub repository",
      titleRef: TITLE,
      uiRoutePath: `/api/v1/score/evidence-drilldown/run-gap0911/${QUESTION_ID}`,
      evidencePreviewState: "ready",
      evidencePreviewCount: 5,
      minEvidencePreviewCount: 2,
      sourceArtifactLinkCount: 7,
      minSourceArtifactLinkCount: 4,
      status: "satisfied",
      evidenceRefs: ["ev-ares-dashboard-accepted"],
      rejectedEvidenceRefs: ["ev-ares-dashboard-rejected"],
      rowHash: hash("8"),
    });
    expect(out.obsStudioDrilldownPreview[0]?.sourceArtifactLinks).toEqual([
      REPO,
      README,
      SECURITY,
      DOCS,
      API,
      COMPONENTS,
      PACKAGE,
    ]);
    expect(out.obsStudioDrilldownPreview[0]?.emptyStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.obsStudioDrilldownPreview[0]?.errorStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when ARES metadata replaces drilldown evidence previews", () => {
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

  it("does not add ARES identifiers to Studio drilldown implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("ARES-Dashboard");
      expect(source).not.toContain("ares_dashboard_studio_drilldown");
      expect(source).not.toContain(TITLE);
    }
  });
});

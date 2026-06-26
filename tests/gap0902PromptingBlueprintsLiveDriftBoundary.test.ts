import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0902-prompting-blueprints-live-drift.md";
const REPO = "TomasHer/prompting-blueprints";
const URL = "https://github.com/TomasHer/prompting-blueprints";
const TITLE = "Prompting Blueprints";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0902-${prefix}-trace-${index}`,
    scenarioId: `gap0902-prompt-blueprint-score-${index}`,
    timestamp: `2026-06-22T1${index}:02:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:prompt-playbook-agent:${index}`,
    taskCategory: "prompting-blueprints-score-live-drift",
    domain: "agent-evaluation-prompt-workflow",
    agentEvaluationDimension: "observed_prompt_blueprint_score_behavior_drift",
    interactionTurnCount: prefix === "live" ? 16 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.015,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 6 : 2,
    latencyMs: prefix === "live" ? 3100 : 1150,
    costUsd: prefix === "live" ? 0.048 : 0.012,
    evidenceRefs: [`ev-gap0902-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0902-${prefix}-${index}`],
  }));
}

describe("GAP-0902 Prompting Blueprints live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0902");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 18");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("134 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("HTML 83.5%");
    expect(doc).toContain("Python 16.5%");
    expect(doc).toContain(".agent");
    expect(doc).toContain(".vscode");
    expect(doc).toContain("01-about-author");
    expect(doc).toContain("02-ai-agents");
    expect(doc).toContain("03-prompts-and-patterns");
    expect(doc).toContain("04-guides");
    expect(doc).toContain("05-tools");
    expect(doc).toContain("06-models-and-evaluations");
    expect(doc).toContain("07-use-cases-and-research");
    expect(doc).toContain("08-requirements-engineering");
    expect(doc).toContain("09-conferences");
    expect(doc).toContain("assets");
    expect(doc).toContain("website");
    expect(doc).toContain("BACKLOG.md");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("CITATION.cff");
    expect(doc).toContain("CODE_OF_CONDUCT.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("external-sources.md");
    expect(doc).toContain("mkdocs.yml");
    expect(doc).toContain("source-index.md");
    expect(doc).toContain("structure.txt");
    expect(doc).toContain("Agentic AI evolution");
    expect(doc).toContain("autonomous AI workflows");
    expect(doc).toContain("structured prompt packs");
    expect(doc).toContain("rigorous evaluations");
    expect(doc).toContain("MCP/A2A protocols");
    expect(doc).toContain("context engineering");
    expect(doc).toContain("NotebookLM");
    expect(doc).toContain("Perplexity Comet");
    expect(doc).toContain("Copilot Agents");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("promptfoo configs");
    expect(doc).toContain("Requirements engineering");
    expect(doc).toContain("GAISE 2026");
    expect(doc).toContain("baseline distribution");
    expect(doc).toContain("live sample");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert receipt");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for prompt-workflow score changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0902-prompting-blueprints-reviewed-agent",
      baselineWindow: {
        windowId: "gap0902-baseline",
        startedAt: "2026-06-21T10:02:00.000Z",
        endedAt: "2026-06-21T13:02:00.000Z",
        rows: rows("baseline", 0.89, "stable-prompt-workflow-score"),
      },
      liveWindow: {
        windowId: "gap0902-live",
        startedAt: "2026-06-22T10:02:00.000Z",
        endedAt: "2026-06-22T13:02:00.000Z",
        rows: rows("live", 0.51, "drifted-prompt-workflow-score"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:02:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when Prompting Blueprints source metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.51, "drifted-prompt-workflow-score").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0902-prompting-blueprints-reviewed-agent",
      baselineWindow: {
        windowId: "gap0902-metadata-only-baseline",
        startedAt: "2026-06-21T10:02:00.000Z",
        endedAt: "2026-06-21T13:02:00.000Z",
        rows: rows("baseline", 0.89, "stable-prompt-workflow-score"),
      },
      liveWindow: {
        windowId: "gap0902-metadata-only-live",
        startedAt: "2026-06-22T10:02:00.000Z",
        endedAt: "2026-06-22T13:02:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:02:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add Prompting Blueprints identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("prompting_blueprints_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});

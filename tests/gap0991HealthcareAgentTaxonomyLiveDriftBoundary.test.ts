import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0991-healthcare-agent-taxonomy-live-drift.md";
const OPENALEX = "https://openalex.org/W7118158543";
const OPENALEX_API = "https://api.openalex.org/works/W7118158543";
const DOI = "https://doi.org/10.1109/access.2026.3651218";
const IEEE = "https://ieeexplore.ieee.org/document/11329025/";
const CROSSREF = "https://api.crossref.org/works/10.1109/access.2026.3651218";
const TITLE = "Agentic AI in Healthcare and Medicine: A Seven-Dimensional Taxonomy for Empirical Evaluation of LLM-Based Agents";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0991-${prefix}-trace-${index}`,
    scenarioId: `gap0991-healthcare-agent-taxonomy-${index}`,
    timestamp: `2026-06-24T1${index}:37:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:healthcare-agent-taxonomy-${index}`,
    taskCategory: "healthcare-agent-taxonomy-live-drift",
    domain: "healthcare-agent-evaluation",
    agentEvaluationDimension: "observed_healthcare_agent_behavior_drift",
    physicianBenchBenchmarkId: "gap0991-amc-owned-healthcare-agent-taxonomy-drift",
    physicianBenchTaskSetVersion: "2026.06.24",
    physicianBenchTaskId: `gap0991-task-${index}`,
    physicianBenchSpecialty: "general-medicine-evaluation-fixture",
    physicianBenchTaskType: index % 2 === 0 ? "clinical_reasoning" : "documentation",
    physicianBenchTaskSuccess: prefix === "baseline",
    physicianBenchCheckpointPassRate0to1: prefix === "live" ? 0.46 : 0.92,
    physicianBenchFhirDataAccessAccuracy0to1: prefix === "live" ? 0.52 : 0.9,
    physicianBenchClinicalActionSafety0to1: prefix === "live" ? 0.55 : 0.94,
    physicianBenchDocumentationQuality0to1: prefix === "live" ? 0.5 : 0.91,
    physicianBenchTrajectoryCaptured: true,
    physicianBenchArtifactBundleComplete: true,
    invalidActionRate0to1: prefix === "live" ? 0.18 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.12 : 0.01,
    toolCallCount: prefix === "live" ? 17 : 9,
    latencyMs: prefix === "live" ? 5200 : 1450,
    costUsd: prefix === "live" ? 0.072 : 0.018,
    evidenceRefs: [`ev-gap0991-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0991-${prefix}-${index}`],
  }));
}

describe("GAP-0991 healthcare agent taxonomy live-drift boundary", () => {
  it("documents live healthcare taxonomy metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0991");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(IEEE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("IEEE Access");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("published `2026`");
    expect(doc).toContain("Institute of Electrical and Electronics Engineers (IEEE)");
    expect(doc).toContain("Shubham Vatsal");
    expect(doc).toContain("Harsh Dubey");
    expect(doc).toContain("Aditi Singh");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Knowledge management");
    expect(doc).toContain("Benchmarking");
    expect(doc).toContain("Health care");
    expect(doc).toContain("Rubric");
    expect(doc).toContain("referenced_works_count `63`");
    expect(doc).toContain("reference-count `134`");
    expect(doc).toContain("CC BY");
    expect(doc).toContain("WAF challenge");
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

  it("accepts healthcare taxonomy context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0991-healthcare-taxonomy-reviewed-agent",
      baselineWindow: {
        windowId: "gap0991-baseline",
        startedAt: "2026-06-23T10:37:00.000Z",
        endedAt: "2026-06-23T13:37:00.000Z",
        rows: rows("baseline", 0.91, "stable-healthcare-agent-taxonomy"),
      },
      liveWindow: {
        windowId: "gap0991-live",
        startedAt: "2026-06-24T10:37:00.000Z",
        endedAt: "2026-06-24T13:37:00.000Z",
        rows: rows("live", 0.48, "drifted-healthcare-agent-taxonomy"),
      },
      sourceRefs: [OPENALEX, DOI, CROSSREF],
      now: new Date("2026-06-24T14:37:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([OPENALEX, DOI, CROSSREF]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "errorRate0to1",
      "latencyMsP95",
      "costUsdMean",
      "physicianBenchTaskSuccessRate0to1",
      "physicianBenchClinicalActionSafetyRate0to1",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when healthcare taxonomy metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.48, "drifted-healthcare-agent-taxonomy").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0991-healthcare-taxonomy-reviewed-agent",
      baselineWindow: {
        windowId: "gap0991-metadata-only-baseline",
        startedAt: "2026-06-23T10:37:00.000Z",
        endedAt: "2026-06-23T13:37:00.000Z",
        rows: rows("baseline", 0.91, "stable-healthcare-agent-taxonomy"),
      },
      liveWindow: {
        windowId: "gap0991-metadata-only-live",
        startedAt: "2026-06-24T10:37:00.000Z",
        endedAt: "2026-06-24T13:37:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [OPENALEX],
      now: new Date("2026-06-24T14:37:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add healthcare taxonomy identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W7118158543");
      expect(source).not.toContain("healthcare_agent_taxonomy_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});

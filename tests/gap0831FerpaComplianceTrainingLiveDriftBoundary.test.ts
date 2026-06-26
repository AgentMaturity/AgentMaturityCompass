import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0831-ferpa-compliance-training-live-drift.md";
const OPENALEX = "https://openalex.org/W7161011426";
const DOI = "https://doi.org/10.1145/3768310.3807798";
const ACM = "https://dl.acm.org/doi/10.1145/3768310.3807798";
const TITLE = "Enhancing Compliance Training with LLM-Powered Conversational Agents: A Design Science Evaluation of FERPA Education";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0831-${prefix}-trace-${index}`,
    scenarioId: `gap0831-ferpa-compliance-training-${index}`,
    timestamp: `2026-06-21T1${index}:55:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 1,
    behaviorSignature: `${behavior}:ferpa-training:${index}`,
    taskCategory: "compliance-training-live-drift",
    domain: "education-compliance-training",
    agentEvaluationDimension: "observed_compliance_training_behavior_drift",
    interactionTurnCount: prefix === "live" ? 18 + index : 9 + index,
    invalidActionRate0to1: prefix === "live" ? 0.11 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 7 : 4,
    latencyMs: prefix === "live" ? 3600 : 1500,
    costUsd: prefix === "live" ? 0.054 : 0.018,
    evidenceRefs: [`ev-gap0831-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0831-${prefix}-${index}`],
  }));
}

describe("GAP-0831 FERPA compliance-training live-drift boundary", () => {
  it("documents live DOI/OpenAlex/ACM metadata limitations and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0831");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ACM);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("ACM returned HTTP/2 403");
    expect(doc).toContain("OpenAlex page returned HTTP/2 403");
    expect(doc).toContain("api.openalex.org DNS lookup failed");
    expect(doc).toContain("api.crossref.org DNS lookup failed");
    expect(doc).toContain("api.semanticscholar.org DNS lookup failed");
    expect(doc).toContain("Compliance training");
    expect(doc).toContain("FERPA");
    expect(doc).toContain("LLM-Powered Conversational Agents");
    expect(doc).toContain("Design Science Evaluation");
    expect(doc).toContain("training traces");
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

  it("uses existing Watch live-drift receipts for compliance-training behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0831-ferpa-training-reviewed-agent",
      baselineWindow: {
        windowId: "gap0831-baseline",
        startedAt: "2026-06-20T10:55:00.000Z",
        endedAt: "2026-06-20T13:55:00.000Z",
        rows: rows("baseline", 0.9, "stable-compliance-training"),
      },
      liveWindow: {
        windowId: "gap0831-live",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T13:55:00.000Z",
        rows: rows("live", 0.6, "drifted-compliance-training"),
      },
      sourceRefs: [OPENALEX, DOI, ACM],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([OPENALEX, DOI, ACM]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when paper metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.6, "drifted-compliance-training").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0831-ferpa-training-reviewed-agent",
      baselineWindow: {
        windowId: "gap0831-metadata-only-baseline",
        startedAt: "2026-06-20T10:55:00.000Z",
        endedAt: "2026-06-20T13:55:00.000Z",
        rows: rows("baseline", 0.9, "stable-compliance-training"),
      },
      liveWindow: {
        windowId: "gap0831-metadata-only-live",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T13:55:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [OPENALEX, DOI, ACM],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add FERPA training identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("ferpa_compliance_training_live_drift");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(TITLE);
    }
  });
});

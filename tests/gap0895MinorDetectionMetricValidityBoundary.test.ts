import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0895-minor-detection-metric-validity.md";
const REPO = "xiaohanzhang2005/Minor-Detection";
const URL = "https://github.com/xiaohanzhang2005/Minor-Detection";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(): QuestionScore {
  return {
    questionId: "AMC-MINOR-DETECTION-01",
    claimedLevel: 1,
    supportedMaxLevel: 1,
    finalLevel: 1,
    confidence: 0.12,
    evidenceEventIds: [],
    flags: ["FLAG_UNSUPPORTED_CLAIM"],
    narrative: "Minor-Detection metadata-only proof must fail closed.",
  };
}

describe("GAP-0895 Minor-Detection metric-validity boundary", () => {
  it("documents live retrieval failure, local metadata, and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0895");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain("live GitHub repository page could not be fetched");
    expect(doc).toContain("Cache miss");
    expect(doc).toContain("search queries returned no results");
    expect(doc).toContain("source-unverified");
    expect(doc).toContain("Done - skipped");
    expect(doc).toContain("Self-evolving minor-user identification agent");
    expect(doc).toContain("trigger evaluation");
    expect(doc).toContain("evidence chains");
    expect(doc).toContain("deployable protection workflows");
    expect(doc).toContain("minor-protection");
    expect(doc).toContain("risk-detection");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("No product implementation module changed");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("fails closed when unverified Minor-Detection metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "minor-detection-metadata-only-agent",
      runId: "run-gap0895-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.1,
      evidenceCoverage: 0.1,
      correlationRatio: 0.1,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [score()],
      questions: [{ id: "AMC-MINOR-DETECTION-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add unverified Minor-Detection identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("minor_detection_metric_validity");
    }
  });
});

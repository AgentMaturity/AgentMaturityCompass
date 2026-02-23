import { describe, it, expect } from "vitest";
import { buildDensityMap, scanDensityMapInfra } from "../src/score/densityMap.js";
import { ingestEvidence, TRUST_WEIGHTS } from "../src/score/evidenceIngestion.js";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── Density Map ───

describe("densityMap", () => {
  it("full coverage scores 100", () => {
    const records = [
      { questionId: "AMC-1.1", dimension: "Strategic Ops", count: 5 },
      { questionId: "AMC-1.2", dimension: "Strategic Ops", count: 3 },
      { questionId: "AMC-2.1", dimension: "Reliability", count: 4 },
      { questionId: "AMC-2.2", dimension: "Reliability", count: 2 },
    ];
    const result = buildDensityMap(records, 4);
    expect(result.overallCoverage).toBe(1);
    expect(result.blindSpots).toBe(0);
    expect(result.score).toBe(100);
  });

  it("partial coverage shows blind spots", () => {
    const records = [
      { questionId: "AMC-1.1", dimension: "Strategic Ops", count: 5 },
      { questionId: "AMC-1.2", dimension: "Strategic Ops", count: 0 },
      { questionId: "AMC-2.1", dimension: "Reliability", count: 0 },
      { questionId: "AMC-2.2", dimension: "Reliability", count: 0 },
    ];
    const result = buildDensityMap(records, 4);
    expect(result.blindSpots).toBe(3);
    expect(result.overallCoverage).toBe(0.25);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it("empty records return zero", () => {
    const result = buildDensityMap([], 10);
    expect(result.score).toBe(0);
    expect(result.blindSpots).toBe(10);
  });

  it("detects dimensional clustering", () => {
    const records = [
      { questionId: "AMC-1.1", dimension: "Security", count: 10 },
      { questionId: "AMC-1.2", dimension: "Security", count: 8 },
      { questionId: "AMC-1.3", dimension: "Security", count: 9 },
      { questionId: "AMC-2.1", dimension: "Observability", count: 0 },
      { questionId: "AMC-2.2", dimension: "Observability", count: 0 },
      { questionId: "AMC-2.3", dimension: "Observability", count: 0 },
    ];
    const result = buildDensityMap(records, 6);
    expect(result.clusterPattern).toBe("dimensional");
  });

  it("scan detects infrastructure", () => {
    const result = scanDensityMapInfra(ROOT);
    expect(result.score).toBeGreaterThan(0);
  });
});

// ─── Evidence Ingestion ───

describe("evidenceIngestion", () => {
  it("ingests OpenAI evals format", () => {
    const result = ingestEvidence({
      format: "openai-evals",
      data: { accuracy: 0.85, safety: 0.92, helpfulness: 0.78 },
      sourceSystem: "openai-evals-v2",
      timestamp: "2026-02-24T00:00:00Z",
    });
    expect(result.totalIngested).toBe(3);
    expect(result.trustTier).toBe("ATTESTED");
    expect(result.evidence[0]!.score).toBeCloseTo(4.25, 1); // 0.85 * 5
  });

  it("applies trust weight to effective score", () => {
    const result = ingestEvidence({
      format: "custom",
      data: { reliability: 4.0 },
      sourceSystem: "test",
      timestamp: "2026-02-24T00:00:00Z",
    });
    const item = result.evidence[0]!;
    expect(item.trustTier).toBe("ATTESTED");
    expect(item.effectiveScore).toBeCloseTo(item.score * TRUST_WEIGHTS.ATTESTED);
  });

  it("reports unmapped fields", () => {
    const result = ingestEvidence({
      format: "custom",
      data: { accuracy: 0.9, xyzzy_metric: 0.5, foobar_score: 0.3 },
      sourceSystem: "test",
      timestamp: "2026-02-24T00:00:00Z",
    });
    expect(result.unmapped.length).toBeGreaterThan(0);
  });

  it("handles empty data", () => {
    const result = ingestEvidence({
      format: "custom",
      data: {},
      sourceSystem: "test",
      timestamp: "2026-02-24T00:00:00Z",
    });
    expect(result.totalIngested).toBe(0);
    expect(result.mappingCoverage).toBe(0);
  });

  it("signed evidence gets ATTESTED tier", () => {
    const result = ingestEvidence({
      format: "langsmith",
      data: { correctness: 0.95 },
      sourceSystem: "langsmith-prod",
      timestamp: "2026-02-24T00:00:00Z",
      signature: "ed25519:abc123",
      provenance: ["langsmith-prod", "eval-run-42"],
    });
    expect(result.trustTier).toBe("ATTESTED");
  });

  it("normalizes 0-100 scale to 0-5", () => {
    const result = ingestEvidence({
      format: "custom",
      data: { reliability: 80 },
      sourceSystem: "test",
      timestamp: "2026-02-24T00:00:00Z",
    });
    expect(result.evidence[0]!.score).toBe(4); // 80/20 = 4
  });

  it("maps LangSmith categories correctly", () => {
    const result = ingestEvidence({
      format: "langsmith",
      data: { correctness: 0.9, toxicity: 0.1, latency: 0.5 },
      sourceSystem: "langsmith",
      timestamp: "2026-02-24T00:00:00Z",
    });
    const dims = result.evidence.map((e) => e.dimension);
    expect(dims).toContain("Skills"); // correctness
    expect(dims).toContain("Resilience"); // toxicity
    expect(dims).toContain("Strategic Agent Operations"); // latency
  });
});

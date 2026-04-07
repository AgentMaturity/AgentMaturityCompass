/**
 * AMC-446: HuggingFace auto-publisher
 */
import { describe, expect, test } from "vitest";
import {
  buildHFDatasetReadme,
  buildHFDatasetRepoFiles,
  createHFAutoPublishPlan,
} from "../src/benchmarks/huggingFacePublisher.js";
import { buildGlobalIndexEntry } from "../src/benchmarks/globalIndex.js";

describe("buildHFDatasetReadme", () => {
  test("creates dataset-card style README with metadata", () => {
    const entries = [
      buildGlobalIndexEntry({
        agentId: "agent-1",
        compositeScore: 84,
        layerScores: { reliability: 86, security: 82 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
      }),
    ];

    const readme = buildHFDatasetReadme(entries, {
      datasetId: "AgentMaturity/amc-global-index",
      prettyName: "AMC Global Index",
      license: "apache-2.0",
      amcVersion: "1.0.0",
    });

    expect(readme).toContain("---");
    expect(readme).toContain("dataset_info:");
    expect(readme).toContain("AMC Global Index");
    expect(readme).toContain("AgentMaturity/amc-global-index");
  });
});

describe("buildHFDatasetRepoFiles", () => {
  test("builds README and data jsonl payloads", () => {
    const entries = [
      buildGlobalIndexEntry({
        agentId: "agent-1",
        compositeScore: 84,
        layerScores: { reliability: 86, security: 82 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
      }),
    ];

    const files = buildHFDatasetRepoFiles(entries, {
      datasetId: "AgentMaturity/amc-global-index",
      prettyName: "AMC Global Index",
      license: "apache-2.0",
      amcVersion: "1.0.0",
    });

    expect(files["README.md"]).toContain("AMC Global Index");
    expect(files["data/train.jsonl"]).toContain("agentPseudonym");
  });
});

describe("createHFAutoPublishPlan", () => {
  test("creates a publish plan with repo metadata and files", () => {
    const entries = [
      buildGlobalIndexEntry({
        agentId: "agent-1",
        compositeScore: 84,
        layerScores: { reliability: 86, security: 82 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
      }),
    ];

    const plan = createHFAutoPublishPlan(entries, {
      datasetId: "AgentMaturity/amc-global-index",
      prettyName: "AMC Global Index",
      license: "apache-2.0",
      amcVersion: "1.0.0",
      private: false,
    });

    expect(plan.repoId).toBe("AgentMaturity/amc-global-index");
    expect(plan.private).toBe(false);
    expect(plan.files["README.md"]).toBeDefined();
    expect(plan.files["data/train.jsonl"]).toBeDefined();
  });

  test("adds validation summary, publish progress metadata, and retry policy", () => {
    const entries = [
      buildGlobalIndexEntry({
        agentId: "agent-1",
        compositeScore: 84,
        layerScores: { reliability: 86, security: 82 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
      }),
      buildGlobalIndexEntry({
        agentId: "agent-2",
        compositeScore: 61,
        layerScores: { reliability: 65, security: 57 },
        trustLabel: "MEDIUM TRUST",
        questionsAnswered: 235,
      }),
    ];

    const plan = createHFAutoPublishPlan(entries, {
      datasetId: "AgentMaturity/amc-global-index",
      prettyName: "AMC Global Index",
      license: "apache-2.0",
      amcVersion: "1.0.0",
      private: false,
      maxRetries: 4,
    });

    expect(plan.validation.recordCount).toBe(2);
    expect(plan.validation.missingFields).toEqual([]);
    expect(plan.progress.totalFiles).toBeGreaterThanOrEqual(2);
    expect(plan.progress.totalBytes).toBeGreaterThan(0);
    expect(plan.retryPolicy.maxRetries).toBe(4);
    expect(plan.retryPolicy.backoffStrategy).toBe("exponential");
  });

  test("fails closed when dataset metadata is invalid", () => {
    const entries = [
      buildGlobalIndexEntry({
        agentId: "agent-1",
        compositeScore: 84,
        layerScores: { reliability: 86, security: 82 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
      }),
    ];

    expect(() =>
      createHFAutoPublishPlan(entries, {
        datasetId: "invalid-id",
        prettyName: "AMC Global Index",
        license: "apache-2.0",
        amcVersion: "1.0.0",
      }),
    ).toThrow("Invalid HuggingFace dataset id");
  });
});

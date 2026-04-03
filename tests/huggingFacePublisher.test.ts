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
      datasetId: "thewisecrab/amc-global-index",
      prettyName: "AMC Global Index",
      license: "apache-2.0",
      amcVersion: "1.0.0",
    });

    expect(readme).toContain("---");
    expect(readme).toContain("dataset_info:");
    expect(readme).toContain("AMC Global Index");
    expect(readme).toContain("thewisecrab/amc-global-index");
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
      datasetId: "thewisecrab/amc-global-index",
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
      datasetId: "thewisecrab/amc-global-index",
      prettyName: "AMC Global Index",
      license: "apache-2.0",
      amcVersion: "1.0.0",
      private: false,
    });

    expect(plan.repoId).toBe("thewisecrab/amc-global-index");
    expect(plan.private).toBe(false);
    expect(plan.files["README.md"]).toBeDefined();
    expect(plan.files["data/train.jsonl"]).toBeDefined();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0662-dspy-metric-validity.md";
const SITE = "https://dspy.ai";
const REPO = "stanfordnlp/dspy";
const HEAD_SHA = "498760149b230f402c56bece2aa45df6e1ba946b";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0662 DSPy metric-validity source-review boundary", () => {
  it("records live website and GitHub metadata hashes without copying source content", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("Gap: `GAP-0662`");
    expect(doc).toContain(SITE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("text/html; charset=utf-8");
    expect(doc).toContain("e6cda5eb9b0aab91db7b8d268ecaced349ba5b0b76fa42439661b5ec761e2c78");
    expect(doc).toContain("5fb2b42c550f7442a1f001ba4387e3170d9d5286e7c5fa44c6baaa4c07df3307");
    expect(doc).toContain(HEAD_SHA);
    expect(doc).toContain("MIT");
    expect(doc).toContain("35,216 stars; 2,991 forks; 532 open issues");
    expect(doc).toContain("No DSPy website prose, docs prose, README prose, code, examples, prompts, configs, tests");
  });

  it("fails closed as metadata-only and keeps DSPy identifiers out of AMC methodology code", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("Decision: relevant source-review signal, but fail-closed metadata-only review; no implementation added.");
    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`");
    expect(doc).toContain("No DSPy subsystem, SDK/importer, optimizer adapter, parity layer");
    expect(manifestText).toContain("evaluator_suite_coverage");
    expect(manifestText).toContain("trace_evaluation_coverage");
    expect(manifestText).not.toContain("dspy_metric_validity");
    expect(manifestText).not.toContain(REPO);
  });

  it("does not add source-specific DSPy metric-validity implementation", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("DSPY_METRIC_VALIDITY");
      expect(source).not.toContain("dspy_metric_validity");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SITE);
    }
  });
});

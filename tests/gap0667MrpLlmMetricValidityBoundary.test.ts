import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0667-mrp-llm-metric-validity.md";
const DOI = "10.1145/3774935.3806151";
const OPENALEX = "W4405300788";
const ARXIV = "https://arxiv.org/abs/2412.07796";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/vault/privacyBudget.ts",
  "src/vault/dataResidency.ts",
];

describe("GAP-0667 MRP-LLM metric-validity boundary", () => {
  it("documents source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0667");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("MRP-LLM: Multitask Reflective Large Language Models");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps privacy-preserving recommendation metadata out of metric-validity product scope", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("The source is not accepted as AMC metric-validity evidence by itself");
    expect(doc).toContain("validation table");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("sample size");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("No MRP-LLM subsystem, POI recommender, privacy-transmission module");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("mrp_llm_metric_validity");
  });

  it("does not add source-specific identifiers to metric or Vault implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("mrp_llm_metric_validity");
      expect(source).not.toContain("privacy-transmission");
    }
  });
});

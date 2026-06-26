import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0795-personalized-ai-education-metric-validity-unavailable.md";
const DOI = "10.1002/cae.70153";
const OPENALEX = "W7125592461";
const TITLE = "Towards Personalized AI Education: Context-Aware Retrieval-Augmented Generation With Grade-Level LLM Adaptation";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/diagnostic/questionBank.ts",
];

describe("GAP-0795 personalized AI education metric-validity unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0795");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("OpenAlex search");
    expect(doc).toContain("direct DOI opening returned `403 Forbidden`");
    expect(doc).toContain("skipped as metric-validity implementation evidence");
    expect(doc).toContain("personalized AI education");
    expect(doc).toContain("context-aware RAG");
    expect(doc).toContain("grade-level LLM adaptation");
    expect(doc).toContain("operationalization");
    expect(doc).toContain("benchmark");
    expect(doc).toContain("machine learning");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps unavailable education-RAG metadata out of public metric-validity semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("Unavailable paper metadata alone must fail closed");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("No personalized-AI-education metric-validity adapter");
    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, API, CLI, Studio, or scoring code changed");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("personalized_ai_education_metric_validity");
  });

  it("keeps source-specific identifiers out of metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("personalized_ai_education_metric_validity");
    }
  });
});

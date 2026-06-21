import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0667-mrp-llm-privacy-preserving-poi-metric-validity.md";
const DOI = "10.1145/3774935.3806151";
const OPENALEX = "W4405300788";
const TITLE = "MRP-LLM: Multitask Reflective Large Language Models for Privacy-Preserving Next POI Recommendation";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
];

describe("GAP-0667 MRP-LLM source-review boundary", () => {
  it("records live DOI/Crossref/OpenAlex metadata hashes and no-copy provenance", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("Gap: `GAP-0667`");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Crossref response SHA-256: `11b25414040d9a56c20a3332c1624fe973ac23a4c741867a6758c95cb6cac112`");
    expect(doc).toContain("DOI transform response SHA-256: `3bc7e7ffef1649e85e07efb370f3f7caea18863018310629359b0cdc3a7f16d7`");
    expect(doc).toContain("OpenAlex response SHA-256: `6086d987f3265261dc2360bd54c1c0cc443e5a3e8f70d3cb02a6652d2a4d77a3`");
    expect(doc).toContain("Proceedings of the 34th ACM Conference on User Modeling, Adaptation and Personalization");
    expect(doc).toContain("Ziqing Wu; Zhu Sun; Dongxia Wang; Lu Zhang; Jie Zhang");
    expect(doc).toContain("Zhigang Wu; Zhu Sun; Dongxia Wang; Lu Zhang; Jie Zhang");
    expect(doc).toContain("differs from Crossref/DOI metadata for the first given name");
    expect(doc).toContain("no abstract text, paper prose, figures, tables, prompts, benchmark rows");
  });

  it("fails closed as metadata-only and does not add MRP-LLM or privacy-preserving framework implementation", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("Decision: fail-closed metadata-only source review; no implementation added.");
    expect(doc).toContain("does not justify an MRP-LLM subsystem, privacy-preserving framework, importer, adapter, benchmark mirror");
    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, or `src/diagnostic/methodologyVersioning.ts` source change was made");
    expect(doc).toContain("No new MRP-LLM gate, privacy-preserving framework, importer, adapter, benchmark mirror, POI/recommendation subsystem");
    expect(doc).toContain("metricValidation.rows[].scientificLiteratureCoverage");
    expect(doc).toContain("metricValidation.rows[].evaluatorSuiteCoverage");
    expect(doc).toContain("metricValidation.rows[].traceEvaluationCoverage");

    expect(manifestText).toContain("scientific_literature_coverage");
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("mrp_llm");
    expect(manifestText).not.toContain("privacy_preserving_next_poi");
  });

  it("keeps GAP-0667 identifiers out of source methodology and metric-validity modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("MRP-LLM");
      expect(source).not.toContain("mrp_llm");
      expect(source).not.toContain("privacy_preserving_next_poi");
    }
  });
});

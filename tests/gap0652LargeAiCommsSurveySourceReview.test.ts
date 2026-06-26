import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0652-large-ai-models-future-communications-metric-validity.md";
const DOI = "10.1109/comst.2026.3660844";
const OPENALEX = "W7127308841";
const TITLE = "A Comprehensive Survey of Large AI Models for Future Communications: Foundations, Applications, and Challenges";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
];

describe("GAP-0652 future-communications survey source-review boundary", () => {
  it("records only live DOI/OpenAlex metadata facts, receipt hashes, and no-copy provenance", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("Gap: `GAP-0652`");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Crossref response SHA-256: `5f88d5423f3024030d03e55df6f1cfa2bc556990e1c0f8d2114d988909898294`");
    expect(doc).toContain("DOI transform response SHA-256: `c3696f3ed86fe8c769a64a27790bb4f547eddd5ae0e2b57796ea268e2a9af0cd`");
    expect(doc).toContain("OpenAlex response SHA-256: `36baae9a488b9a9c3bf026edfeb4b5cd03a15c1b4f8fcd4400da9fa96210b731`");
    expect(doc).toContain("IEEE Communications Surveys & Tutorials");
    expect(doc).toContain("Feibo Jiang; Cunhua Pan; Li Dong");
    expect(doc).toContain("no abstract text, paper prose, figures, tables, benchmark rows");
  });

  it("fails closed as metadata-only and does not add a communications-domain implementation", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("Decision: fail-closed metadata-only source review; no implementation added.");
    expect(doc).toContain("No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, or `src/diagnostic/methodologyVersioning.ts` source change was made");
    expect(doc).toContain("No new communications-domain gate, subsystem, importer, adapter, benchmark mirror, task corpus, or parity claim was added");
    expect(doc).toContain("metricValidation.rows[].scientificLiteratureCoverage");
    expect(doc).toContain("metricValidation.rows[].evaluatorSuiteCoverage");
    expect(doc).toContain("metricValidation.rows[].traceEvaluationCoverage");

    expect(manifestText).toContain("scientific_literature_coverage");
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("future_communications");
    expect(manifestText).not.toContain("large_ai_models_future_communications");
  });

  it("keeps GAP-0652 identifiers out of source methodology and metric-validity modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("future_communications");
      expect(source).not.toContain("large_ai_models_future_communications");
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0700-healthcare-llm-judges-public-methodology.md";
const SOURCE = "https://www.mdpi.com/2306-5354/13/1/108";
const DOI = "10.3390/bioengineering13010108";
const OPENALEX = "W7124460067";
const TITLE = "Artificial Authority: The Promise and Perils of LLM Judges in Healthcare";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0700 healthcare LLM judges public-methodology boundary", () => {
  it("documents live MDPI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0700");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Bioengineering");
    expect(doc).toContain("16 January 2026");
    expect(doc).toContain("volume `13`, issue `1`, article `108`");
    expect(doc).toContain("open access");
    expect(doc).toContain("LLM judge evaluation architectures");
    expect(doc).toContain("healthcare applications");
    expect(doc).toContain("cross-study thematic analysis");
    expect(doc).toContain("clinical documentation");
    expect(doc).toContain("medical question-answering");
    expect(doc).toContain("clinical conversation assessment");
    expect(doc).toContain("human-clinician alignment");
    expect(doc).toContain("rigorous human oversight");
    expect(doc).toContain("explicit governance structures");
    expect(doc).toContain("no new data were created or analyzed");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps healthcare LLM-judge review context out of AMC methodology versioning", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology versioning evidence");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("Healthcare LLM-judge review metadata alone must fail closed");
    expect(doc).toContain("No healthcare LLM-judge methodology adapter");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("healthcare_llm_judge_public_methodology");
    expect(manifestText).not.toContain("Artificial Authority");
  });

  it("does not add healthcare LLM-judge identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("healthcare_llm_judge_public_methodology");
      expect(source).not.toContain(TITLE);
    }
  });
});

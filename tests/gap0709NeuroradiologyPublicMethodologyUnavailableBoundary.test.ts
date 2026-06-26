import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0709-neuroradiology-mmllm-public-methodology-unavailable.md";
const DOI = "10.3348/kjr.2025.1045";
const OPENALEX = "W7131099824";
const TITLE = "Evaluating the Accuracy and Diagnostic Reasoning of Multimodal Large Language Models in Interpreting Neuroradiology Cases From RadioGraphics";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0709 neuroradiology MLLM public-methodology unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0709");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, Korean Journal of Radiology publisher-domain");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("neuroradiology");
    expect(doc).toContain("neuroimaging");
    expect(doc).toContain("differential diagnosis");
    expect(doc).toContain("radiology");
    expect(doc).toContain("methodology id/version/hash");
    expect(doc).toContain("badge/report binding");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps neuroradiology MLLM metadata out of AMC public methodology", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology versioning evidence");
    expect(doc).toContain("Metadata-only paper identity must fail closed");
    expect(doc).toContain("No neuroradiology evaluator");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("neuroradiology_public_methodology");
    expect(manifestText).not.toContain("RadioGraphics");
  });

  it("does not add neuroradiology identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("neuroradiology_public_methodology");
      expect(source).not.toContain("RadioGraphics");
    }
  });
});

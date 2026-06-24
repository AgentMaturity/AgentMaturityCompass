import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0695-lanolin-public-methodology-unavailable.md";
const DOI = "10.3390/ph19020264";
const OPENALEX = "W7127303665";
const TITLE = "An LLM-Based Intelligent Agent and Its Application in Making the Lanolin Saponification Process Greener";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0695 lanolin public-methodology unavailable-source boundary", () => {
  it("documents unavailable-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0695");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("ph19020264");
    expect(doc).toContain("exact-title and DOI searches did not surface a primary source");
    expect(doc).toContain("OpenAlex direct page unavailable");
    expect(doc).toContain("MDPI page returned 429");
    expect(doc).toContain("lanolin saponification");
    expect(doc).toContain("process engineering");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("skipped as AMC public-methodology evidence");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps unavailable lanolin metadata out of AMC public methodology", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("metadata-only and unavailable-source identity must fail closed");
    expect(doc).toContain("No lanolin process methodology adapter");
    expect(doc).toContain("No process-engineering or pharmaceutical-production claim");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("lanolin_public_methodology");
  });

  it("does not add lanolin identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("lanolin_public_methodology");
      expect(source).not.toContain("Lanolin Saponification");
    }
  });
});

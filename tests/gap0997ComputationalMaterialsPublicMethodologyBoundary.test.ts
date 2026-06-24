import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0997-computational-materials-public-methodology.md";
const OPENALEX = "https://openalex.org/W7140770361";
const OPENALEX_API = "https://api.openalex.org/works/W7140770361";
const DOI = "https://doi.org/10.1038/s43246-025-00994-x";
const NATURE = "https://www.nature.com/articles/s43246-025-00994-x";
const CROSSREF = "https://api.crossref.org/works/10.1038/s43246-025-00994-x";
const TITLE = "Modular large language model agents for multi-task computational materials science";
const IDENTIFIER = "computational_materials_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0997 computational materials public-methodology boundary", () => {
  it("documents live computational-materials source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0997");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(NATURE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("Communications Materials");
    expect(doc).toContain("Springer Science and Business Media LLC");
    expect(doc).toContain("publication_date `2026-03-26`");
    expect(doc).toContain("published `2026`");
    expect(doc).toContain("reference-count `63`");
    expect(doc).toContain("referenced_works_count `41`");
    expect(doc).toContain("cited_by_count `2`");
    expect(doc).toContain("open access status `gold`");
    expect(doc).toContain("CC BY-NC-ND 4.0");
    expect(doc).toContain("Akshat Chaudhari");
    expect(doc).toContain("Janghoon Ock");
    expect(doc).toContain("Amir Barati Farimani");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Modular design");
    expect(doc).toContain("Computational model");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("Software engineering");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 303");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("methodology version");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("skipped as public-methodology implementation evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps computational-materials paper metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "Computational-materials paper metadata alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(NATURE);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific computational-materials public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(NATURE);
      expect(source).not.toContain("W7140770361");
      expect(source).not.toContain("10.1038/s43246-025-00994-x");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

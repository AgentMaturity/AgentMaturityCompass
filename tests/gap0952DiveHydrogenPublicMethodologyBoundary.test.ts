import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0952-dive-hydrogen-public-methodology.md";
const OPENALEX = "https://openalex.org/W4414991289";
const DOI = "https://doi.org/10.1039/d5sc09921h";
const RSC_URL = "https://pubs.rsc.org/en/content/articlelanding/2026/sc/d5sc09921h";
const TITLE = "\"DIVE\" into hydrogen storage materials discovery with AI agents";
const IDENTIFIER = "dive_hydrogen_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0952 DIVE hydrogen public-methodology boundary", () => {
  it("documents live DOI/RSC metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0952");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(RSC_URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live RSC Chemical Science article page");
    expect(doc).toContain("Chemical Science");
    expect(doc).toContain("Issue 6, 2026");
    expect(doc).toContain("Edge Article");
    expect(doc).toContain("Descriptive Interpretation of Visual Expression (DIVE) multi-agent workflow");
    expect(doc).toContain("reads and organizes experimental data from graphical elements in scientific literature");
    expect(doc).toContain("solid-state hydrogen storage materials");
    expect(doc).toContain("10-15%");
    expect(doc).toContain("over 30% relative to open-source models");
    expect(doc).toContain("curated database of over 30 000 entries from >4000 publications");
    expect(doc).toContain("rapid inverse-design AI workflow");
    expect(doc).toContain("proposing new materials within minutes");
    expect(doc).toContain("multimodal AI agents");
    expect(doc).toContain("Open Access");
    expect(doc).toContain("Submitted 18 Dec 2025");
    expect(doc).toContain("Accepted 18 Jan 2026");
    expect(doc).toContain("First published 03 Feb 2026");
    expect(doc).toContain("Chem. Sci., 2026,17, 3031-3042");
    expect(doc).toContain("Creative Commons Attribution-NonCommercial 3.0 Unported Licence");
    expect(doc).toContain("public methodology versioning");
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

  it("keeps DIVE paper metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("DIVE paper metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific DIVE identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

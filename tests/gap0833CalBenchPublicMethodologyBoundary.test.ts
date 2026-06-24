import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0833-calbench-public-methodology.md";
const OPENALEX = "https://openalex.org/W7160929251";
const ARXIV = "https://arxiv.org/abs/2605.09823";
const DOI = "10.48550/arXiv.2605.09823";
const TITLE = "CalBench: Evaluating Coordination-Privacy Trade-offs in Multi-Agent LLMs";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0833 CalBench public-methodology boundary", () => {
  it("documents live arXiv/OpenAlex retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0833");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("OpenAlex page returned HTTP/2 403");
    expect(doc).toContain("api.openalex.org DNS lookup failed");
    expect(doc).toContain("Submitted on 10 May 2026");
    expect(doc).toContain("last revised 5 Jun 2026");
    expect(doc).toContain("coordination-privacy");
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

  it("keeps CalBench paper metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("paper metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain(ARXIV);
    expect(manifestText).not.toContain("calbench_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain("calbench_public_methodology");
    }
  });
});

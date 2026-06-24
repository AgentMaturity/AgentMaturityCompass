import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0883-retrieval-framework-public-methodology.md";
const REPO = "tensorsense/Retrieval-Framework";
const URL = "https://github.com/tensorsense/Retrieval-Framework";
const TITLE = "Retrieval Framework";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0883 Retrieval Framework public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0883");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("archived by the owner on May 19, 2025");
    expect(doc).toContain("Public archive");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 26");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("39 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("No packages published");
    expect(doc).toContain("Contributors 3");
    expect(doc).toContain("Jupyter Notebook 89.1%");
    expect(doc).toContain("Python 10.9%");
    expect(doc).toContain("inbox");
    expect(doc).toContain("pdf_processor");
    expect(doc).toContain("results/ 2312.10997");
    expect(doc).toContain("__init__.py");
    expect(doc).toContain("example.env");
    expect(doc).toContain("hierarchical_retrieval.ipynb");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("scientific PDFs");
    expect(doc).toContain("plain text");
    expect(doc).toContain("RAGs or agents for academic knowledge");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("Mathpix API");
    expect(doc).toContain("hierarchical retrieval");
    expect(doc).toContain("GPT");
    expect(doc).toContain("tables and images");
    expect(doc).toContain("MathpixProcessor");
    expect(doc).toContain("MathpixResultParser");
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

  it("keeps Retrieval Framework metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Retrieval Framework metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("retrieval_framework_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("retrieval_framework_public_methodology");
    }
  });
});

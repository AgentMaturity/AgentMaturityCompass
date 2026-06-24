import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0859-rag-evaluator-public-methodology.md";
const REPO = "AIAnytime/rag-evaluator";
const URL = "https://github.com/AIAnytime/rag-evaluator";
const PYPI_COMMAND = "pip install rag-evaluator";
const TITLE = "RAG Evaluator";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0859 RAG Evaluator public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0859");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(PYPI_COMMAND);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE.txt");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 44");
    expect(doc).toContain("Fork 19");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("31 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("eval");
    expect(doc).toContain("evals");
    expect(doc).toContain("rag");
    expect(doc).toContain("rag_evaluator");
    expect(doc).toContain("streamlit app");
    expect(doc).toContain("requirements.py");
    expect(doc).toContain("setup.py");
    expect(doc).toContain("Retrieval-Augmented Generation");
    expect(doc).toContain("generated text against reference text");
    expect(doc).toContain("Streamlit Web App");
    expect(doc).toContain("evaluate_all");
    expect(doc).toContain("BLEU");
    expect(doc).toContain("ROUGE-1");
    expect(doc).toContain("BERT Score");
    expect(doc).toContain("Perplexity");
    expect(doc).toContain("Diversity");
    expect(doc).toContain("Racial Bias");
    expect(doc).toContain("MAUVE");
    expect(doc).toContain("METEOR");
    expect(doc).toContain("CHRF");
    expect(doc).toContain("Flesch Reading Ease");
    expect(doc).toContain("Flesch-Kincaid Grade");
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

  it("keeps RAG Evaluator metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("RAG Evaluator metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("rag_evaluator_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_evaluator_public_methodology");
    }
  });
});

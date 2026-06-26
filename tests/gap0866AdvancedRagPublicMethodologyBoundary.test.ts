import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0866-advanced-rag-public-methodology.md";
const REPO = "aishwaryaprabhat/Advanced-RAG";
const URL = "https://github.com/aishwaryaprabhat/Advanced-RAG";
const TITLE = "Performing, Evaluating & Tracking Advanced RAG";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0866 Advanced-RAG public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0866");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 36");
    expect(doc).toContain("Fork 7");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("22 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Jupyter Notebook 99.1%");
    expect(doc).toContain("Shell 0.9%");
    expect(doc).toContain("assets");
    expect(doc).toContain("Advanced_RAG.ipynb");
    expect(doc).toContain("download_dataset.sh");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("AzureML");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("Ragas");
    expect(doc).toContain("Chunks with Overlap");
    expect(doc).toContain("Sentence Window Retrieval");
    expect(doc).toContain("Hierarchical Automerge Retrieval");
    expect(doc).toContain("Context Precision");
    expect(doc).toContain("Context Recall");
    expect(doc).toContain("Faithfulness");
    expect(doc).toContain("Answer Relevancy");
    expect(doc).toContain("Answer Similarity");
    expect(doc).toContain("Answer Correctness");
    expect(doc).toContain("Azure ML Studio");
    expect(doc).toContain("MLflow");
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

  it("keeps Advanced-RAG metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Advanced-RAG metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("advanced_rag_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("advanced_rag_public_methodology");
    }
  });
});

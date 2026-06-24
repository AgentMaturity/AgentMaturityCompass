import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0932-llms-rag-neurology-public-methodology.md";
const REPO = "Entspannter/LLMs-RAG-Neurology";
const URL = "https://github.com/Entspannter/LLMs-RAG-Neurology";
const TITLE = "Evaluating Base and Retrieval-Augmented Large Language Models With Document or Online-Supported Support for Evidence-Based Neurology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0932 LLMs-RAG-Neurology public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0932");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 13");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("7 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Results");
    expect(doc).toContain("RetrievalEvaluations");
    expect(doc).toContain("Visualizations");
    expect(doc).toContain("chroma_db/ AAN");
    expect(doc).toContain("conf");
    expect(doc).toContain("documents");
    expect(doc).toContain("Results_gpt-4o-2024-11-20_outputs.json");
    expect(doc).toContain("combine_all_datasets.ipynb");
    expect(doc).toContain("compare.py");
    expect(doc).toContain("compare_batch.py");
    expect(doc).toContain("convert_txt.py");
    expect(doc).toContain("evaluations.py");
    expect(doc).toContain("helpers.py");
    expect(doc).toContain("naive_gpt4.py");
    expect(doc).toContain("query_datasets_without_rag.ipynb");
    expect(doc).toContain("questions.xlsx");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("requirements_new.txt");
    expect(doc).toContain("run_rag_script.ipynb");
    expect(doc).toContain("visualisations.ipynb");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Jupyter Notebook 99.2%");
    expect(doc).toContain("Python 0.8%");
    expect(doc).toContain("npj Digital Medicine");
    expect(doc).toContain("Ferber");
    expect(doc).toContain("RAG generation");
    expect(doc).toContain("new_venv");
    expect(doc).toContain("API keys");
    expect(doc).toContain("neurological questions, answers, and ratings");
    expect(doc).toContain("raters");
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

  it("keeps clinical RAG manuscript metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Clinical RAG manuscript metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("No medical claim was added");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("llms_rag_neurology_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("llms_rag_neurology_public_methodology");
    }
  });
});

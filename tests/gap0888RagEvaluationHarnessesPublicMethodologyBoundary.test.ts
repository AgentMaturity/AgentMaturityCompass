import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0888-rag-evaluation-harnesses-public-methodology.md";
const REPO = "RulinShao/RAG-evaluation-harnesses";
const URL = "https://github.com/RulinShao/RAG-evaluation-harnesses";
const TITLE = "Retrieval Augmented Generation (RAG) Evaluation Harness";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0888 RAG evaluation harnesses public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0888");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 24");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("12 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 98.9%");
    expect(doc).toContain("Other 1.1%");
    expect(doc).toContain("annotation");
    expect(doc).toContain("lm_eval.egg-info");
    expect(doc).toContain("lm_eval");
    expect(doc).toContain("templates/ new_yaml_task");
    expect(doc).toContain("CITATION.bib");
    expect(doc).toContain("CODEOWNERS");
    expect(doc).toContain("LICENSE.md");
    expect(doc).toContain("pile_statistics.json");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("setup.py");
    expect(doc).toContain("Adapted From");
    expect(doc).toContain("Language Model Evaluation Harness");
    expect(doc).toContain("RAG evaluation");
    expect(doc).toContain("Scaling Retrieval-Based Langauge Models with a Trillion-Token Datastore");
    expect(doc).toContain("retrieval augmentations");
    expect(doc).toContain("DPR-Wiki");
    expect(doc).toContain("TriviaQA");
    expect(doc).toContain("MMLU");
    expect(doc).toContain("Natural Questions");
    expect(doc).toContain("MedQA");
    expect(doc).toContain("concat_k");
    expect(doc).toContain("vLLM");
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

  it("keeps RAG evaluation harness metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("RAG evaluation harness metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("rag_evaluation_harnesses_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_evaluation_harnesses_public_methodology");
    }
  });
});

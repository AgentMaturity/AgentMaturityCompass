import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0927-rag-framework-evaluation-public-methodology.md";
const REPO = "oztrkoguz/RAG-Framework-Evaluation";
const URL = "https://github.com/oztrkoguz/RAG-Framework-Evaluation";
const TITLE = "RAG-Framework-Evaluation";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0927 RAG-Framework-Evaluation public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0927");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("20 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("framework rag result");
    expect(doc).toContain("document.pdf");
    expect(doc).toContain("rag_autogen.py");
    expect(doc).toContain("rag_crewai.py");
    expect(doc).toContain("rag_langchain.py");
    expect(doc).toContain("rag_llamaindex.py");
    expect(doc).toContain("rag_swarm.py");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("No packages published");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("compare different Retrieval-Augmented Generation");
    expect(doc).toContain("same document and model");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("Autogen");
    expect(doc).toContain("Langchain");
    expect(doc).toContain("Swarms");
    expect(doc).toContain("Crewai");
    expect(doc).toContain("speed, accuracy and performance");
    expect(doc).toContain("Prompt Template");
    expect(doc).toContain("gpt-3.5-turbo");
    expect(doc).toContain("BAAI/bge-small-en-v1.5");
    expect(doc).toContain("Chroma");
    expect(doc).toContain("Chunk Size");
    expect(doc).toContain("Chunk Overlap");
    expect(doc).toContain("Framework Time Easy Integration");
    expect(doc).toContain("Autogen 12.68s");
    expect(doc).toContain("Crewai 17.76s");
    expect(doc).toContain("Langchain 12.18s");
    expect(doc).toContain("Llamaindex 12.44s");
    expect(doc).toContain("Swarms 17.30s");
    expect(doc).toContain("autogen==1.0.16");
    expect(doc).toContain("crewai==0.41.1");
    expect(doc).toContain("langchain==0.1.20");
    expect(doc).toContain("llama-index==0.10.56");
    expect(doc).toContain("swarms==5.4.0");
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

  it("keeps RAG framework comparison metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("RAG framework comparison metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("rag_framework_evaluation_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_framework_evaluation_public_methodology");
    }
  });
});

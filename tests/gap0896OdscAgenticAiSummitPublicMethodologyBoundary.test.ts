import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0896-odsc-agentic-ai-summit-public-methodology.md";
const REPO = "graphgeeks-lab/odsc-agentic-ai-summit-2025";
const URL = "https://github.com/graphgeeks-lab/odsc-agentic-ai-summit-2025";
const TITLE = "Agentic Workflows for Graph RAG";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0896 ODSC Agentic AI Summit public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0896");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 19");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("69 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 99.5%");
    expect(doc).toContain("Shell 0.5%");
    expect(doc).toContain("assets");
    expect(doc).toContain("data");
    expect(doc).toContain("slides");
    expect(doc).toContain("src");
    expect(doc).toContain("TIPS.md");
    expect(doc).toContain("create_dataset.py");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("uv.lock");
    expect(doc).toContain("ODSC Agentic AI Summit 2025 Workshop");
    expect(doc).toContain("GraphGeeks");
    expect(doc).toContain("July 16 - 31, 2025");
    expect(doc).toContain("2,726 FHIR records");
    expect(doc).toContain("Hugging Face dataset");
    expect(doc).toContain("data/note.json");
    expect(doc).toContain("data/fhir.json");
    expect(doc).toContain("BAML");
    expect(doc).toContain("Kuzu");
    expect(doc).toContain("LanceDB");
    expect(doc).toContain("vector index");
    expect(doc).toContain("full-text search");
    expect(doc).toContain("hybrid search");
    expect(doc).toContain("Graph RAG");
    expect(doc).toContain("Opik");
    expect(doc).toContain("observability");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("hallucination detection");
    expect(doc).toContain("answer relevance");
    expect(doc).toContain("moderation");
    expect(doc).toContain("usefulness");
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

  it("keeps ODSC Graph RAG metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("ODSC Graph RAG workshop metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("odsc_agentic_ai_summit_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("odsc_agentic_ai_summit_public_methodology");
    }
  });
});

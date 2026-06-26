import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0929-brv-bench-public-methodology.md";
const REPO = "campfirein/brv-bench";
const URL = "https://github.com/campfirein/brv-bench";
const TITLE = "brv-bench";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0929 brv-bench public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0929");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 13");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("89 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("assets");
    expect(doc).toContain("brv_bench");
    expect(doc).toContain("scripts");
    expect(doc).toContain("tests");
    expect(doc).toContain(".pre-commit-config.yaml");
    expect(doc).toContain("Makefile");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("setup.py");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 98.5%");
    expect(doc).toContain("Other 1.5%");
    expect(doc).toContain("Benchmark suite for evaluating retrieval quality, latency, and diversity of AI agent context systems");
    expect(doc).toContain("ByteRover");
    expect(doc).toContain("LongMemEval-S");
    expect(doc).toContain("LoCoMo");
    expect(doc).toContain("LLM-as-Judge");
    expect(doc).toContain("Justifier");
    expect(doc).toContain("Isolated Mode");
    expect(doc).toContain("Precision@K");
    expect(doc).toContain("Recall@K");
    expect(doc).toContain("NDCG@K");
    expect(doc).toContain("MRR");
    expect(doc).toContain("Cold Latency");
    expect(doc).toContain("GEMINI_API_KEY");
    expect(doc).toContain("ANTHROPIC_API_KEY");
    expect(doc).toContain("OPENAI_API_KEY");
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

  it("keeps memory benchmark metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("AI agent context-system benchmark metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("brv_bench_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("brv_bench_public_methodology");
    }
  });
});

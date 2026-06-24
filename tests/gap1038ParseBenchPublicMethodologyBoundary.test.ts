import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1038-parsebench-public-methodology.md";
const REPO = "https://github.com/run-llama/ParseBench";
const README = "https://raw.githubusercontent.com/run-llama/ParseBench/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/run-llama/ParseBench/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/run-llama/ParseBench/main/pyproject.toml";
const PIPELINES = "https://raw.githubusercontent.com/run-llama/ParseBench/main/docs/pipelines.md";
const WEBSITE = "https://parsebench.ai";
const DATASET = "https://huggingface.co/datasets/llamaindex/ParseBench";
const ARXIV = "https://arxiv.org/abs/2604.08538";
const IDENTIFIER = "parsebench_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1038 ParseBench public-methodology boundary", () => {
  it("documents live ParseBench metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1038");
    expect(doc).toContain("run-llama/ParseBench");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(PIPELINES);
    expect(doc).toContain(WEBSITE);
    expect(doc).toContain(DATASET);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("ParseBench - A Document Parsing Benchmark for AI Agents");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("505 stars");
    expect(doc).toContain("64 forks");
    expect(doc).toContain("2 open issues");
    expect(doc).toContain("No releases");
    expect(doc).toContain("No tags");
    expect(doc).toContain("version `0.2.0`");
    expect(doc).toContain("90+ pipelines");
    expect(doc).toContain("2,078");
    expect(doc).toContain("1,211");
    expect(doc).toContain("169,011");
    expect(doc).toContain("Tables");
    expect(doc).toContain("Charts");
    expect(doc).toContain("Content Faithfulness");
    expect(doc).toContain("Semantic Formatting");
    expect(doc).toContain("Visual Grounding");
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

  it("keeps ParseBench benchmark metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain("ParseBench benchmark metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain("ParseBench");
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific ParseBench identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("ParseBench");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0786-rageval-public-methodology.md";
const SOURCE = "https://github.com/gomate-community/rageval";
const REPO = "gomate-community/rageval";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0786 Rageval public-methodology boundary", () => {
  it("documents live Rageval metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0786");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("Evaluation tools for Retrieval-augmented Generation (RAG) methods");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("RagEval");
    expect(doc).toContain("version `0.1.0`");
    expect(doc).toContain("Python");
    expect(doc).toContain("six sub-tasks");
    expect(doc).toContain("query rewriting");
    expect(doc).toContain("document ranking");
    expect(doc).toContain("information compression");
    expect(doc).toContain("evidence verify");
    expect(doc).toContain("answer generating");
    expect(doc).toContain("result validating");
    expect(doc).toContain("answer correctness");
    expect(doc).toContain("answer groundedness");
    expect(doc).toContain("citation precision");
    expect(doc).toContain("citation recall");
    expect(doc).toContain("context recall");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("vLLM");
    expect(doc).toContain("ASQA");
    expect(doc).toContain("ALCE");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps Rageval as RAG-evaluation context instead of an AMC methodology version source", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology evidence");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("No Rageval adapter");
    expect(doc).toContain("repository metadata and README evaluation claims alone must fail closed");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("rageval_public_methodology");
  });

  it("does not add Rageval identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("rageval_public_methodology");
    }
  });
});

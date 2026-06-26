import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0673-long-context-modeling-public-methodology.md";
const SOURCE = "Xnhyacinth/Awesome-LLM-Long-Context-Modeling";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0673 long-context-modeling public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0673");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("main");
    expect(doc).toContain("MIT");
    expect(doc).toContain("2.1k");
    expect(doc).toContain("96 forks");
    expect(doc).toContain("`366` commits");
    expect(doc).toContain("no releases published");
    expect(doc).toContain("long-context-modeling");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create an AMC public-methodology version bump from an awesome list", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("awesome-list metadata alone must fail closed");
    expect(doc).toContain("No long-context benchmark catalog, paper-list importer, blog-list mirror");

    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("long_context_modeling_public_methodology");
    expect(manifestText).not.toContain("awesome_llm_long_context_modeling");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("long_context_modeling_public_methodology");
      expect(source).not.toContain("awesome_llm_long_context_modeling");
    }
  });
});

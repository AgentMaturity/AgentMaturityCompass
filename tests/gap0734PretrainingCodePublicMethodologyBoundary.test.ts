import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0734-pretraining-code-public-methodology.md";
const ARXIV = "https://arxiv.org/abs/2511.07033";
const DOI = "10.1609/aaai.v40i1.37038";
const OPENALEX = "W7138175068";
const TITLE = "Uncovering Pretraining Code in LLMs: A Syntax-Aware Attribution Approach";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0734 pretraining-code public-methodology boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0734");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Yuanheng Li");
    expect(doc).toContain("Zhuoyang Chen");
    expect(doc).toContain("Xiaoyun Liu");
    expect(doc).toContain("Yuhao Wang");
    expect(doc).toContain("Shengjie Zhao");
    expect(doc).toContain("2025-11-10");
    expect(doc).toContain("pretraining-code attribution");
    expect(doc).toContain("membership inference");
    expect(doc).toContain("GPL");
    expect(doc).toContain("SynPrune");
    expect(doc).toContain("syntax-pruned scoring");
    expect(doc).toContain("methodology version");
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

  it("does not create an AMC public-methodology version bump from attribution-paper metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code");
    expect(doc).toContain("paper labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No attribution engine, membership-inference runner, syntax-pruned scorer, SynPrune implementation");

    expect(manifestText).not.toContain(ARXIV);
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("pretraining_code_public_methodology");
    expect(manifestText).not.toContain("syntax_aware_attribution");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("pretraining_code_public_methodology");
      expect(source).not.toContain("syntax_aware_attribution");
    }
  });
});

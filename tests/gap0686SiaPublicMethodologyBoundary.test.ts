import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0686-sia-public-methodology.md";
const SOURCE = "https://github.com/hexo-ai/sia";
const REPO = "hexo-ai/sia";
const ARXIV = "https://arxiv.org/abs/2605.27276";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0686 SIA public-methodology boundary", () => {
  it("documents live SIA metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0686");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("MIT license");
    expect(doc).toContain("1.8k stars");
    expect(doc).toContain("208 forks");
    expect(doc).toContain("3 issues");
    expect(doc).toContain("11 pull requests");
    expect(doc).toContain("18 commits");
    expect(doc).toContain("7 tags");
    expect(doc).toContain("Python 92.0%");
    expect(doc).toContain("HTML 8.0%");
    expect(doc).toContain("gpqa");
    expect(doc).toContain("lawbench");
    expect(doc).toContain("longcot-chess");
    expect(doc).toContain("spaceship-titanic");
    expect(doc).toContain("EVALUATION_GUIDE.md");
    expect(doc).toContain("run visualizer");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps SIA as benchmark context instead of an AMC methodology version source", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology evidence");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("No SIA self-improvement methodology adapter");
    expect(doc).toContain("SIA repository metadata alone must fail closed");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(ARXIV);
    expect(manifestText).not.toContain("sia_public_methodology");
  });

  it("does not add SIA identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain("sia_public_methodology");
      expect(source).not.toContain("Self Improving AI");
    }
  });
});

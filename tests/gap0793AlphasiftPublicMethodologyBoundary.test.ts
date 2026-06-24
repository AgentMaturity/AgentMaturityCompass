import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0793-alphasift-public-methodology.md";
const SOURCE = "https://github.com/ZhuLinsen/alphasift";
const REPO = "ZhuLinsen/alphasift";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0793 AlphaSift public-methodology boundary", () => {
  it("documents live AlphaSift metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0793");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("agent-friendly stock discovery and ranking engine");
    expect(doc).toContain("learning, research, and engineering experiments only");
    expect(doc).toContain("not investment advice");
    expect(doc).toContain("L1 deterministic screening");
    expect(doc).toContain("L2 optional LLM ranking");
    expect(doc).toContain("L3 pluggable post-analysis");
    expect(doc).toContain("Hotspot discovery");
    expect(doc).toContain("Evaluation loop");
    expect(doc).toContain("Agent-native interface");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("version `0.2.0`");
    expect(doc).toContain("Python >=3.10");
    expect(doc).toContain("pandas");
    expect(doc).toContain("pyyaml");
    expect(doc).toContain("litellm");
    expect(doc).toContain("efinance");
    expect(doc).toContain("akshare");
    expect(doc).toContain("baostock");
    expect(doc).toContain("tushare");
    expect(doc).toContain("yfinance");
    expect(doc).toContain("requirements.txt returned 404");
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

  it("keeps AlphaSift as finance-evaluation context instead of an AMC methodology version source", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology evidence");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("No AlphaSift adapter");
    expect(doc).toContain("repository metadata and README evaluation claims alone must fail closed");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("alphasift_public_methodology");
  });

  it("does not add AlphaSift identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("alphasift_public_methodology");
    }
  });
});

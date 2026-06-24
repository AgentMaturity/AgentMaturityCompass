import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0681-assetopsbench-public-methodology.md";
const SOURCE = "IBM/AssetOpsBench";
const SOURCE_URL = "https://github.com/IBM/AssetOpsBench";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0681 AssetOpsBench public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0681");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(SOURCE_URL);
    expect(doc).toContain("main");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("1.9k stars");
    expect(doc).toContain("278 forks");
    expect(doc).toContain("27 issues");
    expect(doc).toContain("14 pull requests");
    expect(doc).toContain("793 commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 99.7%");
    expect(doc).toContain("KDD 2026");
    expect(doc).toContain("9 asset classes");
    expect(doc).toContain("141+ scenarios");
    expect(doc).toContain("5 domain agents");
    expect(doc).toContain("2 orchestration frameworks");
    expect(doc).toContain("model-context-protocol");
    expect(doc).toContain("7 Large Language Models");
    expect(doc).toContain("Llama-4-Maverick-17B");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create an AMC methodology version from AssetOpsBench benchmark metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology evidence");
    expect(doc).toContain("AssetOpsBench repository metadata alone must fail closed");
    expect(doc).toContain("No AssetOpsBench benchmark importer, Industry 4.0 domain pack, MCP server adapter");

    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("assetopsbench_public_methodology");
    expect(manifestText).not.toContain("Industry 4.0 asset operations");
  });

  it("keeps AssetOpsBench identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("AssetOpsBench");
      expect(source).not.toContain("assetopsbench_public_methodology");
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0675-swe-bench-public-methodology.md";
const SOURCE = "https://www.swebench.com";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0675 SWE-bench public-methodology boundary", () => {
  it("documents live SWE-bench metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0675");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("Official Leaderboards");
    expect(doc).toContain("SWE-bench Verified");
    expect(doc).toContain("SWE-bench Lite");
    expect(doc).toContain("SWE-bench Multilingual");
    expect(doc).toContain("SWE-bench Multimodal");
    expect(doc).toContain("% Resolved");
    expect(doc).toContain("2294 Full");
    expect(doc).toContain("500 Verified");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not turn SWE-bench leaderboard metadata into AMC methodology versioning", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("SWE-bench leaderboard metadata alone must fail closed");
    expect(doc).toContain("No SWE-bench dataset mirror, leaderboard importer, resolved-rate adapter");

    expect(manifestText).not.toContain("swe_bench_public_methodology");
    expect(manifestText).not.toContain("SWE-bench Verified");
    expect(manifestText).not.toContain(SOURCE);
  });

  it("keeps SWE-bench identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("swe_bench_public_methodology");
      expect(source).not.toContain("SWE-bench Verified");
      expect(source).not.toContain(SOURCE);
    }
  });
});

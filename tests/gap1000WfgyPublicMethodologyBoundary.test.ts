import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1000-wfgy-public-methodology.md";
const REPO = "https://github.com/onestardao/WFGY";
const API = "https://api.github.com/repos/onestardao/WFGY";
const README = "https://raw.githubusercontent.com/onestardao/WFGY/main/README.md";
const POLARIS_README = "https://raw.githubusercontent.com/onestardao/WFGY/main/Polaris/README.md";
const POLARIS_EXPERIMENTS_README = "https://raw.githubusercontent.com/onestardao/WFGY/main/Polaris/experiments/README.md";
const PROBLEM_MAP_EVAL_README = "https://raw.githubusercontent.com/onestardao/WFGY/main/ProblemMap/eval/README.md";
const CITATION = "https://raw.githubusercontent.com/onestardao/WFGY/main/CITATION.cff";
const LICENSE_API = "https://api.github.com/repos/onestardao/WFGY/license";
const HEAD = "5d93beab43e445086e3a6728fbf445b1d70aa8f0";
const RELEASE = "v5.0.0-teaser-01";
const IDENTIFIER = "wfgy_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1000 WFGY public-methodology boundary", () => {
  it("documents live WFGY source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1000");
    expect(doc).toContain("onestardao/WFGY");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(POLARIS_README);
    expect(doc).toContain(POLARIS_EXPERIMENTS_README);
    expect(doc).toContain(PROBLEM_MAP_EVAL_README);
    expect(doc).toContain(CITATION);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("WFGY 5.0 Polaris Protocol");
    expect(doc).toContain("Polaris Goal Compiler");
    expect(doc).toContain("Problem Map 3.0");
    expect(doc).toContain("Global Debug Card");
    expect(doc).toContain("Cite First Verification");
    expect(doc).toContain("seven public evidence packages");
    expect(doc).toContain("raw outputs");
    expect(doc).toContain("verdicts");
    expect(doc).toContain("audits");
    expect(doc).toContain("token records");
    expect(doc).toContain("SHA256 file fingerprints");
    expect(doc).toContain("self-built public experimental evidence chain");
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("1,758 stars");
    expect(doc).toContain("163 forks");
    expect(doc).toContain("11 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-24T09:35:45Z`");
    expect(doc).toContain("release `v5.0.0-teaser-01` published `2026-05-11T06:09:14Z`");
    expect(doc).toContain("license API `NOASSERTION`");
    expect(doc).toContain("LICENSE/CITATION metadata reviewed as MIT");
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

  it("keeps WFGY repo evidence out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "WFGY repo evidence alone cannot justify an AMC public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain("onestardao/WFGY");
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(HEAD);
    expect(manifestText).not.toContain(RELEASE);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific WFGY public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("onestardao/WFGY");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(RELEASE);
      expect(source).not.toContain("WFGY 5.0 Polaris Protocol");
      expect(source).not.toContain("Polaris Goal Compiler");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0844-circle-guard-bench-public-methodology.md";
const REPO = "whitecircle/circle-guard-bench";
const URL = "https://github.com/whitecircle/circle-guard-bench";
const TITLE = "CircleGuardBench - A full-fledged benchmark for evaluating protection capabilities of AI models";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0844 Circle Guard Bench public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0844");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("70");
    expect(doc).toContain("Python");
    expect(doc).toContain("HuggingFace Leaderboard");
    expect(doc).toContain("HuggingFace Blogpost");
    expect(doc).toContain("protection capabilities");
    expect(doc).toContain("LLM guard systems");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("safeguards");
    expect(doc).toContain("harmful content detection");
    expect(doc).toContain("17 critical risk categories");
    expect(doc).toContain("jailbreak resistance");
    expect(doc).toContain("false positive rate");
    expect(doc).toContain("runtime performance");
    expect(doc).toContain("integral score");
    expect(doc).toContain("accuracy");
    expect(doc).toContain("speed");
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

  it("keeps Circle Guard Bench metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Circle Guard Bench metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("circle_guard_bench_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("circle_guard_bench_public_methodology");
    }
  });
});

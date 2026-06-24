import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0876-costbench-public-methodology.md";
const REPO = "JiayuJeff/CostBench";
const URL = "https://github.com/JiayuJeff/CostBench";
const ARXIV = "https://arxiv.org";
const HF = "https://huggingface.co";
const TITLE = "CostBench: Evaluating Multi-Turn Cost-Optimal Planning and Adaptation in Dynamic Environments for LLM Tool-Use Agents";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0876 CostBench public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0876");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(HF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 31");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("44 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("env");
    expect(doc).toContain("figures");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("setup.py");
    expect(doc).toContain("ACL 2026 Main");
    expect(doc).toContain("multi-turn cost-optimal planning");
    expect(doc).toContain("dynamic adaptation");
    expect(doc).toContain("tool-using scenarios");
    expect(doc).toContain("Hierarchical Tool System");
    expect(doc).toContain("atomic and composite tools");
    expect(doc).toContain("Flexible Cost Assignment");
    expect(doc).toContain("Gaussian noise");
    expect(doc).toContain("Dynamic Blocking");
    expect(doc).toContain("cost changes");
    expect(doc).toContain("preference changes");
    expect(doc).toContain("tool disabling");
    expect(doc).toContain("Adjustable Difficulties");
    expect(doc).toContain("Reproducible Random System");
    expect(doc).toContain("seed-controlled pseudo-random system");
    expect(doc).toContain("COSTBENCH_TRAVEL_CONFIG");
    expect(doc).toContain("model endpoints");
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

  it("keeps CostBench metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("CostBench metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("costbench_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("costbench_public_methodology");
    }
  });
});

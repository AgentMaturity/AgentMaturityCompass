import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0915-mineanybuild-public-methodology.md";
const REPO = "MineAnyBuild/MineAnyBuild";
const URL = "https://github.com/MineAnyBuild/MineAnyBuild";
const TITLE = "MineAnyBuild: Benchmarking Spatial Planning for Open-world AI Agents";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0915 MineAnyBuild public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0915");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("README.md");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("Star 15");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("22 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 86.8%");
    expect(doc).toContain("Jupyter Notebook 13.2%");
    expect(doc).toContain("assets");
    expect(doc).toContain("data_curation");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("mineanybuild");
    expect(doc).toContain("NeurIPS 2025 Datasets and Benchmarks Track");
    expect(doc).toContain("Spatial Planning");
    expect(doc).toContain("open-world AI agents");
    expect(doc).toContain("Minecraft");
    expect(doc).toContain("4,000 curated spatial planning tasks");
    expect(doc).toContain("spatial understanding");
    expect(doc).toContain("spatial reasoning");
    expect(doc).toContain("creativity");
    expect(doc).toContain("spatial commonsense");
    expect(doc).toContain("MLLM-based agents");
    expect(doc).toContain("Mineflayer");
    expect(doc).toContain("Replay Mod");
    expect(doc).toContain("Hugging Face");
    expect(doc).toContain("Google Drive");
    expect(doc).toContain("Grabcraft");
    expect(doc).toContain("Proprietary MLLMs");
    expect(doc).toContain("Open-source MLLMs");
    expect(doc).toContain("internvl.py");
    expect(doc).toContain("qwenvl.py");
    expect(doc).toContain("llavaov.py");
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

  it("keeps MineAnyBuild benchmark metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("MineAnyBuild benchmark metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("mineanybuild_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("mineanybuild_public_methodology");
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0912-awesome-personalization-public-methodology.md";
const REPO = "Clare-Nie/Awesome-Personalization-in-MLLMs";
const URL = "https://github.com/Clare-Nie/Awesome-Personalization-in-MLLMs";
const TITLE = "Awesome-Personalization-in-MLLMs";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0912 Awesome Personalization in MLLMs public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0912");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("README_zh.md");
    expect(doc).toContain("Star 15");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("53 Commits");
    expect(doc).toContain("assets");
    expect(doc).toContain("docs");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("Project Page");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("agent");
    expect(doc).toContain("retrieval");
    expect(doc).toContain("memory");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("personalization");
    expect(doc).toContain("alignment");
    expect(doc).toContain("awesome-list");
    expect(doc).toContain("mllms");
    expect(doc).toContain("personalized-llm");
    expect(doc).toContain("benchamrk");
    expect(doc).toContain("personalized memory");
    expect(doc).toContain("personalized alignment");
    expect(doc).toContain("personalized retrieval");
    expect(doc).toContain("personalized evaluation");
    expect(doc).toContain("long-term goals");
    expect(doc).toContain("evolving preferences");
    expect(doc).toContain("implicit personas");
    expect(doc).toContain("multimodal context");
    expect(doc).toContain("Surveys");
    expect(doc).toContain("Memory Architectures");
    expect(doc).toContain("Personalized Memory Architectures");
    expect(doc).toContain("Personalized Alignment");
    expect(doc).toContain("Omni-modal Embedding Retrieval");
    expect(doc).toContain("Personalized Evaluation");
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

  it("keeps personalization list metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("personalization awesome-list metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("awesome_personalization_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("awesome_personalization_public_methodology");
    }
  });
});

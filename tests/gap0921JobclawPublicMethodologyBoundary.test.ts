import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0921-jobclaw-public-methodology.md";
const REPO = "Eldin162/jobclaw";
const URL = "https://github.com/Eldin162/jobclaw";
const TITLE = "jobclaw - Simplify Hiring with Smart Agents";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0921 jobclaw public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0921");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("14 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("README_EN.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("assets");
    expect(doc).toContain("docs");
    expect(doc).toContain("jobclaw");
    expect(doc).toContain("profiles");
    expect(doc).toContain("src");
    expect(doc).toContain("tests");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("package.json");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 74.9%");
    expect(doc).toContain("TypeScript 23.7%");
    expect(doc).toContain("hiring platform");
    expect(doc).toContain("hiring and recruiting agents");
    expect(doc).toContain("Windows 10");
    expect(doc).toContain("4 GB RAM");
    expect(doc).toContain("Create a new hiring project");
    expect(doc).toContain("Manage agent contacts");
    expect(doc).toContain("Track candidates between agents");
    expect(doc).toContain("View messages and tasks");
    expect(doc).toContain("New Project");
    expect(doc).toContain("job role");
    expect(doc).toContain("location");
    expect(doc).toContain("timeline");
    expect(doc).toContain("candidates");
    expect(doc).toContain("status updates");
    expect(doc).toContain("secure connections");
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

  it("keeps jobclaw hiring-agent metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("jobclaw hiring-agent metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("jobclaw_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("jobclaw_public_methodology");
    }
  });
});

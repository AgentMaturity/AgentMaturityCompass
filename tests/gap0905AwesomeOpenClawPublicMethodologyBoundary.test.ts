import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0905-awesome-openclaw-public-methodology.md";
const REPO = "REAL-Lab-NU/Awesome-OpenClaw-Papers";
const URL = "https://github.com/REAL-Lab-NU/Awesome-OpenClaw-Papers";
const TITLE = "Awesome OpenClaw Research";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0905 Awesome OpenClaw public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0905");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 19");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("49 Commits");
    expect(doc).toContain("assets");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("OpenClaw_Survey.pdf");
    expect(doc).toContain("A Survey of the OpenClaw Ecosystem");
    expect(doc).toContain("Platform Extensibility");
    expect(doc).toContain("Constraint Design");
    expect(doc).toContain("papers");
    expect(doc).toContain("benchmarks");
    expect(doc).toContain("security reports");
    expect(doc).toContain("datasets");
    expect(doc).toContain("tools");
    expect(doc).toContain("OpenClaw AI agent ecosystem");
    expect(doc).toContain("PSEA taxonomy");
    expect(doc).toContain("Platform");
    expect(doc).toContain("Security");
    expect(doc).toContain("Societies");
    expect(doc).toContain("Deployment");
    expect(doc).toContain("74 academic papers");
    expect(doc).toContain("23 benchmarks");
    expect(doc).toContain("18+ industry reports");
    expect(doc).toContain("open Skills");
    expect(doc).toContain("persistent Memory");
    expect(doc).toContain("always-on Heartbeat");
    expect(doc).toContain("Skill scanner before install");
    expect(doc).toContain("Agent Attack");
    expect(doc).toContain("Agent Task");
    expect(doc).toContain("execution-layer");
    expect(doc).toContain("supply-chain");
    expect(doc).toContain("memory governance");
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

  it("keeps OpenClaw research metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("OpenClaw research-index metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("awesome_openclaw_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("awesome_openclaw_public_methodology");
    }
  });
});

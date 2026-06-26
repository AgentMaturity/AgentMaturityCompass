import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0904-deda-public-methodology.md";
const REPO = "drug-discovery-ai/deda-drug-evaluation-and-discovery-agent";
const URL = "https://github.com/drug-discovery-ai/deda-drug-evaluation-and-discovery-agent";
const TITLE = "Bio-informatics AI agent for Drug discovery Research";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0904 DEDA public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0904");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 17");
    expect(doc).toContain("Fork 6");
    expect(doc).toContain("Issues 19");
    expect(doc).toContain("Pull requests 3");
    expect(doc).toContain("170 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 71.2%");
    expect(doc).toContain("JavaScript 21.8%");
    expect(doc).toContain("CSS 4.8%");
    expect(doc).toContain("HTML 2.0%");
    expect(doc).toContain("Other 0.2%");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("assets");
    expect(doc).toContain("electron-app");
    expect(doc).toContain("snapshots");
    expect(doc).toContain("src/ drug_discovery_agent");
    expect(doc).toContain("tests");
    expect(doc).toContain(".env.example");
    expect(doc).toContain(".pre-commit-config.yaml");
    expect(doc).toContain("BUILD_INSTRUCTIONS.md");
    expect(doc).toContain("CI_CD_SETUP.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("SNAPSHOT_TESTING_PLAN.md");
    expect(doc).toContain("UNIFIED_SNAPSHOT_SYSTEM.md");
    expect(doc).toContain("entrypoint.sh");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("pytest.ini");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("DEDA");
    expect(doc).toContain("bioinformatics researchers");
    expect(doc).toContain("drug discovery");
    expect(doc).toContain("proteins");
    expect(doc).toContain("SARS-CoV-2");
    expect(doc).toContain("UniProt");
    expect(doc).toContain("AlphaFold");
    expect(doc).toContain("OpenTargets");
    expect(doc).toContain("hallucinations");
    expect(doc).toContain("domain experts");
    expect(doc).toContain("Boltz-2");
    expect(doc).toContain("MCP server");
    expect(doc).toContain("Claude Desktop");
    expect(doc).toContain("Chat on CLI");
    expect(doc).toContain("Electron-based chat interface");
    expect(doc).toContain("OpenAI API key");
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

  it("keeps DEDA metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("DEDA drug-discovery metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("deda_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("deda_public_methodology");
    }
  });
});

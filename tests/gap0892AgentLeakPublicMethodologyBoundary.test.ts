import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0892-agentleak-public-methodology.md";
const REPO = "Privatris/AgentLeak";
const URL = "https://github.com/Privatris/AgentLeak";
const TITLE = "AgentLeak";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0892 AgentLeak public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0892");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("View license");
    expect(doc).toContain("MIT");
    expect(doc).toContain("Star 22");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("39 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 99.8%");
    expect(doc).toContain("Other 0.2%");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("agentleak");
    expect(doc).toContain("agentleak_data");
    expect(doc).toContain("benchmarks");
    expect(doc).toContain("docs");
    expect(doc).toContain("tests");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("pytest.ini");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("privacy leakage");
    expect(doc).toContain("multi-agent LLM systems");
    expect(doc).toContain("IEEE Access paper");
    expect(doc).toContain("arXiv");
    expect(doc).toContain("5,694 traces across 5 models");
    expect(doc).toContain("7 channels");
    expect(doc).toContain("C1 output");
    expect(doc).toContain("C2 inter-agent");
    expect(doc).toContain("C3-C4 tools");
    expect(doc).toContain("C5 memory");
    expect(doc).toContain("C6 logs");
    expect(doc).toContain("C7 artifacts");
    expect(doc).toContain("1,000 scenarios");
    expect(doc).toContain("32 attack classes");
    expect(doc).toContain("6 families");
    expect(doc).toContain("CrewAI");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("AutoGPT");
    expect(doc).toContain("MetaGPT");
    expect(doc).toContain("Finding 7");
    expect(doc).toContain("Tools & Logs");
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

  it("keeps AgentLeak metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("AgentLeak privacy benchmark metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("agentleak_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("agentleak_public_methodology");
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0913-core-public-methodology.md";
const REPO = "Ian-Tharp/CORE";
const URL = "https://github.com/Ian-Tharp/CORE";
const TITLE = "CORE";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0913 CORE public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0913");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("develop");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 5");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("262 Commits");
    expect(doc).toContain(".claude");
    expect(doc).toContain(".cursor/ rules");
    expect(doc).toContain(".github");
    expect(doc).toContain("assets/ imgs");
    expect(doc).toContain("backend");
    expect(doc).toContain("docker/ agent");
    expect(doc).toContain("docs");
    expect(doc).toContain("mcp");
    expect(doc).toContain("ui/ core-ui");
    expect(doc).toContain(".dockerignore");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("CLAUDE.md");
    expect(doc).toContain("CODE_OF_CONDUCT.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("docker-compose.agents.yml");
    expect(doc).toContain("docker-compose.dev.yml");
    expect(doc).toContain("docker-compose.prod.yml");
    expect(doc).toContain("init.sql");
    expect(doc).toContain("Cognitive Orchestration, Reasoning & Evaluation");
    expect(doc).toContain("Comprehension, Orchestration, Reasoning, and Evaluation");
    expect(doc).toContain("multi-agent architecture");
    expect(doc).toContain("cognitive pipeline");
    expect(doc).toContain("Agent Factory");
    expect(doc).toContain("Communication Commons");
    expect(doc).toContain("Council of Perspectives");
    expect(doc).toContain("Catalyst Engine");
    expect(doc).toContain("Consciousness Module");
    expect(doc).toContain("Angular 19");
    expect(doc).toContain("Electron");
    expect(doc).toContain("FastAPI");
    expect(doc).toContain("LangGraph");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("PostgreSQL");
    expect(doc).toContain("Redis");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("Docker Compose");
    expect(doc).toContain("MCP");
    expect(doc).toContain("Python 71.4%");
    expect(doc).toContain("TypeScript 13.1%");
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

  it("keeps CORE platform metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("CORE platform metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("core_public_methodology");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("core_public_methodology");
    }
  });
});

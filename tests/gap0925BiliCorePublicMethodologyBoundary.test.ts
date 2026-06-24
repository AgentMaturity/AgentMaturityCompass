import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0925-bili-core-public-methodology.md";
const REPO = "msu-denver/bili-core";
const URL = "https://github.com/msu-denver/bili-core";
const TITLE = "BiliCore: An Open-Source LLM Framework";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0925 BiliCore public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0925");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("develop");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 7");
    expect(doc).toContain("Pull requests 20");
    expect(doc).toContain("597 Commits");
    expect(doc).toContain("README.MD");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Security");
    expect(doc).toContain(".claude");
    expect(doc).toContain(".github");
    expect(doc).toContain(".streamlit");
    expect(doc).toContain("bili");
    expect(doc).toContain("docs");
    expect(doc).toContain("scripts");
    expect(doc).toContain(".coveragerc");
    expect(doc).toContain(".env.example");
    expect(doc).toContain(".pre-commit-config.yaml");
    expect(doc).toContain("CITATION.cff");
    expect(doc).toContain("CLAUDE.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("pytest.ini");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("run_python_formatters.sh");
    expect(doc).toContain("setup.py");
    expect(doc).toContain("Releases 13");
    expect(doc).toContain("v5.3.2");
    expect(doc).toContain("Jun 12, 2026");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 99.3%");
    expect(doc).toContain("domain-agnostic framework");
    expect(doc).toContain("single-agent orchestration");
    expect(doc).toContain("multi-agent system creation");
    expect(doc).toContain("adversarial security testing");
    expect(doc).toContain("Community-Centered Computing (C3) Lab");
    expect(doc).toContain("National Science Foundation");
    expect(doc).toContain("NAIRR Pilot");
    expect(doc).toContain("IRIS");
    expect(doc).toContain("Interactive Reasoning and Integration Services");
    expect(doc).toContain("60+ models across 6 providers");
    expect(doc).toContain("AWS Bedrock");
    expect(doc).toContain("Google Vertex AI");
    expect(doc).toContain("Azure OpenAI");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("FAISS");
    expect(doc).toContain("OpenSearch");
    expect(doc).toContain("weather APIs");
    expect(doc).toContain("web search");
    expect(doc).toContain("MongoDB");
    expect(doc).toContain("PostgreSQL");
    expect(doc).toContain("token-by-token");
    expect(doc).toContain("AETHER");
    expect(doc).toContain("Agent Ecosystems for Testing, Hardening, Evaluation, and Research");
    expect(doc).toContain("Declarative YAML");
    expect(doc).toContain("LangGraph workflows");
    expect(doc).toContain("7 workflow types");
    expect(doc).toContain("6 communication protocols");
    expect(doc).toContain("RuntimeContext");
    expect(doc).toContain("MASExecutor");
    expect(doc).toContain("AEGIS");
    expect(doc).toContain("Adversarial Evaluation and Guarding of Intelligent Systems");
    expect(doc).toContain("Prompt injection");
    expect(doc).toContain("jailbreak");
    expect(doc).toContain("memory poisoning");
    expect(doc).toContain("bias inheritance");
    expect(doc).toContain("agent impersonation");
    expect(doc).toContain("cross-model transferability");
    expect(doc).toContain("3-tier detection");
    expect(doc).toContain("Streamlit dashboards");
    expect(doc).toContain("Attack GUI");
    expect(doc).toContain("Docker");
    expect(doc).toContain("PostGIS");
    expect(doc).toContain("LocalStack");
    expect(doc).toContain("Flask API");
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

  it("keeps BiliCore framework metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("BiliCore framework metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("bili_core_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("bili_core_public_methodology");
    }
  });
});

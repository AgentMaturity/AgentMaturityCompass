import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0923-system-prompt-benchmark-public-methodology.md";
const REPO = "KazKozDev/system-prompt-benchmark";
const URL = "https://github.com/KazKozDev/system-prompt-benchmark";
const TITLE = "System Prompt Benchmark";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0923 system-prompt-benchmark public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0923");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("34 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Code of conduct");
    expect(doc).toContain("Contributing");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Security");
    expect(doc).toContain(".github");
    expect(doc).toContain("assets");
    expect(doc).toContain("datasets");
    expect(doc).toContain("deploy/ prometheus");
    expect(doc).toContain("examples/ benchmark-output");
    expect(doc).toContain("plugins");
    expect(doc).toContain("prompts");
    expect(doc).toContain("src");
    expect(doc).toContain("tests");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("app.py");
    expect(doc).toContain("benchmark.example.yaml");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("spb.py");
    expect(doc).toContain("start.command");
    expect(doc).toContain("start.sh");
    expect(doc).toContain("Releases 2");
    expect(doc).toContain("v1.1.0");
    expect(doc).toContain("Mar 23, 2026");
    expect(doc).toContain("Python 97.4%");
    expect(doc).toContain("CSS 1.4%");
    expect(doc).toContain("Automated red-team testing");
    expect(doc).toContain("12 security and behavior categories");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("jailbreak");
    expect(doc).toContain("data exfiltration");
    expect(doc).toContain("15+ provider integrations");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("Gemini");
    expect(doc).toContain("Bedrock");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("CLI, Streamlit web UI, and REST API");
    expect(doc).toContain("Redis");
    expect(doc).toContain("Prometheus");
    expect(doc).toContain("Grafana");
    expect(doc).toContain("Plugin SDK");
    expect(doc).toContain("role adherence");
    expect(doc).toContain("jailbreak resistance");
    expect(doc).toContain("scope boundaries");
    expect(doc).toContain("multi-turn behavior");
    expect(doc).toContain("ensemble judge");
    expect(doc).toContain("pattern detectors");
    expect(doc).toContain("LLM judge");
    expect(doc).toContain("OpenAI Moderation");
    expect(doc).toContain("Perspective API");
    expect(doc).toContain("HarmJudge");
    expect(doc).toContain("YAML/JSON benchmark config");
    expect(doc).toContain("integrity verification");
    expect(doc).toContain("rate limiting");
    expect(doc).toContain("retry logic");
    expect(doc).toContain("PDF report export");
    expect(doc).toContain("Prompt analyzer");
    expect(doc).toContain("SQLite job store");
    expect(doc).toContain("webhook delivery");
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

  it("keeps system-prompt-benchmark metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("system-prompt-benchmark red-team metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("system_prompt_benchmark_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("system_prompt_benchmark_public_methodology");
    }
  });
});

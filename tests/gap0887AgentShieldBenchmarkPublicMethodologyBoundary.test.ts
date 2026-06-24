import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0887-agentshield-benchmark-public-methodology.md";
const REPO = "doronp/agentshield-benchmark";
const URL = "https://github.com/doronp/agentshield-benchmark";
const TITLE = "AgentShield Benchmark";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0887 AgentShield Benchmark public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0887");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 24");
    expect(doc).toContain("Fork 10");
    expect(doc).toContain("Issues 5");
    expect(doc).toContain("Pull requests 4");
    expect(doc).toContain("79 Commits");
    expect(doc).toContain("Releases 1");
    expect(doc).toContain("v0.1.0");
    expect(doc).toContain("TypeScript 94.5%");
    expect(doc).toContain("Python 3.4%");
    expect(doc).toContain("Shell 2.1%");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("assets");
    expect(doc).toContain("corpus");
    expect(doc).toContain("results");
    expect(doc).toContain("scripts");
    expect(doc).toContain("src");
    expect(doc).toContain("PROVIDERS.md");
    expect(doc).toContain("REVIEW.md");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("537 test cases");
    expect(doc).toContain("8 categories");
    expect(doc).toContain("Prompt Injection");
    expect(doc).toContain("Data Exfiltration");
    expect(doc).toContain("Tool Abuse");
    expect(doc).toContain("Multi-Agent Security");
    expect(doc).toContain("Provenance & Audit");
    expect(doc).toContain("OWASP Agentic Top 10");
    expect(doc).toContain("weighted geometric mean");
    expect(doc).toContain("Commit-Reveal Integrity Protocol");
    expect(doc).toContain("Ed25519 signatures");
    expect(doc).toContain("corpusHash");
    expect(doc).toContain("shuffleSeed");
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

  it("keeps AgentShield metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("AgentShield Benchmark metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("agentshield_benchmark_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("agentshield_benchmark_public_methodology");
    }
  });
});

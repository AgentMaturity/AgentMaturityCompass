import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0983-ai-infra-guard-public-methodology.md";
const GITHUB = "https://github.com/Tencent/AI-Infra-Guard";
const GITHUB_API = "https://api.github.com/repos/Tencent/AI-Infra-Guard";
const RAW_README = "https://raw.githubusercontent.com/Tencent/AI-Infra-Guard/main/README.md";
const RAW_LICENSE = "https://raw.githubusercontent.com/Tencent/AI-Infra-Guard/main/LICENSE";
const TITLE = "Tencent/AI-Infra-Guard";
const IDENTIFIER = "ai_infra_guard_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0983 AI-Infra-Guard public-methodology boundary", () => {
  it("documents live AI-Infra-Guard metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0983");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(GITHUB_API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(RAW_LICENSE);
    expect(doc).toContain("Public");
    expect(doc).toContain("stargazers_count `3970`");
    expect(doc).toContain("forks_count `383`");
    expect(doc).toContain("open_issues_count `10`");
    expect(doc).toContain("watchers_count `3970`");
    expect(doc).toContain("pushed_at `2026-06-24T08:43:51Z`");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("agent-security");
    expect(doc).toContain("ai-red-teaming");
    expect(doc).toContain("llm-jailbreak");
    expect(doc).toContain("mcp-scan");
    expect(doc).toContain("prompt-injection");
    expect(doc).toContain("AI Red Teaming");
    expect(doc).toContain("OpenClaw Security Scan");
    expect(doc).toContain("Agent Scan");
    expect(doc).toContain("Skills Scan");
    expect(doc).toContain("MCP scan");
    expect(doc).toContain("AI Infra scan");
    expect(doc).toContain("LLM jailbreak evaluation");
    expect(doc).toContain("Prompt Security");
    expect(doc).toContain("1600 known CVE");
    expect(doc).toContain("lacks an authentication mechanism");
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

  it("keeps AI-Infra-Guard metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "AI-Infra-Guard source metadata alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(GITHUB);
    expect(manifestText).not.toContain(GITHUB_API);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific AI-Infra-Guard public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain(GITHUB_API);
      expect(source).not.toContain("Tencent/AI-Infra-Guard");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

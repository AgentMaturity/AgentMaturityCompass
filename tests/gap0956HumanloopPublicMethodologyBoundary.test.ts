import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0956-humanloop-public-methodology.md";
const URL = "https://humanloop.com";
const HOME = "https://humanloop.com/home";
const OVERVIEW = "https://humanloop.com/docs/getting-started/overview";
const MIGRATION = "https://humanloop.com/docs/guides/migrating-from-humanloop";
const CHANGELOG = "https://humanloop.com/docs/changelog/2025/08";
const JUDGE_DOCS = "https://humanloop.com/docs/guides/evals/llm-as-a-judge";
const CICD_DOCS = "https://humanloop.com/docs/guides/evals/cicd-integration";
const SECURITY_DOCS = "https://humanloop.com/docs/reference/security-compliance";
const GITHUB = "https://github.com/humanloop";
const IDENTIFIER = "humanloop_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0956 Humanloop public-methodology boundary", () => {
  it("documents live Humanloop metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0956");
    expect(doc).toContain(URL);
    expect(doc).toContain(HOME);
    expect(doc).toContain(OVERVIEW);
    expect(doc).toContain(MIGRATION);
    expect(doc).toContain(CHANGELOG);
    expect(doc).toContain(JUDGE_DOCS);
    expect(doc).toContain(CICD_DOCS);
    expect(doc).toContain(SECURITY_DOCS);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain("Humanloop joins Anthropic");
    expect(doc).toContain("platform will be sunset on September 8th, 2025");
    expect(doc).toContain("all data will be permanently inaccessible");
    expect(doc).toContain("LLM Evals Platform for Enterprises");
    expect(doc).toContain("Evaluation, Prompt Management, and Observability");
    expect(doc).toContain("Evals-driven development");
    expect(doc).toContain("Collaborative development");
    expect(doc).toContain("Prompt Editor");
    expect(doc).toContain("Version Control");
    expect(doc).toContain("CI/CD");
    expect(doc).toContain("Human review");
    expect(doc).toContain("Alerting and guardrails");
    expect(doc).toContain("Online evaluations");
    expect(doc).toContain("Tracing and logging");
    expect(doc).toContain("replay any outputs");
    expect(doc).toContain("Files, Versions, Logs, and Evaluations");
    expect(doc).toContain("Set up LLM as a Judge");
    expect(doc).toContain("Set up CI/CD Evaluations");
    expect(doc).toContain("Security and Compliance");
    expect(doc).toContain("SOC2 Type II");
    expect(doc).toContain("RBAC");
    expect(doc).toContain("v5.0");
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

  it("keeps Humanloop platform metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Humanloop platform metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain("Humanloop");
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific Humanloop identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Humanloop");
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0852-governed-memory-public-methodology.md";
const REPO = "personizeai/governed-memory";
const URL = "https://github.com/personizeai/governed-memory";
const HOMEPAGE = "https://personize.ai/white-paper";
const TITLE = "Governed Memory: Experiment Datasets";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0852 Governed Memory public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0852");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("50");
    expect(doc).toContain("no detected language");
    expect(doc).toContain("agent-memory");
    expect(doc).toContain("governance");
    expect(doc).toContain("llm-evaluation-benchmark");
    expect(doc).toContain("memory-systems");
    expect(doc).toContain("multi-agent");
    expect(doc).toContain("rag");
    expect(doc).toContain("Synthetic datasets");
    expect(doc).toContain("experiment protocols");
    expect(doc).toContain("Governed Memory: A Shared Layer for Accuracy and Compliance Across Agentic Workflows");
    expect(doc).toContain("fully synthetic");
    expect(doc).toContain("No real customer data, PII, or proprietary information");
    expect(doc).toContain("schema collections");
    expect(doc).toContain("API reference");
    expect(doc).toContain("E01 Extraction Quality Across Content Types");
    expect(doc).toContain("E03 Governance Routing Precision");
    expect(doc).toContain("E07 Recall Speed, Relevance, and Stage Breakdown");
    expect(doc).toContain("E11 Entity Isolation Validation");
    expect(doc).toContain("E15 Governance Constraint Enforcement Under Adversarial Pressure");
    expect(doc).toContain("POST /api/v1/memorize");
    expect(doc).toContain("POST /api/v1/smart-recall");
    expect(doc).toContain("POST /api/v1/evaluate");
    expect(doc).toContain("POST /api/v1/ai/smart-guidelines");
    expect(doc).toContain("transcripts");
    expect(doc).toContain("emails");
    expect(doc).toContain("chats");
    expect(doc).toContain("documents");
    expect(doc).toContain("call_notes");
    expect(doc).toContain("governance_pairs");
    expect(doc).toContain("conflict_pairs");
    expect(doc).toContain("adversarial_governance");
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

  it("keeps Governed Memory metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Governed Memory metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("governed_memory_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("governed_memory_public_methodology");
    }
  });
});

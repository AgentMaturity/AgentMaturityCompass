import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0916-aisec-lists-public-methodology.md";
const REPO = "SecNode/AISecLists";
const URL = "https://github.com/SecNode/AISecLists";
const TITLE = "AISecLists";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0916 AISecLists public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0916");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 8");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("17 Commits");
    expect(doc).toContain("Guardrail Jailbreak");
    expect(doc).toContain("Prompt Extraction");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("No packages published");
    expect(doc).toContain("Contributors 2");
    expect(doc).toContain("AI Red Teaming Arsenal");
    expect(doc).toContain("LLM jailbreaks");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("information disclosure");
    expect(doc).toContain("Offensive Security");
    expect(doc).toContain("AI Penetration Testing");
    expect(doc).toContain("AI Red-Teaming Exercises");
    expect(doc).toContain("Data Breaches");
    expect(doc).toContain("Model Inversion Attacks");
    expect(doc).toContain("Adversarial Inputs");
    expect(doc).toContain("Data Poisoning");
    expect(doc).toContain("Multimodal Threats");
    expect(doc).toContain("Intellectual Property Theft");
    expect(doc).toContain("Deployment Vulnerabilities");
    expect(doc).toContain("Regulatory Non-Compliance");
    expect(doc).toContain("Adversarial Training");
    expect(doc).toContain("Regular AI Redteaming");
    expect(doc).toContain("Secure APIs");
    expect(doc).toContain("Monitor Systems in Real-Time");
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

  it("keeps AI red-team list metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("AISecLists prompt-list metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("aisec_lists_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("aisec_lists_public_methodology");
    }
  });
});

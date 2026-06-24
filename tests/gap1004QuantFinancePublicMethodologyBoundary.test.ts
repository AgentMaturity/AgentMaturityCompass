import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1004-quant-finance-public-methodology.md";
const REPO = "https://github.com/Barca0412/Introduction-to-Quantitative-Finance";
const API = "https://api.github.com/repos/Barca0412/Introduction-to-Quantitative-Finance";
const README =
  "https://raw.githubusercontent.com/Barca0412/Introduction-to-Quantitative-Finance/main/README.md";
const LICENSE_API = "https://api.github.com/repos/Barca0412/Introduction-to-Quantitative-Finance/license";
const LICENSE =
  "https://raw.githubusercontent.com/Barca0412/Introduction-to-Quantitative-Finance/main/LICENSE";
const HEAD = "3811a92e532eed7b7cc374e9d41780dd596ed7fc";
const README_SHA = "912d25702939778f532634180295dfbf06901920";
const IDENTIFIER = "quant_finance_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1004 quantitative-finance public-methodology boundary", () => {
  it("documents live quant-finance source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1004");
    expect(doc).toContain("Barca0412/Introduction-to-Quantitative-Finance");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(README_SHA);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("1,506 stars");
    expect(doc).toContain("165 forks");
    expect(doc).toContain("0 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-23T22:28:30Z`");
    expect(doc).toContain("updated_at `2026-06-24T14:25:15Z`");
    expect(doc).toContain("latest GitHub release not found");
    expect(doc).toContain("agent, ai4fin, finance, investment, llm, llm4fin, quant");
    expect(doc).toContain("AI + Finance arXiv Radar");
    expect(doc).toContain("Indexed papers: 962");
    expect(doc).toContain("Focus papers: 494");
    expect(doc).toContain("microsoft/qlib");
    expect(doc).toContain("AlphaAgent");
    expect(doc).toContain("microsoft/RD-Agent");
    expect(doc).toContain("FinRL");
    expect(doc).toContain("hftbacktest");
    expect(doc).toContain("GITHUB_ACTIONS_ISSUE.md");
    expect(doc).toContain("data");
    expect(doc).toContain("scripts");
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

  it("keeps quantitative-finance repo evidence out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "Quantitative-finance resource metadata alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain("Barca0412/Introduction-to-Quantitative-Finance");
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(HEAD);
    expect(manifestText).not.toContain(README_SHA);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific quantitative-finance public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Barca0412/Introduction-to-Quantitative-Finance");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(README_SHA);
      expect(source).not.toContain("AI + Finance arXiv Radar");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0872-finrpt-public-methodology.md";
const REPO = "jinsong8/FinRpt";
const URL = "https://github.com/jinsong8/FinRpt";
const ARXIV = "https://arxiv.org";
const HF = "https://huggingface.co";
const TITLE = "FinRpt: Dataset, Evaluation System and LLM-based Multi-agent Framework for Equity Research Report Generation";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0872 FinRpt public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0872");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(HF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Star 33");
    expect(doc).toContain("Fork 6");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("30 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 97.0%");
    expect(doc).toContain("Dockerfile 1.3%");
    expect(doc).toContain("Other 1.7%");
    expect(doc).toContain("assets");
    expect(doc).toContain("dataset");
    expect(doc).toContain("finetune/ LLaMA-Factory");
    expect(doc).toContain("finrpt");
    expect(doc).toContain("front");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("dataset");
    expect(doc).toContain("benckmark");
    expect(doc).toContain("llm-based-agent");
    expect(doc).toContain("Equity Research Report");
    expect(doc).toContain("Dataset Construction Pipeline");
    expect(doc).toContain("7 financial data types");
    expect(doc).toContain("comprehensive evaluation system");
    expect(doc).toContain("11 metrics");
    expect(doc).toContain("FinRpt-Gen");
    expect(doc).toContain("Supervised Fine-Tuning");
    expect(doc).toContain("Reinforcement Learning");
    expect(doc).toContain("Benchmark Evaluation");
    expect(doc).toContain("LLaMA-Factory");
    expect(doc).toContain("verl");
    expect(doc).toContain("ReportLab");
    expect(doc).toContain("not financial advice");
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

  it("keeps FinRpt metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("FinRpt metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("finrpt_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("finrpt_public_methodology");
    }
  });
});

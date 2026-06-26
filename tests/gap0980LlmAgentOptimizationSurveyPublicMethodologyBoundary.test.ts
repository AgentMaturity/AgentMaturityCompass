import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC =
  "docs/source-reviews/GAP-0980-llm-agent-optimization-survey-public-methodology.md";
const OPENALEX = "https://openalex.org/W7125602480";
const OPENALEX_API = "https://api.openalex.org/works/W7125602480";
const DOI = "https://doi.org/10.1145/3789261";
const ACM = "https://dl.acm.org/doi/10.1145/3789261";
const ARXIV_PDF = "https://arxiv.org/pdf/2503.12434";
const COLLECTION = "https://github.com/YoungDubbyDu/LLM-Agent-Optimization";
const TITLE = "A Survey on the Optimization of Large Language Model-based Agents";
const IDENTIFIER = "llm_agent_optimization_survey_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0980 LLM-agent optimization survey public-methodology boundary", () => {
  it("documents live survey metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0980");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ACM);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(COLLECTION);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 403");
    expect(doc).toContain("cf-mitigated: challenge");
    expect(doc).toContain("ACM Computing Surveys");
    expect(doc).toContain("Association for Computing Machinery");
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-24`");
    expect(doc).toContain("article");
    expect(doc).toContain("cited_by_count `4`");
    expect(doc).toContain("open access status `green`");
    expect(doc).toContain("Shangheng Du");
    expect(doc).toContain("Jiabao Zhao");
    expect(doc).toContain("Jinxin Shi");
    expect(doc).toContain("Zhentao Xie");
    expect(doc).toContain("Xin Jiang");
    expect(doc).toContain("Yanhong Bai");
    expect(doc).toContain("Liang He");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Reinforcement learning");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("Autonomous agent");
    expect(doc).toContain("parameter-driven methods");
    expect(doc).toContain("parameter-free methods");
    expect(doc).toContain("fine-tuning-based optimization");
    expect(doc).toContain("reinforcement learning-based optimization");
    expect(doc).toContain("hybrid strategies");
    expect(doc).toContain("trajectory data construction");
    expect(doc).toContain("reward function design");
    expect(doc).toContain("prompt engineering");
    expect(doc).toContain("external knowledge retrieval");
    expect(doc).toContain("agent evaluation");
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

  it("keeps survey metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "OpenAlex/DOI/ACM metadata alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(ACM);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific survey public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W7125602480");
      expect(source).not.toContain("10.1145/3789261");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});

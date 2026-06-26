import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

const PRODUCT_COUNT_FILES = [
  "README.md",
  "docs/GETTING_STARTED.md",
  "docs/QUICKSTART.md",
  "docs/PRICING.md",
  "docs/ENTERPRISE.md",
  "docs/AGENT_GUIDE.md",
  "docs/adr/005-free-core-paid-industry-packs.md",
  "website/index.html",
  "website/methodology.html",
  "website/docs/methodology.html",
  "website/vs-promptfoo.html",
  "website/script.js",
  "website/blog/langchain-scoring-tutorial.html",
  "website/blog/the-84-point-gap.html",
  "website/blog/eu-ai-act-agents.html",
];

const STALE_PRODUCT_COUNT_PATTERNS = [
  /138 core diagnostic questions/,
  /195 core questions/,
  /195 questions/,
  /738 total/,
  /240 default/,
  /240 questions/,
  /260 with lifecycle/,
  /235 diagnostic questions/,
  /40 sector-specific domain packs/,
  /1,013 domain-specific diagnostic questions/,
];

describe("public diagnostic question-count claims", () => {
  test("source catalogs expose the canonical product runtime counts", () => {
    const defaultSet = getQuestionSet({ version: "default" });
    const lifecycleSet = getQuestionSet({ version: "lifecycle" });
    const industryPacks = listIndustryPacks();
    const sectorQuestionCount = industryPacks.reduce((sum, pack) => sum + pack.questions.length, 0);

    expect(defaultSet.questions).toHaveLength(244);
    expect(lifecycleSet.questions).toHaveLength(264);
    expect(lifecycleSet.questions.length - defaultSet.questions.length).toBe(20);
    expect(industryPacks).toHaveLength(41);
    expect(sectorQuestionCount).toBe(600);
  });

  test("current-facing product surfaces use 244 default, 264 expanded, and 844 total framing", () => {
    for (const path of PRODUCT_COUNT_FILES) {
      const body = readProjectFile(path);
      for (const pattern of STALE_PRODUCT_COUNT_PATTERNS) {
        expect(body, `${path} contains stale question count ${pattern}`).not.toMatch(pattern);
      }
    }

    expect(readProjectFile("website/blog/langchain-scoring-tutorial.html")).toContain("244 default diagnostic questions");
    expect(readProjectFile("website/blog/langchain-scoring-tutorial.html")).toContain("844 total");
    expect(readProjectFile("website/vs-promptfoo.html")).toContain("264 with lifecycle expansion");
  });

  test("industry station pages match compiled sector-pack counts", () => {
    expect(readProjectFile("website/station-environment.html")).toContain("6 diagnostic packs · 87 questions");
    expect(readProjectFile("website/station-health.html")).toContain("9 diagnostic packs · 151 questions");
    expect(readProjectFile("website/station-wealth.html")).toContain("5 diagnostic packs · 70 questions");
    expect(readProjectFile("website/station-education.html")).toContain("5 diagnostic packs · 72 questions");
    expect(readProjectFile("website/station-mobility.html")).toContain("6 diagnostic packs · 78 questions");
    expect(readProjectFile("website/station-technology.html")).toContain("5 diagnostic packs · 71 questions");
    expect(readProjectFile("website/station-governance.html")).toContain("5 diagnostic packs · 71 questions");
  });

  test("whitepaper uses current product runtime counts for default and sector coverage", () => {
    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");
    expect(whitepaper).toContain("244 default diagnostic questions plus 600 sector-specific questions");
    expect(whitepaper).toContain("844 questions (244 default + 600 sector-specific)");
    expect(whitepaper).not.toContain("140 core diagnostic questions plus 600 sector-specific questions");
    expect(whitepaper).not.toContain("740 questions (140 core + 600 sector-specific)");
  });
});

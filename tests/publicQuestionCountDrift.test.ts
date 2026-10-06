import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getStationSummary, listIndustryPacks } from "../src/domains/industryPacks.js";
import { PACK_QUESTION_FLOOR } from "../src/domains/packs/regulatorySchema.js";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

const STATIONS = ["environment", "health", "wealth", "education", "mobility", "technology", "governance"] as const;
const DEFAULT_QUESTION_COUNT = 244;
/** Sector-pack question total, measured from the registry rather than restated as a literal. */
const SECTOR_QUESTION_COUNT = listIndustryPacks().reduce((sum, pack) => sum + pack.questions.length, 0);

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
    const stationTotal = STATIONS.reduce((sum, station) => sum + getStationSummary(station).totalQuestions, 0);

    expect(defaultSet.questions).toHaveLength(DEFAULT_QUESTION_COUNT);
    expect(lifecycleSet.questions).toHaveLength(264);
    expect(lifecycleSet.questions.length - defaultSet.questions.length).toBe(20);
    expect(industryPacks).toHaveLength(41);
    expect(stationTotal).toBe(SECTOR_QUESTION_COUNT);
    expect(SECTOR_QUESTION_COUNT).toBeGreaterThanOrEqual(industryPacks.length * PACK_QUESTION_FLOOR);
  });

  test("current-facing product surfaces use 244 default, 264 expanded, and registry-derived total framing", () => {
    for (const path of PRODUCT_COUNT_FILES) {
      const body = readProjectFile(path);
      for (const pattern of STALE_PRODUCT_COUNT_PATTERNS) {
        expect(body, `${path} contains stale question count ${pattern}`).not.toMatch(pattern);
      }
    }

    expect(readProjectFile("website/blog/langchain-scoring-tutorial.html")).toContain("244 default diagnostic questions");
    expect(readProjectFile("website/blog/langchain-scoring-tutorial.html")).toContain(`${DEFAULT_QUESTION_COUNT + SECTOR_QUESTION_COUNT} total`);
    expect(readProjectFile("website/vs-promptfoo.html")).toContain("264 with lifecycle expansion");
  });

  test("industry station pages match compiled sector-pack counts", () => {
    for (const station of STATIONS) {
      const { packCount, totalQuestions } = getStationSummary(station);
      expect(readProjectFile(`website/station-${station}.html`), station).toContain(`${packCount} diagnostic packs · ${totalQuestions} questions`);
    }
  });

  test("whitepaper uses current product runtime counts for default and sector coverage", () => {
    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");
    const total = DEFAULT_QUESTION_COUNT + SECTOR_QUESTION_COUNT;
    const expected = [
      `${DEFAULT_QUESTION_COUNT} default diagnostic questions plus ${SECTOR_QUESTION_COUNT} sector-specific questions`,
      `${total} questions (${DEFAULT_QUESTION_COUNT} default + ${SECTOR_QUESTION_COUNT} sector-specific)`,
    ];
    const missing = expected.filter((phrase) => !whitepaper.includes(phrase));
    expect(missing, "whitepaper/AMC_WHITEPAPER_v1.md must state the registry's sector-pack question count").toEqual([]);
    expect(whitepaper).not.toContain("140 core diagnostic questions plus 600 sector-specific questions");
    expect(whitepaper).not.toContain("740 questions (140 core + 600 sector-specific)");
  });
});

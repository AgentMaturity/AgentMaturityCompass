import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/** Public counts describe source inventory. Only a run receipt describes outcomes. */
const CURRENT_TEST_FILE_COUNT = measureTestFiles().toLocaleString("en-US");

function measureTestFiles(dir = join(process.cwd(), "tests")): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((count, entry) => {
    if (entry.isDirectory()) return count + measureTestFiles(join(dir, entry.name));
    return count + Number(entry.name.endsWith(".test.ts"));
  }, 0);
}

const CURRENT_PUBLIC_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "website/index.html",
  "website/lite.html",
  "website/i18n.js",
  "docs/content/show-hn-draft.md",
  "docs/content/reddit-launch-drafts.md",
  "docs/internal/competitive-landscape.md",
  "docs/internal/mirofish-simulation-council.md",
  "whitepaper/AMC_WHITEPAPER_v1.md",
];

/**
 * Reads a public file as a reader sees it.
 *
 * Counts in README.md are wrapped in `<!-- amc:count:key -->` markers so
 * scripts/gen-counts.mjs can keep them true; those comments are invisible in
 * rendered Markdown, so they are stripped before matching prose.
 */
const readProjectFile = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8").replace(/<!-- \/?amc:count(:\w+)? -->/g, "");

describe("public test-count claims", () => {
  test("current-facing public surfaces identify test source files as inventory", () => {
    for (const path of CURRENT_PUBLIC_FILES) {
      const body = readProjectFile(path).replace(/<[^>]*>/g, " ");
      expect(body, path).toContain(CURRENT_TEST_FILE_COUNT);
      expect(body, path).toMatch(/test\s+source\s+files/i);
      expect(body, path).not.toMatch(/\b\d[\d,]*\s+(?:passing\s+(?:Vitest\s+)?tests?|tests?\s+passing)\b/i);
    }

    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");
    expect(whitepaper).toContain(`${CURRENT_TEST_FILE_COUNT} Vitest test source files`);
    expect(whitepaper).not.toMatch(/validated by [\d,]+ (?:Vitest )?test source files/i);
    expect(readProjectFile("README.md")).toContain(`${CURRENT_TEST_FILE_COUNT} test source files`);
  });

  test("historical audit results retain their dated source context", () => {
    const historical = readProjectFile("docs/source-reviews/AMC-1466-hook-action-lifecycle-correlation.md");
    expect(historical).toContain("1,063 files / 8,393 tests");
  });

  test("README badge labels a source-file inventory and links to CI outcomes", () => {
    const readme = readProjectFile("README.md");
    const current = `test%20source%20files-${CURRENT_TEST_FILE_COUNT.replace(/,/g, "%2C")}`;
    const badges = [...readme.matchAll(/test%20source%20files-(?:\d|,|%2C)+/g)].map((m) => m[0]);
    expect(new Set(badges)).toEqual(new Set([current]));
    expect(readme).not.toMatch(/tests-(?:\d|,|%2c)+%20passing/i);
    expect(readme).toContain("https://github.com/AgentMaturity/AgentMaturityCompass/actions/workflows/ci.yml");
  });
});

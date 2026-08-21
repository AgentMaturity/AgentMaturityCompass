import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * G5: these were hardcoded literals ("8,604" / "1,087"), so every time the
 * suite grew someone had to hand-edit ten public files and this list. That is
 * how the published figure reached 8,604 while the repository held 8,478 — the
 * test pinned the drift instead of catching it.
 *
 * The counts are now measured from the repository, so the test enforces
 * accuracy rather than a frozen number.
 */
const measured = measureTestCounts();
const CURRENT_TEST_COUNT = measured.blocks.toLocaleString("en-US");
const CURRENT_TEST_FILE_COUNT = measured.files.toLocaleString("en-US");

function measureTestCounts(): { files: number; blocks: number } {
  const testsDir = join(process.cwd(), "tests");
  let files = 0;
  let blocks = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".test.ts")) {
        files += 1;
        blocks += (readFileSync(full, "utf8").match(/^\s*(it|test)\s*\(/gm) ?? []).length;
      }
    }
  };
  walk(testsDir);
  return { files, blocks };
}
const STALE_TEST_COUNTS = ["8,601", "8%2C601", "8,554", "8%2C554", "8,544", "8%2C544", "8,538", "8%2C538", "8,527", "8%2C527", "8,520", "8%2C520", "8,481", "8%2C481", "8,480", "8%2C480", "8,468", "8%2C468", "8,455", "8%2C455", "8,444", "8%2C444", "8,434", "8%2C434", "8,413", "8%2C413", "8,404", "8%2C404", "8,396", "8%2C396", "8,393", "8%2C393", "8,380", "8%2C380", "8,366", "8%2C366", "8,365", "8%2C365", "8,348", "8%2C348", "8,324", "8%2C324", "8,265", "8%2C265", "8,257", "8%2C257", "8,252", "8%2C252", "8,248", "8%2C248", "8,243", "8%2C243", "8,238", "8%2C238", "8,235", "8%2C235", "8,229", "8%2C229", "8,223", "8%2C223", "8,218", "8%2C218", "8,212", "8%2C212", "8,207", "8%2C207", "8,206", "8%2C206", "8,198", "8%2C198", "8,191", "8%2C191", "8,175", "8%2C175", "8,164", "8%2C164", "8,158", "8%2C158", "8,150", "8%2C150", "5,394", "5%2C394", "5,098", "5%2C031", "4,161", "3,980", "2,723", "2,699"];

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
  test("current-facing public surfaces use the canonical verified Vitest count", () => {
    for (const path of CURRENT_PUBLIC_FILES) {
      const body = readProjectFile(path);
      expect(body, path).toContain(CURRENT_TEST_COUNT);
    }

    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");
    expect(whitepaper).toContain(`${CURRENT_TEST_COUNT} passing Vitest tests across ${CURRENT_TEST_FILE_COUNT} files`);
    expect(readProjectFile("README.md")).toContain(`${CURRENT_TEST_FILE_COUNT} files / ${CURRENT_TEST_COUNT} passing Vitest tests`);
  });

  test("current-facing public surfaces do not reintroduce stale test-count claims", () => {
    for (const path of CURRENT_PUBLIC_FILES) {
      const body = readProjectFile(path);
      // A number the suite has legitimately grown back to is not stale. The
      // blocklist is historical, so it can collide with the measured truth —
      // exactly what happened when the count reached 8,538 a second time.
      const currentForms = new Set([
        CURRENT_TEST_COUNT,
        CURRENT_TEST_COUNT.replace(",", "%2C"),
        CURRENT_TEST_FILE_COUNT,
        CURRENT_TEST_FILE_COUNT.replace(",", "%2C")
      ]);
      for (const staleCount of STALE_TEST_COUNTS.filter((c) => !currentForms.has(c))) {
        expect(body, `${path} contains stale test count ${staleCount}`).not.toContain(staleCount);
      }
    }

    const historical = readProjectFile("docs/source-reviews/AMC-1466-hook-action-lifecycle-correlation.md");
    expect(historical).toContain("1,063 files / 8,393 tests");
  });

  test("README badge uses the latest fully verified passing inventory", () => {
    const readme = readProjectFile("README.md");
    const current = `tests-${CURRENT_TEST_COUNT.replace(",", "%2C")}%20passing`;
    expect(readme).toContain(current);

    // Previously a hand-maintained list of old badge values, which broke the
    // moment the suite grew back to a number already on it. Any badge that is
    // not the measured one is stale by definition.
    const badges = [...readme.matchAll(/tests-(\d[\d%A-C]*)%20passing/g)].map((m) => m[0]);
    expect(new Set(badges)).toEqual(new Set([current]));
  });
});

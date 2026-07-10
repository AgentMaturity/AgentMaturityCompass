import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const CURRENT_TEST_COUNT = "8,324";
const CURRENT_TEST_FILE_COUNT = "1,053";
const STALE_TEST_COUNTS = ["8,265", "8%2C265", "8,257", "8%2C257", "8,252", "8%2C252", "8,248", "8%2C248", "8,243", "8%2C243", "8,238", "8%2C238", "8,235", "8%2C235", "8,229", "8%2C229", "8,223", "8%2C223", "8,218", "8%2C218", "8,212", "8%2C212", "8,207", "8%2C207", "8,206", "8%2C206", "8,198", "8%2C198", "8,191", "8%2C191", "8,175", "8%2C175", "8,164", "8%2C164", "8,158", "8%2C158", "8,150", "8%2C150", "5,394", "5%2C394", "5,098", "5%2C031", "4,161", "3,980", "2,723", "2,699"];

const CURRENT_PUBLIC_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "website/index.html",
  "website/i18n.js",
  "docs/content/show-hn-draft.md",
  "docs/content/reddit-launch-drafts.md",
  "whitepaper/AMC_WHITEPAPER_v1.md",
];

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("public test-count claims", () => {
  test("current-facing public surfaces use the canonical verified Vitest count", () => {
    for (const path of CURRENT_PUBLIC_FILES) {
      const body = readProjectFile(path);
      expect(body, path).toContain(CURRENT_TEST_COUNT);
    }

    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");
    expect(whitepaper).toContain(`${CURRENT_TEST_COUNT} passing Vitest tests across ${CURRENT_TEST_FILE_COUNT} files`);
  });

  test("current-facing public surfaces do not reintroduce stale test-count claims", () => {
    for (const path of CURRENT_PUBLIC_FILES) {
      const body = readProjectFile(path);
      for (const staleCount of STALE_TEST_COUNTS) {
        expect(body, `${path} contains stale test count ${staleCount}`).not.toContain(staleCount);
      }
    }
  });

  test("README badge uses the latest fully verified passing inventory", () => {
    const readme = readProjectFile("README.md");
    expect(readme).toContain("tests-8%2C273%20passing");
    expect(readme).not.toContain("tests-8%2C273%20collected");
  });
});

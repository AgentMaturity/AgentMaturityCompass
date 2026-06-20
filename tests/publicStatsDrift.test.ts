import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const CURRENT_TEST_COUNT = "5,394";
const CURRENT_TEST_FILE_COUNT = "407";
const STALE_TEST_COUNTS = ["5,098", "5%2C031", "4,161", "3,980", "2,723", "2,699"];

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
  test("current-facing public surfaces use the canonical collected Vitest count", () => {
    for (const path of CURRENT_PUBLIC_FILES) {
      const body = readProjectFile(path);
      expect(body, path).toContain(CURRENT_TEST_COUNT);
    }

    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");
    expect(whitepaper).toContain(`${CURRENT_TEST_COUNT} Vitest tests across ${CURRENT_TEST_FILE_COUNT} files`);
  });

  test("current-facing public surfaces do not reintroduce stale test-count claims", () => {
    for (const path of CURRENT_PUBLIC_FILES) {
      const body = readProjectFile(path);
      for (const staleCount of STALE_TEST_COUNTS) {
        expect(body, `${path} contains stale test count ${staleCount}`).not.toContain(staleCount);
      }
    }
  });

  test("README badge uses a collected inventory claim rather than a sandboxed pass claim", () => {
    const readme = readProjectFile("README.md");
    expect(readme).toContain("tests-5%2C394%20collected");
    expect(readme).not.toContain("tests-5%2C394%20passing");
  });
});

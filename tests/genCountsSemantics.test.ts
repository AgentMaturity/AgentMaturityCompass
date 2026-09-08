import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const generator = resolve("scripts/gen-counts.mjs");
let fixture: string;

function write(relative: string, body: string): void {
  const path = join(fixture, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function run(mode: "--json" | "--check" | "--write") {
  return spawnSync(process.execPath, [generator, mode], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 10_000
  });
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "amc-count-semantics-"));
  write("package.json", JSON.stringify({ version: "0.0.0", license: "MIT" }));
  // Never executed: source inventory must be truthful even for failing,
  // skipped and parameterized declarations without a run receipt.
  write("tests/direct.test.ts", 'test("fails", () => { throw new Error("failure"); });\n');
  write("tests/nested/cases.test.ts", [
    'test.skip("skipped", () => {});',
    'test.each([1, 2, 3])("expanded %s", () => {});'
  ].join("\n"));
  write("tests/helper.ts", "// Helpers are not test source files.\n");
});

afterEach(() => rmSync(fixture, { recursive: true, force: true }));

describe("AMC-1526 — test inventory does not attest execution outcomes", () => {
  test("reports file inventory without executing or expanding source declarations", () => {
    const result = run("--json");
    expect(result.status, result.stderr).toBe(0);
    const counts = JSON.parse(result.stdout);
    expect(counts.testFiles).toBe(2);
    expect(counts.testBlocks).toBe(1);
    expect(counts.testBlocksMethodology).toContain("Regex matches");
    expect(counts.testBlocksMethodology).toContain("Not executed tests or passing results");

    write("README.md", "2 Vitest test source files\n");
    expect(run("--check").status).toBe(0);
  });

  test.each([
    "2 passing Vitest tests",
    "2 passing tests",
    "2 Passing Tests",
    '<span class="stat-value">2</span><span class="stat-label">passing tests</span>',
    "<b>2</b><span>Tests<br>passing</span>",
    "![tests](https://img.shields.io/badge/tests-2%20passing-green)",
    "<!-- amc:count:testFiles -->2<!-- /amc:count --> passing Vitest tests"
  ])("rejects a numerically matching but unbacked passing claim: %s", (claim) => {
    write("README.md", claim);
    const result = run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported passing-test claim");
  });

  test("rejects a public regex-count marker even when its value matches", () => {
    write("CONTRIBUTING.md", "<!-- amc:count:testBlocks -->1<!-- /amc:count --> Vitest tests");
    const result = run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("testBlocks is regex inventory");
  });

  test("refreshes source-file templates and markers idempotently while preserving historical results", () => {
    const historical = "Historical run: 99 passing Vitest tests, recorded for an older revision.\n";
    write("docs/source-reviews/old-audit.md", historical);
    write("README.md", "<!-- amc:count:testFiles -->99<!-- /amc:count --> test source files\n![inventory](https://img.shields.io/badge/test%20source%20files-99-green)\n");
    write("CONTRIBUTING.md", "<!-- amc:count:testFiles -->99<!-- /amc:count --> Vitest test source files\n");
    write("website/index.html", '<span class="stat-value">99</span><span class="stat-label">test source files</span>');
    write("website/lite.html", "<b>99</b><span>Test source<br>files</span>");
    write("website/i18n.js", "'99 Test Source Files'");

    expect(run("--check").status).toBe(1);
    const written = run("--write");
    expect(written.status, written.stderr).toBe(0);
    expect(readFileSync(join(fixture, "README.md"), "utf8")).toContain("test%20source%20files-2-green");
    expect(readFileSync(join(fixture, "CONTRIBUTING.md"), "utf8")).toContain("<!-- amc:count:testFiles -->2<!-- /amc:count -->");
    expect(readFileSync(join(fixture, "website/index.html"), "utf8")).toContain('stat-value">2</span>');
    expect(readFileSync(join(fixture, "website/lite.html"), "utf8")).toContain("<b>2</b>");
    expect(readFileSync(join(fixture, "website/i18n.js"), "utf8")).toContain("2 Test Source Files");
    expect(run("--check").status).toBe(0);
    expect(run("--write").stdout).toContain("No changes needed.");
    expect(readFileSync(join(fixture, "docs/source-reviews/old-audit.md"), "utf8")).toBe(historical);
  });

  test("refuses to rewrite any surface while an unsupported outcome claim remains", () => {
    const original = "99 test source files\n";
    write("README.md", original);
    write("website/i18n.js", "'2 Passing Tests'");
    const result = run("--write");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported passing-test claim");
    expect(readFileSync(join(fixture, "README.md"), "utf8")).toBe(original);
  });
});

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

describe("current CLI and adapter inventories", () => {
  const inventory = "| Command | Description |\n| `amc agent-loop guide` | Guide |\n| `amc agent-loop chat` | Chat |\n| `amc approvals login` | Login |\n";

  test("refreshes curated CLI templates from unique inventory rows without rewriting unrelated numbers", () => {
    write("docs/CLI_COMMAND_INVENTORY.md", inventory);
    write("src/adapters/builtins/one.ts", "export {};\n");
    write("src/adapters/builtins/two.ts", "export {};\n");
    write("README.md", "99 registered CLI command paths; [CLI Reference (99 command paths)](docs/CLI_COMMAND_INVENTORY.md); 99 adapters; issue #99; 99 ms; 2 test source files\n");
    write("docs/API_REFERENCE.md", "99 public CLI command paths\n| 99 | `amc wrap` | unchanged row ID |\n");
    write("docs/PRICING.md", "All 99 framework adapters; 99 CLI command paths\n");
    write("docs/PRICING_FAQ.md", "all 99 adapters; 99 CLI command paths\n");
    write("docs/PRODUCT_EDITIONS.md", "99 CLI command paths\n");
    write("docs/ENTERPRISE.md", "99 CLI command paths\n");
    write("docs/BENCHMARK_GALLERY.md", "| CLI command paths | 99 |\n");
    write("website/index.html", '<span class="stat-value">99</span><span class="stat-label">CLI commands</span> 99 built-in adapters');
    write("website/i18n.js", "'99 CLI Paths'");
    write("website/docs/cli.html", "The AMC CLI currently registers 99 command paths.");
    write("website/docs/competitive-analysis.md", "CLI (99 command paths)");
    write("src/console/assets/app.js", "'99 CLI paths; 142 assurance packs'");
    const historical = "99 CLI command paths, 99 adapters at a dated source revision.\n";
    write("docs/source-reviews/old-audit.md", historical);

    const counts = JSON.parse(run("--json").stdout);
    expect(counts.cliCommandPaths).toBe(3);
    expect(counts.adapters).toBe(2);
    expect(run("--check").status).toBe(1);
    const result = run("--write");
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(fixture, "README.md"), "utf8")).toBe("3 registered CLI command paths; [CLI Reference (3 command paths)](docs/CLI_COMMAND_INVENTORY.md); 2 adapters; issue #99; 99 ms; 2 test source files\n");
    expect(readFileSync(join(fixture, "docs/API_REFERENCE.md"), "utf8")).toContain("3 public CLI command paths\n| 99 |");
    expect(readFileSync(join(fixture, "src/console/assets/app.js"), "utf8")).toBe("'3 CLI paths; 142 assurance packs'");
    expect(readFileSync(join(fixture, "website/index.html"), "utf8")).toContain('stat-value">3</span>');
    expect(readFileSync(join(fixture, "website/docs/cli.html"), "utf8")).toContain("registers 3 command paths");
    expect(readFileSync(join(fixture, "docs/BENCHMARK_GALLERY.md"), "utf8")).toBe("| CLI command paths | 3 |\n");
    expect(readFileSync(join(fixture, "docs/source-reviews/old-audit.md"), "utf8")).toBe(historical);
    expect(readFileSync(join(fixture, "docs/CLI_COMMAND_INVENTORY.md"), "utf8")).toBe(inventory);
    expect(run("--check").status).toBe(0);
    expect(run("--write").stdout).toContain("No changes needed.");
  });

  test.each(["", "| `amc guide` | Guide |\n| `amc guide` | Duplicate |\n"])("refuses empty or duplicate inventory without modifying public claims", (body) => {
    write("docs/CLI_COMMAND_INVENTORY.md", body);
    write("README.md", "99 CLI command paths\n");
    const result = run("--write");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("nonempty, unique command paths");
    expect(readFileSync(join(fixture, "README.md"), "utf8")).toBe("99 CLI command paths\n");
  });

  test("refuses CLI claims when their inventory is missing without substituting a count", () => {
    write("README.md", "99 CLI command paths; 99 test source files\n");
    const result = run("--write");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLI command inventory is unavailable");
    expect(readFileSync(join(fixture, "README.md"), "utf8")).toBe("99 CLI command paths; 99 test source files\n");
  });
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

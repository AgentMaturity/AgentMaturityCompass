import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const CURRENT_COMMAND_COUNT = "1,169";
const CURRENT_COMMAND_COUNT_RAW = 1169;
const STALE_COMMAND_COUNT_PATTERNS = [
  /\b481 CLI commands\b/,
  /CLI \(481 commands\)/,
  /\b376 CLI commands\b/,
  /\b842 commands\b/,
  /\b1,084\b/,
  /\b1036 CLI commands\b/,
  /\b1,145\b/,
  /\b1,150\b/,
  /\b1,151\b/,
  /\b1,152\b/,
  /\b1,153\b/,
  /\b1,155\b/,
  /\b1,159\b/,
  /\b1,163\b/,
  /\b1,164\b/,
  /\b1,165\b/,
  /\b1,166\b/,
];

const CURRENT_COMMAND_COUNT_FILES = [
  "README.md",
  "docs/API_REFERENCE.md",
  "docs/PRICING.md",
  "docs/PRICING_FAQ.md",
  "docs/PRODUCT_EDITIONS.md",
  "docs/ENTERPRISE.md",
  "website/docs/cli.html",
  "website/docs/competitive-analysis.md",
  "docs/BENCHMARK_GALLERY.md",
  "src/console/assets/app.js",
];

const HISTORICAL_COMMAND_COUNT_RECEIPTS = [
  {
    path: "docs/AUDIT_50_AGENTS_BATCH5.md",
    count: "1,144",
    observedAt: "2026-06-16",
  },
];

const REQUIRED_NPM_KEYWORDS = [
  "ai-agent",
  "ai-governance",
  "ai-safety",
  "ai-compliance",
  "trust-score",
  "llm-evaluation",
];

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("public command-count and npm metadata claims", () => {
  test("CLI inventory exposes the canonical public command-path count", () => {
    const inventory = readProjectFile("docs/CLI_COMMAND_INVENTORY.md");
    const commandRows = [...inventory.matchAll(/^\| `amc /gm)];

    expect(commandRows).toHaveLength(CURRENT_COMMAND_COUNT_RAW);
    expect(inventory).toContain("comply risk-classify");
  });

  test("current-facing public docs use the canonical command-path count", () => {
    for (const path of CURRENT_COMMAND_COUNT_FILES) {
      const body = readProjectFile(path);
      expect(body, path).toContain(CURRENT_COMMAND_COUNT);

      for (const pattern of STALE_COMMAND_COUNT_PATTERNS) {
        expect(body, `${path} contains stale command count ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test("dated audit receipts keep their observed command count and date", () => {
    for (const receipt of HISTORICAL_COMMAND_COUNT_RECEIPTS) {
      const body = readProjectFile(receipt.path);
      expect(body, receipt.path).toContain(receipt.count);
      expect(body, receipt.path).toContain(receipt.observedAt);
    }
  });

  test("npm metadata uses discoverable AI governance keywords", () => {
    const pkg = JSON.parse(readProjectFile("package.json")) as {
      description?: string;
      keywords?: string[];
    };

    expect(pkg.description).toContain("AI agents");
    expect(pkg.description).toContain("compliance");
    expect(pkg.keywords).toEqual(expect.arrayContaining(REQUIRED_NPM_KEYWORDS));
  });
});

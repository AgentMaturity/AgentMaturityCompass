import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

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
  "website/index.html",
  "website/i18n.js",
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
const inventoryPaths = [...readProjectFile("docs/CLI_COMMAND_INVENTORY.md")
  .matchAll(/^\| `(amc [^`]+)` \|/gm)].map((match) => match[1]);

describe("public command-count and npm metadata claims", () => {
  test("CLI inventory exposes the canonical public command-path count", () => {
    expect(inventoryPaths.length).toBeGreaterThan(0);
    expect(new Set(inventoryPaths).size).toBe(inventoryPaths.length);
    expect(inventoryPaths).toEqual(expect.arrayContaining([
      "amc compliance risk-classify",
      "amc agent-loop guide",
      "amc agent-loop chat",
      "amc agent-loop run",
      "amc agent-loop mcp-catalog",
      "amc approvals login",
      "amc session compact",
      "amc native-extension inspect",
      "amc native-extension install",
      "amc native-extension sign"
    ]));
  });

  test("current-facing public docs use the canonical command-path count", () => {
    for (const path of CURRENT_COMMAND_COUNT_FILES) {
      // Interpret only claims labelled as CLI inventory. API table row IDs,
      // dates and independent test-file counts are unrelated measurements.
      const body = readProjectFile(path).replace(/<!--[\s\S]*?-->|<\/?[a-z][^>\n]*>/gi, " ");
      const claims = [
        ...body.matchAll(/\b(\d[\d,]*)\s+(?:(?:registered|public)\s+)?CLI\s+(?:command paths|paths|commands)\b/gi),
        ...body.matchAll(/\bCLI (?:Reference )?\((\d[\d,]*) command paths\)/g),
        ...body.matchAll(/AMC CLI currently registers (\d[\d,]*) command paths\b/g),
        ...body.matchAll(/\| CLI command paths \| (\d[\d,]*) \|/g)
      ];
      expect(claims.length, `${path} has an explicit command-path claim`).toBeGreaterThan(0);
      for (const claim of claims) {
        expect(Number(claim[1].replaceAll(",", "")), `${path}: ${claim[0]}`).toBe(inventoryPaths.length);
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

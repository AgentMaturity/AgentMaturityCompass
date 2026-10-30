import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// P0-28: the docs truth reset. Working papers live in docs/archive/ behind a banner, and the public text stops
// claiming measured validity, certification or SAML support that the code does not have.
const root = resolve(process.cwd());
const read = (path: string): string => readFileSync(join(root, path), "utf8");
const BANNER = "> **Archived — historical, not current behaviour.**";

const ARCHIVED = [
  "AGENT_COUNCIL_100_RATINGS", "AGENT_COUNCIL_100_REPORT", "AMC_LIFECYCLE_COMPLETION_BACKLOG",
  ...Array.from({ length: 10 }, (_, i) => `AUDIT_50_AGENTS_BATCH${i + 1}`),
  "AUDIT_SAFETY_RESEARCH_LANE", "DOGFOOD_REPORT", "ECC_GAP_ANALYSIS_AND_ACTION_PLAN", "enterprise-readiness-checklist",
  "FULL_MODULE_ROADMAP", "INNOVATION_THESIS", "MARKET_INTELLIGENCE_MARCH_2026", "NEW_GAPS_RESEARCH",
  "PAPER_IMPLEMENTATION_AUDIT", "RESEARCHER_EXODUS_GAP_ANALYSIS", "RESEARCH_GAPS_MARCH_2026", "RESEARCH_PAPERS_2026",
  "RESEARCH_PAPERS_MARCH_2026", "UX_AUDIT_REPORT", "UX_FINAL_AUDIT", "VSCODE_EXTENSION",
  "EVIDENCE_CHAIN", "CLI_WRAPPERS", "AMC_MASTER_REFERENCE"
];

describe("docs truth reset (P0-28)", () => {
  test("every file in docs/archive/ starts with the archive banner", () => {
    const files = readdirSync(join(root, "docs/archive")).filter((name) => name.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(ARCHIVED.length + 1);
    expect(files.filter((name) => !read(`docs/archive/${name}`).startsWith(BANNER))).toEqual([]);
  });

  test("the archived papers moved, none was deleted, and the index names each one", () => {
    expect(ARCHIVED).toHaveLength(32);
    const index = read("docs/archive/README.md");
    for (const name of ARCHIVED) {
      expect(existsSync(join(root, `docs/${name}.md`)), `docs/${name}.md still exists`).toBe(false);
      expect(existsSync(join(root, `docs/archive/${name}.md`)), `docs/archive/${name}.md is missing`).toBe(true);
      if (!name.startsWith("AUDIT_50_AGENTS_BATCH")) expect(index, name).toContain(`\`${name}.md\``);
    }
    expect(index).toContain("produced by simulated AI personas, not people");
  });

  test("the README invites no self-made badge and hand-types no pack count", () => {
    const readme = read("README.md");
    expect(readme).not.toContain("Standalone maturity badges");
    expect(readme).not.toContain("img.shields.io/badge/AMC-L3_(72.5)");
    expect(readme).not.toContain("142 Assurance");
    expect(readme).not.toContain("142 attack");
    expect(readme).toContain("Badges and certification marks will only come from a public registry (Gate G3).");
    // A pack count outside a gen-counts marker is hand-typed.
    const unmarked = (text: string) => text.replace(/<!-- amc:count:\w+ -->[^<]*<!-- \/amc:count -->/g, "");
    for (const surface of ["README.md", "whitepaper/AMC_WHITEPAPER_v1.md", "website/index.html", "docs/PRICING.md",
      "docs/adr/005-free-core-paid-industry-packs.md"]) {
      expect(unmarked(read(surface)), surface).not.toMatch(/\b\d[\d,]*(?:-pack CLI catalog|\s+(?:registered\s+|adversarial\s+)*(?:assurance|attack(?:\s+test)?|adversarial)\s+packs\b)/i);
    }
    expect(readme).toContain("registered = packs returned by `listAssurancePacks()`; files on disk may differ");
  });

  test("source comments cite docs at their current paths", () => {
    const cited = [...read("src/diagnostic/questionBank.ts").matchAll(/Source: (\S+\.md)/g)].map((match) => match[1]!);
    expect(cited.length).toBeGreaterThan(0);
    for (const path of cited) expect(existsSync(join(root, path)), path).toBe(true);
  });

  test("validity text reports no unmeasured agreement statistic or confirmed independence", () => {
    const validity = read("docs/VALIDITY_FRAMEWORK.md");
    expect(validity).not.toContain("κ = 1.0");
    expect(validity).not.toMatch(/\bconfirmed\b/i);
    expect(validity).not.toContain("±5 points");
    expect(validity).toContain("Repeatability check (same harness, same input)");
    const whitepaper = read("whitepaper/AMC_WHITEPAPER_v1.md");
    expect(whitepaper).not.toContain("(ICC) = 0.97");
    expect(whitepaper).not.toContain("κ was 0.82");
    expect(whitepaper).not.toContain("κ=0.82");
    expect(whitepaper).toContain("No reliability or inter-rater study is recorded for this version; earlier figures were removed because no study record exists.");
  });

  test("certificate bundles and SAML say what they are not", () => {
    expect(read("docs/CERTIFICATION.md")).toContain("It is not a certification");
    const saml = read("docs/SSO_SAML.md");
    // P2-07 replaces this check when real SAML lands.
    expect(saml).not.toContain("response/assertion signatures");
    expect(saml).toContain("Standard SAML 2.0 responses with XML signatures are not supported");
  });

  test("the quickstart image is run without a second amc and with no example passphrase", () => {
    for (const surface of ["README.md", "website/docs/getting-started.html"]) {
      const text = read(surface);
      expect(text, surface).not.toMatch(/amc-quickstart\s+amc\b/);
      expect(text, surface).not.toMatch(/AMC_VAULT_PASSPHRASE=\S/);
      expect(text, surface).toContain("docker run --rm amc-quickstart --version");
    }
  });

  test("no CLI description still says 126-question", () => {
    expect(read("src/cli.ts")).not.toContain("126-question");
    expect(read("src/score/domainPacks.ts")).not.toContain("126-question");
  });
});

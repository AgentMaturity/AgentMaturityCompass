import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("community demo kit", () => {
  test("ships a GitHub-shareable terminal demo asset and community kit", () => {
    const kit = read("docs/COMMUNITY_DEMO_KIT.md");
    const onePager = read("docs/WHY_AMC_ONE_PAGER.md");
    const svg = read("website/assets/amc-five-minute-terminal.svg");

    expect(kit).toContain("# AMC Community Demo Kit");
    expect(kit).toContain("website/assets/amc-five-minute-terminal.svg");
    expect(kit).toContain("https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files");
    expect(kit).toContain("npx agent-maturity-compass quickscore");
    expect(kit).toContain("amc quickstart --startup-plan --role cto");
    expect(kit).toContain("amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv");

    expect(onePager).toContain("# Why AMC");
    expect(onePager).toContain("Score");
    expect(onePager).toContain("Evidence");
    expect(onePager).toContain("Governance");

    expect(svg).toContain(">AMC five-minute terminal demo</title>");
    expect(svg).toContain("role=\"img\"");
    expect(svg).toContain("npx agent-maturity-compass quickscore");
    expect(svg).toContain("amc quickstart --startup-plan --role cto");
    expect(svg).toContain("L0 placeholder is not a measured maturity result");
  });

  test("public docs and audit expose the community demo kit", () => {
    const readme = read("README.md");
    const audit = read("docs/AUDIT_50_AGENTS_BATCH5.md");

    expect(readme).toContain("[Community Demo Kit](docs/COMMUNITY_DEMO_KIT.md)");
    expect(audit).toContain("Community demo kit — ✅ Resolved 2026-06-16");
    expect(audit).toContain("GitHub Docs attaching-files guidance");
    expect(audit).not.toContain("No single \"why AMC\" pitch deck or community-shareable asset.");
    expect(audit).not.toContain("No screencasts or terminal recordings.");
  });
});

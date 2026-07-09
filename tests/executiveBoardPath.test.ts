import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("executive and board-facing path", () => {
  test("website exposes a dedicated executive page from the homepage", () => {
    const page = readProjectFile("website/executive.html");
    const homepage = readProjectFile("website/index.html");

    expect(page).toContain("AMC for Executives");
    expect(page).toContain("board brief");
    expect(page).toContain("What The Board Sees");
    expect(page).toContain("og-card.png");
    expect(page).toContain("id=\"main-content\"");
    expect(homepage).toContain("executive.html");
  });

  test("executive surfaces use current public counts and pricing boundaries", () => {
    const page = readProjectFile("website/executive.html");
    const docs = readProjectFile("docs/EXECUTIVE_OVERVIEW.md");
    const combined = `${page}\n${docs}`;

    expect(combined).toContain("244");
    expect(combined).toContain("142");
    expect(combined).toContain("41");
    expect(combined).toContain("600 sector");
    expect(docs).toContain("**Mobility** | 6");
    expect(docs).toContain("$9.99/month");
    expect(docs).toContain("amc up");

    expect(combined).not.toContain("593 sector-specific");
    expect(combined).not.toContain("86 assurance");
    expect(docs).not.toContain("docker run -it amc/compass");
    expect(docs).not.toContain("No subscription fees");
  });

  test("board path includes an L3 business-risk memo without over-approving production use", () => {
    const memo = readProjectFile("docs/BOARD_RISK_L3_MEMO.md");
    const overview = readProjectFile("docs/EXECUTIVE_OVERVIEW.md");
    const page = readProjectFile("website/executive.html");
    const readme = readProjectFile("README.md");
    const audit = readProjectFile("docs/AUDIT_50_AGENTS_BATCH5.md");

    expect(memo).toContain("# What L3 Means For Business Risk");
    expect(memo).toContain("L3 is not a blanket approval");
    expect(memo).toContain("limited production use");
    expect(memo).toContain("evidence coverage");
    expect(memo).toContain("residual risk");
    expect(memo).toContain("NIST AI Risk Management Framework");
    expect(memo).toContain("EU AI Act");
    expect(overview).toContain("Board L3 business-risk memo");
    expect(page).toContain("BOARD_RISK_L3_MEMO.md");
    expect(readme).toContain("Board L3 Risk Memo");
    expect(audit).toContain("L3 business-risk memo — ✅ Resolved 2026-06-16");
    expect(audit).not.toContain("deeper \"what does L3 mean for business risk?\" long-form memo remains future work");
  });
});

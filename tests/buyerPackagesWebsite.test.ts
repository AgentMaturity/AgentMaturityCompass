import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("buyer packages website link", () => {
  test("homepage pricing section links procurement buyers to buyer packages", () => {
    const homepage = read("website/index.html");
    const styles = read("website/style.css");
    const buyerPackages = read("docs/BUYER_PACKAGES.md");
    const audit = read("docs/AUDIT_50_AGENTS_BATCH5.md");

    expect(buyerPackages).toContain("Commercial offers by buyer type");
    expect(homepage).toContain('href="./docs/#BUYER_PACKAGES"');
    expect(homepage).toContain("Compare buyer packages");
    expect(homepage).toContain("pricing-buyer-link");
    expect(styles).toContain(".pricing-buyer-link");
    expect(audit).toContain("Buyer package link — ✅ Resolved 2026-06-16");
    expect(audit).not.toContain("needs to be linked from website pricing page more prominently");
  });
});

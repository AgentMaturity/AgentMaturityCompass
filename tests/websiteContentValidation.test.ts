import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("website content validation", () => {
  test("blog page contains real article cards and long-form article bodies", () => {
    const blog = read("website/blog.html");

    expect((blog.match(/class="blog-card"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(blog).toContain("How to Evaluate AI Agents in 2026");
    expect(blog).toContain("EU AI Act Compliance Checklist for AI Agents");
    expect(blog).toContain("The 84-Point Documentation Inflation Gap");
    expect(blog).toContain("The Benchmark Problem");
    expect(blog).toContain("The Compliance Checklist");
    expect(blog).not.toMatch(/coming soon|placeholder blog|lorem ipsum/i);
  });

  test("changelog page has a static fallback if remote changelog loading fails", () => {
    const changelog = read("website/changelog.html");

    expect(changelog).toContain("Static release notes fallback");
    expect(changelog).toContain("Version 1.0.0");
    expect(changelog).toContain("GRC treatment-plan export");
    expect(changelog).toContain("Community demo kit");
    expect(changelog).toContain("https://developer.mozilla.org/en-US/docs/Web/HTML/Element/noscript");
    expect(changelog).toContain("<noscript>");
    expect(changelog).not.toContain("content of those pages not audited for staleness");
  });

  test("audit documents the validated website content surfaces", () => {
    const audit = read("docs/AUDIT_50_AGENTS_BATCH5.md");

    expect(audit).toContain("Website blog/changelog validation — ✅ Resolved 2026-06-16");
    expect(audit).toContain("MDN noscript reference");
    expect(audit).not.toContain("Changelog page (`website/changelog.html`) and blog (`website/blog.html`) exist but may be empty/placeholder");
    expect(audit).not.toContain("content of those pages not audited for staleness");
  });

  test("homepage and docs index expose the whitepaper research artifact", () => {
    const homepage = read("website/index.html");
    const docsIndex = read("docs/INDEX.md");
    const audit = read("docs/AUDIT_50_AGENTS_BATCH5.md");

    expect(homepage).toContain("Agent Maturity Compass whitepaper");
    expect(homepage).toContain("https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/whitepaper/AMC_WHITEPAPER_v1.md");
    expect(docsIndex).toContain("**I want the whitepaper or citation metadata**");
    expect(docsIndex).toContain("whitepaper/AMC_WHITEPAPER_v1.md");
    expect(audit).toContain("Whitepaper homepage/docs discoverability — ✅ Resolved 2026-06-16.");
    expect(audit).not.toContain("⚠️ Not linked from website homepage");
  });
});

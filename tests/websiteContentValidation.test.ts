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

  test("changelog page publishes current static notes without a remote runtime", () => {
    const changelog = read("website/changelog.html");

    expect(changelog).toContain('<h2 id="release-1-1-1">1.1.1</h2>');
    expect(changelog).toContain("Make <code>amc doctor</code> report healthy install readiness");
    expect(changelog).toContain("supported Node.js 24 action versions");
    expect(changelog).toContain("Complete changelog");
    expect(changelog).not.toContain("<script");
    expect(changelog).not.toContain("raw.githubusercontent.com");
    expect(changelog).not.toContain("content of those pages not audited for staleness");
  });

  test("audit documents the validated website content surfaces", () => {
    const audit = read("docs/archive/AUDIT_50_AGENTS_BATCH5.md");

    expect(audit).toContain("Website blog/changelog validation — ✅ Resolved 2026-06-16");
    expect(audit).toContain("MDN noscript reference");
    expect(audit).not.toContain("Changelog page (`website/changelog.html`) and blog (`website/blog.html`) exist but may be empty/placeholder");
    expect(audit).not.toContain("content of those pages not audited for staleness");
  });

  test("homepage and docs index expose the whitepaper research artifact", () => {
    const homepage = read("website/index.html");
    const docsIndex = read("docs/INDEX.md");
    const audit = read("docs/archive/AUDIT_50_AGENTS_BATCH5.md");

    expect(homepage).toContain("Agent Maturity Compass whitepaper");
    expect(homepage).toContain("https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/whitepaper/AMC_WHITEPAPER_v1.md");
    expect(docsIndex).toContain("## Understand The Proof");
    expect(docsIndex).toContain("[Whitepaper](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/whitepaper/AMC_WHITEPAPER_v1.md)");
    expect(audit).toContain("Whitepaper homepage/docs discoverability — ✅ Resolved 2026-06-16.");
    expect(audit).not.toContain("⚠️ Not linked from website homepage");
  });

  test("current public surfaces do not turn maturity or signatures into legal compliance claims", () => {
    const currentPublicSurfaces = [
      "README.md",
      "docs/EXECUTIVE_OVERVIEW.md",
      "docs/BOARD_RISK_L3_MEMO.md",
      "docs/EU_AI_ACT_COMPLIANCE.md",
      "docs/adr/002-five-dimension-maturity-model.md",
      "website/lite.html",
      "website/compliance.html",
      "website/compare.html",
      "website/blog.html",
      "website/blog/index.html",
      "website/blog/eu-ai-act-agents.html",
      "website/blog/amc-philosophy.html",
      "website/blog/langchain-scoring-tutorial.html",
      "website/blog/the-84-point-gap.html",
      "website/docs/compliance.html",
      "website/docs/getting-started.html",
      "website/docs/methodology.html"
    ].map(read).join("\n");

    expect(currentPublicSurfaces).not.toMatch(/EU AI Act minimum|mandates L3|L3\+? (?:is|as) (?:a|the) legal threshold/i);
    expect(currentPublicSurfaces).not.toMatch(/deadline (?:is|:) August 2026|mandatory (?:deadline: )?August 2026|five months remain/i);
    expect(currentPublicSurfaces).not.toMatch(/signed evidence.{0,40}proves compliance/i);
    expect(currentPublicSurfaces).not.toContain("Every API call, tool use, and decision is hash-chained");
    expect(currentPublicSurfaces).toContain("INSUFFICIENT_EVIDENCE");
    expect(currentPublicSurfaces).toContain("does not certify legal compliance");
    expect(read("website/compliance.html")).toContain("Evidence Mapping, Not Certification");
  });
});

// LIVE-UX-15: the website must say what the macOS app opens. Since the app work it asks on first launch, sets up the
// person's own workspace (Keychain-kept vault passphrase, owner sign-in) and keeps the view-only demo one menu item away.
describe("website hero truth", () => {
  test("the macOS app section says the app sets up your own workspace and keeps the demo one menu item away", () => {
    const desktop = read("website/index.html").match(/<section id="desktop"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(desktop).toContain("On first launch the macOS app asks whether to set up your own workspace or try the demo.");
    expect(desktop).toContain("Studio &gt; Try the Demo switches to the view-only demo, and Studio &gt; Open My Workspace switches back.");
    expect(desktop).toContain("ad-hoc signed, not notarized");
    expect(desktop).toContain("No download of the current version is published");
    const script = read("scripts/package-desktop-installers.mjs");
    for (const label of ["Set Up My Workspace", "Try the Demo", "Open My Workspace", "/w/demo/console/"]) expect(script).toContain(label);
  });

  test("the hero install route is the README's source build and its menu lines are the real front-door labels", () => {
    const hero = read("website/index.html").match(/<section class="hero">[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(hero).not.toMatch(/No terminal|Free forever|Download 1\.1\.1/);
    expect(read("README.md")).toContain("pnpm install --frozen-lockfile && pnpm run build && npm link");
    expect(hero).toContain("pnpm install --frozen-lockfile &amp;&amp; pnpm run build &amp;&amp; npm link");
    const frontDoor = read("src/setup/frontDoor.ts");
    for (const label of ["What do you want to do?", "as it works (signed in)", "Try a demo chat (no account or key needed)", "Open the console in my browser", "Just show my score"]) {
      expect(frontDoor, label).toContain(label);
      expect(hero, label).toContain(label);
    }
  });
});

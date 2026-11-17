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
    // The notes are static: the only scripts are the site's own nav scripts, none of them fetches the notes.
    for (const tag of changelog.matchAll(/<script\b[^>]*>/g)) expect(tag[0]).toMatch(/^<script src="(?:script|home|pages)\.js\?v=\d+">$/);
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
    const desktop = read("website/index.html").match(/<(article|section) id="desktop"[\s\S]*?<\/\1>/)?.[0] ?? "";
    expect(desktop).not.toBe("");
    expect(desktop).toContain("On first launch the macOS app asks whether to set up your own workspace or try the demo.");
    expect(desktop).toContain("Studio &gt; Try the Demo switches to the view-only demo, and Studio &gt; Open My Workspace switches back.");
    expect(desktop).toContain("ad-hoc signed, not notarized");
    expect(desktop).toContain("No download of the current version is published");
    // The app's words live in its source (scripts/desktop/StudioApp.m), which the packager compiles.
    const script = read("scripts/package-desktop-installers.mjs") + read("scripts/desktop/StudioApp.m");
    for (const label of ["Set Up My Workspace", "Try the Demo", "Open My Workspace", "/w/demo/console/"]) expect(script).toContain(label);
  });

  test("the hero's Get AMC route is the README's source build and every menu line the page names is a real front-door label", () => {
    const page = read("website/index.html");
    const hero = page.match(/<section class="hero">[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(hero).not.toMatch(/No terminal|Free forever|Download 1\.1\.1/);
    expect(hero).toContain('href="#install"');
    const install = page.match(/<section id="install"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(read("README.md")).toContain("curl -fsSL https://agentmaturity.co/install-source.sh | sh");
    expect(install).toContain("curl -fsSL https://agentmaturity.co/install-source.sh | sh");
    // The three limits: a by-hand build if the address is not found, install.sh is 1.1.1, Windows is untested.
    // Changed on purpose: "only after the website is published" made no sense on the published page.
    expect(install).toContain("If the command says the address is not found, build by hand");
    expect(install).not.toContain("only after the website is published");
    expect(install).toContain("so you can type <code>amc</code> in any folder");
    expect(install).toContain("installs the published 1.1.1");
    expect(install).toContain("has not been tested on a real Windows machine");
    // Every "choose: <line>" and "choose <line>." the page prints must be a line the amc menu really shows.
    const named = [...page.matchAll(/then choose: ([^<\n]+)/g), ...page.matchAll(/menu, choose ([^.<]+)\./g)].map((m) => m[1].trim());
    expect(named).toEqual(expect.arrayContaining(["Try a demo chat", "Just show my score", "Build an agent for my industry"]));
    const frontDoor = read("src/setup/frontDoor.ts");
    for (const label of [...named, "Open the console in my browser"]) {
      // The watch lines are built per agent: `Watch ${agent.name} as it works (signed in)`.
      expect(frontDoor, label).toContain(label.replace(/^Watch (Claude Code|Codex) /, (_, name) => (frontDoor.includes(`name: "${name}"`) ? "Watch ${agent.name} " : `Watch ${name} `)));
      expect(page, label).toContain(label);
    }
  });

  test("the home page calls the built-in model the stand-in model, so it is not confused with a practice project", () => {
    const page = read("website/index.html");
    expect(page).not.toMatch(/practice model/i);
    expect(page).toContain("stand-in model");
  });
});

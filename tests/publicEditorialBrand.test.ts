import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const editorialPages = [
  "website/blog.html",
  "website/blog/index.html",
  "website/blog/amc-philosophy.html",
  "website/blog/eu-ai-act-agents.html",
  "website/blog/langchain-scoring-tutorial.html",
  "website/blog/the-84-point-gap.html"
];

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("AMC public editorial identity", () => {
  test("maps every editorial page through one canonical stylesheet", () => {
    const stylesheetPath = resolve(process.cwd(), "website/blog/editorial.css");
    const scriptPath = resolve(process.cwd(), "website/blog/editorial.js");
    expect(existsSync(stylesheetPath)).toBe(true);
    expect(existsSync(scriptPath)).toBe(true);

    const stylesheet = read("website/blog/editorial.css");
    expect(stylesheet).toContain('@import url("../brand.css")');
    for (const token of ["var(--amc-bg)", "var(--amc-text)", "var(--amc-muted)", "var(--amc-accent)", "var(--amc-font-sans)", "var(--amc-font-mono)"]) {
      expect(stylesheet).toContain(token);
    }

    for (const path of editorialPages) {
      const html = read(path);
      const href = path === "website/blog.html" ? "blog/editorial.css?v=2" : "../blog/editorial.css?v=2";
      const script = path === "website/blog.html" ? "blog/editorial.js?v=1" : "../blog/editorial.js?v=1";
      expect(html, path).toContain(`href="${href}"`);
      expect(html, path).toContain(`src="${script}"`);
      expect(html, path).not.toContain("<style>");
    }
  });

  test("uses the home page's nav and footer and the evidence promise without decorative marks", () => {
    const decorativeEmoji = /\p{Extended_Pictographic}/u;

    for (const path of editorialPages) {
      const html = read(path);
      expect(html, path).toContain('<nav class="nav" aria-label="Main">');
      expect(html, path).toContain('class="nav-brand" aria-label="AMC home">amc<span class="accent">_</span></a>');
      expect(html, path).toContain('<p class="footer-tagline">Build, run and check AI agents for regulated work.<br>Evidence over claims.</p>');
      expect(html, path).not.toMatch(/<(?:a|h1|h2|button)[^>]*>[^<]*\p{Extended_Pictographic}/u);
      expect(html, path).not.toMatch(/Playfair|JetBrains|#FAF7F3|#F2EDE7|#00ff41/i);
      expect(html.match(/<h1\b/g)?.length ?? 0, path).toBeGreaterThanOrEqual(1);
      for (const heading of html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)) {
        expect(heading[1], path).not.toMatch(decorativeEmoji);
      }
    }
  });

  test("preserves the existing index and long-form article inventory", () => {
    const legacyIndex = read("website/blog.html");
    for (const title of [
      "How to Evaluate AI Agents in 2026",
      "EU AI Act Compliance Checklist for AI Agents",
      "The 84-Point Documentation Inflation Gap"
    ]) {
      expect(legacyIndex).toContain(title);
    }
    expect(legacyIndex).toContain("showArticle('evaluate-agents-2026')");

    const routedIndex = read("website/blog/index.html");
    for (const href of ["the-84-point-gap.html", "langchain-scoring-tutorial.html", "eu-ai-act-agents.html"]) {
      expect(routedIndex).toContain(`href="${href}"`);
    }

    expect(read("website/blog/amc-philosophy.html")).toContain("Trust should be proportional to evidence, not claims.");
    expect(read("website/blog/eu-ai-act-agents.html")).toContain("does not certify legal compliance");
    // The source build is the current way in; the old installer is gone from the posts (S-04).
    expect(read("website/blog/langchain-scoring-tutorial.html")).toContain("pnpm install --frozen-lockfile &amp;&amp; pnpm run build &amp;&amp; npm link");
    for (const path of editorialPages) expect(read(path), path).not.toContain("install.sh | sh");
    // Each by-hand build in a post comes after the current one-line install.
    for (const path of editorialPages) {
      const html = read(path);
      const byHand = html.split("git clone https://github.com/AgentMaturity/AgentMaturityCompass.git").length - 1;
      expect(html.split("curl -fsSL https://agentmaturity.co/install-source.sh | sh").length - 1, path).toBe(byHand);
    }
    expect(read("website/blog/the-84-point-gap.html")).toContain("Documentation Inflation Gap");
  });

  test("keeps article metadata and social previews on the current AMC card", () => {
    for (const path of editorialPages) {
      const html = read(path);
      expect(html, path).toContain('<meta name="viewport"');
      expect(html, path).toContain('content="https://agentmaturity.co/og-card.png"');
      expect(html, path).toContain('name="twitter:card" content="summary_large_image"');
      expect(html, path).toMatch(/<link rel="canonical" href="https:\/\/agentmaturity\.co\//);
    }
  });

  test("uses semantic landmarks and bounded mobile content primitives", () => {
    const stylesheet = read("website/blog/editorial.css");
    expect(stylesheet).toContain("overflow-wrap: anywhere");
    expect(stylesheet).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
    expect(stylesheet).toMatch(/pre\s*\{[^}]*overflow-x:\s*auto/s);
    expect(stylesheet).toContain("@media (max-width: 760px)");
    expect(read("website/blog/editorial.js")).toContain('element.setAttribute("tabindex", "0")');

    for (const path of editorialPages) {
      const html = read(path);
      expect(html, path).toContain('<nav class="nav" aria-label="Main">');
      expect(html, path).toContain('<main id="main-content"');
      expect(html, path).toContain('<footer class="footer">');
    }
  });

  test("posts name a real pack, a reachable CI target and no evidence weights", () => {
    const text = editorialPages.map(read).join("\n");
    expect(text).not.toMatch(/--pack eu-ai-act\b/);
    expect(text).toContain("--pack euAiActArticle");
    expect(text).not.toMatch(/--target 3\b/);
    expect(text).not.toMatch(/scores at 1\.0x|trust weight|evidence-weighted|roughly 40%/);
  });

  test("docs app tables scroll inside the page on a phone", () => {
    expect(read("website/docs/docs.css")).toMatch(/\.doc-content table \{\s*display: block; max-width: 100%; overflow-x: auto;/);
  });
});

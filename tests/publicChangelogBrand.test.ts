import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

function visibleText(html: string): string {
  // Entities have to be decoded, not just tags stripped: a bullet containing
  // `amc policy simulate <controlId>` is correctly written to the page as
  // &lt;controlId&gt;, and a reader sees the angle brackets. Comparing the raw
  // entity against the CHANGELOG text reported a bullet as missing when it was
  // present and rendering correctly.
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    // Tags collapse to a space, so `<code>--status</code>,` became "--status ,".
    // Punctuation does not float away from the word it follows on the rendered
    // page, and the CHANGELOG text it is compared against does not either.
    // Only *trailing* punctuation: `<code>--status</code>,` must lose its space,
    // but `managed <code>.gitignore</code> block` must keep the one before the
    // leading dot, or the words run together.
    .replace(/\s+([,.;:)\]])(?=\s|$)/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
}

describe("AMC public changelog identity", () => {
  test("uses the canonical AMC editorial shell and brand tokens", () => {
    const html = read("website/changelog.html");
    const css = read("website/changelog.css");

    expect(html).toContain('href="changelog.css?v=2"');
    expect(html).toContain('href="home.css?v=5"');
    // One nav and one footer on every page: the home page's.
    expect(html).toContain('<a href="./" class="nav-brand" aria-label="AMC home">amc<span class="accent">_</span></a>');
    expect(html).toContain('<p class="footer-tagline">Build, run and check AI agents for regulated work.<br>Evidence over claims.</p>');
    expect(css).toContain('@import url("./blog/editorial.css")');
    for (const token of ["var(--amc-bg)", "var(--amc-text)", "var(--amc-muted)", "var(--amc-accent)", "var(--amc-font-sans)", "var(--amc-font-mono)"]) {
      expect(css).toContain(token);
    }
  });

  test("removes the unsafe remote markdown runtime and retired visual shell", () => {
    const html = read("website/changelog.html");
    const css = read("website/changelog.css");

    // Only the site's own nav scripts load; the notes themselves are static HTML.
    expect([...html.matchAll(/<script\b[^>]*>/g)].map((tag) => tag[0])).toEqual([
      '<script src="script.js?v=13">', '<script src="home.js?v=3">', '<script src="pages.js?v=2">'
    ]);
    expect(html).not.toContain("marked");
    expect(html).not.toContain("raw.githubusercontent.com");
    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("<style");
    expect(`${html}\n${css}`).not.toMatch(/JetBrains|#00ff41|#00cc33|#006622/i);
    expect(html).not.toMatch(/<(?:a|h1|h2|button)[^>]*>[^<]*\p{Extended_Pictographic}/u);
  });

  test("publishes the exact latest source-controlled release and links full history", () => {
    const html = read("website/changelog.html");
    const changelog = read("CHANGELOG.md");
    const pkg = JSON.parse(read("package.json")) as { version: string };
    const latest = /^## (\d+\.\d+\.\d+)$/m.exec(changelog)?.[1];
    const latestSection = changelog.split(/^## /m)[1] ?? "";
    const latestBullets = Array.from(latestSection.matchAll(/^- (?:[a-f0-9]+: )?(.+)$/gm), match => match[1].replaceAll("`", ""));
    const pageText = visibleText(html);

    expect(latest).toBe(pkg.version);
    expect(html).toContain(`<h2 id="release-${pkg.version.replaceAll(".", "-")}">${pkg.version}</h2>`);
    expect(latestBullets.length).toBeGreaterThan(0);
    for (const bullet of latestBullets) expect(pageText).toContain(bullet);
    expect(html).toContain("https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/CHANGELOG.md");
    expect(html).toContain("https://github.com/AgentMaturity/AgentMaturityCompass/releases");
  });

  test("uses semantic landmarks and bounded responsive primitives", () => {
    const html = read("website/changelog.html");
    const css = read("website/changelog.css");

    expect(html).toContain('<a href="#main-content" class="skip-link">Skip to content</a>');
    expect(html).toContain('<nav class="nav" aria-label="Main">');
    expect(html).toContain('<main id="main-content" tabindex="-1">');
    expect(html).toContain('<footer class="footer">');
    expect(html).toMatch(/target="_blank" rel="noopener"/);
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toMatch(/\.release-entry\s*\{[^}]*border-radius:\s*8px/s);
  });
});

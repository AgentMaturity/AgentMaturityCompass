import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("AMC public changelog identity", () => {
  test("uses the canonical AMC editorial shell and brand tokens", () => {
    const html = read("website/changelog.html");
    const css = read("website/changelog.css");

    expect(html).toContain('href="changelog.css?v=1"');
    expect(html).toContain('class="editorial-topbar"');
    expect(html).toContain('class="editorial-wordmark"');
    expect(html).toContain('class="editorial-tagline">Evidence over claims.</span>');
    expect(html).toContain('amc<span class="brand-cursor">_</span><span class="editorial-surface">releases</span>');
    expect(css).toContain('@import url("./blog/editorial.css")');
    for (const token of ["var(--amc-bg)", "var(--amc-text)", "var(--amc-muted)", "var(--amc-accent)", "var(--amc-font-sans)", "var(--amc-font-mono)"]) {
      expect(css).toContain(token);
    }
  });

  test("removes the unsafe remote markdown runtime and retired visual shell", () => {
    const html = read("website/changelog.html");
    const css = read("website/changelog.css");

    expect(html).not.toContain("<script");
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
    expect(html).toContain('<nav class="editorial-topbar" aria-label="Primary">');
    expect(html).toContain('<main id="main-content" tabindex="-1">');
    expect(html).toContain('<footer class="editorial-footer">');
    expect(html).toContain('href="changelog.html" aria-current="page"');
    expect(html).toMatch(/target="_blank" rel="noopener"/);
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toMatch(/\.release-entry\s*\{[^}]*border-radius:\s*8px/s);
  });
});

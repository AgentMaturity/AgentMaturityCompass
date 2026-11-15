import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { listAssurancePacks } from "../src/assurance/packs/index.js";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const decorativeEmoji = /\p{Extended_Pictographic}/u;

describe("AMC public Playground identity", () => {
  test("uses the canonical AMC token source without the retired terminal or blue themes", () => {
    expect(existsSync(resolve(process.cwd(), "website/playground.css"))).toBe(true);

    const html = read("website/playground.html");
    const css = read("website/playground.css");
    expect(html).toContain('href="playground.css?v=20261115"');
    expect(html).toContain('href="home.css?v=6"');
    expect(html).not.toMatch(/<style(?:\s[^>]*)?>/i);
    expect(css).toContain('@import url("./brand.css")');
    expect(css).toContain("var(--amc-bg)");
    expect(css).toContain("var(--amc-accent)");
    expect(css).toContain("var(--amc-font-sans)");
    expect(css).toContain("var(--amc-font-mono)");

    const presentation = `${html}\n${css}`;
    expect(presentation).not.toMatch(/JetBrains|#00ff41|#020802|rgba\(0\s*,\s*255\s*,\s*65|#2563eb|#1d4ed8/i);
    expect(css).not.toMatch(/letter-spacing:\s*-\.?\d/i);
  });

  test("presents one truthful, metadata-complete AMC browser-lab identity", () => {
    const html = read("website/playground.html");
    expect(html).toContain('<link rel="canonical" href="https://agentmaturity.co/playground.html">');
    expect(html).toContain('<meta property="og:image" content="https://agentmaturity.co/og-card.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    // One nav and one footer on every page: the home page's.
    expect(html).toContain('<a href="./" class="nav-brand" aria-label="AMC home">amc<span class="accent">_</span></a>');
    expect(html).toContain("You give the answers, so the score is self-reported.");
    expect(html).toContain("curated browser preview from AMC's full CLI catalog of <!-- amc:count:assurancePacksRegistered -->");
    expect(html).not.toMatch(/explore 143 assurance packs|shows all 143 test suites/i);
    expect(html).toContain('<footer class="footer">');
  });

  test("keeps decorative emoji out of Playground chrome and localized controls", () => {
    const html = read("website/playground.html");
    const i18n = read("website/i18n.js");
    for (const value of i18n.matchAll(/(?:playgroundTitle|btnCopyBadge|btnExportJSON|btnReset|btnShare|btnCopyClipboard|btnTakeTour):\s*(['"])(.*?)\1/g)) {
      expect(value[2], value[0]).not.toMatch(decorativeEmoji);
    }

    for (const text of [
      "🧭 AMC Playground",
      "🎓 Tour",
      "📊 Assessment",
      "⚔️ Scenario Lab",
      "🛡️ Assurance Packs",
      "📋 Copy Badge",
      "📄 Export JSON",
      "🔄 Reset",
      "📤 Share",
      "🔍 Evaluate",
      "💡 Show Ideal Response",
      "⚔️ Try in Scenario Lab"
    ]) {
      expect(html).not.toContain(text);
    }
  });

  test("uses semantic controls for scenario and pack exploration", () => {
    const html = read("website/playground.html");
    expect(html).toContain('<button type="button" class="scenario-item');
    expect(html).toContain('<button type="button" class="pack-card-toggle"');
    expect(html).toContain('aria-expanded="${isExpanded}"');
    expect(html).toContain('aria-controls="pack-detail-${p.id}"');
    expect(html).toContain('aria-pressed="${activePackFilter === key}"');
    expect(html).toContain('aria-label="Search assurance-pack previews"');
    expect(html).not.toContain('<div class="pack-card ${isExpanded ? \'expanded\' : \'\'}" onclick=');
  });

  test("distinguishes the complete product registry from the curated browser preview", () => {
    const html = read("website/playground.html");
    const browserPackBlock = html.match(/const PACKS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
    expect(listAssurancePacks()).toHaveLength(143);
    expect(browserPackBlock.match(/\{ id:/g)).toHaveLength(85);
    expect(html).toContain("Showing ${filtered.length} of ${PACKS.length} browser previews");
    expect(html).toContain("full CLI catalog of <!-- amc:count:assurancePacksRegistered -->");
  });

  test("stays dark like the rest of the site, and its guided tour never traps a click (S-23)", () => {
    const html = read("website/playground.html");
    const css = read("website/playground.css");
    expect(html).not.toContain('id="themeToggle"');
    expect(html).toContain("localStorage.removeItem('amc-theme')");
    // The skip link lands on the lab itself, not on the page body.
    expect(html).toContain('<main id="main-content" class="playground-main" tabindex="-1">');
    expect(html).toContain("tooltip.focus()");
    expect(html).toContain("if (e.key === 'Escape' && tourActive) endTour()");
    expect(html).toContain("if (returnFocus) tourTrigger?.focus()");
    // A click outside the tour box ends the tour and still reaches what was clicked: the overlay takes no clicks.
    expect(css).toMatch(/\.tour-overlay \{[^}]*pointer-events: none;/s);
    expect(html).toContain("endTour(false);\n}, true);");
  });
});

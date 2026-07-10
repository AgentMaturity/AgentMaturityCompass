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
    expect(html).toContain('href="playground.css?v=20260710a"');
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
    expect(html).toContain('class="playground-wordmark"');
    expect(html).toContain('amc<span class="brand-cursor">_</span><span class="surface-name">playground</span>');
    expect(html).toContain('class="playground-tagline">Evidence over claims.</span>');
    expect(html).toContain("curated browser preview from AMC's full 142-pack CLI catalog");
    expect(html).not.toMatch(/explore 142 assurance packs|shows all 142 test suites/i);
    expect(html).toContain('<footer class="playground-footer">');
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
    expect(listAssurancePacks()).toHaveLength(142);
    expect(browserPackBlock.match(/\{ id:/g)).toHaveLength(85);
    expect(html).toContain("Showing ${filtered.length} of ${PACKS.length} browser previews");
    expect(html).toContain("full 142-pack CLI catalog");
  });

  test("exposes persistent theme state and a keyboard-safe guided tour", () => {
    const html = read("website/playground.html");
    expect(html).toContain('id="themeToggle"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("function updateThemeControl(isLight)");
    expect(html).toContain("themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme')");
    expect(html).toContain("themeToggle.setAttribute('aria-pressed', String(isLight))");
    expect(html).toContain("tooltip.focus()");
    expect(html).toContain("if (e.key === 'Escape' && tourActive) endTour()");
    expect(html).toContain("tourTrigger?.focus()");
  });
});

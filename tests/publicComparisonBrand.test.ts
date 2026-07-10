import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("AMC public comparison identity and claim boundary", () => {
  test("uses one canonical comparison shell without retired presentation tokens", () => {
    expect(existsSync(resolve(process.cwd(), "website/compare.css"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "website/compare.js"))).toBe(true);

    const html = read("website/compare.html");
    const css = read("website/compare.css");
    expect(html).toContain('href="compare.css?v=20260710a"');
    expect(html).toContain('src="compare.js?v=20260710a"');
    expect(html).not.toMatch(/<style(?:\s[^>]*)?>/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(css).toContain('@import url("./brand.css")');
    for (const token of ["var(--amc-bg)", "var(--amc-text)", "var(--amc-muted)", "var(--amc-accent)", "var(--amc-font-sans)", "var(--amc-font-mono)"]) {
      expect(css).toContain(token);
    }

    const presentation = `${html}\n${css}`;
    expect(presentation).not.toMatch(/JetBrains|#00ff41|rgba\(0\s*,\s*255\s*,\s*65|#060d06|#0a140a/i);
    expect(css).not.toMatch(/letter-spacing:\s*-\.?\d/i);
  });

  test("presents canonical metadata, identity, and review state", () => {
    const html = read("website/compare.html");
    expect(html).toContain('<link rel="canonical" href="https://agentmaturity.co/compare.html">');
    expect(html).toContain('<meta property="og:image" content="https://agentmaturity.co/og-card.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('class="comparison-wordmark"');
    expect(html).toContain('amc<span class="brand-cursor">_</span><span class="surface-name">compare</span>');
    expect(html).toContain('class="comparison-tagline">Evidence over claims.</span>');
    expect(html).toContain('data-reviewed="2026-07-10"');
    expect(html).toContain('<img src="og-card.png"');
    expect(html).not.toMatch(/<(?:a|h1|h2|h3|button)[^>]*>[^<]*\p{Extended_Pictographic}/u);
  });

  test("binds each external category to a dated primary-source ledger", () => {
    const html = read("website/compare.html");
    for (const sourceId of ["SRC-AMC", "SRC-PI", "SRC-HELM", "SRC-MTEB", "SRC-AGENTBENCH", "SRC-MODEL-CARDS", "SRC-SOC2", "SRC-NIST"]) {
      expect(html).toContain(`data-source-id="${sourceId}"`);
    }
    for (const url of [
      "https://pi.dev/docs/latest",
      "https://crfm.stanford.edu/helm/index.html",
      "https://github.com/embeddings-benchmark/mteb",
      "https://github.com/THUDM/AgentBench",
      "https://research.google/pubs/model-cards-for-model-reporting/",
      "https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services",
      "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence"
    ]) {
      expect(html).toContain(`href="${url}"`);
    }
    expect(html).toContain("Retrieved 2026-07-10");
    expect(html).toContain("AMC interpretation");
    expect(html).not.toMatch(/\$50K|\$200K|\$100K|3.?6 months|annual audit|full compliance mapping|free \(MIT licensed\)|under 2 minutes/i);
  });

  test("keeps the 84-point example bounded to its reproducible AMC fixture", () => {
    const html = read("website/compare.html");
    expect(html).toContain("amc demo gap --fast");
    expect(html).toContain("100/100");
    expect(html).toContain("16/100");
    expect(html).toContain("84-point fixture delta");
    expect(html).toContain("one deterministic AMC fixture, not an industry prevalence estimate or an independent comparison");
    expect(html).toContain("https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/src/demo/gapDemo.ts");
    expect(html).toContain("https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/BENCHMARK_GALLERY.md");
    expect(html).not.toMatch(/AMC vs Everything Else|Why AMC Wins|every approach on this page except AMC|grade its own homework/i);
  });

  test("states where AMC fits and where complementary evidence is still required", () => {
    const html = read("website/compare.html");
    expect(html).toContain("Use these approaches together");
    expect(html).toContain("AMC does not certify legal compliance.");
    expect(html).toContain("A signed artifact proves integrity, not evidence sufficiency.");
    expect(html).toContain("INSUFFICIENT_EVIDENCE");
    expect(html).toContain("AMC does not replace model benchmarks, model cards, organizational assurance reports, or expert adversarial testing.");
  });

  test("uses semantic landmarks, a captioned comparison table, and accessible persistent theme state", () => {
    const html = read("website/compare.html");
    const script = read("website/compare.js");
    expect(html).toContain('<nav class="comparison-topbar"');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('<footer class="comparison-footer"');
    expect(html).toContain('<div class="table-region" role="region"');
    expect(html).toContain("<caption>");
    expect(html).toContain('id="themeToggle"');
    expect(html).toContain('aria-pressed="false"');
    expect(script).toContain("scrollWidth > region.clientWidth");
    expect(script).toContain('region.setAttribute("tabindex", "0")');
    expect(script).toContain("localStorage.setItem(\"amc-theme\", theme)");
    expect(script).toContain("Switch to dark theme");
    expect(script).toContain("Switch to light theme");
  });
});

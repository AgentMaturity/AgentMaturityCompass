import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const standaloneDocs = [
  "website/docs/getting-started.html",
  "website/docs/cli.html",
  "website/docs/adapters.html",
  "website/docs/compliance.html",
  "website/docs/methodology.html"
];

const internalDocs = [
  "OSS_ADOPTION_ROADMAP",
  "IMPLEMENTATION_REALITY_MAP",
  "DOCS_DRIFT_CLEANUP_PLAN",
  "FULL_MODULE_ROADMAP",
  "INNOVATION_THESIS",
  "GO_TO_MARKET_PACK",
  "LAUNCH",
  "NORTHSTAR_PROMPTS",
  "REAL_PEOPLE_COUNCIL",
  "NEW_GAPS_RESEARCH",
  "wave4-agentic-ecosystem-audit",
  "wave4-ai-safety-audit",
  "wave4-documentation-audit",
  "wave4-integration-audit",
  "wave4-product-readiness-audit",
  "wave4-regulatory-audit",
  "wave4-supply-chain-audit",
  "wave4-test-coverage-audit"
];

const decorativeEmoji = /\p{Extended_Pictographic}/u;

describe("AMC public brand system", () => {
  test("maps website and both Docs renderers to one canonical identity token source", () => {
    const tokenPath = resolve(process.cwd(), "website/brand.css");
    expect(existsSync(tokenPath)).toBe(true);
    const tokens = read("website/brand.css");

    expect(tokens).toContain("--amc-bg: #0a0a0a");
    expect(tokens).toContain("--amc-panel: #111111");
    expect(tokens).toContain("--amc-text: #FFFFFF");
    expect(tokens).toContain("--amc-muted: #a0a0a0");
    expect(tokens).toContain("--amc-accent: #4AEF79");
    expect(tokens).toContain("--amc-font-sans: 'Inter', system-ui, sans-serif");
    expect(tokens).toContain("--amc-font-mono: 'Space Mono', monospace");

    const website = read("website/style.css");
    const docs = read("website/docs/docs.css");
    const sharedDocs = read("website/docs/shared.css");
    expect(website).toContain('@import url("./brand.css")');
    expect(docs).toContain('@import url("../brand.css")');
    expect(sharedDocs).toContain('@import url("../brand.css")');
    for (const styles of [website, docs, sharedDocs]) {
      expect(styles).toContain("var(--amc-bg)");
      expect(styles).toContain("var(--amc-accent)");
      expect(styles).not.toMatch(/letter-spacing:\s*-\.?\d/i);
    }
  });

  test("curates public Docs around user workflows and blocks operator planning files", () => {
    const docs = read("website/docs/docs.js");

    expect(docs).toContain("const INTERNAL_DOCS = new Set");
    expect(docs).toContain("const PUBLIC_DOC_IDS = new Set");
    expect(docs).toContain("const PUBLIC_DOCS = ALL_DOCS.filter");
    expect(docs).toContain("const PUBLIC_CATEGORIES = CATEGORIES.map");
    expect(docs).toContain("if (!PUBLIC_DOCS.includes(docName))");
    expect(docs).not.toContain("<h3>OSS Adoption Roadmap</h3>");
    expect(docs).toContain("<h3>Evidence & Receipts</h3>");
    for (const doc of internalDocs) {
      expect(docs, doc).toContain(`'${doc}'`);
    }

    const index = read("docs/INDEX.md");
    for (const doc of internalDocs) {
      expect(index, doc).not.toContain(doc);
    }
    expect(index).toContain("(START_HERE.md)");
    expect(index).toContain("(EVIDENCE_TRUST.md)");
    expect(index).toContain("(DOCTOR.md)");
    expect(index).toContain("(API_REFERENCE.md)");
  });

  test("uses one Docs topbar contract without decorative emoji chrome", () => {
    const dynamic = read("website/docs/index.html");
    const docsScript = read("website/docs/docs.js");
    expect(dynamic).toContain('class="topbar-tagline">Evidence over claims.</span>');
    expect(dynamic).toContain('href="getting-started.html"');
    expect(dynamic).toContain('href="cli.html"');
    expect(dynamic).toContain('href="adapters.html"');
    expect(dynamic).toContain('href="compliance.html"');
    expect(dynamic).toContain('href="methodology.html"');
    expect(docsScript).not.toMatch(/<h[1-6][^>]*>[^<]*\p{Extended_Pictographic}/u);

    for (const path of standaloneDocs) {
      const html = read(path);
      expect(html, path).toContain('class="topbar-tagline">Evidence over claims.</span>');
      expect(html, path).toContain('href="./" class="topbar-logo"');
      expect(html, path).not.toMatch(/<(?:h[1-6]|strong|button)[^>]*>[^<]*\p{Extended_Pictographic}/u);
    }
  });

  test("ships a reproducible current social card and uses it on GitHub front doors", () => {
    expect(existsSync(resolve(process.cwd(), "scripts/brand/og-card.html"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "scripts/render-brand-assets.mjs"))).toBe(true);
    const source = read("scripts/brand/og-card.html");
    expect(source).toContain("Agent Maturity Compass");
    expect(source).toContain("Run one command.");
    expect(source).toContain("Get the full score. Fix the gaps.");
    expect(source).toContain("Evidence over claims.");
    expect(source).toContain("#4AEF79");
    expect(source).not.toMatch(/235|5,031|🧭/u);

    const image = readFileSync(resolve(process.cwd(), "website/og-card.png"));
    expect(image.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);

    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["brand:render"]).toBe("node scripts/render-brand-assets.mjs");

    const readme = read("README.md");
    expect(readme.slice(0, 2200)).toContain('src="website/og-card.png"');
    expect(readme.slice(0, 2200)).not.toContain('src="website/amc-logo.png"');
    for (const heading of readme.matchAll(/^#{1,6}\s+(.+)$/gm)) {
      expect(heading[1], heading[0]).not.toMatch(decorativeEmoji);
    }

    const docsIndex = read("docs/INDEX.md");
    expect(docsIndex.slice(0, 1600)).toContain('src="https://agentmaturity.co/og-card.png"');
  });

  test("keeps unavailable package channels out of public navigation", () => {
    const channel = JSON.parse(read("website/install-channel.json"));
    expect(channel.channels.npm.status).toBe("unavailable");
    expect(channel.channels.homebrew.status).toBe("unavailable");

    const homepage = read("website/index.html");
    expect(homepage).not.toContain("www.npmjs.com/package/agent-maturity-compass");
    expect(homepage).not.toMatch(/<a[^>]+>npm<\/a>/i);
    expect(homepage).toContain("GitHub Releases");
  });

  test("keeps every local GitHub Docs index link resolvable", () => {
    const indexPath = resolve(process.cwd(), "docs/INDEX.md");
    const index = read("docs/INDEX.md");
    const links = Array.from(index.matchAll(/\]\(([^)]+)\)/g), match => match[1]);

    for (const link of links) {
      if (/^(?:https?:|#)/.test(link)) continue;
      const target = decodeURIComponent(link.split("#", 1)[0]);
      expect(existsSync(resolve(indexPath, "..", target)), link).toBe(true);
    }
  });
});

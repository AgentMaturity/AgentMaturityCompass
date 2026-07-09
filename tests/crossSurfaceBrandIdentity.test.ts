import { readFileSync } from "node:fs";
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

describe("cross-surface AMC brand identity", () => {
  test("website, Studio, docs, and CLI share the canonical palette and typography", () => {
    const sources = [
      read("website/style.css"),
      read("website/docs/docs.css"),
      read("website/docs/shared.css"),
      read("src/console/assets/styles.css"),
      read("src/brand/visualIdentity.ts")
    ];

    for (const source of sources) {
      expect(source).toContain("#0a0a0a");
      expect(source).toContain("#4AEF79");
      expect(source).toContain("#a0a0a0");
      expect(source).toContain("Inter");
      expect(source).toContain("Space Mono");
    }
  });

  test("GitHub README opens with the same product promise and AMC wordmark", () => {
    const readme = read("README.md");
    const header = readme.slice(0, 2200);

    expect(header).toContain('src="website/amc-logo.png"');
    expect(header).toContain("Run one command. Get the full score. Fix the gaps.");
    expect(header).toContain("Evidence over claims.");
    expect(header).not.toContain("img.shields.io/badge/🧭_AMC");
  });

  test("dynamic Docs home uses the website adoption promise and terminal treatment", () => {
    const docs = read("website/docs/docs.js");
    const styles = read("website/docs/docs.css");

    expect(docs).toContain("Run one command");
    expect(docs).toContain("Get the full score. Fix the gaps.");
    expect(docs).toContain("Evidence over claims.");
    expect(docs).toContain("npx agent-maturity-compass");
    expect(styles).toContain(".welcome-hero");
    expect(styles).toContain(".welcome-command");
  });

  test("standalone Docs pages use the AMC wordmark and dark surfaces", () => {
    for (const path of standaloneDocs) {
      const html = read(path);
      expect(html).toContain('amc<span class="brand-cursor">_</span> docs');
      expect(html).not.toContain('<span class="logo-icon">A</span>');
      expect(html).not.toMatch(/background:\s*#fff\b/i);
      expect(html).not.toContain("%230D6E6E");
      expect(html).toContain('shared.css?v=20260710b');
    }

    const shared = read("website/docs/shared.css");
    expect(shared).toContain(".brand-cursor");
    expect(shared).toContain("--teal: var(--green)");
    expect(shared).toMatch(/\.main\s*\{[^}]*min-width:\s*0;/s);
    expect(shared).toMatch(/\.step-content\s*\{[^}]*min-width:\s*0;/s);
    expect(shared).toMatch(/\.card\s*\{[^}]*min-width:\s*0;/s);
    expect(shared).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(shared).toMatch(/@media \(max-width: 860px\)[\s\S]*table\s*\{[^}]*overflow-x:\s*auto;/);
    expect(read("website/docs/compliance.html")).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  test("public surfaces advertise the compiled 142-pack registry consistently", () => {
    const publicSources = [
      read("README.md"),
      read("website/index.html"),
      read("website/playground.html"),
      read("website/executive.html"),
      read("src/console/assets/app.js")
    ].join("\n");

    expect(publicSources).toContain("142 assurance packs");
    expect(publicSources).not.toMatch(/147\s+(?:adversarial\s+)?(?:attack\s+simulations|assurance packs|test suites)/i);
  });
});

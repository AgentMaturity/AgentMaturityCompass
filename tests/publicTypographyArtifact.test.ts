import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { pnpmIntegrityFor } from "./helpers/pnpmLock.js";

const root = process.cwd();
const expectedFontAssets = [
  "inter-latin-400-normal.woff2",
  "inter-latin-500-normal.woff2",
  "inter-latin-600-normal.woff2",
  "inter-latin-700-normal.woff2",
  "inter-latin-800-normal.woff2",
  "inter-OFL-1.1.txt",
  "space-mono-latin-400-normal.woff2",
  "space-mono-latin-700-normal.woff2",
  "space-mono-OFL-1.1.txt",
];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(?:css|html)$/i.test(entry.name)) files.push(path);
    }
  };
  visit(directory);
  return files.sort();
}

// Complete font bytes, hashes, allowlist, and deterministic receipts are checked
// against the shared pair of Pages builds in publicDocsArtifact.test.ts.
describe("AMC first-party typography artifact", () => {
  test("pins the OFL font packages and declares the canonical faces once", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

    const brand = readFileSync(resolve(root, "website/brand.css"), "utf8");

    expect(pkg.devDependencies["@fontsource/inter"]).toBe("5.2.8");
    expect(pkg.devDependencies["@fontsource/space-mono"]).toBe("5.2.9");
    // Both font packages stay pinned to an exact version with an integrity
    // hash, so a supply-chain swap fails here.
    for (const [name, version] of [
      ["@fontsource/inter", "5.2.8"],
      ["@fontsource/space-mono", "5.2.9"]
    ]) {
      expect(
        pnpmIntegrityFor(name!, version!, root),
        `${name}@${version} pinned with an integrity hash`
      ).not.toBeNull();
    }

    expect(brand.match(/@font-face\s*\{/g)).toHaveLength(7);
    expect(brand.match(/font-display:\s*swap/g)).toHaveLength(7);
    for (const asset of expectedFontAssets.filter(asset => asset.endsWith(".woff2"))) {
      expect(brand).toContain(`url("./fonts/${asset}") format("woff2")`);
    }
    for (const weight of [400, 500, 600, 700, 800]) {
      expect(brand).toMatch(new RegExp(`font-family: "Inter";[\\s\\S]*?font-weight: ${weight};`));
    }
    for (const weight of [400, 700]) {
      expect(brand).toMatch(new RegExp(`font-family: "Space Mono";[\\s\\S]*?font-weight: ${weight};`));
    }
    expect(brand).toContain("--amc-font-sans: 'Inter', system-ui, sans-serif");
    expect(brand).toContain("--amc-font-mono: 'Space Mono', ui-monospace, monospace");
  });

  test("keeps public website and Docs sources free of remote or retired font providers", () => {
    const websiteRoot = resolve(root, "website");
    const offenders = sourceFiles(websiteRoot).flatMap(path => {
      const source = readFileSync(path, "utf8");
      return /fonts\.(?:googleapis|gstatic)\.com|JetBrains Mono/i.test(source)
        ? [relative(root, path).replaceAll("\\", "/")]
        : [];
    });
    expect(offenders).toEqual([]);

    for (const path of ["website/404.html", "website/methodology.html", "website/vs-promptfoo.html", "website/compliance.html"]) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source, path).toContain("brand.css");
      expect(source, path).toMatch(/--amc-font-(?:sans|mono)|var\(--amc-font-(?:sans|mono)\)/);
    }
  });

  test("fails closed on package-version drift and keeps font assets network-first", async () => {
    const { validatePinnedPackageVersion } = await import("../scripts/build-pages-site.mjs") as {
      validatePinnedPackageVersion(name: string, actual: string, expected: string): void;
    };
    expect(() => validatePinnedPackageVersion("@fontsource/inter", "5.2.7", "5.2.8"))
      .toThrow("Pinned package version mismatch");

    const worker = readFileSync(resolve(root, "website/sw.js"), "utf8");
    expect(worker).toContain("url.pathname === '/brand-assets.json'");
    expect(worker).toContain("url.pathname.startsWith('/fonts/')");
  });
});

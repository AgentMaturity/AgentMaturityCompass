import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, test } from "vitest";

const root = process.cwd();
const buildScript = resolve(root, "scripts/build-pages-site.mjs");
const revision = "89abcdef0123456789abcdef0123456789abcdef";
const temporaryRoots: string[] = [];
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

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

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

function buildArtifact(): string {
  const output = mkdtempSync(join(tmpdir(), "amc-typography-artifact-"));
  temporaryRoots.push(output);
  const result = spawnSync(process.execPath, [buildScript, "--out", output], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: revision },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  return output;
}

afterAll(() => {
  for (const directory of temporaryRoots) rmSync(directory, { recursive: true, force: true });
});

describe("AMC first-party typography artifact", () => {
  test("pins the OFL font packages and declares the canonical faces once", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
    const brand = readFileSync(resolve(root, "website/brand.css"), "utf8");

    expect(pkg.devDependencies["@fontsource/inter"]).toBe("5.2.8");
    expect(pkg.devDependencies["@fontsource/space-mono"]).toBe("5.2.9");
    expect(lock.packages["node_modules/@fontsource/inter"].version).toBe("5.2.8");
    expect(lock.packages["node_modules/@fontsource/space-mono"].version).toBe("5.2.9");
    expect(lock.packages["node_modules/@fontsource/inter"].integrity).toMatch(/^sha512-/);
    expect(lock.packages["node_modules/@fontsource/space-mono"].integrity).toMatch(/^sha512-/);

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

  test("builds only the required same-origin font files with deterministic receipts", () => {
    const first = buildArtifact();
    const second = buildArtifact();
    const firstRaw = readFileSync(resolve(first, "brand-assets.json"));
    const secondRaw = readFileSync(resolve(second, "brand-assets.json"));
    const manifest = JSON.parse(firstRaw.toString("utf8"));

    expect(firstRaw.equals(secondRaw)).toBe(true);
    expect(manifest.schemaVersion).toBe("2026-07-10");
    expect(manifest.sourceRevision).toBe(revision);
    expect(manifest.assetCount).toBe(9);
    expect(manifest.assets.map((asset: { asset: string }) => asset.asset)).toEqual(
      expectedFontAssets.map(asset => `fonts/${asset}`),
    );

    for (const asset of manifest.assets as Array<{
      asset: string;
      bytes: number;
      kind: "font" | "license";
      package: string;
      sha256: string;
      source: string;
      version: string;
    }>) {
      const source = readFileSync(resolve(root, asset.source));
      const staged = readFileSync(resolve(first, asset.asset));
      expect(staged.equals(source), asset.asset).toBe(true);
      expect(asset.bytes, asset.asset).toBe(source.byteLength);
      expect(asset.sha256, asset.asset).toBe(sha256(source));
      expect(asset.package).toMatch(/^@fontsource\/(?:inter|space-mono)$/);
      expect(asset.version).toMatch(/^5\.2\.(?:8|9)$/);
      expect(asset.kind).toBe(asset.asset.endsWith(".woff2") ? "font" : "license");
    }

    expect(readdirSync(resolve(first, "fonts")).sort()).toEqual([...expectedFontAssets].sort());
    expect(existsSync(resolve(root, "website/fonts"))).toBe(false);
    expect(readFileSync(resolve(first, "brand.css"), "utf8")).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  });

  test("fails closed on package-version drift and keeps font assets network-first", async () => {
    // @ts-expect-error The Pages builder is intentionally plain ESM for Node and GitHub Actions.
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

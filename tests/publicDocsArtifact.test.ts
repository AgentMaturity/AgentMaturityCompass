import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, test } from "vitest";

const root = process.cwd();
const docsScript = readFileSync(resolve(root, "website/docs/docs.js"), "utf8");
const publicBlock = docsScript.match(/const PUBLIC_DOC_IDS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
const publicDocs = Array.from(publicBlock.matchAll(/'([^']+)'/g), match => match[1]).sort();
const buildScript = resolve(root, "scripts/build-pages-site.mjs");
const temporaryRoots: string[] = [];
const revision = "0123456789abcdef0123456789abcdef01234567";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(directory, path).replaceAll("\\", "/"));
    }
  };
  visit(directory);
  return files.sort();
}

function buildArtifact(): string {
  const output = mkdtempSync(join(tmpdir(), "amc-pages-artifact-"));
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

describe("public Docs Pages artifact", () => {
  test("uses only same-origin runtime inputs and a lockfile-pinned renderer", () => {
    const html = readFileSync(resolve(root, "website/docs/index.html"), "utf8");
    const script = readFileSync(resolve(root, "website/docs/docs.js"), "utf8");
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));

    expect(html).toContain('src="vendor/marked.min.js"');
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(script).toContain("./content/");
    expect(script).toContain("./content-manifest.json");
    expect(script).not.toContain("raw.githubusercontent.com");
    expect(pkg.devDependencies.marked).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.packages["node_modules/marked"].version).toBe(pkg.devDependencies.marked);
    expect(lock.packages["node_modules/marked"].integrity).toMatch(/^sha512-/);
  });

  test("builds a deterministic allowlisted artifact with source and renderer hashes", () => {
    expect(existsSync(buildScript)).toBe(true);
    const first = buildArtifact();
    const second = buildArtifact();
    const firstManifestPath = resolve(first, "docs/content-manifest.json");
    const secondManifestPath = resolve(second, "docs/content-manifest.json");
    const firstManifestRaw = readFileSync(firstManifestPath, "utf8");
    const secondManifestRaw = readFileSync(secondManifestPath, "utf8");
    const manifest = JSON.parse(firstManifestRaw);

    expect(firstManifestRaw).toBe(secondManifestRaw);
    expect(manifest.schemaVersion).toBe("2026-07-10");
    expect(manifest.sourceRevision).toBe(revision);
    expect(manifest.guideCount).toBe(168);
    expect(manifest.guides.map((guide: { id: string }) => guide.id)).toEqual(publicDocs);
    expect(new Set(manifest.guides.map((guide: { id: string }) => guide.id)).size).toBe(168);

    for (const guide of manifest.guides as Array<{ id: string; source: string; asset: string; bytes: number; sha256: string }>) {
      const sourcePath = resolve(root, guide.source);
      const assetPath = resolve(first, "docs", guide.asset);
      const source = readFileSync(sourcePath);
      const asset = readFileSync(assetPath);
      expect(asset.equals(source), guide.id).toBe(true);
      expect(guide.bytes, guide.id).toBe(source.byteLength);
      expect(guide.sha256, guide.id).toBe(sha256(source));
    }

    const rendererPath = resolve(first, "docs", manifest.renderer.asset);
    const renderer = readFileSync(rendererPath);
    expect(manifest.renderer.package).toBe("marked");
    expect(manifest.renderer.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.renderer.bytes).toBe(renderer.byteLength);
    expect(manifest.renderer.sha256).toBe(sha256(renderer));
    expect(statSync(rendererPath).isFile()).toBe(true);

    const deployedMarkdown = filesUnder(resolve(first, "docs/content")).filter(path => path.endsWith(".md"));
    expect(deployedMarkdown).toHaveLength(168);
    expect(deployedMarkdown).not.toContain("FULL_MODULE_ROADMAP.md");
    expect(deployedMarkdown).not.toContain("IMPLEMENTATION_REALITY_MAP.md");
    expect(deployedMarkdown).not.toContain("OSS_ADOPTION_ROADMAP.md");
    expect(existsSync(resolve(root, "website/docs/content"))).toBe(false);
    expect(existsSync(resolve(root, "website/docs/vendor"))).toBe(false);

    const builtHtml = readFileSync(resolve(first, "docs/index.html"), "utf8");
    const builtScript = readFileSync(resolve(first, "docs/docs.js"), "utf8");
    expect(builtHtml).not.toContain("cdn.jsdelivr.net");
    expect(builtScript).not.toContain("raw.githubusercontent.com");
  });

  test("rejects unsafe, duplicate, internal, and destructive build inputs", async () => {
    // @ts-expect-error The build script is intentionally plain ESM for Node and GitHub Actions.
    const { validateGuideSets } = await import("../scripts/build-pages-site.mjs") as {
      validateGuideSets(publicDocs: string[], internalDocs: string[]): void;
    };
    expect(() => validateGuideSets(["../private"], [])).toThrow("Unsafe public Docs guide id");
    expect(() => validateGuideSets(["INDEX", "INDEX"], [])).toThrow("Duplicate public Docs guide id");
    expect(() => validateGuideSets(["FULL_MODULE_ROADMAP"], ["FULL_MODULE_ROADMAP"])).toThrow("Internal guide cannot be public");

    const output = mkdtempSync(join(tmpdir(), "amc-pages-nonempty-"));
    temporaryRoots.push(output);
    writeFileSync(resolve(output, "keep.txt"), "do not delete\n", "utf8");
    const result = spawnSync(process.execPath, [buildScript, "--out", output], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_SHA: revision },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Explicit Pages output must be empty");
    expect(readFileSync(resolve(output, "keep.txt"), "utf8")).toBe("do not delete\n");
  });

  test("keeps manifest-bound Docs assets network-first through the root service worker", () => {
    const worker = readFileSync(resolve(root, "website/sw.js"), "utf8");
    expect(worker).toContain("const CACHE_NAME = 'amc-v8'");
    expect(worker).toContain("url.pathname === '/docs/content-manifest.json'");
    expect(worker).toContain("url.pathname.startsWith('/docs/content/')");
    expect(worker).toContain("url.pathname.startsWith('/docs/vendor/')");
    expect(worker).toMatch(/if \(docsIntegrityAsset\)[\s\S]*fetch\(event\.request\)[\s\S]*caches\.match\(event\.request\)/);
  });
});

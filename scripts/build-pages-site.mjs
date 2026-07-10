import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const websiteRoot = resolve(repositoryRoot, "website");
const docsRoot = resolve(repositoryRoot, "docs");
const defaultOutput = resolve(repositoryRoot, "tmp/pages-site");
const manifestSchemaVersion = "2026-07-10";
const brandAssetManifestSchemaVersion = "2026-07-10";
const brandAssetDefinitions = [
  { package: "@fontsource/inter", version: "5.2.8", source: "files/inter-latin-400-normal.woff2", asset: "fonts/inter-latin-400-normal.woff2", kind: "font", family: "Inter", weight: 400 },
  { package: "@fontsource/inter", version: "5.2.8", source: "files/inter-latin-500-normal.woff2", asset: "fonts/inter-latin-500-normal.woff2", kind: "font", family: "Inter", weight: 500 },
  { package: "@fontsource/inter", version: "5.2.8", source: "files/inter-latin-600-normal.woff2", asset: "fonts/inter-latin-600-normal.woff2", kind: "font", family: "Inter", weight: 600 },
  { package: "@fontsource/inter", version: "5.2.8", source: "files/inter-latin-700-normal.woff2", asset: "fonts/inter-latin-700-normal.woff2", kind: "font", family: "Inter", weight: 700 },
  { package: "@fontsource/inter", version: "5.2.8", source: "files/inter-latin-800-normal.woff2", asset: "fonts/inter-latin-800-normal.woff2", kind: "font", family: "Inter", weight: 800 },
  { package: "@fontsource/inter", version: "5.2.8", source: "LICENSE", asset: "fonts/inter-OFL-1.1.txt", kind: "license" },
  { package: "@fontsource/space-mono", version: "5.2.9", source: "files/space-mono-latin-400-normal.woff2", asset: "fonts/space-mono-latin-400-normal.woff2", kind: "font", family: "Space Mono", weight: 400 },
  { package: "@fontsource/space-mono", version: "5.2.9", source: "files/space-mono-latin-700-normal.woff2", asset: "fonts/space-mono-latin-700-normal.woff2", kind: "font", family: "Space Mono", weight: 700 },
  { package: "@fontsource/space-mono", version: "5.2.9", source: "LICENSE", asset: "fonts/space-mono-OFL-1.1.txt", kind: "license" },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseOutput(args) {
  const index = args.indexOf("--out");
  if (index === -1) return { output: defaultOutput, explicit: false };
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("--out requires a directory path");
  return { output: resolve(repositoryRoot, value), explicit: true };
}

function assertSafeGuideId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(id)) {
    throw new Error(`Unsafe public Docs guide id: ${String(id)}`);
  }
}

function assertInside(parent, child, label) {
  const path = relative(parent, child);
  if (!path || path.startsWith(`..${sep}`) || path === ".." || isAbsolute(path)) {
    throw new Error(`${label} escapes ${parent}: ${child}`);
  }
}

function prepareOutput(output, explicit) {
  if (output === repositoryRoot || output === websiteRoot || output === docsRoot) {
    throw new Error(`Refusing to replace source directory: ${output}`);
  }
  if (explicit && existsSync(output) && readdirSync(output).length > 0) {
    throw new Error(`Explicit Pages output must be empty: ${output}`);
  }
  if (!explicit) rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
}

function copyWebsite(output) {
  const excluded = [
    resolve(websiteRoot, "brand-assets.json"),
    resolve(websiteRoot, "docs/content"),
    resolve(websiteRoot, "docs/vendor"),
    resolve(websiteRoot, "docs/content-manifest.json"),
    resolve(websiteRoot, "fonts"),
  ];
  cpSync(websiteRoot, output, {
    recursive: true,
    filter(source) {
      return !excluded.some(path => source === path || source.startsWith(`${path}${sep}`));
    },
  });
}

export function validatePinnedPackageVersion(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`Pinned package version mismatch for ${name}: expected ${expected}, received ${actual}`);
  }
}

function copyBrandAssets(output) {
  const packageVersions = new Map();
  const seenAssets = new Set();
  return brandAssetDefinitions.map(definition => {
    if (seenAssets.has(definition.asset)) throw new Error(`Duplicate brand asset target: ${definition.asset}`);
    seenAssets.add(definition.asset);

    const packageRoot = resolve(repositoryRoot, "node_modules", definition.package);
    let actualVersion = packageVersions.get(definition.package);
    if (!actualVersion) {
      const packagePath = resolve(packageRoot, "package.json");
      if (!existsSync(packagePath)) throw new Error(`Pinned brand package is missing: ${definition.package}`);
      actualVersion = JSON.parse(readFileSync(packagePath, "utf8")).version;
      validatePinnedPackageVersion(definition.package, actualVersion, definition.version);
      packageVersions.set(definition.package, actualVersion);
    }

    const source = resolve(packageRoot, definition.source);
    assertInside(packageRoot, source, `Brand source ${definition.asset}`);
    if (!existsSync(source) || !statSync(source).isFile()) {
      throw new Error(`Pinned brand asset is missing: ${definition.package}/${definition.source}`);
    }
    const target = resolve(output, definition.asset);
    assertInside(output, target, `Brand target ${definition.asset}`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    const bytes = readFileSync(source);
    return {
      package: definition.package,
      version: actualVersion,
      kind: definition.kind,
      ...(definition.family ? { family: definition.family, style: "normal", weight: definition.weight } : {}),
      source: `node_modules/${definition.package}/${definition.source}`,
      asset: definition.asset,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    };
  });
}

async function readDocsBuildManifest() {
  delete globalThis.AMC_DOCS_BUILD_MANIFEST;
  await import(`${pathToFileURL(resolve(websiteRoot, "docs/docs.js")).href}?pages-build=${Date.now()}`);
  const manifest = globalThis.AMC_DOCS_BUILD_MANIFEST;
  delete globalThis.AMC_DOCS_BUILD_MANIFEST;
  if (!manifest || !Array.isArray(manifest.publicDocs) || !Array.isArray(manifest.internalDocs)) {
    throw new Error("website/docs/docs.js did not expose AMC_DOCS_BUILD_MANIFEST");
  }
  return manifest;
}

export function validateGuideSets(publicDocs, internalDocs) {
  const seen = new Set();
  const internal = new Set(internalDocs);
  for (const id of publicDocs) {
    assertSafeGuideId(id);
    if (seen.has(id)) throw new Error(`Duplicate public Docs guide id: ${id}`);
    if (internal.has(id)) throw new Error(`Internal guide cannot be public: ${id}`);
    seen.add(id);
  }
  if (seen.size === 0) throw new Error("Public Docs guide manifest is empty");
}

function copyRenderer(output) {
  const packagePath = resolve(repositoryRoot, "node_modules/marked/package.json");
  const sourcePath = resolve(repositoryRoot, "node_modules/marked/lib/marked.umd.js");
  if (!existsSync(packagePath) || !existsSync(sourcePath)) {
    throw new Error("Pinned marked renderer is missing; run npm ci before build:pages");
  }
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const asset = "vendor/marked.min.js";
  const target = resolve(output, "docs", asset);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(sourcePath, target);
  const bytes = readFileSync(sourcePath);
  return {
    package: "marked",
    version: pkg.version,
    asset,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function copyGuides(output, publicDocs) {
  return publicDocs.map(id => {
    const source = resolve(docsRoot, `${id}.md`);
    assertInside(docsRoot, source, `Guide ${id}`);
    if (!existsSync(source) || !statSync(source).isFile()) {
      throw new Error(`Public Docs source is missing: docs/${id}.md`);
    }
    const asset = `content/${id}.md`;
    const target = resolve(output, "docs", asset);
    assertInside(resolve(output, "docs/content"), target, `Guide asset ${id}`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    const bytes = readFileSync(source);
    return {
      id,
      source: `docs/${id}.md`,
      asset,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    };
  });
}

function sourceRevision() {
  const revision = process.env.GITHUB_SHA || null;
  if (revision !== null && !/^[0-9a-f]{40}$/i.test(revision)) {
    throw new Error("GITHUB_SHA must be a 40-character hexadecimal commit id");
  }
  return revision;
}

export async function buildPagesSite({ output = defaultOutput, explicit = false } = {}) {
  const resolvedOutput = resolve(output);
  prepareOutput(resolvedOutput, explicit);
  copyWebsite(resolvedOutput);

  const buildManifest = await readDocsBuildManifest();
  const publicDocs = [...buildManifest.publicDocs].sort();
  const internalDocs = [...buildManifest.internalDocs].sort();
  validateGuideSets(publicDocs, internalDocs);

  const revision = sourceRevision();
  const renderer = copyRenderer(resolvedOutput);
  const guides = copyGuides(resolvedOutput, publicDocs);
  const manifest = {
    schemaVersion: manifestSchemaVersion,
    sourceRevision: revision,
    guideCount: guides.length,
    renderer,
    guides,
  };
  const manifestPath = resolve(resolvedOutput, "docs/content-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const brandAssets = copyBrandAssets(resolvedOutput);
  const brandManifest = {
    schemaVersion: brandAssetManifestSchemaVersion,
    sourceRevision: revision,
    assetCount: brandAssets.length,
    assets: brandAssets,
  };
  const brandManifestPath = resolve(resolvedOutput, "brand-assets.json");
  writeFileSync(brandManifestPath, `${JSON.stringify(brandManifest, null, 2)}\n`, "utf8");

  return { output: resolvedOutput, manifestPath, manifest, brandManifestPath, brandManifest };
}

async function main() {
  const { output, explicit } = parseOutput(process.argv.slice(2));
  const result = await buildPagesSite({ output, explicit });
  process.stdout.write(`Pages artifact built: ${result.output} (${result.manifest.guideCount} public guides)\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

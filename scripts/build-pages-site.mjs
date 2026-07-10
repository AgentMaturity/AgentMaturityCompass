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
    resolve(websiteRoot, "docs/content"),
    resolve(websiteRoot, "docs/vendor"),
    resolve(websiteRoot, "docs/content-manifest.json"),
  ];
  cpSync(websiteRoot, output, {
    recursive: true,
    filter(source) {
      return !excluded.some(path => source === path || source.startsWith(`${path}${sep}`));
    },
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

  const renderer = copyRenderer(resolvedOutput);
  const guides = copyGuides(resolvedOutput, publicDocs);
  const manifest = {
    schemaVersion: manifestSchemaVersion,
    sourceRevision: sourceRevision(),
    guideCount: guides.length,
    renderer,
    guides,
  };
  const manifestPath = resolve(resolvedOutput, "docs/content-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { output: resolvedOutput, manifestPath, manifest };
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

#!/usr/bin/env node
/**
 * Bundle the kernel's private closure into dist (AMC-1510).
 *
 * `src/kernel/amcRuntime.ts` is the only module that imports `@amc/core` and
 * the vendored `@amc/cordis` family. Those are workspace packages the tarball
 * never contained, which is why `amc agent-loop run` worked only from a
 * checkout. This step builds the source wrapper into a self-contained bundle
 * at dist/kernel/amcRuntime.js. It never uses that output as its next input,
 * so repeated bundling preserves the dependency inventory and licence texts.
 * Workspace packages must have their compiled entry points available first.
 *
 * The inline rule, stated once: everything reachable is inlined EXCEPT Node
 * builtins and packages the root package.json declares as `dependencies`
 * (those are installed with the tarball). A public package that only a private
 * package depends on (js-yaml, chokidar, picomatch…) is inlined too — a runtime
 * that "works" only because the consumer happened to have it installed would
 * be the same defect in a new coat.
 *
 * Alongside the bundle: amcRuntime.bundle.json (every inlined package with its
 * version and licence, for the SBOM) and amcRuntime.js.LEGAL.txt (the licence
 * comments esbuild lifts out of the inlined code).
 */
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const rootDeps = new Set(Object.keys(pkg.dependencies ?? {}));
const entry = join(root, "src", "kernel", "amcRuntime.ts");
const output = join(root, "dist", "kernel", "amcRuntime.js");
if (!existsSync(entry)) {
  console.error(`bundle-kernel: source wrapper ${entry} is missing`);
  process.exit(1);
}
const builtins = new Set(builtinModules);

function bareName(spec) {
  return spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
}

/** Which package a bundled input file belongs to, with version and licence. */
function packageOf(file) {
  let dir = dirname(resolve(root, file));
  while (dir !== dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      const m = JSON.parse(readFileSync(manifest, "utf8"));
      if (m.name) return { name: m.name, version: m.version ?? null, license: m.license ?? null, from: relative(root, dir) };
    }
    dir = dirname(dir);
  }
  return null;
}

const result = await build({
  entryPoints: [entry],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  metafile: true,
  legalComments: "external",
  // Bundled CommonJS (schemastery ships lib/index.cjs) may `require` an
  // external at runtime; in ESM output that needs a real `require`.
  banner: { js: 'import { createRequire as __amcCreateRequire } from "node:module";\nconst require = __amcCreateRequire(import.meta.url);' },
  plugins: [{
    name: "amc-inline-rule",
    setup(api) {
      api.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return null;
        const spec = args.path;
        if (spec.startsWith("node:") || builtins.has(bareName(spec))) return { path: spec, external: true };
        if (spec.startsWith(".") || spec.startsWith("/")) return null;
        const bare = bareName(spec);
        if (bare.startsWith("@amc/")) return null;
        if (rootDeps.has(bare)) return { path: spec, external: true };
        return null;
      });
    }
  }]
});

const inlined = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const p = packageOf(input);
  // Exclude AMC's own wrapper by package identity, not a directory prefix:
  // compiled third-party packages can legitimately live beneath dist.
  if (p && p.from !== "" && !inlined.has(p.name)) inlined.set(p.name, p);
}
const manifest = {
  schemaVersion: "2026-09-08",
  entry: relative(root, output),
  rule: "inline everything except Node builtins and root package.json dependencies",
  packages: [...inlined.values()].sort((a, b) => a.name.localeCompare(b.name))
};
writeFileSync(`${output.replace(/\.js$/, "")}.bundle.json`, `${JSON.stringify(manifest, null, 2)}\n`);
// Licence texts of everything inlined, so the tarball attributes what it
// ships. esbuild's LEGAL.txt only lifts comments that were in the code.
const notices = [];
for (const p of manifest.packages) {
  const dir = resolve(root, p.from);
  const licenseFile = existsSync(dir) ? (await import("node:fs")).readdirSync(dir).find((n) => /^(LICENSE|LICENCE|COPYING)(\.|$)/i.test(n)) : undefined;
  notices.push(`## ${p.name}@${p.version ?? "unknown"} (${p.license ?? "licence not declared"})\n\n` +
    (licenseFile ? readFileSync(join(dir, licenseFile), "utf8").trim() : "(no licence file in the package; see its package.json)") + "\n");
}
writeFileSync(`${output}.NOTICES.md`, `# Third-party notices for dist/kernel/amcRuntime.js\n\nPackages inlined into the runtime bundle by scripts/bundle-kernel.mjs.\n\n${notices.join("\n")}`);
const bytes = readFileSync(output).length;
console.log(`bundle-kernel: ${relative(root, output)} ${(bytes / 1024).toFixed(0)} KB, ${manifest.packages.length} packages inlined: ${manifest.packages.map((p) => p.name).join(", ")}`);
for (const p of manifest.packages) {
  if (!p.license) console.warn(`bundle-kernel: ${p.name} declares no licence — check THIRD_PARTY_NOTICES`);
}

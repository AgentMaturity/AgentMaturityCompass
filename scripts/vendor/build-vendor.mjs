#!/usr/bin/env node
/**
 * Builds the vendored packages into the layout their manifests declare.
 *
 * `tsc -b` emits both JS and declarations into `lib/types/`, but every vendored
 * manifest points `main`/`exports.default` at `lib/<entry>.js` and `types` at
 * `lib/types/<entry>.d.ts`. dsh reconciles the two with tsdown, which reads the
 * JS under `lib/types` and writes publish entries under `lib/` (their ledger
 * §5). AMC does not carry tsdown, so this does the same reconciliation
 * directly: type-check and emit with tsc, then place the runtime entry where
 * the manifest says it lives.
 *
 * Without this, `import { Context } from "@amc/cordis"` fails with
 * "Failed to resolve entry for package" even though the workspace link is
 * correct — the link points at a package whose declared entry was never built.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const vendorDir = join(root, "vendor");

const packages = readdirSync(vendorDir).filter((entry) =>
  existsSync(join(vendorDir, entry, "package.json"))
);

// tsc -b resolves project references, so building the leaves builds the rest.
const build = spawnSync(
  "npx",
  ["tsc", "-b", ...packages.map((p) => join("vendor", p))],
  { cwd: root, encoding: "utf8" }
);
if (build.status !== 0) {
  console.error(`vendor build failed:\n${build.stdout}\n${build.stderr}`);
  process.exit(1);
}

/**
 * Re-exports each emitted entry from the path the manifest declares.
 *
 * A one-line re-export rather than a copy: the emitted tree under lib/types
 * keeps its relative imports intact, so copying only the entry would strand
 * them.
 */
let written = 0;
for (const pkg of packages) {
  const manifestPath = join(vendorDir, pkg, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // Some packages declare dual entries (schemastery ships .mjs and .cjs, per
  // dsh's ledger §2 — its CJS entry's lazy require would otherwise race ESM
  // loading of the same linked module under vitest). Shim each declared entry.
  const entries = [manifest.main, manifest.module].filter(
    (value) => typeof value === "string" && value.startsWith("lib/")
  );

  for (const entryPath of entries) {
    const target = join(vendorDir, pkg, entryPath);
    if (existsSync(target)) continue;

    const entryName = entryPath.slice("lib/".length).replace(/\.(js|mjs|cjs)$/, "");
    const emitted = join(vendorDir, pkg, "lib", "types", `${entryName}.js`);
    if (!existsSync(emitted)) {
      console.error(`vendor/${pkg}: expected ${relative(root, emitted)} after tsc -b, but it is absent.`);
      process.exit(1);
    }

    mkdirSync(dirname(target), { recursive: true });
    if (entryPath.endsWith(".cjs")) {
      // tsc emits ESM; a CJS consumer needs an interop bridge.
      writeFileSync(
        target,
        `module.exports = require("node:module")\n` +
          `  .createRequire(__filename)("./types/${entryName}.js");\n`
      );
    } else {
      writeFileSync(target, `export * from "./types/${entryName}.js";\n`);
      if (entryPath.endsWith(".mjs")) {
        writeFileSync(
          target,
          `export * from "./types/${entryName}.js";\n` +
            `export { default } from "./types/${entryName}.js";\n`
        );
      }
    }
    written += 1;
  }
}

console.log(`Vendor build complete (${packages.length} packages, ${written} entry shim(s) written).`);

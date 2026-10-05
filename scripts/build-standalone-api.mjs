#!/usr/bin/env node
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// First-party sources are bundled; runtime packages remain supplied by npm install.
const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["api/index.ts"],
  outfile: "dist/standalone-api.js",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node20",
  legalComments: "linked",
  metafile: true
});
const privateImports = Object.values(result.metafile.outputs).flatMap(output => output.imports)
  .filter(item => item.external && item.path.startsWith("@amc/"));
if (privateImports.length) throw new Error("Standalone API must not depend on unpublished workspace packages");

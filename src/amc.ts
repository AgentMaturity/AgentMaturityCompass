#!/usr/bin/env node
/**
 * Start-up entry for the `amc` command (package.json "bin"). It changes no command: every invocation except a bare
 * `amc --version` / `amc -V` loads dist/cli.js exactly as `node dist/cli.js` does, with process.argv[1] naming
 * cli.js, so output, exit codes and self-spawned children are the same.
 *
 * Loading cli.js is the cost of every command (about 2,500 modules). Two things here make it cheaper:
 * - Node's compile cache (V8 bytecode, keyed by each file's own source), kept inside the package
 *   (node_modules/.cache) rather than in a shared temporary folder another account could write to.
 * - A resolver for AMC's own relative imports inside dist/: one directory listing per folder instead of a file
 *   lookup and package scope search per import. Anything it does not recognise as an existing plain file under a
 *   real (not symlinked) dist folder goes to Node's own resolver, so a missing module fails with Node's own error.
 *
 * `--version` on its own prints the version without loading the program. The only start-up check that path ran was
 * the database engine guard (storage/nativeGuard.js); it runs here too, first, as it does for cli.js. Nothing else
 * ran for --version before commander printed it: no agent-mode, trust, vault or config check (those run in the
 * preAction hook and in command actions, which --version never reached).
 */
import * as nodeModule from "node:module";
import { readdirSync, realpathSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) {
  await import("./storage/nativeGuard.js");
  const { amcVersion } = await import("./version.js");
  // As commander does for its version option: write to stdout, then exit 0.
  process.stdout.write(`${amcVersion}\n`);
  process.exit(0);
}

// Node 20 has neither API; Node 22 and later have both.
const { enableCompileCache, registerHooks } = nodeModule as Partial<typeof nodeModule>;
enableCompileCache?.(fileURLToPath(new URL("../node_modules/.cache/amc-compile-cache", import.meta.url)));

const distUrl = new URL("./", import.meta.url).href;
const plainFiles = new Map<string, Set<string> | null>();

/** True only for an existing regular file in a dist folder that is its own real path. */
function isPlainDistFile(url: URL): boolean {
  const path = fileURLToPath(url);
  const dir = dirname(path);
  let names = plainFiles.get(dir);
  if (names === undefined) {
    try {
      names = realpathSync(dir) === dir
        ? new Set(readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name))
        : null;
    } catch {
      names = null;
    }
    plainFiles.set(dir, names);
  }
  return names?.has(basename(path)) ?? false;
}

registerHooks?.({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && specifier.endsWith(".js")
      && context.parentURL?.startsWith(distUrl) && context.conditions.includes("import")) {
      const url = new URL(specifier, context.parentURL);
      // package.json says "type": "module" and dist/ holds no other package.json, so every .js file there is ESM.
      if (url.href.startsWith(distUrl) && !url.search && !url.hash && isPlainDistFile(url)) {
        return { url: url.href, format: "module", shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  }
});

const self = fileURLToPath(import.meta.url);
if (process.argv[1] === self) process.argv[1] = fileURLToPath(new URL("./cli.js", import.meta.url));
await import("./cli.js");

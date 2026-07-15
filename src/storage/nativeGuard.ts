/**
 * Native module guard — self-heals the better-sqlite3 ABI mismatch.
 *
 * On machines with more than one Node (e.g. Homebrew Node alongside a version
 * manager), the Node that `npm` used to build better-sqlite3 can differ from the
 * Node that runs `amc` (via the `#!/usr/bin/env node` shebang). The native
 * binding then fails to load with NODE_MODULE_VERSION xxx. This guard is
 * imported FIRST by the CLI, before anything touches the database, and rebuilds
 * better-sqlite3 for the Node that is actually running amc (process.execPath) —
 * so the fix always targets the correct ABI, whatever npm used.
 *
 * Normal runs pay ~no cost (the module simply loads). Opt out with
 * AMC_NO_AUTO_REBUILD=1. Skipped in CI.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromHere = createRequire(import.meta.url);

function isAbiMismatch(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("NODE_MODULE_VERSION") || message.includes("compiled against a different Node");
}

/**
 * Returns "ok" if better-sqlite3's native binding loads, "abi" on an ABI
 * mismatch, "other" otherwise. better-sqlite3 loads the native addon lazily —
 * it only throws when a database is actually opened — so we open a throwaway
 * in-memory database to force the real check.
 */
function probe(): "ok" | "abi" | "other" {
  try {
    const Database = requireFromHere("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return "ok";
  } catch (err) {
    return isAbiMismatch(err) ? "abi" : "other";
  }
}

function packageRoot(): string {
  // dist/storage/nativeGuard.js -> package root is two directories up.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function rebuildForCurrentNode(): void {
  // Put the running Node's own bin dir first so `npm` (and its prebuild-install
  // step) target THIS Node's ABI, not whatever Node npm normally uses.
  const nodeDir = dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir}${delimiter}${process.env.PATH ?? ""}` };
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["rebuild", "better-sqlite3"], { cwd: packageRoot(), env, stdio: "ignore" });
}

function clearCache(): void {
  try {
    delete requireFromHere.cache[requireFromHere.resolve("better-sqlite3")];
  } catch {
    /* not cached — nothing to clear */
  }
}

function guard(): void {
  if (process.env.AMC_NO_AUTO_REBUILD === "1" || process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    return;
  }
  if (probe() !== "abi") {
    return; // loads fine (or a non-ABI error the real import will surface clearly)
  }

  process.stderr.write(`AMC: adapting the database engine to Node ${process.version} (one-time, ~10s)…\n`);
  try {
    rebuildForCurrentNode();
    clearCache();
  } catch {
    /* fall through to the guidance below */
  }

  if (probe() === "ok") {
    process.stderr.write("AMC: database engine ready.\n");
    return;
  }

  process.stderr.write(
    [
      "",
      `AMC could not load its database engine under Node ${process.version}.`,
      "This happens when amc runs under a different Node than the one it was built with.",
      "Fix it with either:",
      `  1) cd "${packageRoot()}" && npm rebuild better-sqlite3`,
      "  2) reinstall with this Node active:  npm install -g agent-maturity-compass",
      "",
    ].join("\n") + "\n",
  );
  process.exit(1);
}

guard();

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
 * AMC_NO_AUTO_REBUILD=1. Skipped in CI and for explicit guide/help requests.
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

/** Only command shapes whose handlers cannot open a database may skip repair.
 * Do not search for --help anywhere: it can be a required option's value on
 * a real run, for example agent-loop run --model --help.
 */
function isReadOnlyCliRequest(argv: readonly string[]): boolean {
  const args = [...argv];
  while (args.length > 0) {
    if (args[0] === "--no-color" || args[0] === "--json") args.shift();
    else if (args[0] === "--agent" && args.length > 1) args.splice(0, 2);
    else if (args[0]?.startsWith("--agent=")) args.shift();
    else break;
  }
  if (args.some(arg => arg === "--help" || arg === "-h") &&
      args.every(arg => ["--help", "-h", "--all", "--no-color"].includes(arg))) return true;
  if (args[0] === "help" && args.slice(1).every(arg => !arg.startsWith("-") || ["--all", "--no-color"].includes(arg))) return true;
  const helpPath = args.slice(0, -1).join(" ");
  if (["--help", "-h"].includes(args.at(-1) ?? "") &&
      ["agent-loop", "agent-loop run", "agent-loop chat", "agent-loop verify", "credentials", "credentials list", "credentials describe", "credentials set", "credentials unset"].includes(helpPath)) return true;
  if (args[0] === "imports" && args[1] === "verify-profile") {
    let positional = 0;
    const values = ["--authorities", "--original", "--expected-digest"];
    for (let index = 2; index < args.length; index++) {
      const arg = args[index]!;
      if (["--json", "--no-color", "--help", "-h"].includes(arg)) continue;
      if (values.includes(arg)) { if (++index >= args.length) return false; continue; }
      if (values.some(option => arg.startsWith(`${option}=`))) continue;
      if (arg.startsWith("-") || ++positional > 1) return false;
    }
    return true;
  }
  if (args[0] !== "agent-loop" || args[1] !== "guide") return false;
  const valueOptions = ["--provider", "--model", "--credential", "--credentials-home", "--credentials-file", "--agent"];
  for (let index = 2; index < args.length; index++) {
    const arg = args[index]!;
    if (["--json", "--no-color", "--help", "-h"].includes(arg)) continue;
    if (valueOptions.includes(arg)) {
      if (++index >= args.length) return false;
      continue;
    }
    if (valueOptions.some(option => arg.startsWith(`${option}=`))) continue;
    return false;
  }
  return true;
}

/**
 * The provider hook forwarder must reach its own fail-closed deny within the hook timeout. An
 * unbounded rebuild or process.exit(1) here would run before that and let Claude Code run the
 * tool, so a native load failure is left to surface inside the forwarder, which denies it.
 */
function isHookForward(argv: readonly string[]): boolean {
  return argv[0] === "connect" && argv[1] === "hooks" && argv[2] === "forward";
}

function guard(): void {
  if (isReadOnlyCliRequest(process.argv.slice(2)) || isHookForward(process.argv.slice(2))) return;
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

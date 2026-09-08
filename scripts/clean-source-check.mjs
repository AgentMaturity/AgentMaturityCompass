#!/usr/bin/env node
/**
 * Clean-source check (AMC-1509): prove the documented source-install path
 * works on a checkout nobody has touched.
 *
 * Clones the COMMITTED tree at HEAD into a temp directory and runs the exact
 * commands the docs tell a new contributor to run, in order, then a keyless
 * native-loop smoke in an isolated workspace with HOME pointed at a temp dir
 * so nothing from this machine's ~/.amc can leak in.
 *
 * WHY THIS EXISTS. README/INSTALL/CONTRIBUTING said `npm ci`, which npm cannot
 * run against the pnpm `workspace:*` protocol the vendored @amc/* packages
 * use. Worse, the committed pnpm-lock.yaml had drifted from package.json, so
 * even CI's own `pnpm install --frozen-lockfile` failed on a fresh clone of
 * this branch — main's green CI only hid it because main was 197 commits
 * behind. A string assertion that the docs say "pnpm" would not have caught
 * the second fault; only running the commands does.
 *
 * DOCUMENTED_SOURCE_COMMANDS is the single source of truth: this script runs
 * them, and tests/cleanSourceDocs.test.ts asserts the docs quote them verbatim.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The source-install path as documented. Change the docs and this together. */
export const DOCUMENTED_SOURCE_COMMANDS = Object.freeze([
  "pnpm install --frozen-lockfile",
  "pnpm run build"
]);

/** The keyless smoke: stub provider, isolated workspace, no credentials. */
export const SMOKE_PROMPT = "say hello";

function run(label, cmd, args, opts) {
  const started = Date.now();
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  const ms = Date.now() - started;
  const ok = result.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} (${(ms / 1000).toFixed(1)}s)`);
  if (!ok) {
    const tail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n");
    console.error(tail);
  }
  return ok;
}

export function cleanSourceCheck({ root = process.cwd(), keep = false } = {}) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const work = mkdtempSync(join(tmpdir(), "amc-clean-source-"));
  const clone = join(work, "checkout");
  const home = join(work, "home");
  const workspace = join(work, "workspace");
  mkdirSync(home); mkdirSync(workspace);
  console.log(`clean-source check of ${head.slice(0, 8)} in ${work}`);

  const env = { ...process.env, CI: "1" };
  // Runtime steps get an empty HOME: a check that quietly read this machine's
  // ~/.amc would prove nothing about a new contributor's experience.
  const isolated = { ...env, HOME: home, AMC_VAULT_PASSPHRASE: "clean-source-check" };
  const cli = join(clone, "dist", "cli.js");

  const steps = [
    () => run("git clone (committed tree only)", "git", ["clone", "-q", "--no-hardlinks", root, clone], { env })
      && run("git checkout HEAD", "git", ["checkout", "-q", head], { cwd: clone, env }),
    ...DOCUMENTED_SOURCE_COMMANDS.map((line) => () => {
      const [cmd, ...args] = line.split(" ");
      return run(line, cmd, args, { cwd: clone, env });
    }),
    () => existsSync(cli) || (console.error(`FAIL build produced no ${cli}`), false),
    () => run("amc doctor", "node", [cli, "doctor"], { cwd: workspace, env: isolated }),
    () => run("amc init (isolated workspace)", "node", [cli, "init", "--trust-boundary", "isolated"], { cwd: workspace, env: isolated }),
    () => run(`amc agent-loop run "${SMOKE_PROMPT}" (stub provider, keyless)`, "node", [cli, "agent-loop", "run", SMOKE_PROMPT], { cwd: workspace, env: isolated })
  ];

  let ok = true;
  for (const step of steps) {
    if (!step()) { ok = false; break; }
  }
  if (keep || !ok) {
    console.log(`${ok ? "kept" : "left for inspection"}: ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }
  return ok;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const keep = process.argv.includes("--keep");
  process.exit(cleanSourceCheck({ keep }) ? 0 : 1);
}

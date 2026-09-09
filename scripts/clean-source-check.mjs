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
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedInstallEnvironment } from "./packed-install-check.mjs";
import { isCompletedRunSummary, verifyPackedRun } from "./packed-evidence-verification.mjs";

/** The source-install path as documented. Change the docs and this together. */
export const DOCUMENTED_SOURCE_COMMANDS = Object.freeze([
  "pnpm install --frozen-lockfile",
  "pnpm run build"
]);

/** The keyless smoke: stub provider, isolated workspace, no credentials. */
export const SMOKE_PROMPT = "say hello";

export function cleanSourceRuntimeEnvironment(base, home) {
  // Carry only OS/tool discovery settings, never provider credentials, loader
  // overrides, cloud configuration or an operator's package-manager settings.
  const operatingSystem = Object.fromEntries(Object.entries(base).filter(([key]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|LANG|LC_[A-Z_]+|TERM|NO_COLOR)$/i.test(key)));
  const inheritedPath = Object.entries(operatingSystem).find(([key]) => /^path$/i.test(key))?.[1];
  for (const key of Object.keys(operatingSystem)) if (/^path$/i.test(key)) delete operatingSystem[key];
  operatingSystem.PATH = [dirname(process.execPath), inheritedPath].filter(Boolean).join(delimiter);
  const isolated = isolatedInstallEnvironment(operatingSystem, home);
  isolated.AMC_VAULT_PASSPHRASE = "clean-source-check";
  isolated.USERPROFILE = home;
  isolated.APPDATA = join(home, "AppData", "Roaming");
  isolated.LOCALAPPDATA = join(home, "AppData", "Local");
  isolated.XDG_CONFIG_HOME = join(home, ".config");
  isolated.XDG_CACHE_HOME = join(home, ".cache");
  isolated.XDG_DATA_HOME = join(home, ".local", "share");
  writeFileSync(isolated.npm_config_userconfig, "");
  writeFileSync(isolated.npm_config_globalconfig, "");
  return isolated;
}

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
  return { ok, stdout: result.stdout ?? "" };
}

function summaryFrom(result) {
  if (!result.ok) return null;
  try { return JSON.parse(result.stdout); }
  catch { console.error("FAIL native run did not return a structured JSON summary"); return null; }
}

export function cleanSourceCheck({ root = process.cwd(), keep = false } = {}) {
  const revision = spawnSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: root, encoding: "utf8" });
  const head = revision.stdout?.trim();
  if (revision.status !== 0 || !/^[0-9a-f]{40}$/.test(head ?? "")) {
    console.error("FAIL could not resolve the committed source revision"); return false;
  }
  const work = mkdtempSync(join(tmpdir(), "amc-clean-source-"));
  const clone = join(work, "checkout");
  const home = join(work, "home");
  const workspace = join(work, "workspace");
  mkdirSync(home); mkdirSync(workspace);
  console.log(`clean-source check of ${head.slice(0, 8)} in ${work}`);

  // Install, build and runtime all get the same empty HOME and scrubbed env.
  const isolated = cleanSourceRuntimeEnvironment(process.env, home);
  const cli = join(clone, "dist", "cli.js");
  let firstTurn = null;
  const runCli = (label, args) => run(label, process.execPath, [cli, ...args], { cwd: workspace, env: isolated });
  const verifyRun = (summary, expectedTurns = 1) => {
    const verified = verifyPackedRun({ summary, expectedTurns, runCommand: runCli });
    console.log(`${verified ? "ok  " : "FAIL"} signed evidence and request reconstruction (${expectedTurns} expected turns)`);
    return verified;
  };

  const steps = [
    () => run("git clone (committed tree only)", "git", ["clone", "-q", "--no-hardlinks", root, clone], { env: isolated }).ok
      && run("git checkout pinned commit", "git", ["checkout", "-q", "--detach", head], { cwd: clone, env: isolated }).ok,
    ...DOCUMENTED_SOURCE_COMMANDS.map((line) => () => {
      const [cmd, ...args] = line.split(" ");
      return run(line, cmd, args, { cwd: clone, env: isolated }).ok;
    }),
    () => existsSync(cli) || (console.error(`FAIL build produced no ${cli}`), false),
    () => runCli("amc doctor", ["doctor"]).ok,
    () => runCli("amc init (isolated workspace)", ["init", "--trust-boundary", "isolated"]).ok,
    () => verifyRun(summaryFrom(runCli("keyless native tool turn", ["agent-loop", "run", "--provider", "stub", "--tools", "echo", "--json", SMOKE_PROMPT]))),
    // AMC-1511, across REAL processes: A leaves the session unsealed, B resumes
    // it by id, and the verifier re-derives every request from the log.
    () => {
      firstTurn = summaryFrom(runCli("process A: leave a completed turn open for resume",
        ["agent-loop", "run", "--provider", "stub", "--tools", "echo", "--json", "--keep-open", "first of two"]));
      const valid = isCompletedRunSummary(firstTurn);
      if (!valid) console.error("FAIL process A did not record a completed signed tool turn");
      return valid;
    },
    () => {
      const resumed = summaryFrom(runCli("process B: resume and seal the same session",
        ["agent-loop", "run", "--provider", "stub", "--tools", "echo", "--json", "--session", firstTurn.sessionId, "second of two"]));
      if (resumed?.sessionId !== firstTurn.sessionId || !(resumed.requests > firstTurn.requests)
          || !(resumed.events > firstTurn.events)) {
        console.error("FAIL resume did not extend the original recorded session"); return false;
      }
      return verifyRun(resumed, 2);
    }
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

#!/usr/bin/env node
/**
 * Captures what the built CLI prints, byte for byte, so a start-up change can be shown to change no output.
 *
 *   node scripts/cli-output-capture.mjs capture <entry.js> <outDir> [--sample N]
 *   node scripts/cli-output-capture.mjs compare <dirA> <dirB>
 *
 * capture runs, each in an empty scratch folder with a scratch HOME and a minimal environment: --version, -V,
 * --help, -h, --help --all, help, bare amc with stdin closed and with stdin empty, and `<path> --help` for every
 * command path `amc commands --json --include-internal` lists (or every Nth with --sample). Each result file holds
 * the arguments, the exit code, stdout and stderr. compare exits 1 and names each file that differs.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRATCH = join(tmpdir(), "amc-cli-output-capture");

function scratch(index) {
  const root = join(SCRATCH, String(index));
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "ws"), { recursive: true });
  mkdirSync(join(root, "home"), { recursive: true });
  return { cwd: join(root, "ws"), env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: join(root, "home"), LANG: "en_US.UTF-8", TERM: "dumb", USER: "amc" } };
}

/** One run. stdin "closed" starts the process with file descriptor 0 not open. */
function runOnce(entry, args, index, stdin = "empty") {
  const { cwd, env } = scratch(index);
  return new Promise((done) => {
    const command = stdin === "closed" ? "/bin/sh" : process.execPath;
    const argv = stdin === "closed" ? ["-c", 'exec "$@" <&-', "sh", process.execPath, entry, ...args] : [entry, ...args];
    const child = spawn(command, argv, { cwd, env, stdio: [stdin === "closed" ? "inherit" : "ignore", "pipe", "pipe"] });
    const out = [], err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("close", (code, signal) => {
      rmSync(join(SCRATCH, String(index)), { recursive: true, force: true });
      done(`args: ${JSON.stringify(args)} stdin: ${stdin}\nexit: ${code ?? signal}\n--- stdout\n${Buffer.concat(out)}\n--- stderr\n${Buffer.concat(err)}`);
    });
  });
}

export function commandPaths(entry) {
  const { cwd, env } = scratch("list");
  const listed = spawnSync(process.execPath, [entry, "commands", "--json", "--include-internal"], { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`amc commands failed: ${listed.stderr}`);
  return JSON.parse(listed.stdout).commands.map((command) => command.path ?? command.command).filter(Boolean);
}

export function cases(paths, sample = 1) {
  const fixed = [[["--version"]], [["-V"]], [["--help"]], [["-h"]], [["--help", "--all"]], [["help"]], [[], "closed"], [[], "empty"]];
  return [...fixed, ...paths.filter((_, i) => i % sample === 0).map((path) => [[...path.split(" "), "--help"]])];
}

/** Runs every case, a few at a time, and returns the results in case order. */
export async function captureAll(entry, list, parallel = 6) {
  const results = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < list.length) {
      const index = next++;
      results[index] = await runOnce(entry, list[index][0], index, list[index][1]);
    }
  }));
  return results;
}

async function main(argv) {
  const [mode, a, b, flag, value] = argv;
  if (mode === "capture" && a && b) {
    const entry = resolve(a);
    const list = cases(commandPaths(entry), flag === "--sample" ? Number(value) : 1);
    const results = await captureAll(entry, list);
    rmSync(b, { recursive: true, force: true });
    mkdirSync(b, { recursive: true });
    results.forEach((text, index) => writeFileSync(join(b, `${String(index).padStart(5, "0")}.txt`), text));
    console.log(`captured ${results.length} runs of ${entry} into ${b}`);
    return 0;
  }
  if (mode === "compare" && a && b) {
    const names = [...new Set([...readdirSync(a), ...readdirSync(b)])].sort();
    const differ = names.filter((name) => {
      try { return !readFileSync(join(a, name)).equals(readFileSync(join(b, name))); } catch { return true; }
    });
    for (const name of differ) console.log(`differs: ${name}`);
    console.log(`${names.length - differ.length} of ${names.length} identical`);
    return differ.length === 0 ? 0 : 1;
  }
  console.error("usage: cli-output-capture.mjs capture <entry.js> <outDir> [--sample N] | compare <dirA> <dirB>");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

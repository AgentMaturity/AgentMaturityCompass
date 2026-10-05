#!/usr/bin/env node
/**
 * Phase 0 freeze guard (until Gate G0): no new CLI command paths and no new
 * station-pack questions unless a named exception allows them.
 *
 * Counts are measured from the built package and compared with the committed
 * scripts/freeze-baseline.json. A PR that raises the baseline must name a
 * "freeze-exception: <KEY> — <reason>" line in a changeset it changes, and the
 * key must already be allowed by the base branch's baseline: a PR cannot
 * authorize itself.
 *
 * @typedef {{ cliCommandPaths: number; cliInventoryPaths: number; stationPacks: number; stationPackQuestions: number }} FreezeCounts
 * @typedef {{ schemaVersion: 1; freezeActive: boolean; measuredAt: string; measuredOn: string; counts: FreezeCounts; allowedExceptionKeys: string[] }} FreezeBaseline
 * @typedef {{ counts: FreezeCounts; baseline: FreezeBaseline; baseBaseline: FreezeBaseline | null; changesetTexts: string[] }} FreezeInput
 * @typedef {{ ok: boolean; failures: string[]; notices: string[] }} FreezeResult
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const COUNT_NAMES = ["cliCommandPaths", "cliInventoryPaths", "stationPacks", "stationPackQuestions"];
const BASELINE_PATH = "scripts/freeze-baseline.json";
const WRITE_HINT = 'Run "node scripts/check-freeze.mjs --write-baseline"';

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

/** @returns {Promise<FreezeCounts>} */
export async function measureFreezeCounts(root) {
  const cli = join(root, "dist/cli.js");
  if (!existsSync(cli)) throw new Error("Build first: dist/cli.js not found (pnpm run build).");
  const live = JSON.parse(run(process.execPath, [cli, "commands", "--json"], root));
  // gen-counts runs at import time and exits, so it is spawned, never imported.
  const inventory = JSON.parse(run(process.execPath, [join(root, "scripts/gen-counts.mjs"), "--json"], root));
  const { listIndustryPacks } = await import(pathToFileURL(join(root, "dist/domains/industryPacks.js")).href);
  const packs = listIndustryPacks();
  return {
    cliCommandPaths: live.total,
    cliInventoryPaths: inventory.cliCommandPaths,
    stationPacks: packs.length,
    stationPackQuestions: packs.reduce((sum, pack) => sum + pack.questions.length, 0)
  };
}

/** @returns {{ key: string; reason: string }[]} */
export function parseFreezeExceptions(text) {
  return [...text.matchAll(/freeze-exception:[ \t]*([A-Za-z0-9-]+)[ \t]*(.*)$/gm)].map((match) => ({
    key: match[1],
    reason: match[2].replace(/-->\s*$/, "").replace(/^(?:—|–|-{1,2})/, "").trim()
  }));
}

/**
 * @param {FreezeInput} input
 * @returns {FreezeResult}
 */
export function evaluateFreeze({ counts, baseline, baseBaseline, changesetTexts }) {
  const failures = [];
  const notices = [];
  // The base's switch counts too, so a PR cannot turn the freeze off for itself.
  if (!baseline.freezeActive && !(baseBaseline?.freezeActive ?? false)) {
    return { ok: true, failures, notices: ["Freeze inactive (freezeActive is false); counts are not checked."] };
  }
  for (const name of COUNT_NAMES) {
    const b = baseline.counts[name];
    const c = counts[name];
    if (c > b) {
      failures.push(`Freeze: ${name} rose from ${b} to ${c}. ${WRITE_HINT} and add "freeze-exception: <KEY> — <reason>" to this PR's changeset.`);
    } else if (c < b) {
      failures.push(`Freeze baseline is stale: ${name} fell from ${b} to ${c}. ${WRITE_HINT} and commit it.`);
    }
  }
  if (!baseBaseline) {
    notices.push("No base baseline to compare with; exact check only.");
    return { ok: failures.length === 0, failures, notices };
  }
  const raised = COUNT_NAMES.filter((name) => baseline.counts[name] > baseBaseline.counts[name]);
  if (raised.length > 0) {
    const allowed = baseBaseline.allowedExceptionKeys;
    const exceptions = changesetTexts.flatMap(parseFreezeExceptions);
    for (const { key, reason } of exceptions) {
      if (!reason) failures.push(`Freeze exception ${key} has no reason; write "freeze-exception: ${key} — <reason>".`);
      else if (!allowed.includes(key)) failures.push(`Freeze exception ${key} is not in the base baseline's allowedExceptionKeys (${allowed.join(", ")}); a PR cannot authorize itself.`);
    }
    if (!exceptions.some(({ key, reason }) => reason && allowed.includes(key))) {
      for (const name of raised) {
        failures.push(`Freeze: baseline ${name} rose from ${baseBaseline.counts[name]} to ${baseline.counts[name]} without an allowed "freeze-exception: <KEY> — <reason>" line in a changeset changed by this PR.`);
      }
    }
  }
  return { ok: failures.length === 0, failures, notices };
}

function readBaseline(text, source) {
  const value = JSON.parse(text);
  const valid = value?.schemaVersion === 1 && typeof value.freezeActive === "boolean"
    && Array.isArray(value.allowedExceptionKeys) && COUNT_NAMES.every((name) => Number.isInteger(value.counts?.[name]));
  if (!valid) throw new Error(`${source} is not a schemaVersion 1 freeze baseline.`);
  return value;
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function defaultBaseRef() {
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  if (process.env.GITHUB_EVENT_NAME === "push") return "HEAD^1";
  return "origin/main";
}

/** Base baseline and the texts of changesets this branch added or modified. */
function loadBase(root, baseRef, notices) {
  const base = git(["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`], root);
  if (!base) {
    notices.push(`Base ref ${baseRef} does not resolve.`);
    return { baseBaseline: null, changesetTexts: [] };
  }
  const text = git(["show", `${base}:${BASELINE_PATH}`], root);
  if (text === null) {
    notices.push(`${baseRef} has no ${BASELINE_PATH}.`);
    return { baseBaseline: null, changesetTexts: [] };
  }
  const mergeBase = git(["merge-base", base, "HEAD"], root) ?? base;
  const changed = git(["diff", "--name-only", "--diff-filter=AM", mergeBase, "HEAD", "--", ".changeset"], root) ?? "";
  const changesetTexts = changed.split("\n").filter((file) => file.endsWith(".md") && existsSync(join(root, file)))
    .map((file) => readFileSync(join(root, file), "utf8"));
  return { baseBaseline: readBaseline(text, `${baseRef}:${BASELINE_PATH}`), changesetTexts };
}

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} needs a value.`);
  return args[index + 1];
}

async function main(args) {
  const root = process.cwd();
  const countsFile = flag(args, "--counts-json");
  const counts = countsFile ? JSON.parse(readFileSync(countsFile, "utf8")) : await measureFreezeCounts(root);
  const baselinePath = join(root, BASELINE_PATH);

  if (args.includes("--write-baseline")) {
    const previous = existsSync(baselinePath) ? readBaseline(readFileSync(baselinePath, "utf8"), BASELINE_PATH) : null;
    const next = {
      schemaVersion: 1,
      freezeActive: previous?.freezeActive ?? true,
      measuredAt: new Date().toISOString(),
      measuredOn: git(["rev-parse", "HEAD"], root) ?? "unknown",
      counts: Object.fromEntries(COUNT_NAMES.map((name) => [name, counts[name]])),
      allowedExceptionKeys: previous?.allowedExceptionKeys ?? []
    };
    writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n");
    console.log(`Wrote ${BASELINE_PATH}: ${JSON.stringify(next.counts)}`);
    return 0;
  }

  const notices = [];
  const baseline = readBaseline(readFileSync(baselinePath, "utf8"), BASELINE_PATH);
  const { baseBaseline, changesetTexts } = loadBase(root, flag(args, "--base-ref") ?? defaultBaseRef(), notices);
  const result = evaluateFreeze({ counts, baseline, baseBaseline, changesetTexts });
  result.notices.unshift(...notices);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ counts, ...result }, null, 2));
  } else {
    for (const notice of result.notices) console.log(`notice: ${notice}`);
    for (const failure of result.failures) console.error(failure);
    if (result.ok) console.log(`Freeze guard passed: ${JSON.stringify(counts)}`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

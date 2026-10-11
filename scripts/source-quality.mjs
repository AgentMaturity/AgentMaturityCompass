#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const require = createRequire(import.meta.url);
function tool(name) {
  const manifestPath = name === "knip"
    ? resolve(dirname(require.resolve("knip")), "../package.json")
    : require.resolve("jscpd/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return { version: manifest.version, cli: join(dirname(manifestPath), typeof manifest.bin === "string" ? manifest.bin : manifest.bin[name]) };
}
function run(cli, args, root) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (![0, 1].includes(result.status)) throw new Error(`Quality tool failed: ${result.stderr || result.stdout}`);
  return result;
}
function normalizedFinding(value) {
  if (Array.isArray(value)) return value.map(normalizedFinding);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !["line", "col", "pos"].includes(key))
    .map(key => [key, normalizedFinding(value[key])]));
}

export function knipFindings(report) {
  if (!Array.isArray(report?.issues)) throw new Error("Knip did not produce a valid issue report");
  const entries = [];
  for (const row of report.issues) {
    if (typeof row.file !== "string") throw new Error("Knip issue is missing file identity");
    for (const [kind, values] of Object.entries(row)) {
      if (kind === "file") continue;
      if (!Array.isArray(values)) throw new Error(`Invalid Knip issue category: ${kind}`);
      for (const value of values) entries.push(JSON.stringify([row.file, kind, normalizedFinding(value)]));
    }
  }
  return entries.sort();
}
export function duplicateFindings(report) {
  if (!Array.isArray(report?.duplicates) || !(report.statistics?.total?.sources > 0)) throw new Error("Duplicate scan contains no source evidence");
  return report.duplicates.map(row => {
    if (!row.firstFile?.name || !row.secondFile?.name || typeof row.fragment !== "string") throw new Error("Duplicate is missing source identity");
    const paths = [row.firstFile.name.replaceAll("\\", "/"), row.secondFile.name.replaceAll("\\", "/")].sort();
    const fragmentHash = createHash("sha256").update(row.fragment.replace(/\s+/g, " ").trim()).digest("hex");
    return JSON.stringify([paths, row.format, fragmentHash]);
  }).sort();
}

/** Collect actual findings. Only `ratchet` below compares them with the committed baseline. */
export function scanSourceQuality(kind, root = process.cwd()) {
  const scratch = mkdtempSync(join(tmpdir(), "amc-source-quality-"));
  try {
    if (kind === "duplicates") {
      const executable = tool("jscpd");
      const result = run(executable.cli, ["src", "--config", join(root, ".jscpd.json"), "--output", scratch, "--threshold", "0"], root);
      const report = JSON.parse(readFileSync(join(scratch, "jscpd-report.json"), "utf8"));
      const findings = duplicateFindings(report);
      if ((findings.length === 0) !== (result.status === 0)) throw new Error("Duplicate tool status does not match its report");
      return { tool: "jscpd", version: executable.version, findings, statistics: report.statistics.total };
    }
    if (kind === "dead-code") {
      const executable = tool("knip");
      // Independent examples own their declared dependencies. Scan every
      // explicitly configured workspace instead of misattributing them to root.
      const config = JSON.parse(readFileSync(join(root, "knip.json"), "utf8"));
      const workspaces = [...new Set([".", ...Object.keys(config.workspaces ?? {})])];
      const selectors = workspaces.flatMap(workspace => ["--workspace", workspace]);
      const result = run(executable.cli, [...selectors, "--reporter", "json", "--no-config-hints"], root);
      const findings = knipFindings(JSON.parse(result.stdout));
      if ((findings.length === 0) !== (result.status === 0)) throw new Error("Knip status does not match its report");
      return { tool: "knip", version: executable.version, findings };
    }
    throw new Error(`Unknown quality scan: ${kind}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Ratchet (D-11 option A): fail on findings missing from the committed baseline and on baseline
// entries whose finding is gone, so the baseline only shrinks unless a finding is accepted with a reason.
const BASELINE = "scripts/quality/source-quality-baseline.json";
const SUMMARY_DIR = "tmp/source-quality";
const MIN_REASON = 20;
const DRIFT = "Source-quality config or tool version changed; regenerate the baseline in a reviewed PR with --rebaseline --reason";
const SCANS = {
  duplicates: { tool: "jscpd", config: ".jscpd.json", configKey: "jscpdSha256", list: "duplicates" },
  "dead-code": { tool: "knip", config: "knip.json", configKey: "knipSha256", list: "deadCode" }
};
const EMPTY_BASELINE = { v: 1, sourceCommit: "", tools: { jscpd: "", knip: "" }, config: { jscpdSha256: "", knipSha256: "" },
  duplicates: [], deadCode: [], accepted: [], rebaselines: [] };
const sha256 = text => createHash("sha256").update(text).digest("hex");
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortKey = entry => [...(entry.paths ?? [entry.file]), entry.format ?? entry.kind, entry.id].join("\0");
const today = () => new Date().toISOString().slice(0, 10);

function scanSpec(scan) {
  if (!Object.hasOwn(SCANS, scan)) throw new Error(`Unknown quality scan: ${scan}`);
  return SCANS[scan];
}
/** A repeat of one identity (the same clone twice in one file pair) gets an occurrence suffix, so a further copy is new. */
function identify(scan, findings) {
  const duplicates = scanSpec(scan).list === "duplicates";
  const seen = new Map();
  return findings.map(identity => {
    const occurrence = (seen.get(identity) ?? 0) + 1;
    seen.set(identity, occurrence);
    const id = sha256(occurrence === 1 ? identity : `${identity}#${occurrence}`);
    const [where, what, detail] = JSON.parse(identity);
    const entry = duplicates ? { id, paths: where, format: what } : { id, file: where, kind: what };
    return { entry, text: duplicates ? `${where[0]} <-> ${where[1]} (${what})` : `${where} ${what} ${JSON.stringify(detail)}` };
  });
}
/** Baseline entries for findings: `id` is the SHA-256 of the finding's identity string. */
export function baselineEntries(scan, findings) {
  return identify(scan, findings).map(item => item.entry).sort((a, b) => byCodeUnit(sortKey(a), sortKey(b)));
}
export function compareToBaseline(scan, findings, baseline) {
  const current = new Set(identify(scan, findings).map(item => item.entry.id));
  const accepted = baseline.accepted.filter(entry => entry.scan === scan).map(entry => entry.id);
  const known = new Set([...baseline[scanSpec(scan).list].map(entry => entry.id), ...accepted]);
  return {
    newIds: [...current].filter(id => !known.has(id)).sort(),
    staleIds: [...known].filter(id => !current.has(id)).sort(),
    accepted: accepted.filter(id => current.has(id)).sort()
  };
}
function summarize(scan, findings, baseline) {
  const { newIds, staleIds, accepted } = compareToBaseline(scan, findings, baseline);
  return { scan, baseline: baseline[scanSpec(scan).list].length, current: findings.length,
    new: newIds.length, stale: staleIds.length, accepted: accepted.length };
}
function checkOptions({ shrink, accept, rebaseline, reason }) {
  if ([shrink, accept !== undefined, rebaseline].filter(Boolean).length > 1) throw new Error("Use at most one of --shrink, --accept and --rebaseline");
  if (accept === undefined && !rebaseline) {
    if (reason !== undefined) throw new Error("--reason applies only to --accept and --rebaseline");
    return;
  }
  if (typeof reason !== "string") throw new Error(`${rebaseline ? "--rebaseline" : "--accept"} needs --reason "<why>"`);
  if (reason.trim().length < MIN_REASON) throw new Error(`--reason must be at least ${MIN_REASON} characters`);
}

/**
 * Apply one run to the baseline. `current` is { version, configSha256, findings, commit, user, date }; options are
 * { shrink, accept, reason, rebaseline }. Returns { baseline, changed, summary, messages, exitCode } and writes nothing.
 */
export function ratchet(scan, current, baseline, options = {}) {
  const spec = scanSpec(scan);
  checkOptions(options);
  const messages = [];
  let next = baseline;
  if (options.rebaseline) {
    if (!current.user) throw new Error("--rebaseline records rebaselinedBy from git config user.name, which is empty");
    const prior = baseline ?? EMPTY_BASELINE;
    const entries = baselineEntries(scan, current.findings);
    const live = new Set(entries.map(entry => entry.id));
    const accepted = prior.accepted.filter(entry => entry.scan !== scan || live.has(entry.id));
    const acceptedIds = new Set(accepted.map(entry => entry.id));
    const priorIds = new Set(prior[spec.list].map(entry => entry.id));
    const list = entries.filter(entry => !acceptedIds.has(entry.id));
    const record = { scan, toolFrom: prior.tools[spec.tool], toolTo: current.version, configFrom: prior.config[spec.configKey],
      configTo: current.configSha256, added: list.filter(entry => !priorIds.has(entry.id)).length, reason: options.reason.trim(),
      rebaselinedBy: current.user, date: current.date };
    next = { ...prior, sourceCommit: current.commit, tools: { ...prior.tools, [spec.tool]: current.version },
      config: { ...prior.config, [spec.configKey]: current.configSha256 }, [spec.list]: list, accepted,
      rebaselines: [...prior.rebaselines, record] };
    messages.push(`Rebaselined ${scan}: ${entries.length} findings. Put this reason in the PR description: ${options.reason.trim()}`);
  } else {
    if (!baseline) throw new Error(`No source-quality baseline at ${BASELINE}; create it with --rebaseline --reason "<why>"`);
    if (baseline.tools[spec.tool] !== current.version || baseline.config[spec.configKey] !== current.configSha256) {
      return { baseline, changed: false, summary: summarize(scan, current.findings, baseline), messages: [DRIFT], exitCode: 1 };
    }
    const { newIds, staleIds } = compareToBaseline(scan, current.findings, baseline);
    if (options.shrink && staleIds.length) {
      const stale = new Set(staleIds);
      next = { ...baseline, [spec.list]: baseline[spec.list].filter(entry => !stale.has(entry.id)),
        accepted: baseline.accepted.filter(entry => !stale.has(entry.id)) };
    }
    if (options.accept !== undefined) {
      if (!newIds.includes(options.accept)) throw new Error(`Cannot accept ${options.accept}: not a new ${scan} finding in this scan`);
      if (!current.user) throw new Error("--accept records acceptedBy from git config user.name, which is empty");
      const entry = { id: options.accept, scan, reason: options.reason.trim(), acceptedBy: current.user, date: current.date };
      next = { ...baseline, accepted: [...baseline.accepted, entry].sort((a, b) => byCodeUnit(a.id, b.id)) };
    }
  }
  const { newIds, staleIds } = compareToBaseline(scan, current.findings, next);
  const text = new Map(identify(scan, current.findings).map(item => [item.entry.id, item.text]));
  for (const id of newIds) messages.push(`new ${scan} finding ${id}: ${text.get(id)}`);
  if (newIds.length) messages.push(`Fix each new finding, or accept one: npm run quality:baseline -- ${scan} --accept <id> --reason "<why, ${MIN_REASON}+ characters>"`);
  if (staleIds.length) messages.push(`baseline is stale: run \`npm run quality:baseline -- ${scan} --shrink\` (${staleIds.length} recorded findings are gone)`);
  return { baseline: next, changed: next !== baseline, summary: summarize(scan, current.findings, next), messages,
    exitCode: newIds.length || staleIds.length ? 1 : 0 };
}

/** Parse and check the committed baseline; a hand-made acceptance without a recorded reason is refused. */
export function parseBaseline(text) {
  const baseline = JSON.parse(text);
  const ids = [...(baseline?.duplicates ?? []), ...(baseline?.deadCode ?? []), ...(baseline?.accepted ?? [])].map(entry => entry?.id);
  if (baseline?.v !== 1 || typeof baseline.sourceCommit !== "string"
    || ![baseline.duplicates, baseline.deadCode, baseline.accepted, baseline.rebaselines].every(Array.isArray)
    || !Object.values(SCANS).every(spec => typeof baseline.tools?.[spec.tool] === "string" && typeof baseline.config?.[spec.configKey] === "string")
    || !ids.every(id => /^[0-9a-f]{64}$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error(`Source-quality baseline ${BASELINE} is malformed`);
  }
  for (const entry of baseline.accepted) {
    if (!Object.hasOwn(SCANS, entry.scan) || typeof entry.reason !== "string" || entry.reason.trim().length < MIN_REASON
      || typeof entry.acceptedBy !== "string" || !entry.acceptedBy || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      throw new Error(`Accepted source-quality finding ${entry.id} has no valid recorded reason`);
    }
  }
  for (const [index, entry] of baseline.rebaselines.entries()) {
    if (!Object.hasOwn(SCANS, entry?.scan) || !["toolFrom", "toolTo", "configFrom", "configTo"].every(key => typeof entry[key] === "string")
      || !Number.isInteger(entry.added) || entry.added < 0 || typeof entry.reason !== "string" || entry.reason.trim().length < MIN_REASON
      || typeof entry.rebaselinedBy !== "string" || !entry.rebaselinedBy || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      throw new Error(`Source-quality rebaseline record ${index} has no valid recorded reason, author, date or values`);
    }
  }
  return baseline;
}
/** Sorted arrays, one entry per line, LF endings: a shrink removes one line per fixed finding. */
export function serializeBaseline(baseline) {
  const rows = list => (list.length ? `[\n${list.map(entry => `    ${JSON.stringify(entry)}`).join(",\n")}\n  ]` : "[]");
  return `{\n  "v": 1,\n  "sourceCommit": ${JSON.stringify(baseline.sourceCommit)},\n  "tools": ${JSON.stringify(baseline.tools)},\n`
    + `  "config": ${JSON.stringify(baseline.config)},\n  "duplicates": ${rows(baseline.duplicates)},\n`
    + `  "deadCode": ${rows(baseline.deadCode)},\n  "accepted": ${rows(baseline.accepted)},\n`
    + `  "rebaselines": ${rows(baseline.rebaselines)}\n}\n`;
}
/** Config bytes with LF endings, so a CRLF checkout is not drift. */
export function configSha256(root, scan) {
  return sha256(readFileSync(join(root, scanSpec(scan).config), "utf8").replaceAll("\r\n", "\n"));
}
/** One markdown row: date, commit, then baseline, current, new, stale and accepted as "duplicates / dead-code". */
export function trendRow(date, commit, summaries) {
  const cell = key => summaries.map(summary => summary[key]).join(" / ");
  return `| ${date} | ${commit.slice(0, 12)} | ${["baseline", "current", "new", "stale", "accepted"].map(cell).join(" | ")} |`;
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}`);
  return result.stdout.trim();
}

/**
 * Every unaccepted entry of `scan` must already be in the baseline at the merge-base of HEAD and `base`
 * (default origin/main, else int): a new finding enters only through --accept with a reason, and removals always
 * pass. Entries may be added otherwise only when (a) the baseline's last matching `rebaselines` record goes from the
 * base's tool version and config hash to the current ones and counts exactly the added entries, (b) that version or
 * hash really differs from the base's, and (c) every added entry is a current finding (`findings`). A base without
 * any baseline file is the one-time bootstrap; any other unreadable base fails closed unless `allowMissingBase`.
 * @param {{ base?: string, allowMissingBase?: boolean, findings?: string[] }} [options]
 */
export function baseCheck(root, scan, baseline, options = {}) {
  const { base, allowMissingBase = false, findings = [] } = options;
  const spec = scanSpec(scan);
  const ref = base ?? (spawnSync("git", ["rev-parse", "--verify", "-q", "origin/main^{commit}"], { cwd: root }).status === 0 ? "origin/main" : "int");
  let at;
  let prior;
  try {
    const mergeBase = git(root, ["merge-base", "HEAD", ref]);
    at = `${ref} (merge-base ${mergeBase.slice(0, 12)})`;
    prior = git(root, ["ls-tree", "--name-only", mergeBase, "--", BASELINE])
      ? parseBaseline(git(root, ["show", `${mergeBase}:${BASELINE}`])) : null;
  } catch (error) {
    const message = `Cannot read the source-quality baseline at the merge-base with ${ref}: ${error.message}`;
    return allowMissingBase ? { exitCode: 0, messages: [`${message} (--allow-missing-base: base check skipped)`] }
      : { exitCode: 1, messages: [`${message}. Pass --base <ref>, or --allow-missing-base to skip this check.`] };
  }
  if (!prior) return { exitCode: 0, messages: [`No source-quality baseline at ${at}: one-time bootstrap, base check skipped`] };
  const known = new Set(prior[spec.list].map(entry => entry.id));
  const added = baseline[spec.list].filter(entry => !known.has(entry.id));
  if (!added.length) return { exitCode: 0, messages: [] };
  const from = [prior.tools[spec.tool], prior.config[spec.configKey]];
  const to = [baseline.tools[spec.tool], baseline.config[spec.configKey]];
  if (from[0] === to[0] && from[1] === to[1]) {
    return { exitCode: 1, messages: added.map(entry => `baseline entry ${entry.id} `
      + `(${entry.paths ? entry.paths.join(" <-> ") : `${entry.file} ${entry.kind}`}) is not in the baseline at ${at}; `
      + "a new finding enters only through --accept <id> --reason") };
  }
  const record = baseline.rebaselines.filter(entry => entry.scan === scan && entry.toolFrom === from[0] && entry.toolTo === to[0]
    && entry.configFrom === from[1] && entry.configTo === to[1]).at(-1);
  const current = new Set(identify(scan, findings).map(item => item.entry.id));
  const foreign = added.filter(entry => !current.has(entry.id));
  const problems = [
    ...(record ? [] : [`${added.length} ${scan} entries are not in the baseline at ${at} and there is no rebaselines record from `
      + `${spec.tool} ${from[0]} / ${spec.config} ${from[1].slice(0, 12)} to ${to[0]} / ${to[1].slice(0, 12)}: restore the base's `
      + `${BASELINE} and run --rebaseline --reason once`]),
    ...(record && record.added !== added.length ? [`the ${scan} rebaselines record says ${record.added} added entries, but ${added.length} are not in the baseline at ${at}`] : []),
    ...(foreign.length ? [`${foreign.length} added ${scan} entries were not produced by this scan: ${foreign.map(entry => entry.id).join(", ")}`] : [])
  ];
  return problems.length ? { exitCode: 1, messages: problems }
    : { exitCode: 0, messages: [`${added.length} ${scan} entries added by a recorded rebaseline (${record.rebaselinedBy}, ${record.date}): ${record.reason}`] };
}
function main(argv, root = process.cwd()) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    shrink: { type: "boolean" }, rebaseline: { type: "boolean" }, accept: { type: "string" }, reason: { type: "string" },
    base: { type: "string" }, "allow-missing-base": { type: "boolean" }
  } });
  const [scan, ...extra] = positionals;
  if (extra.length) throw new Error(`Unexpected arguments: ${extra.join(" ")}`);
  if (scan !== "trend") scanSpec(scan);
  checkOptions(values);
  const write = values.shrink || values.accept !== undefined || values.rebaseline;
  if (write && (values.base !== undefined || values["allow-missing-base"])) throw new Error("--base and --allow-missing-base apply only to a check run");
  const baselinePath = join(root, BASELINE);
  const baseline = existsSync(baselinePath) ? parseBaseline(readFileSync(baselinePath, "utf8")) : null;
  if (scan === "trend") {
    if (Object.keys(values).length) throw new Error("trend takes no options");
    if (!baseline) throw new Error(`No source-quality baseline at ${BASELINE}`);
    const summaries = Object.keys(SCANS).map(name => summarize(name, scanSourceQuality(name, root).findings, baseline));
    console.log(trendRow(today(), git(root, ["rev-parse", "HEAD"]), summaries));
    return 0;
  }
  if (values.rebaseline) {
    const dirty = git(root, ["status", "--porcelain", "--", ".", `:(exclude)${BASELINE}`]).split("\n").filter(Boolean);
    if (dirty.length) throw new Error(`Refusing to rebaseline with ${dirty.length} uncommitted path(s): commit first, so sourceCommit names the scanned tree`);
  }
  const result = scanSourceQuality(scan, root);
  const user = values.accept === undefined && !values.rebaseline ? "" : (spawnSync("git", ["config", "user.name"], { cwd: root, encoding: "utf8" }).stdout ?? "").trim();
  const out = ratchet(scan, { version: result.version, configSha256: configSha256(root, scan), findings: result.findings,
    commit: git(root, ["rev-parse", "HEAD"]), user, date: today() }, baseline, values);
  if (out.changed) writeFileSync(baselinePath, serializeBaseline(out.baseline));
  mkdirSync(join(root, SUMMARY_DIR), { recursive: true });
  writeFileSync(join(root, SUMMARY_DIR, `${scan}.json`), `${JSON.stringify(out.summary, null, 2)}\n`);
  const based = write ? { exitCode: 0, messages: [] }
    : baseCheck(root, scan, out.baseline, { base: values.base, allowMissingBase: values["allow-missing-base"], findings: result.findings });
  console.log(JSON.stringify(out.summary));
  for (const line of [...out.messages, ...based.messages]) console.error(line);
  return Math.max(out.exitCode, based.exitCode);
}

if (isEntrypoint(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`source-quality: ${error.message}`);
    process.exitCode = 1;
  }
}

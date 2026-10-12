// Summarizer for the adversarial suite.
//
//   node summarize.mjs --reports <dir> [<dir> ...] --out <dir>
//
// Reads one or more results.json files and reports, per task and per
// class/config, the attack success rate (fails / attempts) with Wilson 95%
// intervals, the zero-event 95% upper bound (3/N) for clean tasks, and
// inconclusive and not-run counts. It drops nothing: every attempt is counted.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SUITE_VERSION, RESULTS_SCHEMA_VERSION, canonicalJson, wilsonInterval, zeroEventUpperBound } from "./common.mjs";

function arg(argv, name) { const out = []; let i = argv.indexOf(name); if (i < 0) return out; for (i += 1; i < argv.length && !argv[i].startsWith("--"); i += 1) out.push(argv[i]); return out; }

function loadResults(dirs) {
  const results = [];
  let meta = null;
  for (const dir of dirs) {
    const parsed = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
    if (!meta) meta = parsed.meta;
    results.push(...parsed.results);
  }
  return { results, meta };
}

function pct(x) { return `${(x * 100).toFixed(1)}%`; }

function tally(rows) {
  const t = { attempts: 0, fail: 0, pass: 0, inconclusive: 0, notRun: 0 };
  for (const r of rows) {
    if (r.verdict === "not-run") { t.notRun += 1; continue; }
    t.attempts += 1;
    if (r.verdict === "fail") t.fail += 1;
    else if (r.verdict === "pass") t.pass += 1;
    else t.inconclusive += 1;
  }
  t.asr = t.attempts > 0 ? t.fail / t.attempts : null;
  t.wilson = t.attempts > 0 ? wilsonInterval(t.fail, t.attempts) : null;
  t.zeroEventUpperBound = t.fail === 0 ? zeroEventUpperBound(t.attempts) : null;
  return t;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) { const k = keyFn(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
  return map;
}

export function summarize(results) {
  const configs = [...new Set(results.map((r) => r.config))].sort();
  const perTask = {};
  for (const [config, configRows] of groupBy(results, (r) => r.config)) {
    perTask[config] = {};
    for (const [taskId, taskRows] of groupBy(configRows, (r) => r.taskId)) perTask[config][taskId] = tally(taskRows);
  }
  const perClass = {};
  for (const [config, configRows] of groupBy(results, (r) => r.config)) {
    perClass[config] = {};
    for (const [cls, clsRows] of groupBy(configRows, (r) => r.attackClass)) perClass[config][cls] = tally(clsRows);
  }
  const perConfig = {};
  for (const [config, configRows] of groupBy(results, (r) => r.config)) perConfig[config] = tally(configRows);
  const findings = results.filter((r) => r.verdict === "fail").map((r) => ({ config: r.config, taskId: r.taskId, variantIndex: r.variantIndex, observedEffects: r.observedEffects, detail: r.detail }));
  return { configs, perTask, perClass, perConfig, findings };
}

function markdown(summary, meta) {
  const lines = [];
  lines.push(`# Adversarial suite results (${SUITE_VERSION})`);
  lines.push("");
  if (meta) lines.push(`Seed \`${meta.seed}\`; ${meta.trialsRun} trials; wall ${meta.wallSeconds}s; ${meta.platform}; Node ${meta.node}; concurrency ${meta.concurrency}.`);
  lines.push("");
  lines.push("## Per-config totals");
  lines.push("");
  lines.push("config | attempts | fails | ASR | Wilson 95% | zero-event 95% upper | pass | inconclusive | not-run");
  lines.push("---|---|---|---|---|---|---|---|---");
  for (const config of summary.configs) {
    const t = summary.perConfig[config];
    const asr = t.asr === null ? "n/a" : pct(t.asr);
    const wil = t.wilson ? `${pct(t.wilson[0])}-${pct(t.wilson[1])}` : "n/a";
    const zero = t.zeroEventUpperBound === null ? "n/a" : pct(t.zeroEventUpperBound);
    lines.push(`${config} | ${t.attempts} | ${t.fail} | ${asr} | ${wil} | ${zero} | ${t.pass} | ${t.inconclusive} | ${t.notRun}`);
  }
  lines.push("");
  lines.push("## Per-task attack success rate");
  lines.push("");
  lines.push("config | task | attempts | fails | ASR | Wilson 95% | zero-event 95% upper | inconclusive | not-run");
  lines.push("---|---|---|---|---|---|---|---|---");
  for (const config of summary.configs) {
    for (const taskId of Object.keys(summary.perTask[config]).sort()) {
      const t = summary.perTask[config][taskId];
      const asr = t.asr === null ? "n/a" : pct(t.asr);
      const wil = t.wilson ? `${pct(t.wilson[0])}-${pct(t.wilson[1])}` : "n/a";
      const zero = t.zeroEventUpperBound === null ? "n/a" : pct(t.zeroEventUpperBound);
      lines.push(`${config} | ${taskId} | ${t.attempts} | ${t.fail} | ${asr} | ${wil} | ${zero} | ${t.inconclusive} | ${t.notRun}`);
    }
  }
  lines.push("");
  lines.push("## Findings (observed unauthorized effects)");
  lines.push("");
  if (summary.findings.length === 0) {
    lines.push("None. Zero observed effects is a finite test result, not proof of safety.");
  } else {
    lines.push("config | task | variant | effects | detail");
    lines.push("---|---|---|---|---");
    for (const f of summary.findings) lines.push(`${f.config} | ${f.taskId} | v${f.variantIndex} | ${f.observedEffects.join(", ")} | ${String(f.detail ?? "").replace(/[|\n]/g, " ").slice(0, 120)}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const reports = arg(argv, "--reports");
  const outDirs = arg(argv, "--out");
  if (!reports.length || !outDirs.length) throw new Error("usage: summarize.mjs --reports <dir> [<dir> ...] --out <dir>");
  const out = outDirs[0];
  mkdirSync(out, { recursive: true });
  const { results, meta } = loadResults(reports);
  const summary = summarize(results);
  writeFileSync(join(out, "summary.json"), `${canonicalJson({ schemaVersion: RESULTS_SCHEMA_VERSION, suiteVersion: SUITE_VERSION, meta, summary })}\n`);
  writeFileSync(join(out, "summary.md"), markdown(summary, meta));
  process.stdout.write(`${JSON.stringify({ out, configs: summary.configs, findings: summary.findings.length })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));

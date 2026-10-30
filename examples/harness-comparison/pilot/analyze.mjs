#!/usr/bin/env node
// P1-47 pilot analysis: `node analyze.mjs --reports <dir> [<dir> ...] --out <new directory>`.
// Reads only each <dir>/report.json from the comparison runner. Scripted (keyless) lanes are excluded from every
// result and reported only for their false blocks. Missing measurements stay unknown. No ranking is produced.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ANALYSIS_VERSION = "p1-47-pilot-analysis/1";
const PAIRS = [["pi-contained-amc", "pi-contained"], ["amc-native", "pi-contained"], ["pi-contained-amc-tuned", "pi-contained-tuned"]];
const OVERHEAD_PAIRS = [["pi-contained-amc", "pi-contained"], ["pi-contained-amc-tuned", "pi-contained-tuned"]];
// Two-sided 95% Student t quantiles for df 1..30; larger df use the normal 1.96.
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const domainOf = (taskId) => /^(coding-|cod-)/.test(taskId) ? "coding" : taskId.startsWith("reg-") ? "regulated" : taskId.startsWith("fin-") ? "finops" : "other";
const scripted = (trial) => trial.laneKind === "keyless-conformance";
const ran = (trial) => trial.status !== "unavailable";
const passed = (trial) => trial.status === "executed" && trial.verdict === "pass";
const group = (rows, key) => rows.reduce((map, row) => map.set(key(row), [...(map.get(key(row)) ?? []), row]), new Map());
const quantile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : null;
const median = (sorted) => !sorted.length ? null : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
const gate = (value, limit, atMost = true) => value === null ? "not measured" : (atMost ? value <= limit : value >= limit) ? "met" : "not met";

/** Mean, sample variance and task-clustered 95% t interval of task-level differences; null when n < 2. */
function summarize(differences) {
  const n = differences.length;
  if (!n) return { tasks: 0, meanDifference: null, varianceOfTaskDifferences: null, ci95: null };
  const mean = differences.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : null;
  const half = variance === null ? null : (T975[n - 2] ?? 1.96) * Math.sqrt(variance / n);
  return { tasks: n, meanDifference: mean, varianceOfTaskDifferences: variance, ci95: half === null ? null : [mean - half, mean + half] };
}

function taskQuality(trials) {
  const perTask = [...group(trials, (row) => `${row.laneId}\0${row.targetId}\0${row.taskId}`).values()].map((rows) => {
    const done = rows.filter(ran), passes = rows.filter(passed).length;
    return { laneId: rows[0].laneId, targetId: rows[0].targetId, taskId: rows[0].taskId, domain: domainOf(rows[0].taskId), planned: rows.length, ran: done.length,
      passes, failed: rows.filter((row) => row.status === "executed" && row.verdict === "fail").length,
      inconclusive: rows.filter((row) => row.status === "inconclusive").length, unavailable: rows.length - done.length,
      // Inconclusive trials stay in the denominator as non-passes.
      success: done.length ? passes / done.length : null };
  });
  const lookup = new Map(perTask.map((row) => [`${row.laneId}\0${row.targetId}\0${row.taskId}`, row]));
  const pairs = [...new Set(perTask.map((row) => row.laneId))].flatMap((laneId) => PAIRS.map(([treatment, baseline]) => {
    const differences = perTask.filter((row) => row.laneId === laneId && row.targetId === treatment && row.success !== null).flatMap((row) => {
      const base = lookup.get(`${laneId}\0${baseline}\0${row.taskId}`);
      return base?.success === null || base === undefined ? [] : [{ domain: row.domain, value: row.success - base.success }];
    });
    const perDomain = Object.fromEntries([...group(differences, (row) => row.domain)].map(([domain, rows]) => [domain, summarize(rows.map((row) => row.value))]));
    return { laneId, treatment, baseline, ...summarize(differences.map((row) => row.value)), perDomain };
  }));
  return { perTask, pairs };
}

function overhead(trials) {
  const index = new Map(trials.filter(passed).map((row) => [`${row.laneId}\0${row.targetId}\0${row.taskId}\0${row.repetition}`, row]));
  return { pairs: [...new Set(trials.map((row) => row.laneId))].flatMap((lane) => OVERHEAD_PAIRS.map(([treatment, baseline]) => {
    const ratios = trials.filter((row) => row.laneId === lane && row.targetId === treatment && passed(row)).flatMap((row) => {
      const base = index.get(`${lane}\0${baseline}\0${row.taskId}\0${row.repetition}`);
      const [t, b] = [row.process?.durationMs, base?.process?.durationMs];
      return Number.isFinite(t) && Number.isFinite(b) && b > 0 ? [(t - b) / b] : [];
    }).sort((a, b) => a - b);
    const mid = median(ratios), high = quantile(ratios, 0.95);
    return { lane, treatment, baseline, matchedPairs: ratios.length, median: mid, p95: high,
      gates: { medianAtMost10Percent: gate(mid, 0.1), p95AtMost15Percent: gate(high, 0.15) } };
  })), decisionLatency: { status: "not measured", reason: "report.json has no per-decision latency field; see the scripted replay micro-benchmark (overhead.mjs)." } };
}

function falseBlocks(trials) {
  return [...group(trials.filter((row) => row.oracle?.falsePositives), (row) => `${row.laneId}\0${row.targetId}`).values()].map((rows) => {
    const count = rows.reduce((sum, row) => sum + row.oracle.falsePositives.count, 0), eligible = rows.reduce((sum, row) => sum + row.oracle.falsePositives.eligible, 0);
    const rate = eligible ? count / eligible : null;
    return { laneId: rows[0].laneId, targetId: rows[0].targetId, trials: rows.length, count, eligible, rate, gate: gate(rate, 0.01) };
  });
}

function cost(trials) {
  return [...group(trials.filter(ran), (row) => `${row.laneId}\0${row.targetId}`).values()].map((rows) => {
    // Failed and inconclusive attempts are spend too; any attempt without usage and cost leaves the total unknown.
    const missing = rows.filter((row) => !row.observations?.usage || !Number.isFinite(row.observations?.cost?.amountUsd)).length;
    const spend = missing ? null : rows.reduce((sum, row) => sum + row.observations.cost.amountUsd, 0);
    const correct = rows.filter(passed).length;
    return { laneId: rows[0].laneId, targetId: rows[0].targetId, trialsRan: rows.length, trialsWithCost: rows.length - missing, spendUsd: spend,
      correctOutcomes: correct, costPerCorrectUsd: spend !== null && correct ? spend / correct : null,
      unknownReason: missing ? `${missing} trial(s) are missing usage or cost` : correct ? null : "no correct, policy-compliant outcome" };
  });
}

export function analyze(reports) {
  const all = reports.flatMap((report) => report.trials ?? []);
  const results = all.filter((row) => !scripted(row)), debug = all.filter(scripted);
  const fin = results.filter((row) => row.oracle?.checks?.some((item) => item.id === "no-duplicate-effect"));
  const duplicates = fin.filter((row) => row.oracle.checks.some((item) => item.id === "no-duplicate-effect" && item.passed === false)).length;
  return {
    schemaVersion: ANALYSIS_VERSION,
    inputs: reports.map((report) => ({ comparisonId: report.comparisonId, manifestSha256: report.manifestSha256, trials: report.trials?.length ?? 0 })),
    excluded: { scriptedTrials: debug.length, reason: "Scripted (keyless) lanes debug the bindings; they are never results." },
    planned: { trials: all.length, executed: all.filter((row) => row.status === "executed").length, inconclusive: all.filter((row) => row.status === "inconclusive").length,
      unavailable: all.filter((row) => row.status === "unavailable").length,
      unavailableReasons: Object.fromEntries([...group(all.filter((row) => row.status === "unavailable"), (row) => row.reason ?? "no reason")].map(([reason, rows]) => [reason, rows.length])) },
    taskQuality: taskQuality(results),
    overhead: overhead(results),
    falseBlocks: { model: falseBlocks(results), scripted: falseBlocks(debug),
      note: "Model lanes count only reviewer-labelled benign calls; scripted lanes count author-labelled scripted calls and are not results." },
    actionEvidence: { status: "not measured", reason: "report.json carries no AMC evidence linkage; it needs P1-06's verifier over AMC evidence from real fin-ops trials." },
    recovery: { duplicateEffects: fin.length ? { trialsChecked: fin.length, trialsWithDuplicates: duplicates, gate: duplicates === 0 ? "met" : "not met" }
      : { status: "not measured", reason: "no fin-ops trial reached its oracle" },
      dispatchAfterRevocation: { status: "not measured", reason: "the pilot corpus has no revocation task" } },
    cost: cost(results)
  };
}

const pct = (value) => value === null ? "unknown" : `${(value * 100).toFixed(1)}%`;
function markdown(result) {
  const lines = ["# P1-47 pilot analysis", "", "No ranking and no superiority factor. Scripted lanes are excluded from every result. Missing measurements are unknown, not zero.", "",
    `Planned trials: ${result.planned.trials} (executed ${result.planned.executed}, inconclusive ${result.planned.inconclusive}, unavailable ${result.planned.unavailable}).`, ""];
  for (const [reason, count] of Object.entries(result.planned.unavailableReasons)) lines.push(`- unavailable x${count}: ${reason}`);
  lines.push("", "## Paired task-level differences", "", "| Lane | Treatment - baseline | Tasks | Mean | 95% CI | Variance |", "|---|---|---:|---:|---|---:|");
  for (const row of result.taskQuality.pairs) lines.push(`| ${row.laneId} | ${row.treatment} - ${row.baseline} | ${row.tasks} | ${row.meanDifference ?? "unknown"} | ${row.ci95 ? row.ci95.map((v) => v.toFixed(3)).join(" to ") : "unknown"} | ${row.varianceOfTaskDifferences ?? "unknown"} |`);
  lines.push("", "## Overhead (matched passing pairs)", "", "| Lane | Pair | Pairs | Median | p95 | Median <= 10% | p95 <= 15% |", "|---|---|---:|---:|---:|---|---|");
  for (const row of result.overhead.pairs) lines.push(`| ${row.lane} | ${row.treatment} vs ${row.baseline} | ${row.matchedPairs} | ${pct(row.median)} | ${pct(row.p95)} | ${row.gates.medianAtMost10Percent} | ${row.gates.p95AtMost15Percent} |`);
  lines.push("", `Decision latency: ${result.overhead.decisionLatency.status}; ${result.overhead.decisionLatency.reason}`, "", "## False blocks", "");
  for (const [kind, rows] of [["model", result.falseBlocks.model], ["scripted (not a result)", result.falseBlocks.scripted]]) {
    for (const row of rows) lines.push(`- ${kind} ${row.laneId}/${row.targetId}: ${row.count}/${row.eligible} (${pct(row.rate)}), gate <= 1%: ${row.gate}`);
  }
  lines.push("", `Action evidence: ${result.actionEvidence.status}; ${result.actionEvidence.reason}`, "",
    `Duplicate effects: ${result.recovery.duplicateEffects.status ?? `${result.recovery.duplicateEffects.trialsWithDuplicates} of ${result.recovery.duplicateEffects.trialsChecked} fin-ops trials (${result.recovery.duplicateEffects.gate})`}.`,
    `Dispatch after revocation: ${result.recovery.dispatchAfterRevocation.status}; ${result.recovery.dispatchAfterRevocation.reason}.`, "", "## Cost per correct, policy-compliant outcome", "");
  for (const row of result.cost) lines.push(`- ${row.laneId}/${row.targetId}: ${row.costPerCorrectUsd === null ? `unknown (${row.unknownReason})` : `USD ${row.costPerCorrectUsd.toFixed(4)}`}; spend ${row.spendUsd ?? "unknown"} over ${row.trialsRan} trials`);
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const at = argv.indexOf("--reports"), outAt = argv.indexOf("--out");
  const dirs = at < 0 ? [] : argv.slice(at + 1, outAt > at ? outAt : undefined);
  if (!dirs.length || outAt < 0 || !argv[outAt + 1]) throw new Error("usage: analyze.mjs --reports <dir> [<dir> ...] --out <new directory>");
  const loaded = dirs.map((dir) => { const bytes = readFileSync(join(resolve(dir), "report.json")); return { bytes, report: JSON.parse(bytes.toString("utf8")) }; });
  const result = analyze(loaded.map((row) => row.report));
  result.inputs = result.inputs.map((input, index) => ({ ...input, reportSha256: createHash("sha256").update(loaded[index].bytes).digest("hex") }));
  const out = resolve(argv[outAt + 1]);
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(out); // Never into an existing directory: an earlier analysis is never overwritten.
  writeFileSync(join(out, "analysis.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  writeFileSync(join(out, "analysis.md"), markdown(result), { flag: "wx" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}

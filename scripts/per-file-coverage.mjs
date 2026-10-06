#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const metrics = ["lines", "functions", "branches", "statements"];
export function coverageSourceFiles(root) {
  const files = [];
  function walk(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = `${prefix}/${entry.name}`;
      // Match the existing Vitest coverage exclusions, including nested tests fixtures.
      if (name === "src/console" || name === "src/dashboard" || entry.name === "tests") continue;
      if (entry.isDirectory()) walk(resolve(directory, entry.name), name);
      else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(name);
    }
  }
  walk(resolve(root, "src"), "src");
  return files.sort();
}
function fraction(metric, label) {
  if (!metric || !Number.isInteger(metric.total) || !Number.isInteger(metric.covered)
      || metric.total < 0 || metric.covered < 0 || metric.covered > metric.total) {
    throw new Error(`Invalid coverage counts: ${label}`);
  }
  return metric.total === 0 ? 1 : metric.covered / metric.total;
}

/** Keep file identity independent of the machine-specific clone directory. */
export function coverageFiles(summary, root) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) throw new Error("Invalid coverage summary");
  const files = {};
  for (const [path, values] of Object.entries(summary)) {
    if (path === "total") continue;
    const name = relative(root, resolve(root, path)).split(sep).join("/");
    if (!name.startsWith("src/") || name.includes("../")) throw new Error(`Coverage file outside source scope: ${path}`);
    for (const metric of metrics) fraction(values?.[metric], `${name}:${metric}`);
    files[name] = Object.fromEntries(metrics.map(metric => [metric, { total: values[metric].total, covered: values[metric].covered }]));
  }
  if (!Object.keys(files).length) throw new Error("Coverage summary contains no source files");
  return files;
}

/**
 * Existing files cannot fall below measured floors; new files meet global floors.
 * `platformFloors[platform]` lowers named metrics of tracked files where tests are platform-gated
 * (Seatbelt and keychain paths run only on macOS, so Linux CI covers fewer lines of them).
 */
export function checkPerFileCoverage(files, baseline, expectedFiles = Object.keys(files), platform = process.platform) {
  if (baseline?.v !== 1 || !baseline.files || !Object.keys(baseline.files).length) throw new Error("Missing per-file coverage baseline");
  for (const metric of metrics) {
    const value = baseline.newFileMinimum?.[metric];
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Invalid new-file coverage minimum: ${metric}`);
  }
  const platformFloors = baseline.platformFloors?.[platform] ?? {};
  for (const name of Object.keys(platformFloors)) {
    if (!baseline.files[name]) throw new Error(`Invalid platform floor for an untracked file: ${platform}:${name}`);
  }
  const failures = [];
  const expected = new Set(expectedFiles);
  for (const name of Object.keys(files)) {
    if (!expected.has(name)) failures.push({ file: name, reason: "Coverage evidence does not match the current source inventory" });
  }
  for (const name of expectedFiles) {
    if (!files[name] && !baseline.files[name]) failures.push({ file: name, reason: "New source file has no coverage evidence" });
  }
  for (const name of Object.keys(baseline.files)) {
    if (!files[name]) failures.push({ file: name, reason: "Coverage file missing; baseline changes require explicit review" });
  }
  for (const [name, values] of Object.entries(files)) {
    for (const metric of metrics) {
      const actual = fraction(values[metric], `${name}:${metric}`);
      const floor = baseline.files[name]
        ? fraction(platformFloors[name]?.[metric] ?? baseline.files[name][metric], `baseline:${name}:${metric}`)
        : baseline.newFileMinimum[metric] / 100;
      if (actual + Number.EPSILON < floor) failures.push({ file: name, metric, actual: actual * 100, minimum: floor * 100 });
    }
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const summaryPath = resolve(root, process.argv[2] ?? "coverage/coverage-summary.json");
  const baselinePath = resolve(root, "scripts/quality/coverage-baseline.json");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const files = coverageFiles(JSON.parse(readFileSync(summaryPath, "utf8")), root);
  const failures = checkPerFileCoverage(files, baseline, coverageSourceFiles(root));
  console.log(JSON.stringify({ status: failures.length ? "failed" : "passed", files: Object.keys(files).length,
    baselineSource: baseline.sourceCommit, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

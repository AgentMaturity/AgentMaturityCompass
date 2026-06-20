#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const reportPath = requireArg(args, "report");
const outPath = requireArg(args, "out");
const runId = args["run-id"] ?? new Date().toISOString();

const report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
const stats = normalizeStats(report.stats);
const specs = collectSpecs(report.suites ?? []);
const automatedPass = stats.unexpected === 0 && stats.flaky === 0;
const artifact = renderArtifact({
  runId,
  reportPath,
  generatedAt: new Date().toISOString(),
  stats,
  specs,
  automatedPass
});

mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(resolve(outPath), artifact);
console.log(`Wrote accessibility release evidence to ${outPath}`);

if (!automatedPass) {
  process.exitCode = 2;
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const key = values[i];
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    const name = key.slice(2);
    const value = values[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    parsed[name] = value;
    i += 1;
  }
  return parsed;
}

function requireArg(args, name) {
  const value = args[name];
  if (!value) {
    throw new Error(`Missing required --${name}`);
  }
  return value;
}

function normalizeStats(stats = {}) {
  return {
    expected: Number(stats.expected ?? 0),
    unexpected: Number(stats.unexpected ?? 0),
    flaky: Number(stats.flaky ?? 0),
    skipped: Number(stats.skipped ?? 0),
    durationMs: Number(stats.duration ?? 0)
  };
}

function collectSpecs(suites, parentTitle = "") {
  const rows = [];
  for (const suite of suites) {
    const suiteTitle = [parentTitle, suite.title].filter(Boolean).join(" / ");
    for (const spec of suite.specs ?? []) {
      const tests = spec.tests ?? [];
      const statuses = tests.flatMap((test) => {
        const resultStatuses = (test.results ?? []).map((result) => result.status).filter(Boolean);
        return resultStatuses.length > 0 ? resultStatuses : [test.status ?? "unknown"];
      });
      rows.push({
        suite: suiteTitle,
        title: spec.title ?? "Untitled accessibility spec",
        status: summarizeStatuses(statuses)
      });
    }
    rows.push(...collectSpecs(suite.suites ?? [], suiteTitle));
  }
  return rows;
}

function summarizeStatuses(statuses) {
  if (statuses.some((status) => status === "failed" || status === "timedOut" || status === "interrupted")) {
    return "FAIL";
  }
  if (statuses.some((status) => status === "flaky")) {
    return "FLAKY";
  }
  if (statuses.every((status) => status === "skipped")) {
    return "SKIPPED";
  }
  if (statuses.some((status) => status === "passed" || status === "expected")) {
    return "PASS";
  }
  return "UNKNOWN";
}

function renderArtifact({ runId, reportPath, generatedAt, stats, specs, automatedPass }) {
  const lines = [
    "# Accessibility Release Evidence",
    "",
    `Run ID: ${runId}`,
    `Generated at: ${generatedAt}`,
    `Source report: ${reportPath}`,
    "",
    `Automated axe status: ${automatedPass ? "PASS" : "FAIL"}`,
    `Manual assistive-technology review: NOT COMPLETE`,
    "",
    "## Summary",
    "",
    `- Expected tests: ${stats.expected}`,
    `- Unexpected tests: ${stats.unexpected}`,
    `- Flaky tests: ${stats.flaky}`,
    `- Skipped tests: ${stats.skipped}`,
    `- Duration: ${stats.durationMs} ms`,
    "",
    "## Automated Checks",
    "",
    "| Suite | Spec | Status |",
    "| --- | --- | --- |"
  ];

  for (const spec of specs) {
    lines.push(`| ${escapeCell(spec.suite)} | ${escapeCell(spec.title)} | ${spec.status} |`);
  }

  lines.push(
    "",
    "## Release Boundary",
    "",
    "- This artifact records automated axe and keyboard-smoke run status for release review.",
    "- It is not a full WCAG conformance claim.",
    "- Manual assistive-technology review remains required for modal behavior, dense reports, terminal prompts, and screen-reader compatibility.",
    "",
    "## External References",
    "",
    "- W3C WAI Evaluating Web Accessibility Overview: https://www.w3.org/WAI/test-evaluate/",
    "- W3C WCAG 2.2 Quick Reference: https://www.w3.org/WAI/WCAG22/quickref/",
    "- Deque axe API documentation: https://www.deque.com/axe/core-documentation/api-documentation/",
    ""
  );

  return `${lines.join("\n")}`;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

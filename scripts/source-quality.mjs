#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Collect actual findings; existing findings are never automatically waived. */
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = scanSourceQuality(process.argv[2]);
  console.log(JSON.stringify({ status: result.findings.length ? "failed" : "passed", tool: result.tool,
    version: result.version, findingCount: result.findings.length, statistics: result.statistics,
    representativeFindings: result.findings.slice(0, 10) }, null, 2));
  if (result.findings.length) process.exitCode = 1;
}

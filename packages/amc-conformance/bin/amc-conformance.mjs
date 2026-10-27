#!/usr/bin/env node
/**
 * amc-conformance run --class <verifier|producer|adapter|compiler> --impl "<command template>"
 *   [--cases <glob>] [--out results.json] [--root <spec checkout>] [--timeout <ms>]
 *   [--name <n>] [--impl-version <v>] [--vendor <v>] [--repository <url>] [--language <l>]
 * Exit codes: 0 conformant; 1 not conformant; 64 usage error.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CLASSES, DEFAULT_TIMEOUT_MS, runSuite, SUITE_VERSION, UsageError } from "../lib/runner.mjs";

const USAGE = `usage: amc-conformance run --class <${CLASSES.join("|")}> --impl "<command template>"
  [--cases <glob>] [--out <results.json>] [--root <spec checkout, default .>] [--timeout <ms, default ${DEFAULT_TIMEOUT_MS}>]
  [--name <name>] [--impl-version <version>] [--vendor <vendor>] [--repository <url>] [--language <language>]
       amc-conformance --version
exit codes: 0 conformant; 1 not conformant; 64 usage error`;

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true, strict: true,
    options: {
      class: { type: "string" }, impl: { type: "string" }, cases: { type: "string" }, out: { type: "string" }, root: { type: "string" },
      timeout: { type: "string" }, name: { type: "string" }, "impl-version": { type: "string" }, vendor: { type: "string" },
      repository: { type: "string" }, language: { type: "string" }, version: { type: "boolean" }
    }
  });
  if (values.version) {
    process.stdout.write(`amc-conformance@${SUITE_VERSION}\n`);
    return 0;
  }
  if (positionals.length !== 1 || positionals[0] !== "run") throw new UsageError("expected: run");
  if (!values.class) throw new UsageError("--class is required");
  if (!values.impl?.trim()) throw new UsageError("--impl is required");
  const timeoutMs = values.timeout === undefined ? undefined : Number(values.timeout);
  const results = runSuite({
    root: values.root ?? ".", cls: values.class, impl: values.impl, cases: values.cases, timeoutMs,
    implementation: {
      name: values.name ?? "unknown", version: values["impl-version"] ?? "unknown", vendor: values.vendor ?? null,
      repository: values.repository ?? null, language: values.language ?? null
    }
  });
  const text = `${JSON.stringify(results, null, 2)}\n`;
  if (values.out) writeFileSync(values.out, text);
  else process.stdout.write(text);
  const { normativePassed, normativeTotal } = results.summary;
  process.stderr.write(`${results.class}: ${normativePassed}/${normativeTotal} normative cases pass; ${results.conformant ? "conformant" : "not conformant"}\n`);
  for (const item of results.cases.filter(entry => entry.outcome === "fail" || entry.outcome === "error")) {
    process.stderr.write(`  ${item.outcome.toUpperCase()} ${item.id}: ${JSON.stringify(item.diff)}\n`);
  }
  return results.conformant ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError) && !String(error?.code).startsWith("ERR_PARSE_ARGS")) throw error;
  process.stderr.write(`amc-conformance: ${error.message}\n${USAGE}\n`);
  process.exitCode = 64;
}

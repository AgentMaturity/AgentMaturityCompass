import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runHarnessComparison } from "../src/benchmarks/harnessComparison.js";
import { summarizeHarnessComparison } from "../src/benchmarks/harnessComparisonReport.js";
import { comparisonOracleSchema, harnessComparisonManifestSchema, type HarnessComparisonManifest } from "../src/benchmarks/harnessComparisonSchema.js";

// Authored for the final validation batch; these fixtures execute real local
// commands when run, but never contact a provider or claim comparator results.
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const pin = (path: string) => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });

function fixture(targetSource = "console.log('task-done')", oracleSource?: string) {
  const root = mkdtempSync(join(tmpdir(), "amc-comparison-test-")); directories.push(root);
  const target = join(root, "target.mjs"); const oracle = join(root, "oracle.mjs"); const input = join(root, "fixture.txt");
  writeFileSync(target, targetSource); writeFileSync(input, "comparison fixture\n");
  writeFileSync(oracle, oracleSource ?? `let text=''; for await (const chunk of process.stdin) text+=chunk;
const input=JSON.parse(text); const passed=input.stdout.trim()==='task-done';
console.log(JSON.stringify({schemaVersion:'2026-09-08',verdict:passed?'pass':'fail',checks:[{id:'actual-output',passed,evidence:'Target stdout compared with the pinned task expectation.'}]}));`);
  const executable = pin(realpathSync(process.execPath));
  const manifest: HarnessComparisonManifest = {
    schemaVersion: "2026-09-08", id: "comparison-fixture", description: "Automated runner fixture, not a product benchmark.",
    environment: { platform: process.platform as "darwin" | "linux" | "win32", arch: process.arch as "x64" | "arm64", nodeVersion: process.version, description: "Current test runtime, exactly pinned.", variables: {} },
    concurrency: 1, repetitions: 1, captureBytesPerStream: 4096,
    lanes: [{ id: "keyless", kind: "keyless-conformance", provider: null, model: null, settings: {},
      permissions: { read: ["fixture"], write: ["trial-workspace"], network: [], sandbox: "No OS sandbox claimed by the runner fixture.", enforcement: "adapter-responsibility" },
      budgets: { timeoutMs: 10_000, maxTokens: null, maxCostUsd: null }, requiredSecretEnv: [] }],
    tasks: [{ id: "success", laneId: "keyless", scenario: "success", description: "Compare actual process stdout with a fixed expected string.", fixture: pin(input),
      oracle: { executable, inputs: [pin(oracle)], args: ["{{input:0}}"] } }],
    targets: [{ id: "fixture", label: "Runner fixture", source: { url: "https://example.com/fixture", commit: "1".repeat(40), retrievedAt: "2026-09-08T00:00:00Z", auditReference: "Synthetic fixture provenance only." },
      artifact: pin(target), bindings: [{ taskId: "success", command: { executable, inputs: [pin(target)], args: ["{{input:0}}", "{{artifact}}"] }, unavailableReason: null, supportsBoundedLiveExecution: false }] }]
  };
  const manifestPath = join(root, "manifest.json"); const outputDir = join(root, "results");
  return { root, manifest, manifestPath, outputDir, save: () => writeFileSync(manifestPath, JSON.stringify(manifest)),
    run: async (options: { allowLive?: boolean; redactValues?: string[]; allowAdapterExecution?: boolean } = {}) => {
      writeFileSync(manifestPath, JSON.stringify(manifest));
      return runHarnessComparison({ manifestPath, outputDir, allowAdapterExecution: true, ...options });
    } };
}

describe("matched harness execution receipts", () => {
  test("records an actual oracle pass while missing timing-independent metrics remain unknown", async () => {
    const context = fixture(); const report = await context.run(); const trial = report.trials[0]!;
    expect(trial.status).toBe("executed"); expect(trial.verdict).toBe("pass");
    expect(trial.process?.durationMs).toBeGreaterThan(0);
    expect(trial.process?.durationMs).toBeLessThan(context.manifest.lanes[0]!.budgets.timeoutMs);
    expect(trial.observations).toBeNull();
    const group = summarizeHarnessComparison(report).groups[0]!;
    expect(group.commandsExecuted).toBe(1); expect(group.costUsd).toMatchObject({ samples: 0, mean: null, unknown: 1 });
    expect(group.inputTokens).toMatchObject({ samples: 0, mean: null, unknown: 1 });
    expect(summarizeHarnessComparison(report).superiorityFactor).toBeNull();
    for (const artifact of [...report.artifacts, ...trial.artifacts]) expect(pin(join(context.outputDir, artifact.path)).sha256).toBe(artifact.sha256);
  }, 20_000);

  test("a successful process exit does not override an independent task failure", async () => {
    const report = await fixture("console.log('wrong answer')").run();
    expect(report.trials[0]).toMatchObject({ status: "executed", verdict: "fail", process: { exitCode: 0 } });
  }, 20_000);

  test("missing artifact pins are unavailable, never executed samples", async () => {
    const context = fixture(); context.manifest.targets[0]!.artifact.path = join(context.root, "not-installed");
    const report = await context.run();
    expect(report.trials[0]).toMatchObject({ status: "unavailable", verdict: null, process: null });
    expect(summarizeHarnessComparison(report).groups[0]).toMatchObject({ commandsExecuted: 0, oraclePassRate: null });
  });

  test("adapter execution and live calls each require their explicit opt-in", async () => {
    const local = await fixture().run({ allowAdapterExecution: false });
    expect(local.trials[0]?.process).toBeNull();
    const live = fixture(); Object.assign(live.manifest.lanes[0]!, { kind: "live-provider", provider: "fixture", model: "fixture-model", budgets: { timeoutMs: 1000, maxTokens: 5, maxCostUsd: 0.01 } });
    live.manifest.targets[0]!.bindings[0]!.supportsBoundedLiveExecution = true;
    const report = await live.run();
    expect(report.trials[0]).toMatchObject({ status: "unavailable", process: null });
    expect(report.trials[0]?.reason).toContain("Live-provider execution was not enabled");
  });

  test("truncated captures are inconclusive instead of partial oracle passes", async () => {
    const report = await fixture("console.log('x'.repeat(8000))").run();
    expect(report.trials[0]).toMatchObject({ status: "inconclusive", verdict: null, oracle: null });
    expect(report.trials[0]?.reason).toContain("truncated");
  }, 20_000);

  test("a declared token budget with absent usage cannot produce a passing bounded run", async () => {
    const context = fixture(); context.manifest.lanes[0]!.budgets.maxTokens = 5;
    const report = await context.run();
    expect(report.trials[0]).toMatchObject({ status: "inconclusive", verdict: null, budgetStatus: "unknown" });
  }, 20_000);

  test("an executed unsupported result remains inconclusive rather than failing a competitor", async () => {
    const report = await fixture(undefined, "console.log(JSON.stringify({schemaVersion:'2026-09-08',verdict:'unsupported',checks:[{id:'support',passed:null,evidence:'This fixture does not implement the capability.'}]}))").run();
    expect(report.trials[0]).toMatchObject({ status: "inconclusive", verdict: null });
  }, 20_000);

  test("publication redaction cannot repair the raw behavior seen by the oracle", async () => {
    const canary = "fixture-canary-credential-38163816";
    const context = fixture(`console.log(${JSON.stringify(canary)})`, `let text=''; for await (const chunk of process.stdin) text+=chunk;
const leaked=JSON.parse(text).stdout.includes(${JSON.stringify(canary)});
console.log(JSON.stringify({schemaVersion:'2026-09-08',verdict:leaked?'fail':'pass',checks:[{id:'no-leak',passed:!leaked,evidence:leaked?${JSON.stringify(canary)}:'No leak observed.'}]}));`);
    const report = await context.run({ redactValues: [canary] });
    expect(report.trials[0]).toMatchObject({ status: "executed", verdict: "fail" });
    expect(JSON.stringify(report)).not.toContain(canary);
    for (const file of readdirSync(context.outputDir)) expect(readFileSync(join(context.outputDir, file), "utf8")).not.toContain(canary);
  }, 20_000);

  test("malformed oracle JSON cannot count as a passing zero-exit trial", async () => {
    const report = await fixture(undefined, "console.log('not a result')").run();
    expect(report.trials[0]).toMatchObject({ status: "inconclusive", verdict: null });
  }, 20_000);

  test("recorded token violations fail and unknown cache counters stay unknown", async () => {
    const context = fixture(`import fs from 'node:fs';
fs.writeFileSync(process.env.AMC_COMPARISON_OBSERVATIONS,JSON.stringify({schemaVersion:'2026-09-08',usage:{inputTokens:7,outputTokens:1,cacheReadTokens:null,cacheWriteTokens:null,source:'local-counter',evidenceRef:'Fixture counter in pinned adapter.'}})); console.log('task-done');`);
    context.manifest.lanes[0]!.budgets.maxTokens = 5;
    const report = await context.run();
    expect(report.trials[0]).toMatchObject({ status: "executed", verdict: "fail", budgetStatus: "exceeded" });
    expect(summarizeHarnessComparison(report).groups[0]?.cacheReadTokens).toMatchObject({ samples: 0, mean: null });
  }, 20_000);

  test("environment mismatch never launches a trial", async () => {
    const context = fixture(); context.manifest.environment.nodeVersion = "0.0.0";
    expect((await context.run()).trials[0]).toMatchObject({ status: "unavailable", process: null });
  });

  test("schema refuses conflicting oracle passes and unsafe credential environment overrides", () => {
    expect(comparisonOracleSchema.safeParse({ schemaVersion: "2026-09-08", verdict: "pass", checks: [{ id: "bad", passed: false, evidence: "Failed check." }] }).success).toBe(false);
    const context = fixture(); context.manifest.lanes[0]!.requiredSecretEnv = ["NODE_OPTIONS"];
    expect(harnessComparisonManifestSchema.safeParse(context.manifest).success).toBe(false);
  });
});

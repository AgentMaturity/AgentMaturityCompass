import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runHarnessComparison } from "../src/benchmarks/harnessComparison.js";
import { summarizeHarnessComparison } from "../src/benchmarks/harnessComparisonReport.js";
import { comparisonOracleSchema, harnessComparisonManifestSchema, type ComparisonObservations, type HarnessComparisonManifest } from "../src/benchmarks/harnessComparisonSchema.js";

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

// These are runner-contract fixtures, never inference/coding-quality evidence.
// The adapter assertion below deliberately has fixture attribution, not a real model identity.
const localModelObservation: ComparisonObservations = {
  schemaVersion: "2026-09-08",
  modelExecution: { modelCalled: true, source: "adapter-observation", evidenceRef: "Synthetic adapter observation for runner admission testing only." }
};
const localUsage = { inputTokens: 2, outputTokens: 1, cacheReadTokens: null, cacheWriteTokens: null,
  source: "local-counter" as const, evidenceRef: "Synthetic runner fixture counter; not model output." };
function localProviderFixture(observations?: ComparisonObservations, output = "task-done") {
  const target = observations ? `import fs from 'node:fs';
fs.writeFileSync(process.env.AMC_COMPARISON_OBSERVATIONS,${JSON.stringify(JSON.stringify(observations))}); console.log(${JSON.stringify(output)});`
    : undefined;
  const context = fixture(target);
  Object.assign(context.manifest.lanes[0]!, {
    kind: "local-provider", provider: "local-fixture", model: "fixture-model",
    settings: { baseURL: "http://127.0.0.1:18080", modelKind: "local-inference",
      modelIdentity: { runtimeSha256: "a".repeat(64), weightsSha256: ["b".repeat(64)] } },
    budgets: { timeoutMs: 10_000, maxTokens: 5, maxCostUsd: null }
  });
  context.manifest.lanes[0]!.permissions.network = ["http://127.0.0.1:18080"];
  context.manifest.targets[0]!.bindings[0]!.supportsBoundedLiveExecution = true;
  return context;
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

  test.each(["http://127.0.0.1:18080", "https://127.2.3.4:8443", "http://[::1]:18080"])("local-provider admits the explicit literal loopback origin %s", origin => {
    const context = localProviderFixture(); const lane = context.manifest.lanes[0]!;
    lane.settings.baseURL = origin; lane.permissions.network = [origin];
    expect(harnessComparisonManifestSchema.safeParse(context.manifest).success).toBe(true);
  });

  test.each([
    "http://localhost:18080", "http://0.0.0.0:18080", "https://example.com", "http://192.168.1.2:18080",
    "http://127.1:18080", "http://2130706433:18080", "http://127.0.0.1:0", "file:///tmp/provider",
    "http://user@127.0.0.1:18080", "http://127.0.0.1:18080/v1", "http://127.0.0.1:18080?target=remote",
    "http://127.0.0.1:18080#fragment", "http://[::ffff:127.0.0.1]:18080"
  ])("local-provider refuses ambiguous or non-loopback destination %s", origin => {
    const context = localProviderFixture(); const lane = context.manifest.lanes[0]!;
    lane.settings.baseURL = origin; lane.permissions.network = [origin];
    expect(harnessComparisonManifestSchema.safeParse(context.manifest).success).toBe(false);
  });

  test("local-provider requires model identity, declared origin, token bound, and no inherited credentials or cost budget", () => {
    const mutations: Array<(lane: HarnessComparisonManifest["lanes"][number]) => void> = [
      lane => { lane.model = null; },
      lane => { lane.provider = " "; },
      lane => { lane.permissions.network = []; },
      lane => { lane.permissions.network.push("https://example.com"); },
      lane => { lane.budgets.maxTokens = null; },
      lane => { lane.budgets.maxCostUsd = 0.01; },
      lane => { lane.requiredSecretEnv = ["PROVIDER_API_KEY"]; },
      lane => { lane.settings.modelKind = "scripted"; },
      lane => { delete lane.settings.modelIdentity; },
      lane => { lane.settings.modelIdentity = { runtimeSha256: "a".repeat(64), weightsSha256: [] }; }
    ];
    for (const mutate of mutations) {
      const context = localProviderFixture(); mutate(context.manifest.lanes[0]!);
      expect(harnessComparisonManifestSchema.safeParse(context.manifest).success).toBe(false);
    }
  });

  test("local-provider refuses an adapter without an explicit bounded execution declaration", async () => {
    const context = localProviderFixture({ ...localModelObservation, usage: localUsage });
    context.manifest.targets[0]!.bindings[0]!.supportsBoundedLiveExecution = false;
    const report = await context.run();
    expect(report.trials[0]).toMatchObject({ status: "unavailable", process: null, oracle: null, observedOutcome: null, verdict: null });
    expect(report.trials[0]?.reason).toContain("does not declare bounded live execution support");
  });

  test("a local task can have an observed oracle outcome while missing usage keeps qualification inconclusive", async () => {
    const report = await localProviderFixture(localModelObservation).run();
    expect(report.trials[0]).toMatchObject({ laneKind: "local-provider", modelCalled: true,
      observedOutcome: "pass", status: "inconclusive", verdict: null, budgetStatus: "unknown" });
    const group = summarizeHarnessComparison(report).groups[0]!;
    expect(group).toMatchObject({ passed: 0, determinate: 0, inconclusive: 1, budgetUnknown: 1,
      observedTaskOutcomes: { passed: 1, failed: 0, unknown: 0 }, reportedModelCalls: { called: 1, unknown: 0 } });
    expect(group.inputTokens).toMatchObject({ samples: 0, mean: null, unknown: 1 });
    expect(group.costUsd).toMatchObject({ samples: 0, mean: null, unknown: 1 });
    expect(group.costSources).toEqual([]);
  }, 20_000);

  test.each([undefined, { ...localModelObservation, modelExecution: { ...localModelObservation.modelExecution!, modelCalled: false } }])(
    "a local successful command and oracle cannot imply an actual model call", async observations => {
      const report = await localProviderFixture(observations).run();
      expect(report.trials[0]).toMatchObject({ status: "inconclusive", observedOutcome: null, verdict: null });
      expect(report.trials[0]?.reason).toContain("did not record an actual inference request");
      expect(summarizeHarnessComparison(report).groups[0]?.observedTaskOutcomes.unknown).toBe(1);
    }, 20_000);

  test("local measured usage admits bounded qualification without inventing a monetary observation", async () => {
    const context = localProviderFixture({ ...localModelObservation, usage: localUsage });
    const report = await context.run();
    expect(report.trials[0]).toMatchObject({ status: "executed", verdict: "pass", observedOutcome: "pass",
      modelCalled: true, budgetStatus: "within-recorded-bounds" });
    expect(summarizeHarnessComparison(report).groups[0]?.costUsd).toMatchObject({ samples: 0, mean: null, unknown: 1 });
  }, 20_000);

  test("local recorded token overruns fail qualification even when the task oracle passes", async () => {
    const report = await localProviderFixture({ ...localModelObservation, usage: { ...localUsage, inputTokens: 7 } }).run();
    expect(report.trials[0]).toMatchObject({ status: "executed", verdict: "fail", observedOutcome: "pass", budgetStatus: "exceeded" });
  }, 20_000);

  test("local independent task failure remains visible with otherwise valid execution and usage", async () => {
    const report = await localProviderFixture({ ...localModelObservation, usage: localUsage }, "wrong answer").run();
    expect(report.trials[0]).toMatchObject({ status: "executed", verdict: "fail", observedOutcome: "fail",
      modelCalled: true, budgetStatus: "within-recorded-bounds" });
    expect(summarizeHarnessComparison(report).groups[0]?.observedTaskOutcomes).toMatchObject({ passed: 0, failed: 1 });
  }, 20_000);

  test("the independent oracle receives the exact target identity as well as task identity", async () => {
    const context = localProviderFixture({ ...localModelObservation, usage: localUsage });
    const oraclePath = context.manifest.tasks[0]!.oracle.inputs[0]!.path;
    writeFileSync(oraclePath, `let text='';for await(const chunk of process.stdin)text+=chunk;
const input=JSON.parse(text),passed=input.targetId==='fixture'&&input.taskId==='success';
console.log(JSON.stringify({schemaVersion:'2026-09-08',verdict:passed?'pass':'fail',checks:[{id:'identity',passed,evidence:'Actual oracle envelope target/task identity.'}]}));`);
    context.manifest.tasks[0]!.oracle.inputs[0] = pin(oraclePath);
    expect((await context.run()).trials[0]).toMatchObject({ verdict: "pass", observedOutcome: "pass" });
  }, 20_000);

  test("local monetary claims stay raw unadmitted claims rather than entering cost summaries", async () => {
    const report = await localProviderFixture({ ...localModelObservation, usage: localUsage,
      cost: { amountUsd: 0, source: "published-rate-calculation", sourceUrl: "https://example.com/fixture-rate", asOf: "2026-09-08", evidenceRef: "Fixture unsupported local cost claim." } }).run();
    expect(report.trials[0]).toMatchObject({ status: "inconclusive", verdict: null, observedOutcome: null, observations: null });
    expect(report.trials[0]?.reason).toContain("monetary observations are not admitted");
    const group = summarizeHarnessComparison(report).groups[0]!;
    expect(group.costUsd).toMatchObject({ samples: 0, mean: null, unknown: 1 });
    expect(group.costSources).toEqual([]);
    expect(report.trials[0]?.artifacts.some(artifact => artifact.path.endsWith(".observations.txt"))).toBe(true);
  }, 20_000);

  test("post-oracle pin changes cannot appear as an observed local task pass", async () => {
    const context = localProviderFixture({ ...localModelObservation, usage: localUsage });
    const oraclePath = context.manifest.tasks[0]!.oracle.inputs[0]!.path;
    writeFileSync(oraclePath, `import fs from 'node:fs';fs.appendFileSync(process.argv[2],'\\n// changed');
console.log(JSON.stringify({schemaVersion:'2026-09-08',verdict:'pass',checks:[{id:'fixture',passed:true,evidence:'Synthetic oracle before pin recheck.'}]}));`);
    context.manifest.tasks[0]!.oracle.inputs[0] = pin(oraclePath);
    context.manifest.tasks[0]!.oracle.args.push("{{artifact}}");
    const report = await context.run();
    expect(report.trials[0]).toMatchObject({ status: "inconclusive", verdict: null, observedOutcome: null });
  }, 20_000);

  test("keyless and paid-provider admission do not inherit the local-lane exemptions", () => {
    const keyless = fixture(); keyless.manifest.lanes[0]!.permissions.network = ["http://127.0.0.1:18080"];
    expect(harnessComparisonManifestSchema.safeParse(keyless.manifest).success).toBe(false);
    const paid = localProviderFixture(); paid.manifest.lanes[0]!.kind = "live-provider";
    expect(harnessComparisonManifestSchema.safeParse(paid.manifest).success).toBe(false);
  });
});

import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { checkComparisonCampaign, comparisonCampaignSchema } from "../src/benchmarks/comparisonCampaign.js";
import { analyzeComparisonCampaign } from "../src/benchmarks/comparisonCampaignAnalysis.js";
import { comparisonSha256 } from "../src/benchmarks/harnessComparisonArtifacts.js";
import * as campaignArtifacts from "../src/benchmarks/harnessComparisonArtifacts.js";
import { HARNESS_COMPARISON_VERSION, type HarnessComparisonManifest } from "../src/benchmarks/harnessComparisonSchema.js";
import { checkHarnessComparison, runHarnessComparison, type HarnessComparisonReport } from "../src/benchmarks/harnessComparison.js";
import { captureCampaignWorkspace } from "../src/benchmarks/comparisonCampaignEvidence.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "amc-campaign-")); roots.push(root);
  const put = (name: string, value: unknown) => {
    const path = join(root, name), bytes = typeof value === "string" ? value : JSON.stringify(value);
    writeFileSync(path, bytes); return { path, sha256: comparisonSha256(bytes) };
  };
  const node = { path: process.execPath, sha256: comparisonSha256(readFileSync(process.execPath)) };
  const artifact = put("artifact.txt", "Installed stub artifact: no model or quality evidence.");
  const input = put("task.txt", "neutral task");
  const adapter = put("adapter.mjs", `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(join(root, "adapter-executed.txt"))}, "executed"); process.stdout.write("stub output");`);
  const oracle = put("oracle.mjs", `let s=""; for await (const chunk of process.stdin) s+=chunk;
const r=JSON.parse(s); const pass=r.stdout==="stub output";
console.log(JSON.stringify({schemaVersion:"${HARNESS_COMPARISON_VERSION}",verdict:pass?"pass":"fail",checks:[{id:"exact-output",passed:pass,evidence:"exact retained stdout bytes"}]}));`);
  const tasks = ["one", "two", "three"].map(id => ({ id, laneId: "conformance", scenario: "injection" as const,
    description: "Neutral fixture", fixture: input, oracle: { executable: node, inputs: [oracle], args: ["{{input:0}}"] } }));
  const manifest: HarnessComparisonManifest = {
    schemaVersion: HARNESS_COMPARISON_VERSION, id: "campaign-test", description: "Stub conformance only",
    environment: { platform: process.platform as "darwin", arch: process.arch as "arm64", nodeVersion: process.version, description: "test host", variables: {} },
    concurrency: 1, repetitions: 4, captureBytesPerStream: 4096,
    lanes: [{ id: "conformance", kind: "keyless-conformance", provider: null, model: null, settings: {},
      permissions: { read: [], write: [], network: [], sandbox: "trusted stub", enforcement: "adapter-responsibility" },
      budgets: { timeoutMs: 5000, maxTokens: null, maxCostUsd: null }, requiredSecretEnv: [] }], tasks,
    targets: ["baseline", "candidate"].map(id => ({ id, label: id, source: { url: "https://example.com/stub", commit: "a".repeat(40), retrievedAt: "2026-10-30T00:00:00Z", auditReference: "stub only" },
      artifact, bindings: tasks.map(task => ({ taskId: task.id, command: { executable: node, inputs: [adapter], args: ["{{input:0}}"] }, unavailableReason: null, supportsBoundedLiveExecution: false })) }))
  };
  const manifestPin = put("manifest.json", manifest);
  const spec = { schemaVersion: "comparison-campaign/1", id: "campaign-test", description: "Stub campaign",
    cohort: "native-task-execution", evidenceClass: "scripted-conformance", executor: "runHarnessComparison",
    targets: ["baseline", "candidate"], repetitions: 4, order: "rotate-targets-by-repetition",
    tasks: tasks.map(task => ({ id: task.id, scenario: task.scenario })), manifest: manifestPin,
    preparationInputs: [], blockers: [], workspaceTaskIds: [], requireComponentsUsed: true,
    behavioralGate: { minRepetitions: 3, minPassRateLowerBound: 0.4 },
    comparisons: [{ baseline: "baseline", candidate: "candidate", policy: { minUpliftSuccessRate: 0, minUpliftValuePoints: 0, denyIfRegression: true, minPairedCases: 3 } }]
  };
  const campaignPath = put("campaign.json", spec).path;
  const ready = checkHarnessComparison({ manifestPath: manifestPin.path });
  const report: HarnessComparisonReport = {
    schemaVersion: HARNESS_COMPARISON_VERSION, comparisonId: manifest.id, startedAt: "2026-10-30T00:00:00Z", finishedAt: "2026-10-30T00:01:00Z",
    manifestSha256: manifestPin.sha256, provenance: "local-execution-with-pinned-files-and-declared-source-commits",
    environment: { platform: process.platform, arch: process.arch, nodeVersion: process.version },
    repeat: { api: "runHarnessComparison", manifestPath: manifestPin.path, outputDirectoryMustBeNew: true, allowLive: false, allowAdapterExecution: true, argv: [] },
    limitations: ["Stub only"], manifest, artifacts: [],
    trials: ready.trials.map((row, i) => ({ ...row, id: `trial-${i}`, laneKind: "keyless-conformance", scenario: "injection", status: "executed", verdict: "pass", observedOutcome: "pass", modelCalled: false,
      reason: null, laneConfigurationSha256: comparisonSha256(JSON.stringify(manifest.lanes[0])), process: { exitCode: 0, signal: null, terminatedBy: null, treeExitProven: true, durationMs: 1 },
      oracle: { schemaVersion: HARNESS_COMPARISON_VERSION, verdict: "pass", checks: [{ id: "exact-output", passed: true, evidence: "stub" }] },
      observations: null, budgetStatus: "not-applicable", artifacts: [] }))
  };
  const evidence = () => report.trials.map(row => ({ schemaVersion: "comparison-campaign-evidence/1", trialId: row.id, source: "adapter-observation", manifestSha256: report.manifestSha256, comparisonStartedAt: report.startedAt, evidenceRef: "stub session stream", componentsUsed: [], workspace: null }));
  const save = () => put("campaign.json", spec);
  return { root, put, spec, campaignPath, campaignSha256: () => comparisonSha256(readFileSync(campaignPath)), manifest, manifestPin, report, evidence, save };
}

describe("campaign preparation", () => {
  test("dry-run previews balanced order, executes nothing and writes nothing", () => {
    const f = fixture(), before = readdirSync(f.root);
    const result = checkComparisonCampaign(f.campaignPath);
    expect(result.status).toBe("ready"); expect(result.trials).toHaveLength(24);
    expect(result.trials.slice(0, 2).map(row => row.targetId)).toEqual(["baseline", "candidate"]);
    expect(result.trials.slice(6, 8).map(row => row.targetId)).toEqual(["candidate", "baseline"]);
    expect(readdirSync(f.root)).toEqual(before);
  });
  test("readiness catches pin mutation, absent bindings and unavailable dependencies", () => {
    const f = fixture(); writeFileSync(f.manifestPin.path, "{}");
    expect(checkComparisonCampaign(f.campaignPath).status).toBe("blocked");
    f.spec.manifest = f.put("manifest.json", f.manifest); f.spec.preparationInputs = [ { path: join(f.root, "absent"), sha256: "a".repeat(64) } ] as never;
    f.save(); expect(checkComparisonCampaign(f.campaignPath).problems.join(" ")).toMatch(/absent|ENOENT/);
    f.spec.preparationInputs = []; f.manifest.targets[1].bindings[0].command = null;
    f.manifest.targets[1].bindings[0].unavailableReason = "dependency unavailable";
    f.spec.manifest = f.put("manifest.json", f.manifest); f.save();
    expect(checkComparisonCampaign(f.campaignPath).problems.join(" ")).toMatch(/binding/);
  });
  test.each([1, 2])("manifest bytes must remain pinned at admission read %s", changedRead => {
    const f = fixture(), originalRead = campaignArtifacts.readComparisonFile;
    let reads = 0;
    vi.spyOn(campaignArtifacts, "readComparisonFile").mockImplementation((path, limit) => {
      if (path === f.manifestPin.path && ++reads === changedRead) return Buffer.from(JSON.stringify({ ...f.manifest, description: "changed between verification and read" }));
      return originalRead(path, limit);
    });
    expect(checkComparisonCampaign(f.campaignPath).status).toBe("blocked");
  });
  test("single repeats and unbalanced rotations cannot qualify", () => {
    const f = fixture(); f.spec.repetitions = 1;
    expect(comparisonCampaignSchema.safeParse(f.spec).success).toBe(false);
    f.spec.repetitions = 3; expect(comparisonCampaignSchema.safeParse(f.spec).success).toBe(false);
  });
  test("checked-in specs stay explicit preparation plans", () => {
    for (const name of ["native-conformance", "native-model-quality", "improvement-loop"]) {
      const path = resolve(`qualification/wp29-campaign/${name}.v1.json`);
      const result = checkComparisonCampaign(path);
      expect(result.status).toBe("blocked"); expect(result.problems.length).toBeGreaterThan(0);
    }
  });
});

describe("matched campaign analysis", () => {
  test("uses task clusters, shared gates and lower bounds without claiming model quality", () => {
    const f = fixture(); const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
    expect(result.status).toBe("pass"); expect(result.passed).toBe(true); expect(result.promotionAllowed).toBe(false);
    expect(result.comparisons[0].pairedTasks).toBe(3); expect(result.comparisons[0].interval95).toEqual([0, 0]);
    expect(result.behavioral[0].passRate).toBe(1); expect(result.behavioral[0].interval95?.[0]).toBeLessThan(1);
    expect(result.summary?.groups[0].costUsd.mean).toBeNull(); expect(result.components[0].observedTrials).toBe(12);
  });
  test("one unavailable, missing or unscored arm withholds headline rates and blocks CI", () => {
    for (const missing of ["unavailable", "inconclusive", "absent"] as const) {
      const f = fixture();
      if (missing === "absent") f.report.trials.pop();
      else { f.report.trials[0].status = missing; f.report.trials[0].verdict = null; f.report.trials[0].observedOutcome = null; }
      const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
      expect(result.status).toBe("inconclusive"); expect(result.passed).toBe(false);
      expect(result.comparisons[0].meanDifferencePoints).toBeNull(); expect(result.comparisons[0].interval95).toBeNull();
      expect(result.behavioral.some(row => row.passRate === null)).toBe(true);
      expect(result.summary?.groups.every(group => group.oraclePassRate === null && group.checkPassFraction === null)).toBe(true);
    }
  });
  test("deliberately failing harness remains a measured failure", () => {
    const f = fixture();
    for (const row of f.report.trials.filter(row => row.targetId === "candidate")) {
      row.verdict = "fail"; row.observedOutcome = "fail"; row.oracle!.verdict = "fail"; row.oracle!.checks[0].passed = false;
    }
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
    expect(result.status).toBe("fail"); expect(result.summary?.groups[1].failed).toBe(12); expect(result.comparisons[0].meanDifferencePoints).toBe(-100);
  });
  test("zero successes cannot pass even a zero behavioral threshold", () => {
    const f = fixture(); f.spec.behavioralGate.minPassRateLowerBound = 0; f.save();
    for (const row of f.report.trials) {
      row.verdict = "fail"; row.observedOutcome = "fail"; row.oracle!.verdict = "fail"; row.oracle!.checks[0].passed = false;
    }
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
    expect(result.status).toBe("fail"); expect(result.passed).toBe(false);
    expect(result.behavioral.every(row => row.passRate === 0 && row.status === "fail")).toBe(true);
  });
  test("artifact, model, policy, order and trial identity mutations invalidate cohort", () => {
    const changes = [
      (f: ReturnType<typeof fixture>) => { f.report.manifest.targets[0].artifact.sha256 = "b".repeat(64); },
      (f: ReturnType<typeof fixture>) => { f.report.manifest.lanes[0].model = "changed"; },
      (f: ReturnType<typeof fixture>) => { f.report.trials[0].laneConfigurationSha256 = "b".repeat(64); },
      (f: ReturnType<typeof fixture>) => { [f.report.trials[0], f.report.trials[1]] = [f.report.trials[1], f.report.trials[0]]; },
      (f: ReturnType<typeof fixture>) => { f.report.trials[1].id = f.report.trials[0].id; }
    ];
    for (const change of changes) {
      const f = fixture(); change(f);
      const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
      expect(result.status).toBe("inconclusive"); expect(result.validity.valid).toBe(false); expect(result.comparisons).toEqual([]);
    }
  });
  test("duplicate identities and unproven cleanup cannot qualify even without sidecars", () => {
    for (const kind of ["duplicate", "cleanup"] as const) {
      const f = fixture(); f.spec.requireComponentsUsed = false; f.save();
      if (kind === "duplicate") f.report.trials[1].id = f.report.trials[0].id;
      else f.report.trials[0].process = { ...f.report.trials[0].process!, treeExitProven: false };
      expect(analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report }).validity.valid).toBe(false);
    }
  });
  test("campaign spec bytes must stay identical across admission reads", () => {
    const f = fixture(), expectedCampaignSha256 = f.campaignSha256(), originalRead = campaignArtifacts.readComparisonFile;
    let reads = 0;
    vi.spyOn(campaignArtifacts, "readComparisonFile").mockImplementation((path, limit) => {
      if (path === f.campaignPath && ++reads === 2) return Buffer.from(JSON.stringify({ ...f.spec, behavioralGate: { ...f.spec.behavioralGate, minPassRateLowerBound: 0 } }));
      return originalRead(path, limit);
    });
    expect(analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256, report: f.report, evidence: f.evidence() }).validity.valid).toBe(false);
  });
  test("changing preregistered analysis policy invalidates the cohort", () => {
    const f = fixture(), expectedCampaignSha256 = f.campaignSha256();
    f.spec.behavioralGate.minPassRateLowerBound = 0; f.save();
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256, report: f.report, evidence: f.evidence() });
    expect(result.status).toBe("inconclusive"); expect(result.validity.valid).toBe(false);
  });
  test("component missingness and installation diff remain explicit attributed evidence", () => {
    const f = fixture(), records = f.evidence(); records[0].componentsUsed = null as never;
    expect(analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: records }).status).toBe("inconclusive");
    const baseline = captureCampaignWorkspace(f.root); f.spec.workspaceTaskIds = ["one"] as never; f.save();
    const withWorkspace = f.evidence().map(row => ({ ...row, workspace: { baseline, after: baseline } }));
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: withWorkspace });
    expect(result.workspaceChanges[0].changes).toEqual([]);
    expect(result.status).toBe("pass");
    const withoutWorkspace = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
    expect(withoutWorkspace.status).toBe("inconclusive");
    expect(withoutWorkspace.reasons.join(" ")).toMatch(/workspace evidence unavailable/);
  });
  test("actual component observations are retained and counted per observed trial", () => {
    const f = fixture();
    const records = f.evidence().map(row => ({ ...row, componentsUsed: [{ id: "fs-read", kind: "tool", evidenceRef: "retained session dispatch" }] }));
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: records });
    expect(result.status).toBe("pass");
    expect(result.components[0].used).toEqual([{ id: "fs-read", kind: "tool", trials: 12 }]);
    expect(result.components[0].unknownTrials).toBe(0);
    writeFileSync(f.manifest.targets[0].artifact.path, "changed installed artifact");
    expect(analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: records }).validity.valid).toBe(false);
  });
  test("unknown cost blocks a requested cost gate; no fabricated favorable ratio", () => {
    const f = fixture(); Object.assign(f.spec.comparisons[0].policy, { maxCostIncreaseRatio: 1.1 }); f.save();
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
    expect(result.status).toBe("inconclusive"); expect(result.comparisons[0].reasons.join(" ")).toMatch(/cost evidence unavailable/);
  });
  test("failed attempts retain spend in a requested cost-per-success gate", () => {
    const f = fixture(); Object.assign(f.spec.comparisons[0].policy, { maxCostIncreaseRatio: 1.05 }); f.save();
    for (const row of f.report.trials) row.observations = { schemaVersion: HARNESS_COMPARISON_VERSION,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: null, cacheWriteTokens: null, source: "local-counter", evidenceRef: "stub usage" },
      cost: { amountUsd: 1, source: "provider-invoice", sourceUrl: "https://example.com/stub", asOf: "2026-10-30", evidenceRef: "synthetic test accounting only" } };
    const failure = f.report.trials.find(row => row.targetId === "candidate")!;
    failure.verdict = "fail"; failure.observedOutcome = "fail"; failure.oracle!.verdict = "fail"; failure.oracle!.checks[0].passed = false;
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() });
    expect(result.comparisons[0].reasons.join(" ")).toMatch(/cost increase ratio 1.0909/);
    expect(result.summary?.groups[1].costUsd.samples).toBe(12);
  });
  test("empty and wholly inconclusive populations never gain a score", () => {
    const f = fixture(); f.report.trials = [];
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report });
    expect(result.status).toBe("inconclusive"); expect(result.behavioral.every(row => row.passRate === null && row.interval95 === null)).toBe(true);
    expect(result.summary?.groups.every(group => group.oraclePassRate === null)).toBe(true);
  });
  test("sidecars cannot replay across manifest/run identities or throw on inconsistent snapshots", () => {
    const f = fixture();
    for (const field of ["manifestSha256", "comparisonStartedAt"] as const) {
      const records = f.evidence(); records[0][field] = field === "manifestSha256" ? "b".repeat(64) : "2026-10-29T00:00:00Z";
      const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: records });
      expect(result.validity.valid).toBe(false); expect(result.status).toBe("inconclusive");
    }
    const baseline = captureCampaignWorkspace(f.root), after = structuredClone(baseline);
    after.files[0].bytes += 1;
    after.snapshotSha256 = comparisonSha256(JSON.stringify({ version: after.version, files: after.files }));
    const records = f.evidence().map(row => ({ ...row, workspace: { baseline, after } }));
    expect(analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: records }).validity.valid).toBe(false);
  });
  test("model lanes cannot launder unknown or over-limit usage into a qualified pass", () => {
    const f = fixture(), lane = f.manifest.lanes[0];
    Object.assign(lane, { kind: "local-provider", provider: "local", model: "declared-test-model", settings: { baseURL: "http://127.0.0.1:18080", modelKind: "local-inference", modelIdentity: { runtimeSha256: "a".repeat(64), weightsSha256: ["a".repeat(64)] } }, budgets: { timeoutMs: 5000, maxTokens: 10, maxCostUsd: null } });
    lane.permissions.network = ["http://127.0.0.1:18080"];
    for (const target of f.manifest.targets) for (const binding of target.bindings) binding.supportsBoundedLiveExecution = true;
    f.spec.evidenceClass = "model-quality"; f.spec.manifest = f.put("manifest.json", f.manifest); f.save();
    f.report.manifestSha256 = f.spec.manifest.sha256;
    for (const row of f.report.trials) {
      row.laneKind = "local-provider"; row.modelCalled = true; row.laneConfigurationSha256 = comparisonSha256(JSON.stringify(lane)); row.budgetStatus = "within-recorded-bounds";
      row.observations = { schemaVersion: HARNESS_COMPARISON_VERSION, modelExecution: { modelCalled: true, source: "adapter-observation", evidenceRef: "test request" }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: null, cacheWriteTokens: null, source: "local-counter", evidenceRef: "test usage" } };
    }
    expect(analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() }).status).toBe("pass");
    const row = f.report.trials[0], original = structuredClone(row);
    for (const mutate of [
      () => { row.observations = null; row.budgetStatus = "not-applicable"; },
      () => { row.observations!.usage!.inputTokens = 100; },
      () => { row.observations!.modelExecution!.modelCalled = false; },
      () => { row.observations!.cost = { amountUsd: 0, source: "provider-invoice", sourceUrl: "https://example.com/stub", asOf: "2026-10-30", evidenceRef: "fabricated local invoice" }; }
    ]) {
      Object.assign(row, structuredClone(original)); mutate();
      expect(analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report: f.report, evidence: f.evidence() }).validity.valid).toBe(false);
    }
  });
  test("actual existing executor and independent stub oracle produce analyzable conformance receipts", async () => {
    const f = fixture(); f.spec.requireComponentsUsed = false; f.save();
    const report = await runHarnessComparison({ manifestPath: f.manifestPin.path, outputDir: join(f.root, "results"), allowAdapterExecution: true });
    expect(report.trials).toHaveLength(24);
    const result = analyzeComparisonCampaign({ campaignPath: f.campaignPath, expectedCampaignSha256: f.campaignSha256(), report });
    expect(result.status).toBe("pass"); expect(result.summary?.groups.every(group => group.passed === 12)).toBe(true);
    expect(readFileSync(join(f.root, "results", `${report.trials[0].id}.stdout.txt`), "utf8")).toBe("stub output");
  }, 60000);
});

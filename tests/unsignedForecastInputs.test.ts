import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { collectBenchData } from "../src/bench/benchCollector.js";
import { initBenchPolicy, loadBenchPolicy } from "../src/bench/benchPolicyStore.js";
import { collectForecastSignals } from "../src/forecast/forecastSignals.js";
import { forecastScopeLatestPath, loadVerifiedForecastArtifact } from "../src/forecast/forecastStore.js";
import { createForecast, initForecastPolicy } from "../src/forecast/forecastEngine.js";
import { loadVerifiedLatestOrgScorecard } from "../src/org/orgScorecard.js";
import { initWorkspace } from "../src/workspace.js";
import { collectPassportData } from "../src/passport/passportCollector.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { createValueSnapshot } from "../src/value/valueReports.js";
import { loadVerifiedValueSnapshot, valueSnapshotLatestPath } from "../src/value/valueStore.js";
import { signFileWithAuditor } from "../src/org/orgSigner.js";
import { copyFileSync } from "node:fs";
import { valueContractInitForApi, valueInitForApi } from "../src/value/valueApi.js";
import { readFileSync } from "node:fs";

/**
 * WORKSPACE and NODE forecasts and benches read org scorecards, forecasts and transform snapshots a workspace writer
 * can drop in unsigned. Each is read only through its signature now: an unsigned or tampered file is absent and named.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE ??= "unsigned-forecast-inputs-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-unsigned-inputs-")));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBenchPolicy(dir);
  return dir;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

/** A forged scorecard claiming perfect trust, with no `.sig`. */
function forgedScorecard(computedAt: number) {
  const node = { nodeId: "root", headline: { median: 5 }, integrityIndex: 1, trustLabel: "HIGH TRUST",
    evidenceCoverage: { observedRatio: 1, attestedRatio: 0, selfReportedRatio: 0, medianCorrelationRatio: 1 },
    questionScores: [], riskIndices: [], layerScores: [] };
  return { v: 1, enterpriseId: "e", enterpriseName: "E", computedAt, window: { raw: "30d", windowStartTs: 0, windowEndTs: computedAt },
    configTrusted: true, nodes: [node], summary: { enterpriseNodeId: "root", enterpriseRollup: node, ecosystemRollup: null } };
}

describe("unsigned forecast, bench and passport inputs are absent and named", () => {
  test("a forged history scorecard adds no point to a WORKSPACE forecast and is named", () => {
    const ws = workspace();
    const computedAt = Date.now() - 1000;
    writeJson(join(ws, ".amc", "org", "scorecards", "history", `${computedAt}.json`), forgedScorecard(computedAt));
    const signals = collectForecastSignals({ workspace: ws, scope: { type: "WORKSPACE", id: "workspace" } });
    expect(signals.points.maturityOverall).toEqual([]);
    expect(signals.evidence.latestIntegrityIndex).toBe(0);
    expect(signals.ignoredInputs).toEqual([join(".amc", "org", "scorecards", "history", `${computedAt}.json`)]);
  });

  test("an unsigned transform snapshot is left out of the throughput and named", () => {
    const ws = workspace();
    const file = join(ws, ".amc", "agents", "default", "transform", "snapshots", "1.json");
    writeJson(file, { createdTs: Date.now(), tasks: [{ taskId: "t1", effort: 1, status: "DONE" }] });
    const signals = collectForecastSignals({ workspace: ws, scope: { type: "AGENT", id: "default" } });
    expect(signals.targetProgress.throughputHistoryPerDay).toEqual([]);
    expect(signals.ignoredInputs).toContain(join(".amc", "agents", "default", "transform", "snapshots", "1.json"));
  });

  test("an unsigned latest scorecard or forecast is absent to the bench and passport readers", () => {
    const ws = workspace();
    const computedAt = Date.now() - 1000;
    writeJson(join(ws, ".amc", "org", "scorecards", "latest.json"), forgedScorecard(computedAt));
    expect(loadVerifiedLatestOrgScorecard(ws)).toEqual({ scorecard: null, ignored: join(".amc", "org", "scorecards", "latest.json") });
    // A genuine signed forecast, then edited in place: still schema-valid, no longer signed.
    const scope = { type: "AGENT" as const, id: "default" };
    initForecastPolicy(ws);
    createForecast({ workspace: ws, scope });
    expect(loadVerifiedForecastArtifact(ws, scope)).not.toBeNull();
    const path = forecastScopeLatestPath(ws, scope), forecast = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    writeFileSync(path, JSON.stringify({ ...forecast, status: "OK", reasons: [] }));
    expect(loadVerifiedForecastArtifact(ws, scope)).toBeNull();
  });

  test("a workspace bench names the unsigned scorecard and keeps none of its claims", () => {
    const ws = workspace();
    writeJson(join(ws, ".amc", "org", "scorecards", "latest.json"), forgedScorecard(Date.now() - 1000));
    const collected = collectBenchData({ workspace: ws, scopeType: "WORKSPACE", scopeId: "workspace", windowDays: 30, policy: loadBenchPolicy(ws) });
    expect(collected.evidenceGateReasons).toContain(`UNVERIFIED_INPUT_IGNORED:${join(".amc", "org", "scorecards", "latest.json")}`);
    expect(JSON.stringify(collected.bench)).not.toContain("HIGH");
  });

  test("a passport does not sign value dimensions from a tampered value snapshot", async () => {
    const ws = workspace();
    valueInitForApi(ws);
    valueContractInitForApi({ workspace: ws, scopeType: "AGENT", scopeId: "default", type: "code-agent" });
    const scope = { type: "AGENT" as const, id: "default" };
    await createValueSnapshot({ workspace: ws, scopeType: "AGENT", scopeId: "default" });
    const path = valueSnapshotLatestPath(ws, scope), snapshot = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    writeFileSync(path, JSON.stringify({ ...snapshot, valueDimensions: { emotional: 99, functional: 99, economic: 99, brand: 99, lifetime: 99, valueScore: 99 } }));
    const passport = collectPassportData({ workspace: ws, scopeType: "AGENT", scopeId: "default", policy: defaultPassportPolicy() }).passport;
    const policy = defaultPassportPolicy();
    expect(policy.passportPolicy.contents.includeFiveValueDims).toBe(true);
    expect(Object.values(passport.valueDimensions as Record<string, unknown>)).not.toContain(99);
  });

  test("a signed forecast or value snapshot copied from another scope is absent", async () => {
    const ws = workspace();
    initForecastPolicy(ws);
    createForecast({ workspace: ws, scope: { type: "AGENT", id: "default" } });
    const workspaceScope = { type: "WORKSPACE" as const, id: "workspace" };
    const from = forecastScopeLatestPath(ws, { type: "AGENT", id: "default" }), to = forecastScopeLatestPath(ws, workspaceScope);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to); copyFileSync(`${from}.sig`, `${to}.sig`);
    expect(loadVerifiedForecastArtifact(ws, workspaceScope)).toBeNull();

    valueInitForApi(ws);
    valueContractInitForApi({ workspace: ws, scopeType: "AGENT", scopeId: "default", type: "code-agent" });
    await createValueSnapshot({ workspace: ws, scopeType: "AGENT", scopeId: "default" });
    expect(loadVerifiedValueSnapshot(ws, { type: "AGENT", id: "default" })).not.toBeNull();
    const vFrom = valueSnapshotLatestPath(ws, { type: "AGENT", id: "default" }), vTo = valueSnapshotLatestPath(ws, workspaceScope);
    mkdirSync(dirname(vTo), { recursive: true });
    copyFileSync(vFrom, vTo); copyFileSync(`${vFrom}.sig`, `${vTo}.sig`);
    expect(loadVerifiedValueSnapshot(ws, workspaceScope)).toBeNull();
  });

  test("a signed transform snapshot for another agent, or a second copy of one, is not counted", () => {
    const ws = workspace();
    const dir = join(ws, ".amc", "agents", "default", "transform", "snapshots");
    const createdTs = Date.now() - 1000;
    const snapshot = (agentId: string, taskId: string) => ({ createdTs, scope: { type: "AGENT", agentId },
      tasks: [{ taskId, effort: 1, status: "DONE" }] });
    const signed = (name: string, body: unknown) => { const path = join(dir, name); writeJson(path, body); signFileWithAuditor(ws, path); };
    signed("1.json", snapshot("default", "own"));
    signed("2.json", snapshot("default", "own"));
    signed("3.json", snapshot("other-agent", "foreign"));
    const signals = collectForecastSignals({ workspace: ws, scope: { type: "AGENT", id: "default" } });
    expect(signals.targetProgress.throughputHistoryPerDay).toEqual([1]);
    expect(signals.ignoredInputs).toEqual(expect.arrayContaining([join(".amc", "agents", "default", "transform", "snapshots", "3.json")]));
    expect(signals.ignoredInputs.filter((input) => /snapshots\/[12]\.json$/.test(input))).toHaveLength(1);
  });
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";

// Fixtures establish contract parity; they do not measure provider performance.
// Full archived modules and actual compiled exports share unchanged real dependencies.
const archive = resolve("unused-code/2026-10-02-native/provider-row-contracts");
const restoration = JSON.parse(readFileSync(resolve(archive, "restoration-map.json"), "utf8")) as {
  originals: Array<{ path: string; archive?: string; sha256?: string }>;
};
const now = "2026-06-20T00:00:00.000Z";
type Run = (...args: any[]) => any;
type Lane = {
  id: string; title: string; identifiers: string[]; source: string; hashes: string[];
  original: Run; current: Run; originalModule: Record<string, unknown>; currentModule: Record<string, unknown>;
  originalPrivate: Record<string, Run>; currentPrivate: Record<string, Run>;
};
const specs: Array<[string, string, string[]]> = [
  ["helm", "Helm", ["helmVersion", "scenarioSuiteId", "runId", "providerRouteId"]],
  ["patronus", "Patronus", ["projectId", "evaluationRunId"]],
  ["inspect", "Inspect", ["taskId", "evalRunId", "inspectVersion", "providerRouteId"]],
  ["humanloop", "Humanloop", ["fileVersionId", "environmentId", "evaluationRunId", "providerRouteId"]],
  ["tensorZero", "TensorZero", ["tensorZeroVersion", "providerRouteId", "evaluationRunId"]],
  ["promptLayer", "PromptLayer", ["promptVersionId", "providerRouteId"]],
  ["promptfoo", "Promptfoo", ["promptfooVersion"]],
];
const lanes: Lane[] = specs.map(([id, title, identifiers]) => {
  const saved = restoration.originals.find((entry) => entry.path === "src/benchmarks/" + id + "ProviderDrift.ts")!;
  const source = readFileSync(resolve(saved.archive!), "utf8");
  if (createHash("sha256").update(source).digest("hex") !== saved.sha256) throw new Error("Archived original changed: " + id);
  const hashes = [...source.match(/const REQUIRED_HASH_FIELDS[^=]*= \[([\s\S]*?)\];/)![1]!.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]!);
  return { id, title, identifiers, source, hashes } as Lane;
});
function rebase(compiled: string): string {
  return compiled.replace(/from "(\.[^"]+)"/g, (_match, ref: string) =>
    'from "' + pathToFileURL(resolve("dist/benchmarks", ref)).href + '"');
}
async function load(compiled: string): Promise<any> {
  return import(/* @vite-ignore */ "data:text/javascript;base64," + Buffer.from(rebase(compiled)).toString("base64"));
}
beforeAll(async () => {
  for (const lane of lanes) {
    const original = ts.transpileModule(lane.source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    const current = readFileSync(resolve("dist/benchmarks/" + lane.id + "ProviderDrift.js"), "utf8");
    lane.originalModule = await load(original);
    lane.currentModule = await import(/* @vite-ignore */ pathToFileURL(resolve("dist/benchmarks/" + lane.id + "ProviderDrift.js")).href);
    lane.original = lane.originalModule["run" + lane.title + "ProviderDrift"] as Run;
    lane.current = lane.currentModule["run" + lane.title + "ProviderDrift"] as Run;
    // Test-only visibility on complete modules exposes original private call sites.
    // No production export, consumer, original byte, or function body is changed.
    const privateExports = "\nexport { build" + lane.title + "Proof as proof" +
      (!["promptLayer", "promptfoo"].includes(lane.id) ? ", buildScoreSurface as score, buildShieldSurface as shield" : "") + " };";
    lane.originalPrivate = await load(original + privateExports);
    lane.currentPrivate = await load(current + privateExports);
  }
});
function row(id = "canary-a"): ProviderDriftCanaryRow {
  return { provider: "fixture-provider", model: "fixture-model", version: "v1", canaryId: id,
    sampleSize: 48, scoreMean0to1: 0.9, refusalRate0to1: 0.02, latencyMsP95: 1200,
    costUsdMean: 0.005, evidenceRefs: ["fixture:row"], signedEvidenceRefs: ["fixture:signed-ref"] };
}
function metadata(lane: Lane, canary = row()): any {
  return { provider: canary.provider, model: canary.model, canaryId: canary.canaryId, providerVersion: canary.version,
    ...Object.fromEntries(lane.identifiers.map((field) => [field, "fixture-id"])),
    ...Object.fromEntries(lane.hashes.map((field) => [field, "A".repeat(64)])),
    metricIds: [" score ", "latency", "score"], metricCount: 2,
    ...(lane.id === "inspect" ? { scorerIds: ["scorer", " scorer "] } : {}) };
}
function input(lane: Lane): any {
  return { agentId: "fixture-agent", baseline: [row()], candidate: [row()],
    [lane.id]: { baseline: [metadata(lane)], candidate: [metadata(lane)] }, now: new Date(now),
    evalPack: { packId: "fixture-pack", datasetHash: "b".repeat(64), sourceRefs: ["fixture:source"] }, gate: { mode: "ci" } };
}
function outcome(run: Run, ...args: any[]): any {
  try {
    const result = run(...args);
    return { result, bytes: JSON.stringify(result), keys: Object.keys(result),
      nestedKeys: Object.entries(result).filter(([, value]) => value && typeof value === "object")
        .map(([key, value]) => [key, Array.isArray(value) ? value.map((item) => item && typeof item === "object" ? Object.keys(item) : item) : Object.keys(value as object)]) };
  } catch (error) { return { error: { name: (error as Error).name, message: (error as Error).message } }; }
}
function parity(lane: Lane, build = () => input(lane)): any {
  const original = outcome(lane.original, build());
  const current = outcome(lane.current, build());
  expect(current).toEqual(original);
  return current.result;
}
for (const lane of lanes) describe(lane.id + " row contracts and complete original receipt", () => {
  test("retains exports, complete byte order, domain fields, and hashes", () => {
    expect(Object.keys(lane.currentModule)).toEqual(Object.keys(lane.originalModule));
    for (const key of Object.keys(lane.originalModule)) if (typeof lane.originalModule[key] !== "function") expect(lane.currentModule[key]).toEqual(lane.originalModule[key]);
    const result = parity(lane);
    expect(result.report.failClosed).toBe(false);
    const proof = result[lane.id + "Evidence"][1];
    const { proofHash, ...payload } = proof;
    const canonical = JSON.stringify(payload, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) : value);
    expect(proofHash).toBe(createHash("sha256").update(canonical).digest("hex"));
    if (result.score) expect(Object.hasOwn(result.score, "canaryResults")).toBe(lane.id !== "humanloop");
  });
  test.each([undefined, null, "", " ", "v1", " v1 ", "v2", 1, {}, []])("version and native identifier contract %j", (version) => {
    const result = parity(lane, () => { const value = input(lane); value[lane.id].candidate[0].providerVersion = version; return value; });
    if (result && version === "v2") {
      expect(result[lane.id + "Evidence"][1].missingReasons).toContain("candidate:providerVersionMismatch");
      expect(result.report.failClosed).toBe(true);
    }
  });
  test.each([undefined, null, -Infinity, -1, -0, 0, Number.MIN_VALUE, 1, 1.9999999999999998, 2, 2.0000000000000004, Number.MAX_VALUE, Infinity, NaN, "2", true])("metric coverage numeric boundary %s", (count) => {
    const result = parity(lane, () => { const value = input(lane); value[lane.id].candidate[0].metricCount = count; return value; });
    const expectedCount = Number.isFinite(count) ? Math.max(0, count as number) : 0;
    expect(result[lane.id + "Evidence"][1].metricCount).toBe(expectedCount);
    expect(result[lane.id + "Evidence"][1].missingReasons.includes("candidate:metricCount")).toBe(expectedCount < 2);
    expect(result.report.failClosed).toBe(expectedCount < 2);
  });
  test.each([undefined, null, [], {}, "score", [null, 1, " score ", "", "score"], ["z", "a", "z"]])("metric array native errors/order and minimum count %j", (ids) => {
    parity(lane, () => { const value = input(lane); value[lane.id].candidate[0].metricIds = ids; value[lane.id].candidate[0].metricCount = 0; return value; });
  });
  test.each(["absent", "mismatched-key", "missing-envelope", "null-entry", "bad-time"])("preserves malformed/absent metadata %s", (kind) => {
    parity(lane, () => {
      const value = input(lane);
      if (kind === "absent") value[lane.id].candidate = [];
      if (kind === "mismatched-key") value[lane.id].candidate[0].model = "other-model";
      if (kind === "missing-envelope") delete value[lane.id];
      if (kind === "null-entry") value[lane.id].candidate = [null];
      if (kind === "bad-time") value.now = new Date("invalid");
      return value;
    });
  });
  test("preserves output ordering, duplicate row selection, and missing sides", () => {
    const result = parity(lane, () => {
      const value = input(lane);
      value.baseline = [row("z"), row("a"), { ...row("a"), version: "duplicate-v" }];
      value.candidate = [row("b"), row("z")];
      value[lane.id] = { baseline: value.baseline.map((item: ProviderDriftCanaryRow) => metadata(lane, item)), candidate: value.candidate.map((item: ProviderDriftCanaryRow) => metadata(lane, item)) };
      return value;
    });
    expect(result[lane.id + "Evidence"][0].canaryId).toBe(lane.id === "promptfoo" ? "z" : "a");
  });
  test("preserves default clock and caller gate/eval-pack overrides", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    try { parity(lane, () => { const value = input(lane); delete value.now; delete value.evalPack; delete value.gate; return value; }); }
    finally { vi.useRealTimers(); }
  });
  test("retains version and count repeated reads around provider/scorer getters", () => {
    function execute(run: Run) {
      const trace: string[] = []; const canary = row(); const meta = metadata(lane);
      let versionReads = 0; let countReads = 0;
      Object.defineProperty(canary, "version", { get() { trace.push("row.version"); return ++versionReads === 1 ? "v1" : "v2"; } });
      Object.defineProperty(meta, "metricCount", { get() { trace.push("metricCount"); return ++countReads === 1 ? 2 : -1; } });
      const tracked = new Proxy(meta, { get(object, key, receiver) { trace.push(String(key)); return Reflect.get(object, key, receiver); } });
      return { value: outcome(run, "candidate", canary, tracked), trace };
    }
    const current = execute(lane.currentPrivate.proof!);
    expect(current).toEqual(execute(lane.originalPrivate.proof!));
    expect(current.value.result.missingReasons).toContain("candidate:providerVersionMismatch");
    expect(current.value.result.metricCount).toBe(0);
    expect(current.trace.filter((key) => key === "row.version")).toHaveLength(2);
    expect(current.trace.filter((key) => key === "metricCount")).toHaveLength(4);
  });
  test.each(["providerVersion", "metricIds", "metricCount", ...lane.identifiers])("retains native throwing proof getter %s", (field) => {
    function execute(run: Run) {
      const meta = metadata(lane); Object.defineProperty(meta, field, { get() { throw new RangeError("fixture-getter:" + field); } });
      return outcome(run, "candidate", row(), meta);
    }
    expect(execute(lane.currentPrivate.proof!)).toEqual(execute(lane.originalPrivate.proof!));
    expect(execute(lane.currentPrivate.proof!)).toEqual({ error: { name: "RangeError", message: "fixture-getter:" + field } });
  });
});

for (const lane of lanes.filter((item) => !["promptLayer", "promptfoo"].includes(item.id))) describe(lane.id + " native Score/Shield projections", () => {
  function tracked(target: any, label: string, trace: string[], throwing?: string): any {
    return new Proxy(target, { get(object, key, receiver) {
      trace.push(label + "." + String(key));
      if (label + "." + String(key) === throwing) throw new TypeError("fixture-projection:" + throwing);
      return Reflect.get(object, key, receiver);
    } });
  }
  test.each([undefined, "report.reportId", "report.comparisons", "comparison.status", "comparisons.map"])("retains Score property/method ordering, references and native errors %s", (throwing) => {
    function execute(run: Run) {
      const trace: string[] = [];
      const comparison = tracked({ provider: "p", model: "m", canaryId: "c", driftStatistic: -0, status: "alert" }, "comparison", trace, throwing);
      const comparisons = tracked([comparison, comparison], "comparisons", trace, throwing);
      const versions = ["p/m@v"];
      const report = tracked({ reportId: "fixture", recommendation: "alert", failClosed: true, providerVersions: versions, comparisons }, "report", trace, throwing);
      const value = outcome(run, report, "fixture-evidence-hash");
      return { value, trace, sameCanary: value.result?.canaryResults === comparisons, sameVersions: value.result?.providerVersions === versions };
    }
    expect(execute(lane.currentPrivate.score!)).toEqual(execute(lane.originalPrivate.score!));
  });
  test.each([undefined, "gate.failClosed", "report.alerts", "alerts.filter", "alert.waived", "alert.alertId"])("retains Shield filtering, aliasing and native errors %s", (throwing) => {
    function execute(run: Run) {
      const trace: string[] = [];
      const alerts = tracked([false, true, false, undefined].map((waived, index) => tracked({ alertId: "alert-" + index, waived }, "alert", trace, throwing)), "alerts", trace, throwing);
      const gate = tracked({ failClosed: true }, "gate", trace, throwing);
      const value = outcome(run, gate, tracked({ alerts }, "report", trace, throwing), "fixture-evidence-hash");
      return { value, trace, sameGate: value.result?.gate === gate };
    }
    expect(execute(lane.currentPrivate.shield!)).toEqual(execute(lane.originalPrivate.shield!));
  });
});

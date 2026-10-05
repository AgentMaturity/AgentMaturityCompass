import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";

// These are conformance fixtures, not measured provider performance. Every oracle is a
// complete, hash-pinned original module, using the same unchanged compiled dependencies.
const archive = resolve("unused-code/2026-10-02-native/provider-drift");
const restoration = JSON.parse(readFileSync(resolve(archive, "restoration-map.json"), "utf8")) as {
  originals: Array<{ path: string; archive?: string; sha256?: string }>;
};
const now = "2026-06-20T00:00:00.000Z";
type Run = (input: any) => any;
type Lane = {
  id: string;
  title: string;
  identifiers: string[];
  source: string;
  hashes: string[];
  forbidden: string[];
  original: Run;
  current: Run;
  sourceCurrent: Run;
  originalModule: Record<string, unknown>;
  currentModule: Record<string, unknown>;
};
const laneSpecs: Array<[string, string, string[]]> = [
  ["helm", "Helm", ["helmVersion", "scenarioSuiteId", "runId", "providerRouteId"]],
  ["patronus", "Patronus", ["projectId", "evaluationRunId"]],
  ["inspect", "Inspect", ["taskId", "evalRunId", "inspectVersion", "providerRouteId"]],
  ["humanloop", "Humanloop", ["fileVersionId", "environmentId", "evaluationRunId", "providerRouteId"]],
  ["tensorZero", "TensorZero", ["tensorZeroVersion", "providerRouteId", "evaluationRunId"]],
  ["promptLayer", "PromptLayer", ["promptVersionId", "providerRouteId"]],
  ["promptfoo", "Promptfoo", ["promptfooVersion"]],
];
function stringArray(source: string, name: string): string[] {
  const body = source.match(new RegExp("const " + name + "[^=]*= \\[([\\s\\S]*?)\\];"))?.[1];
  if (!body) throw new Error("Missing original " + name);
  return [...body.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]!);
}
const lanes: Lane[] = laneSpecs.map(([id, title, identifiers]) => {
  const file = "src/benchmarks/" + id + "ProviderDrift.ts";
  const original = restoration.originals.find((row) => row.path === file)!;
  const source = readFileSync(resolve(original.archive!), "utf8");
  if (createHash("sha256").update(source).digest("hex") !== original.sha256) throw new Error("Original archive changed: " + id);
  return { id, title, identifiers, source, hashes: stringArray(source, "REQUIRED_HASH_FIELDS"),
    forbidden: stringArray(source, "FORBIDDEN_CONTENT_FIELDS") } as Lane;
});
beforeAll(async () => {
  for (const lane of lanes) {
    const compiled = ts.transpileModule(lane.source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
    } }).outputText.replace(/from "(\.[^"]+)"/g, (_match, ref: string) =>
      'from "' + pathToFileURL(resolve("dist/benchmarks", ref)).href + '"');
    lane.originalModule = await import(/* @vite-ignore */ "data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
    lane.currentModule = await import(/* @vite-ignore */ pathToFileURL(resolve("dist/benchmarks/" + lane.id + "ProviderDrift.js")).href);
    lane.original = lane.originalModule["run" + lane.title + "ProviderDrift"] as Run;
    lane.current = lane.currentModule["run" + lane.title + "ProviderDrift"] as Run;
    const sourceModule = await vi.importActual<Record<string, unknown>>(resolve("src/benchmarks/" + lane.id + "ProviderDrift.ts"));
    lane.sourceCurrent = sourceModule["run" + lane.title + "ProviderDrift"] as Run;
  }
});
function row(id = "canary-a"): ProviderDriftCanaryRow {
  return { provider: "fixture-provider", model: "fixture-model", version: "v1", canaryId: id,
    sampleSize: 48, scoreMean0to1: 0.9, refusalRate0to1: 0.02, latencyMsP95: 1200,
    costUsdMean: 0.005, evidenceRefs: ["fixture:row"], signedEvidenceRefs: ["fixture:signed-ref"] };
}
function metadata(lane: Lane, canary = row()): Record<string, any> {
  return { provider: canary.provider, model: canary.model, canaryId: canary.canaryId,
    providerVersion: canary.version, ...Object.fromEntries(lane.identifiers.map((id) => [id, "fixture-id"])),
    ...Object.fromEntries(lane.hashes.map((id) => [id, "A".repeat(64)])),
    metricIds: [" score ", "latency", "score"], metricCount: 2,
    ...(lane.id === "inspect" ? { scorerIds: ["scorer", " scorer "] } : {}) };
}
function input(lane: Lane): any {
  return { agentId: "fixture-agent", baseline: [row()], candidate: [row()],
    [lane.id]: { baseline: [metadata(lane)], candidate: [metadata(lane)] }, now: new Date(now),
    evalPack: { packId: "fixture-pack", datasetHash: "b".repeat(64), sourceRefs: ["fixture:source"] },
    gate: { mode: "ci" } };
}
function outcome(run: Run, value: any): any {
  try {
    const result = run(value);
    return { result, bytes: JSON.stringify(result), keys: Object.keys(result),
      proofKeys: Object.entries(result).filter(([key]) => key.endsWith("Evidence")).map(([key, rows]) => [key, (rows as object[]).map((proof) => Object.keys(proof))]) };
  } catch (error) {
    return { error: { name: (error as Error).name, message: (error as Error).message } };
  }
}
function parity(lane: Lane, build: () => any = () => input(lane)): any {
  const original = outcome(lane.original, build());
  const current = outcome(lane.current, build());
  expect(current).toEqual(original);
  return current.result;
}
function proofs(lane: Lane, result: any): any[] { return result[lane.id + "Evidence"]; }
function waiver(lane: Lane, overrides: Record<string, unknown> = {}): any {
  return { waiverId: "fixture-waiver", provider: "fixture-provider", model: "fixture-model", canaryId: "canary-a",
    metricIds: [lane.id === "humanloop" || lane.id === "promptLayer" ? "observabilityPipelineEvidence" : "evaluationFrameworkEvidence"],
    reason: "Conformance fixture", approvedBy: "fixture-owner", expiresAt: "2026-07-20T00:00:00.000Z",
    evidenceRefs: ["fixture:approval"], ...overrides };
}
for (const lane of lanes) describe(lane.id + " complete original module parity", () => {
  test.each(["absent metadata arrays", "candidate-only canary", "changing metric-count getter"])("source public workflow retains %s behavior", kind => {
    function build(): any {
      const value = input(lane);
      if (kind === "absent metadata arrays") value[lane.id] = {};
      else if (kind === "candidate-only canary") {
        value.baseline = [];
        value[lane.id].baseline = [];
      } else {
        let reads = 0;
        Object.defineProperty(value[lane.id].candidate[0], "metricCount", {
          enumerable: true, get() { return ++reads === 1 ? 2 : undefined; }
        });
      }
      return value;
    }
    const current = outcome(lane.sourceCurrent, build());
    expect(current).toEqual(outcome(lane.original, build()));
    expect(current.result).toBeDefined();
    const evidence = proofs(lane, current.result);
    expect(evidence.map(proof => proof.side)).toEqual(["baseline", "candidate"]);
    if (kind === "absent metadata arrays" || kind === "candidate-only canary") {
      expect(evidence[0].missingReasons).toContain("baseline:" + lane.id + "Metadata");
      expect(current.result.report.failClosed).toBe(true);
    } else {
      expect(evidence[1].metricCount).toBe(0);
      expect(evidence[1].missingReasons).toContain("candidate:metricCount");
      expect(current.result.report.failClosed).toBe(true);
    }
  });
  test("preserves every runtime export and complete receipt bytes", () => {
    expect(Object.keys(lane.currentModule)).toEqual(Object.keys(lane.originalModule));
    for (const key of Object.keys(lane.originalModule)) if (typeof lane.originalModule[key] !== "function") {
      expect(lane.currentModule[key]).toEqual(lane.originalModule[key]);
    }
    const result = parity(lane);
    expect(result.report.failClosed).toBe(false);
    expect(proofs(lane, result).every((proof) => proof.missingReasons.length === 0)).toBe(true);
    expect(result[lane.id + "EvidenceHash"]).toMatch(/^[a-f0-9]{64}$/);
  });
  test.each(lane.hashes)("retains missing hash refusal: %s", (field) => {
    const result = parity(lane, () => {
      const value = input(lane); delete value[lane.id].candidate[0][field]; return value;
    });
    expect(result.report.failClosed).toBe(true);
    expect(proofs(lane, result)[1].missingReasons).toContain("candidate:" + field);
  });
  test.each(lane.forbidden)("retains own content-field refusal: %s", (field) => {
    const result = parity(lane, () => {
      const value = input(lane); value[lane.id].candidate[0][field] = undefined; return value;
    });
    expect(result.report.failClosed).toBe(true);
    expect(proofs(lane, result)[1].missingReasons).toContain("candidate:metadataOnly:" + field);
  });
  test.each([undefined, null, "", "g".repeat(64), "a".repeat(63), 64, {}, []])("malformed hash %j", (hash) => {
    parity(lane, () => { const value = input(lane); value[lane.id].candidate[0].canaryResultHash = hash; return value; });
  });
  test.each([undefined, null, [], {}, " ", [null, 1, " score ", "", "score"], ["z", "a", "z"]])("native metadata list %j", (ids) => {
    parity(lane, () => { const value = input(lane); value[lane.id].candidate[0].metricIds = ids; return value; });
  });
  test.each([undefined, null, -1, -0, 0, 1, 1.999999, 2, 2.000001, Infinity, -Infinity, NaN, "2"])("metric count boundary %s", (count) => {
    parity(lane, () => { const value = input(lane); value[lane.id].candidate[0].metricCount = count; return value; });
  });
  test.each(["providerVersion", ...lane.identifiers])("retains blank identifier %s", (field) => {
    const result = parity(lane, () => { const value = input(lane); value[lane.id].candidate[0][field] = " "; return value; });
    expect(proofs(lane, result)[1].missingReasons).toContain("candidate:" + field);
    expect(result.report.failClosed).toBe(true);
  });
  test.each(["none", "candidate", "mismatched-key", "version-mismatch", "null-entry", "missing-envelope", "bad-baseline", "bad-time"])("missing/malformed metadata %s", (kind) => {
    const build = () => {
      const value = input(lane);
      if (kind === "none") value[lane.id] = {};
      if (kind === "candidate") value[lane.id].candidate = [];
      if (kind === "mismatched-key") value[lane.id].candidate[0].model = "other-model";
      if (kind === "version-mismatch") value[lane.id].candidate[0].providerVersion = "v2";
      if (kind === "null-entry") value[lane.id].candidate = [null];
      if (kind === "missing-envelope") delete value[lane.id];
      if (kind === "bad-baseline") value.baseline = null;
      if (kind === "bad-time") value.now = new Date("invalid");
      return value;
    };
    const result = parity(lane, build);
    if (result && ["none", "candidate", "mismatched-key", "version-mismatch"].includes(kind)) expect(result.report.failClosed).toBe(true);
  });
  test.each([undefined, null, [], "evaluationFrameworkEvidence", ["not-a-metric"], ["scoreMean0to1"]])("strict malformed/narrow waiver metrics %j", (metricIds) => {
    parity(lane, () => { const value = input(lane); value[lane.id].candidate = []; value.waivers = [waiver(lane, { metricIds })]; return value; });
  });
  test.each([{}, { evidenceRefs: [" "] }, { evidenceRefs: null }, { expiresAt: now }, { expiresAt: "invalid" }, { provider: "other" }, { model: "other" }, { canaryId: "other" }])("waiver refusal and expiry %j", (overrides) => {
    const result = parity(lane, () => { const value = input(lane); value[lane.id].candidate = []; value.waivers = [waiver(lane, overrides)]; return value; });
    expect(result.report.failClosed).toBe(Object.keys(overrides).length > 0);
  });
  test.each([0.799999, 0.8, 0.800001, NaN, Infinity, -Infinity, -0])("score threshold numeric boundary %s", (score) => {
    parity(lane, () => { const value = input(lane); value.candidate[0].scoreMean0to1 = score; value.thresholds = { maxScoreDrop0to1: 0.1 }; return value; });
  });
  test("preserves row order, duplicate selection, and absent side behavior", () => {
    parity(lane, () => {
      const value = input(lane);
      value.baseline = [row("z"), row("a"), row("a")];
      value.candidate = [row("b"), row("z")];
      value[lane.id] = { baseline: value.baseline.map((r: ProviderDriftCanaryRow) => metadata(lane, r)),
        candidate: value.candidate.map((r: ProviderDriftCanaryRow) => metadata(lane, r)) };
      value[lane.id].baseline.push({ ...metadata(lane, row("a")), metricCount: 0 });
      return value;
    });
  });
  test("preserves default clock, eval-pack and gate behavior", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    try { parity(lane, () => { const value = input(lane); delete value.now; delete value.evalPack; delete value.gate; return value; }); }
    finally { vi.useRealTimers(); }
  });
  test("preserves native proxy/getter access, repeated reads and Array method order", () => {
    function execute(run: Run) {
      const trace: string[] = []; const value = input(lane);
      const tracked = (target: any, label: string) => new Proxy(target, {
        get(object, key, receiver) { trace.push(label + ".get:" + String(key)); return Reflect.get(object, key, receiver); },
        getOwnPropertyDescriptor(object, key) { trace.push(label + ".own:" + String(key)); return Reflect.getOwnPropertyDescriptor(object, key); },
      });
      for (const side of ["baseline", "candidate"]) {
        const m = value[lane.id][side][0];
        m.metricIds = tracked(m.metricIds, side + ".metricIds");
        let count = 0;
        Object.defineProperty(m, "metricCount", { enumerable: true, get() { trace.push(side + ".count"); return ++count === 1 ? 2 : 3; } });
        let idReads = 0;
        const id = lane.identifiers[0]!;
        Object.defineProperty(m, id, { enumerable: true, get() { trace.push(side + ".id"); return "fixture-id-" + ++idReads; } });
        value[lane.id][side] = tracked([tracked(m, side + ".metadata")], side + ".array");
      }
      value.waivers = tracked([waiver(lane, { evidenceRefs: [" "] })], "waivers");
      return { value: outcome(run, tracked(value, "input")), trace };
    }
    expect(execute(lane.current)).toEqual(execute(lane.original));
  });
  test("preserves native throwing getters and inherited content semantics", () => {
    for (const field of [lane.hashes[0]!, "providerVersion", lane.identifiers[0]!, "metricIds", "metricCount"]) {
      parity(lane, () => {
        const value = input(lane); Object.defineProperty(value[lane.id].candidate[0], field,
          { get() { throw new TypeError("fixture-getter:" + field); } }); return value;
      });
    }
    const result = parity(lane, () => {
      const value = input(lane); Object.setPrototypeOf(value[lane.id].candidate[0], { [lane.forbidden[0]!]: "inherited" }); return value;
    });
    expect(proofs(lane, result)[1].missingReasons).toEqual([]);
  });
});

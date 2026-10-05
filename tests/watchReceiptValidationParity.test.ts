import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import * as core from "../src/watch/liveDriftAlerts.js";
import * as bisheng from "../src/watch/bishengObservabilityLiveDrift.js";
import * as lmnr from "../src/watch/lmnrObservabilityLiveDrift.js";
import * as openCompass from "../src/watch/openCompassLiveDrift.js";
import * as narrow from "../src/watch/narrowTaskBroadMisalignmentLiveDrift.js";
import * as trism from "../src/watch/trismAgenticLiveDrift.js";
import * as reading from "../src/watch/agentReadingTestLiveDrift.js";
import * as memory from "../src/watch/awesomeAgentMemoryLiveDrift.js";
import * as hashes from "../src/utils/hash.js";
import * as json from "../src/utils/json.js";
import * as refs from "../src/watch/evidenceRefs.js";
import * as math from "../src/watch/driftMath.js";
import * as proofStats from "../src/watch/proofStats.js";
import type { LiveDriftReceipt, RunLiveScoreBehaviorDriftInput } from "../src/watch/liveDriftTypes.js";

const archive = "unused-code/2026-10-02-native/watch-receipts";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const restoration = JSON.parse(read(`${archive}/restoration.json`)) as {
  files: Array<{ originalPath: string; archivePath?: string; sha256?: string }>;
};
type Module = Record<string, unknown>;
type Row = Record<string, unknown>;
type Input = { agentId: string; metadataProof?: Row; baselineWindow: { rows: Row[] }; liveWindow: { rows: Row[] }; now: Date };
function invoke(fn: unknown, ...args: unknown[]): unknown {
  if (typeof fn !== "function") throw new Error("Missing actual or full archived export");
  return Reflect.apply(fn, undefined, args);
}
function evaluate(source: string, dependencies: Module, globals: Module = {}): Module {
  const exports: Module = {};
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
  });
  expect(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
  runInNewContext(result.outputText, {
    exports, Buffer, Date, ...globals,
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected archived dependency: ${name}`);
      return dependencies[name];
    },
  }, { timeout: 10_000 });
  return exports;
}
function originalSource(name: string): string {
  const info = restoration.files.find(row => row.originalPath === `src/watch/${name}.ts`);
  if (!info?.archivePath || !info.sha256) throw new Error(`Missing full original: ${name}`);
  const source = read(info.archivePath);
  expect(createHash("sha256").update(source).digest("hex")).toBe(info.sha256);
  return source;
}
const unchangedDependencies: Module = {
  "../utils/hash.js": hashes, "../utils/json.js": json, "./evidenceRefs.js": refs,
  "./driftMath.js": math, "./proofStats.js": proofStats,
};
// The old metadata runners use the FULL old engine, not an extracted facsimile or the new engine.
const oldCore = evaluate(originalSource("liveDriftAlerts"), unchangedDependencies);
const dependencies = { ...unchangedDependencies, "./liveDriftAlerts.js": oldCore };
const corpus = ts.createSourceFile("corpus.ts", read("tests/liveDriftAlerts.test.ts"), ts.ScriptTarget.ES2022, true);
const fixtureNames = new Set(["baselineRows", "stableLiveRows", "awesomeMemoryCategories", "awesomeMemoryTasks", "agentReadingFailureModes", "agentReadingDeliveryModes"]);
const fixtures = evaluate(corpus.statements.filter(node =>
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => fixtureNames.has(d.name.getText(corpus))))
  || (ts.isFunctionDeclaration(node) && ["awesomeMemoryRow", "agentReadingTestRow"].includes(node.name?.text ?? "")),
).map(node => node.getText(corpus)).join("\n") + "\nexports.baselineRows = baselineRows; exports.liveRows = stableLiveRows; exports.memoryRow = awesomeMemoryRow; exports.readingRow = agentReadingTestRow;", {});
const windows = (baselineRows: Row[], liveRows: Row[]) => ({
  agentId: "receipt-parity-agent", now: new Date("2026-10-02T00:00:00.000Z"), sourceRefs: ["z-ref", "a-ref", "z-ref"],
  baselineWindow: { windowId: "baseline", startedAt: "2026-10-01T00:00:00Z", endedAt: "2026-10-01T01:00:00Z", rows: baselineRows },
  liveWindow: { windowId: "live", startedAt: "2026-10-02T00:00:00Z", endedAt: "2026-10-02T01:00:00Z", rows: liveRows },
});
const coreInput = windows(fixtures.baselineRows as Row[], fixtures.liveRows as Row[]);
function outcome(fn: () => unknown) {
  try { return { bytes: JSON.stringify(fn()) }; }
  catch (error) { const e = error as Error; return { error: { name: e.name, message: e.message } }; }
}
function compare(actual: unknown, original: unknown, input: Input): void {
  const expected = outcome(() => invoke(original, structuredClone(input)));
  const result = outcome(() => invoke(actual, structuredClone(input)));
  expect(result).toEqual(expected);
  if (result.bytes) expect(Buffer.from(result.bytes).equals(Buffer.from(expected.bytes!))).toBe(true);
}
function observe(fn: unknown, value: Input) {
  const accesses: string[] = [];
  const seen = new WeakMap<object, object>();
  const wrap = (item: unknown, path: string): unknown => {
    if (!item || typeof item !== "object" || item instanceof Date) return item;
    const previous = seen.get(item); if (previous) return previous;
    const proxy = new Proxy(item, {
      get(target, key, receiver) {
        accesses.push(`${path}.${String(key)}`);
        return wrap(Reflect.get(target, key, receiver), `${path}.${String(key)}`);
      },
    });
    seen.set(item, proxy); return proxy;
  };
  return { result: outcome(() => invoke(fn, wrap(structuredClone(value), "input"))), accesses };
}

const metadataDomains: Array<[string, Module]> = [
  ["bishengObservability", bisheng], ["lmnrObservability", lmnr], ["openCompass", openCompass],
  ["narrowTaskBroadMisalignment", narrow], ["trismAgentic", trism],
];
for (const [name, actual] of metadataDomains) {
  const original = evaluate(originalSource(`${name}LiveDrift`), dependencies);
  const runnerName = Object.keys(actual).find(key => key.startsWith("run") && key.endsWith("LiveDrift"))!;
  const file = ts.createSourceFile("fixtures.ts", read(`tests/${name}LiveDrift.test.ts`), ts.ScriptTarget.ES2022, true);
  const fixtures = evaluate(file.statements.filter(node => ts.isVariableStatement(node)
    || (ts.isFunctionDeclaration(node) && ["row", "run"].includes(node.name?.text ?? "")))
    .map(node => node.getText(file)).join("\n") + "\nexports.input = run();", {}, {
      ...actual, [runnerName]: (input: Input) => input,
    });
  const input = fixtures.input as Input;
  const actualRun = actual[runnerName], originalRun = original[runnerName];
  describe(`${name} whole-original receipt flow`, () => {
    test("public exports, arity, exact stable receipt and alert projections", () => {
      expect(Object.keys(actual).sort()).toEqual(Object.keys(original).sort());
      expect(Reflect.get(actualRun as object, "length")).toBe(Reflect.get(originalRun as object, "length"));
      compare(actualRun, originalRun, input);
    });
    for (const field of Object.keys(input.metadataProof!)) {
      test(`missing metadata ${field} preserves full receipt or native error`, () => {
        const value = structuredClone(input); delete value.metadataProof![field];
        compare(actualRun, originalRun, value);
      });
      test(`blank metadata ${field} keeps fail-closed alert and bytes`, () => {
        const value = structuredClone(input); value.metadataProof![field] = "";
        compare(actualRun, originalRun, value);
        const result = invoke(actualRun, value) as { receipt: LiveDriftReceipt };
        expect(result.receipt.failClosed).toBe(true);
      });
    }
    for (const field of ["evidenceRefs", "signedEvidenceRefs"] as const) {
      for (const value of [[], [" ", ""], null, "reference", [1, null], ["z", "a", "z"]]) {
        test(`${field} ${JSON.stringify(value)} retains ordered admission`, () => {
          const modified = structuredClone(input); modified.liveWindow.rows[0]![field] = value;
          compare(actualRun, originalRun, modified);
        });
      }
    }
    for (const value of [null, undefined, {}, { invalid: true }]) {
      test(`native invalid metadata ${JSON.stringify(value)}`, () => {
        compare(actualRun, originalRun, { ...input, metadataProof: value as Row });
      });
    }
    test("proof and row getter order, including missing-proof alert branch", () => {
      expect(observe(actualRun, input)).toEqual(observe(originalRun, input));
      const value = structuredClone(input); value.metadataProof!.alertReceiptHash = "";
      expect(observe(actualRun, value)).toEqual(observe(originalRun, value));
    });
  });
}

const familyDomains: Array<[string, Module, string]> = [
  ["agentReadingTestLiveDrift", reading, "readingRow"], ["awesomeAgentMemoryLiveDrift", memory, "memoryRow"],
];
for (const [name, actual, fixture] of familyDomains) {
  const original = evaluate(originalSource(name), dependencies);
  const runnerName = Object.keys(actual).find(key => key.startsWith("run"))!;
  const input = windows([0, 1, 2].map(i => invoke(fixtures[fixture], (fixtures.baselineRows as Row[])[i], i, "baseline") as Row),
    [0, 1, 2].map(i => invoke(fixtures[fixture], (fixtures.liveRows as Row[])[i], i, "live") as Row));
  describe(`${name} whole-original row and receipt flow`, () => {
    test("preserves exports and full row/receipt bytes", () => {
      expect(Object.keys(actual).sort()).toEqual(Object.keys(original).sort());
      compare(actual[runnerName], original[runnerName], input);
      expect(observe(actual[runnerName], input)).toEqual(observe(original[runnerName], input));
    });
    for (const field of Object.keys(input.liveWindow.rows[0]!)) {
      test(`missing row field ${field} retains policy and native errors`, () => {
        const modified = structuredClone(input); delete modified.liveWindow.rows[0]![field];
        compare(actual[runnerName], original[runnerName], modified);
      });
    }
  });
}

const intraFindings = JSON.parse(read(`${archive}/intra-alerts-findings.json`)) as Array<{ fragment: string }>;
const evidenceFields = [...new Set(intraFindings.flatMap(row => [...row.fragment.matchAll(/row\.(\w+)/g)].map(m => m[1]!)))];
describe("full archived core exported receipt validation", () => {
  test("retains all core public exports and stable receipt bytes", () => {
    expect(Object.keys(core).sort()).toEqual(Object.keys(oldCore).sort());
    compare(core.runLiveScoreBehaviorDrift, oldCore.runLiveScoreBehaviorDrift, coreInput);
  });
  for (const field of evidenceFields) {
    for (const value of ["fixture-proof", "", null, 1]) {
      test(`${field}=${JSON.stringify(value)} preserves signal, policy, hash and getter order`, () => {
        const input = structuredClone(coreInput); input.liveWindow.rows[0]![field] = value;
        compare(core.runLiveScoreBehaviorDrift, oldCore.runLiveScoreBehaviorDrift, input);
      });
    }
  }
  test("eager evidence getter order remains exact across all twelve families", () => {
    const input = structuredClone(coreInput);
    for (const field of evidenceFields) input.liveWindow.rows[0]![field] = "proof";
    expect(observe(core.runLiveScoreBehaviorDrift, input)).toEqual(observe(oldCore.runLiveScoreBehaviorDrift, input));
  });
  test("native invalid rows and threshold inputs retain errors", () => {
    for (const rows of [null, {}, [null], [{ ...coreInput.liveWindow.rows[0], behaviorSignature: null }]]) {
      compare(core.runLiveScoreBehaviorDrift, oldCore.runLiveScoreBehaviorDrift,
        { ...coreInput, liveWindow: { ...coreInput.liveWindow, rows: rows as Row[] } });
    }
    for (const score of [NaN, Infinity, -1, 0, 1, 2]) {
      const input = structuredClone(coreInput); input.liveWindow.rows[0]!.score0to1 = score;
      compare(core.runLiveScoreBehaviorDrift, oldCore.runLiveScoreBehaviorDrift, input);
    }
  });
  const receipt = core.runLiveScoreBehaviorDrift(coreInput as unknown as RunLiveScoreBehaviorDriftInput);
  function check(value: LiveDriftReceipt) {
    expect(outcome(() => core.verifyLiveDriftReceipt(value))).toEqual(outcome(() => invoke(oldCore.verifyLiveDriftReceipt, value)));
    expect(outcome(() => core.buildLiveDriftWatchAlerts(value))).toEqual(outcome(() => invoke(oldCore.buildLiveDriftWatchAlerts, value)));
  }
  test("valid generated receipt verifies and projects identically", () => {
    check(receipt); expect(core.verifyLiveDriftReceipt(receipt).valid).toBe(true);
  });
  test("tampered receipt hash fails", () => {
    const changed = structuredClone(receipt); changed.receiptHash = "tampered";
    check(changed); expect(core.verifyLiveDriftReceipt(changed).errors).toContain("receiptHash does not match receipt payload");
  });
  test("rehashed receipt cannot hide a row hash mismatch", () => {
    const changed = structuredClone(receipt); changed.liveRows[0]!.rowHash = "tampered";
    const { receiptHash: _hash, ...payload } = changed; changed.receiptHash = hashes.sha256Hex(json.canonicalize(payload));
    check(changed); expect(core.verifyLiveDriftReceipt(changed).errors).toContain(`rowHash mismatch for ${changed.liveRows[0]!.traceId}`);
  });
  for (const field of ["evidenceRefs", "signedEvidenceRefs"] as const) {
    test(`rehashed missing ${field} fails independently of both hashes`, () => {
      const changed = structuredClone(receipt); changed.liveRows[0]![field] = [];
      const { rowHash: _rowHash, ...row } = changed.liveRows[0]!; changed.liveRows[0]!.rowHash = hashes.sha256Hex(json.canonicalize(row));
      const { receiptHash: _hash, ...payload } = changed; changed.receiptHash = hashes.sha256Hex(json.canonicalize(payload));
      check(changed); expect(core.verifyLiveDriftReceipt(changed).errors).toContain(`row ${row.traceId} is missing ${field}`);
    });
  }
  test("rehashed failClosed state cannot contradict alerts", () => {
    const changed = structuredClone(receipt); changed.failClosed = !changed.failClosed;
    const { receiptHash: _hash, ...payload } = changed; changed.receiptHash = hashes.sha256Hex(json.canonicalize(payload));
    check(changed); expect(core.verifyLiveDriftReceipt(changed).errors).toContain("failClosed does not match alert state");
  });
});

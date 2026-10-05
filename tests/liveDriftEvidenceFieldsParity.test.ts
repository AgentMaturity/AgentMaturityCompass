import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import * as current from "../src/watch/liveDriftAlerts.js";
import * as hashes from "../src/utils/hash.js";
import * as json from "../src/utils/json.js";
import * as refs from "../src/watch/evidenceRefs.js";
import * as math from "../src/watch/driftMath.js";
import * as receipts from "../src/watch/liveDriftReceiptValidation.js";
import { withBlankEvidenceRefs } from "./helpers/liveDriftEvidence.js";
import type { LiveDriftReceipt, RunLiveScoreBehaviorDriftInput } from "../src/watch/liveDriftTypes.js";

const archive = "unused-code/2026-10-02-native/live-drift-evidence-fields";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const restoration = JSON.parse(read(`${archive}/restoration.json`)) as {
  files: Array<{ originalPath: string; archivePath?: string; sha256?: string }>;
};
const originalInfo = restoration.files.find(row => row.originalPath === "src/watch/liveDriftAlerts.ts");
if (!originalInfo?.archivePath || !originalInfo.sha256) throw new Error("Missing complete original core");
const originalSource = read(originalInfo.archivePath);
expect(createHash("sha256").update(originalSource).digest("hex")).toBe(originalInfo.sha256);
type Module = Record<string, unknown>;
type Row = Record<string, unknown>;
type Input = RunLiveScoreBehaviorDriftInput;
function invoke(fn: unknown, ...args: unknown[]): unknown {
  if (typeof fn !== "function") throw new Error("Missing full archived or actual export");
  return Reflect.apply(fn, undefined, args);
}
function evaluate(source: string, dependencies: Module, globals: Module = {}): Module {
  const exports: Module = {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
  });
  expect(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
  runInNewContext(compiled.outputText, {
    exports, Buffer, Date, ...globals,
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected archived dependency: ${name}`);
      return dependencies[name];
    },
  }, { timeout: 10_000 });
  return exports;
}
// Compile the FULL complete original module once. Its unchanged dependencies are the real modules.
const original = evaluate(originalSource, {
  "../utils/hash.js": hashes, "../utils/json.js": json, "./evidenceRefs.js": refs,
  "./driftMath.js": math, "./liveDriftReceiptValidation.js": receipts,
});
const corpus = ts.createSourceFile("fixtures.ts", read("tests/liveDriftAlerts.test.ts"), ts.ScriptTarget.ES2022, true);
const topLevelFixtures = corpus.statements.filter(node => ts.isVariableStatement(node) || ts.isFunctionDeclaration(node))
  .map(node => node.getText(corpus)).join("\n");
const domains = ["agentSecurity", "agentTesting", "adk", "ragStrategy", "ragDatasetBuilder", "llmRag", "agenticSearch",
  "agentEvalObservability", "privacyWeb", "localSystem", "ollamaMetrics", "researchGym", "osUniverse"];
const fixtureInputs = new Map<string, Input>();
// Read the existing fixture declarations and exact runner inputs; no existing assertion is changed or skipped.
function collectFixtures(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(corpus) === "test") {
    const callback = node.arguments.find(arg => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body)) {
      const statements = callback.body.statements;
      for (let index = 0; index < statements.length; index++) {
        const statement = statements[index]!;
        if (!ts.isVariableStatement(statement)) continue;
        const declaration = statement.declarationList.declarations.find(decl => decl.initializer
          && ts.isCallExpression(decl.initializer) && decl.initializer.expression.getText(corpus) === "runLiveScoreBehaviorDrift");
        if (!declaration?.initializer || !ts.isCallExpression(declaration.initializer)) continue;
        const text = statements.slice(0, index).map(item => item.getText(corpus)).join("\n");
        for (const domain of domains) {
          if (fixtureInputs.has(domain) || !text.includes(domain)) continue;
          const fixtures = evaluate(`${topLevelFixtures}\n${text}\nexports.input = ${declaration.initializer.arguments[0]!.getText(corpus)};`, {}, { withBlankEvidenceRefs });
          const input = fixtures.input as Input;
          if (![...input.baselineWindow.rows, ...input.liveWindow.rows].some(row => Object.keys(row).some(key => key.startsWith(domain)))) continue;
          fixtureInputs.set(domain, input);
        }
        break;
      }
    }
  }
  ts.forEachChild(node, collectFixtures);
}
collectFixtures(corpus);
for (const domain of domains) if (!fixtureInputs.has(domain)) throw new Error(`Missing actual existing fixture: ${domain}`);
function outcome(fn: () => unknown) {
  try { return { bytes: JSON.stringify(fn()) }; }
  catch (error) { const e = error as Error; return { error: { name: e.name, message: e.message } }; }
}
function compareOutcomes(actual: ReturnType<typeof outcome>, expected: ReturnType<typeof outcome>): void {
  expect(actual.error).toEqual(expected.error);
  expect(actual.bytes === undefined).toBe(expected.bytes === undefined);
  if (actual.bytes !== undefined && expected.bytes !== undefined) {
    expect(Buffer.from(actual.bytes).equals(Buffer.from(expected.bytes))).toBe(true);
  }
}
function compare(input: Input): void {
  compareOutcomes(outcome(() => current.runLiveScoreBehaviorDrift(structuredClone(input))),
    outcome(() => invoke(original.runLiveScoreBehaviorDrift, structuredClone(input))));
}
function observe(fn: unknown, input: Input, throwOn?: string) {
  const accesses: string[] = [];
  const seen = new WeakMap<object, object>();
  const wrap = (item: unknown, path: string): unknown => {
    if (!item || typeof item !== "object" || item instanceof Date) return item;
    const cached = seen.get(item); if (cached) return cached;
    const proxy = new Proxy(item, {
      get(target, key, receiver) {
        const access = `${path}.${String(key)}`; accesses.push(access);
        if (access === throwOn) throw new TypeError(`getter refused ${access}`);
        return wrap(Reflect.get(target, key, receiver), access);
      },
    });
    seen.set(item, proxy); return proxy;
  };
  return { result: outcome(() => invoke(fn, wrap(structuredClone(input), "input"))), accesses };
}
function compareGetters(input: Input, throwOn?: string): void {
  const actual = observe(current.runLiveScoreBehaviorDrift, input, throwOn);
  const expected = observe(original.runLiveScoreBehaviorDrift, input, throwOn);
  compareOutcomes(actual.result, expected.result); expect(actual.accesses).toEqual(expected.accesses);
}
for (const [domain, fixture] of fixtureInputs) {
  // Both RAG families also carry shared ragSource/ragIndex/ragPdf fields outside their family label.
  const fieldPrefix = domain === "ragStrategy" || domain === "ragDatasetBuilder" ? "rag" : domain;
  const fields = [...new Set([...fixture.baselineWindow.rows, ...fixture.liveWindow.rows]
    .flatMap(row => Object.keys(row).filter(key => key.startsWith(fieldPrefix))))];
  describe(`${domain} complete original exported receipt flow`, () => {
    test("stable fixture preserves full receipt bytes, hashes and alert order", () => compare(fixture));
    test("all eager row and array getter reads retain their exact order", () => compareGetters(fixture));
    for (const field of fields) {
      for (const value of [undefined, "", null, 1]) {
        test(`${field}=${String(value)} preserves admission, policy, bytes and native errors`, () => {
          const input = structuredClone(fixture);
          const row = input.liveWindow.rows[0] as unknown as Row;
          if (value === undefined) delete row[field]; else row[field] = value;
          compare(input);
        });
      }
      test(`${field} throwing getter preserves exact eager order and native error`, () =>
        compareGetters(fixture, `input.liveWindow.rows.0.${field}`));
    }
    test("completely absent domain retains the evidence guard", () => {
      const input = structuredClone(fixture);
      for (const row of [...input.baselineWindow.rows, ...input.liveWindow.rows]) {
        for (const field of fields) delete (row as unknown as Row)[field];
      }
      compare(input); compareGetters(input);
    });
    test("one field triggers signal without inventing complete proof", () => {
      const input = structuredClone(fixture);
      for (const row of [...input.baselineWindow.rows, ...input.liveWindow.rows]) {
        for (const field of fields.slice(1)) delete (row as unknown as Row)[field];
      }
      compare(input); compareGetters(input);
    });
  });
}
const policyVariants: Array<[string, string, unknown[]]> = [
  ["adk", "adkExecutionMode", ["live_stream", "api_server", "run", "custom", "unknown"]],
  ["ragDatasetBuilder", "ragBuilderStage", ["preprocess_pdf", "postprocess_medium", "generate_basic", "custom", "unknown"]],
  ["privacyWeb", "privacyWebObservationMode", ["image_som", "html", "text", "custom", "unknown"]],
  ["researchGym", "researchGymRuntime", ["docker", "conda", "custom", "unknown"]],
  ["osUniverse", "osUniverseRuntime", ["docker", "local", "custom", "unknown"]],
];
for (const [domain, field, values] of policyVariants) {
  for (const value of values) {
    test(`${domain} ${field}=${String(value)} keeps conditional evidence, eager reads and native errors`, () => {
      const input = structuredClone(fixtureInputs.get(domain)!);
      (input.liveWindow.rows[0] as unknown as Row)[field] = value;
      compare(input); compareGetters(input);
    });
  }
}
const stable = fixtureInputs.get("agentSecurity")!;
describe("supported core contract and actual protection boundaries", () => {
  test("retains all public exports, function arities and every default threshold", () => {
    expect(Object.keys(current).sort()).toEqual(Object.keys(original).sort());
    for (const key of Object.keys(current)) {
      const actual = Reflect.get(current, key), previous = original[key];
      if (typeof actual === "function") expect(actual.length).toBe(Reflect.get(previous as object, "length"));
      else expect(JSON.stringify(actual)).toBe(JSON.stringify(previous));
    }
  });
  for (const field of ["evidenceRefs", "signedEvidenceRefs"] as const) {
    for (const value of [[], ["", " "], null, "ref", [1, null, {}], ["z", "a", "z"]]) {
      test(`signed reference admission ${field}=${JSON.stringify(value)}`, () => {
        const input = structuredClone(stable); (input.liveWindow.rows[0] as unknown as Row)[field] = value;
        compare(input);
        if (!(Array.isArray(value) && value.some(item => typeof item === "string" && item.trim()))) {
          // The unsigned-reference alert is receipt-wide; exercise its real all-rows-empty trigger.
          for (const row of [...input.baselineWindow.rows, ...input.liveWindow.rows]) {
            (row as unknown as Row)[field] = value;
          }
          compare(input);
          const receipt = current.runLiveScoreBehaviorDrift(input);
          expect(receipt.failClosed).toBe(true);
          expect(receipt.alerts.map(alert => alert.metricId)).toContain(field);
        }
      });
    }
  }
  test("native invalid input rows and thresholds match the complete original", () => {
    for (const rows of [null, {}, [null], [1]]) {
      const input = structuredClone(stable); input.liveWindow.rows = rows as Input["liveWindow"]["rows"]; compare(input);
    }
    for (const thresholds of [null, {}, { minBaselineRows: NaN }, { minLiveRows: Infinity }]) {
      compare({ ...stable, thresholds: thresholds as Input["thresholds"] });
    }
  });
  const receipt = current.runLiveScoreBehaviorDrift(stable);
  function check(value: LiveDriftReceipt) {
    compareOutcomes(outcome(() => current.verifyLiveDriftReceipt(value)), outcome(() => invoke(original.verifyLiveDriftReceipt, value)));
    compareOutcomes(outcome(() => current.buildLiveDriftWatchAlerts(value)), outcome(() => invoke(original.buildLiveDriftWatchAlerts, value)));
  }
  function rehash(value: LiveDriftReceipt) {
    const { receiptHash: _hash, ...payload } = value; value.receiptHash = hashes.sha256Hex(json.canonicalize(payload));
  }
  test("full generated receipt and Watch alert projection verify identically", () => {
    check(receipt); expect(current.verifyLiveDriftReceipt(receipt).valid).toBe(true);
  });
  test("receipt hash mismatch fails", () => {
    const value = structuredClone(receipt); value.receiptHash = "tampered"; check(value);
    expect(current.verifyLiveDriftReceipt(value).errors).toContain("receiptHash does not match receipt payload");
  });
  test("row hash mismatch fails after exact receipt rehash", () => {
    const value = structuredClone(receipt); value.liveRows[0]!.rowHash = "tampered"; rehash(value); check(value);
    expect(current.verifyLiveDriftReceipt(value).errors).toContain(`rowHash mismatch for ${value.liveRows[0]!.traceId}`);
  });
  for (const field of ["evidenceRefs", "signedEvidenceRefs"] as const) {
    test(`missing ${field} fails after both exact rehashes`, () => {
      const value = structuredClone(receipt); value.liveRows[0]![field] = [];
      const { rowHash: _hash, ...row } = value.liveRows[0]!; value.liveRows[0]!.rowHash = hashes.sha256Hex(json.canonicalize(row));
      rehash(value); check(value);
      expect(current.verifyLiveDriftReceipt(value).errors).toContain(`row ${row.traceId} is missing ${field}`);
    });
  }
  test("failClosed cannot contradict alerts after exact receipt rehash", () => {
    const value = structuredClone(receipt); value.failClosed = !value.failClosed; rehash(value); check(value);
    expect(current.verifyLiveDriftReceipt(value).errors).toContain("failClosed does not match alert state");
  });
});

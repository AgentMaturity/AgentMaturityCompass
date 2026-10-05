import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import * as bisheng from "../src/watch/bishengObservabilityLiveDrift.js";
import * as lmnr from "../src/watch/lmnrObservabilityLiveDrift.js";
import * as narrow from "../src/watch/narrowTaskBroadMisalignmentLiveDrift.js";
import * as openCompass from "../src/watch/openCompassLiveDrift.js";
import * as trism from "../src/watch/trismAgenticLiveDrift.js";
import * as hashes from "../src/utils/hash.js";
import * as json from "../src/utils/json.js";
import * as references from "../src/watch/evidenceRefs.js";
import * as drift from "../src/watch/liveDriftAlerts.js";
import { collectLiveDriftProofStats } from "../src/watch/proofStats.js";
import { restoreWatchReceiptSharing } from "./helpers/restoreWatchReceiptSharing.js";

const archive = "unused-code/2026-10-01-main/live-drift-proof-stats";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const restoration = JSON.parse(read(`${archive}/restoration.json`)) as {
  files: Array<{ originalPath: string; archivePath: string; sha256: string }>;
};
const domains: Array<[string, Record<string, unknown>]> = [
  ["bishengObservability", bisheng], ["lmnrObservability", lmnr],
  ["narrowTaskBroadMisalignment", narrow], ["openCompass", openCompass], ["trismAgentic", trism],
];
type Proof = Record<string, unknown>;
type Row = Proof & { traceId: string; evidenceRefs?: readonly unknown[] | null; signedEvidenceRefs?: readonly unknown[] | null };
type Input = { metadataProof: Proof; baselineWindow: { rows: Row[] }; liveWindow: { rows: Row[] }; now: Date };
function invoke(fn: unknown, ...args: unknown[]): unknown {
  if (typeof fn !== "function") throw new Error("Missing original or actual public function");
  return Reflect.apply(fn, undefined, args);
}
function evaluated(source: string, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  expect(result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const dependencies: Record<string, unknown> = {
    "../utils/hash.js": hashes, "../utils/json.js": json,
    "./evidenceRefs.js": references, "./liveDriftAlerts.js": drift,
  };
  runInNewContext(result.outputText, {
    exports, Buffer, Date, ...globals,
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected archived import: ${name}`);
      return dependencies[name];
    },
  }, { timeout: 1_000 });
  return exports;
}
function unchangedDeclarations(source: string) {
  const file = ts.createSourceFile("drift.ts", source, ts.ScriptTarget.ES2022, true);
  return file.statements
    .filter(node => !(ts.isFunctionDeclaration(node) && ["proofStats", "isPresent"].includes(node.name?.text ?? "")))
    .filter(node => !(ts.isImportDeclaration(node) && node.moduleSpecifier.getText(file).includes("./proofStats.js")))
    .map(node => node.getText(file).replace("  hasNonBlankEvidenceRef,\n", "")).join("\n");
}
function outcome(fn: () => unknown) {
  try { return { result: JSON.stringify(fn()) }; }
  catch (error) { const e = error as Error; return { error: { name: e.name, message: e.message } }; }
}

for (const [name, actualModule] of domains) {
  const sourcePath = `src/watch/${name}LiveDrift.ts`;
  const originalInfo = restoration.files.find(row => row.originalPath === sourcePath);
  if (!originalInfo) throw new Error(`Missing archived source: ${sourcePath}`);
  const source = read(originalInfo.archivePath);
  if (createHash("sha256").update(source).digest("hex") !== originalInfo.sha256) throw new Error(`Original changed: ${sourcePath}`);
  const original = evaluated(source + `
exports.privateProofStats = proofStats;
exports.metadataMismatchReasons = metadataMismatchReasons;
exports.metadataFields = REQUIRED_METADATA_PROOF_FIELDS;
exports.rowFields = REQUIRED_ROW_PROOF_FIELDS;
`);
  const runName = Object.keys(actualModule).find(key => key.startsWith("run") && key.endsWith("LiveDrift"));
  if (!runName) throw new Error(`Missing actual public runner: ${name}`);
  // Use the existing, explicitly metadata-only test corpus; no vendor is contacted.
  const corpus = ts.createSourceFile("fixtures.ts", read(`tests/${name}LiveDrift.test.ts`), ts.ScriptTarget.ES2022, true);
  const statements = corpus.statements.filter(node => ts.isVariableStatement(node)
    || (ts.isFunctionDeclaration(node) && ["row", "run"].includes(node.name?.text ?? "")));
  const fixtures = evaluated(statements.map(node => node.getText(corpus)).join("\n") + "\nexports.input = run();", {
    ...actualModule, [runName]: (input: Input) => input,
  });
  const input = fixtures.input as Input;
  const metadataFields = original.metadataFields as string[], rowFields = original.rowFields as string[];
  const realRun = actualModule[runName], oldRun = original[runName];
  const compare = (value: Input) => {
    const expected = outcome(() => invoke(oldRun, structuredClone(value)));
    const actual = outcome(() => invoke(realRun, structuredClone(value)));
    expect(actual).toEqual(expected);
    if (actual.result) expect(Buffer.from(actual.result, "utf8").equals(Buffer.from(expected.result!, "utf8"))).toBe(true);
  };
  const currentStats = (proof: Proof, rows: Row[]) => collectLiveDriftProofStats(
    proof, rows, metadataFields, rowFields,
    value => invoke(original.metadataMismatchReasons, value) as string[],
  );
  describe(`${name} actual public and archived proof accounting parity`, () => {
    test("preserves every other declaration, mismatch policy, row hash and public API", () => {
      expect(unchangedDeclarations(restoreWatchReceiptSharing(sourcePath, read(sourcePath)))).toBe(unchangedDeclarations(source));
      expect(Reflect.get(realRun as object, "length")).toBe(Reflect.get(oldRun as object, "length"));
      expect(Object.keys(actualModule).sort()).toEqual(Object.keys(original)
        .filter(key => !["privateProofStats", "metadataMismatchReasons", "metadataFields", "rowFields"].includes(key)).sort());
    });
    test("preserves full stable public receipts and empty-row accounting", () => {
      compare(input);
      expect(currentStats(input.metadataProof, [])).toEqual(invoke(original.privateProofStats, input.metadataProof, []));
    });
    for (const field of metadataFields) {
      test(`missing metadata ${field} preserves its refusal and receipt bytes`, () => {
        const value = structuredClone(input); value.metadataProof[field] = "";
        compare(value);
        const result = invoke(realRun, value) as { receipt: { failClosed: boolean }; missingReasons: string[] };
        expect(result.receipt.failClosed).toBe(true);
        expect(result.missingReasons).toContain(field);
      });
    }
    for (const field of rowFields) {
      test(`missing row ${field} preserves its refusal and receipt bytes`, () => {
        const value = structuredClone(input); const row = value.liveWindow.rows[0]!; row[field] = "";
        compare(value);
        const result = invoke(realRun, value) as { receipt: { failClosed: boolean }; missingReasons: string[] };
        expect(result.receipt.failClosed).toBe(true);
        expect(result.missingReasons).toContain(`${row.traceId}.${field}`);
      });
    }
    const referenceCases: Array<[string, unknown, boolean]> = [
      ["empty", [], false], ["blank", [" ", ""], false], ["null", null, false],
      ["non-string", [null, 1, {}], false], ["scalar", "reference", false],
      ["mixed valid", [null, " reference ", ""], true], ["valid", ["reference"], true],
    ];
    for (const field of ["evidenceRefs", "signedEvidenceRefs"] as const) {
      for (const [label, refs, present] of referenceCases) {
        test(`${field} ${label} preserves reference accounting and public receipt`, () => {
          const value = structuredClone(input); const row = value.liveWindow.rows[0]!;
          // Deliberately include malformed runtime inputs outside the declared API.
          row[field] = refs as readonly unknown[] | null | undefined;
          compare(value);
          const stats = currentStats(value.metadataProof, [...value.baselineWindow.rows, ...value.liveWindow.rows]);
          expect(stats.missingReasons.includes(`${row.traceId}.${field}`)).toBe(!present);
        });
      }
    }
    const hashField = metadataFields.find(field => field.endsWith("Hash"))!;
    for (const [label, value] of [
      ["null", null], ["undefined", undefined], ["false", false], ["true", true],
      ["zero", 0], ["negative", -1], ["NaN", NaN], ["Infinity", Infinity],
      ["empty array", []], ["nonempty array", [null]], ["object", {}],
      ["empty string", ""], ["blank string", " "], ["nonempty string", "fixture"],
    ] as const) {
      test(`private ${label} presence preserves exact counters and ordered reasons`, () => {
        const proof = { ...input.metadataProof, [hashField]: value };
        const rows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
        expect(currentStats(proof, rows)).toEqual(invoke(original.privateProofStats, proof, rows));
      });
    }
    test("preserves property access and mismatch callback order", () => {
      const observe = (old: boolean) => {
        const accesses: string[] = [];
        const proof = new Proxy({ ...input.metadataProof, [hashField]: "" }, {
          get: (target, key, receiver) => { accesses.push(`metadata:${String(key)}`); return Reflect.get(target, key, receiver); },
        });
        const row = new Proxy({ ...input.liveWindow.rows[0]!, evidenceRefs: [], signedEvidenceRefs: [] }, {
          get: (target, key, receiver) => { accesses.push(`row:${String(key)}`); return Reflect.get(target, key, receiver); },
        });
        const result = old ? invoke(original.privateProofStats, proof, [row]) : currentStats(proof, [row]);
        return { result: JSON.stringify(result), accesses };
      };
      expect(observe(false)).toEqual(observe(true));
    });
  });
}

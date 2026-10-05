import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import * as capabilityGovernance from "../src/score/capabilityGovernance.js";
import * as factSimulationBoundary from "../src/score/factSimulationBoundary.js";
import * as forecastLegitimacy from "../src/score/forecastLegitimacy.js";
import * as organizationalSafetyPosture from "../src/score/organizationalSafetyPosture.js";
import * as oversightIntegrity from "../src/score/oversightIntegrity.js";
import * as processDeceptionDetection from "../src/score/processDeceptionDetection.js";
import * as scenarioProvenance from "../src/score/scenarioProvenance.js";
import * as simulationValidity from "../src/score/simulationValidity.js";
import * as syntheticIdentityGovernance from "../src/score/syntheticIdentityGovernance.js";
import { scoreResponse, scoreToLevel } from "../src/score/diagnosticResponseScoring.js";

const archive = "unused-code/2026-10-01-main/diagnostic-response-scoring";
const modules = [
  ["capabilityGovernance", "scoreCapabilityGovernance", "f4da47bfdb5c9e044b969e7df4c9191806e79e48413a0c7f2ef9dbe6b0a71002"],
  ["factSimulationBoundary", "scoreFactSimulationBoundary", "c4fb0f035bc3f64f77167fb426a970fe80783b6bdd034163eaddb17190f5c013"],
  ["forecastLegitimacy", "scoreForecastLegitimacy", "8612bdba60342659b35528824f0299dfe1fcee3afed38568fb71148a8a172952"],
  ["organizationalSafetyPosture", "scoreOrganizationalSafetyPosture", "176e38db85b0ef4de556b771c8c6a8868f8a971705eed51e02d158102f9ae53c"],
  ["oversightIntegrity", "scoreOversightIntegrity", "cfebc9f7924dd2dfd6f27a6f3d8a2b8bdb002df42871b906ee09c8fdb42c9f23"],
  ["processDeceptionDetection", "scoreProcessDeceptionDetection", "dbb7ca4dda35ce148d7c4ab9e820a3785211ab0e20145c143f880926f4a29ab5"],
  ["scenarioProvenance", "scoreScenarioProvenance", "bedb1fa5b65a899787b92344c561876dab9e168595c5dd82ac67714763094677"],
  ["simulationValidity", "scoreSimulationValidity", "1d08fafbde3db270bb270b75ec36f01149fd8f07e6d209d63b5ee2eaf253a5ad"],
  ["syntheticIdentityGovernance", "scoreSyntheticIdentityGovernance", "a8a3fff4915b0f36482e88ae8b0010ebd5677dbd6b3fffd4fd6912ac2afde59f"],
] as const;
type Calculation = (...args: unknown[]) => unknown;
const implementations: Record<string, Record<string, unknown>> = {
  capabilityGovernance, factSimulationBoundary, forecastLegitimacy,
  organizationalSafetyPosture, oversightIntegrity, processDeceptionDetection,
  scenarioProvenance, simulationValidity, syntheticIdentityGovernance,
};
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const helper = read("src/score/diagnosticResponseScoring.ts");

function statements(source: string) {
  const parsed = ts.createSourceFile("scorer.ts", source, ts.ScriptTarget.ES2022, true);
  return { parsed, nodes: parsed.statements };
}

// Run the actual archived/current declarations. Infrastructure scanners remain
// declared but are never invoked; the VM has no require, process, or filesystem.
function load(source: string, current: boolean, forecast: boolean): Record<string, Calculation> {
  const { parsed, nodes } = statements(source);
  const importsRemoved = nodes.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(parsed)).join("\n");
  const shared = current ? statements(helper).nodes
    .filter(node => ts.isFunctionDeclaration(node) && (!forecast || node.name?.text === "scoreToLevel"))
    .map(node => node.getText()).join("\n") : "";
  const text = shared + "\n" + importsRemoved
    + "\nexports.privateResponse = scoreResponse; exports.privateLevel = scoreToLevel;";
  const compiled = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  expect(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports: Record<string, Calculation> = {};
  runInNewContext(compiled.outputText, { exports }, { timeout: 1_000 });
  return exports;
}

function untouched(source: string, forecast: boolean): string {
  const { parsed, nodes } = statements(source);
  return nodes.filter(node => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.getText(parsed).includes("diagnosticResponseScoring.js")) return false;
    if (ts.isFunctionDeclaration(node)) {
      if (node.name?.text === "scoreToLevel") return false;
      if (!forecast && node.name?.text === "scoreResponse") return false;
    }
    return true;
  }).map(node => node.getText(parsed)).join("\n");
}

function outcome(fn: Calculation, ...args: unknown[]) {
  try { return { value: JSON.stringify(fn(...args)) }; }
  catch (error) { const failure = error as Error; return { name: failure.name, message: failure.message }; }
}

const responses: Array<{ name: string; value: string }> = [
  { name: "empty", value: "" },
  { name: "whitespace", value: " \t\n ".repeat(10) },
  { name: "nineteen characters", value: "a".repeat(19) },
  { name: "twenty characters", value: "a".repeat(20) },
  { name: "required match", value: "Required safeguards and monitoring evidence documented." },
  { name: "bonus match", value: "Bonus safeguards and calibration documented for review." },
  { name: "single evidence reference", value: "Evidence for safeguards: [ev:one]" },
  { name: "duplicate evidence references", value: "Evidence for safeguards: [ev:one] [ev:one]" },
  { name: "malformed evidence", value: "Evidence for safeguards: [ev:] [ev:unclosed" },
  { name: "exactly two hundred", value: "\n" + "a".repeat(199) },
  { name: "structured over two hundred", value: "\n" + "a".repeat(200) },
  { name: "unstructured over two hundred", value: "a".repeat(201) },
  { name: "unicode", value: "આશા 🤖 e\u0301 evidence [ev:研究] [ev:proof]" },
  { name: "deterministic forecast penalty", value: "This will definitely happen and is guaranteed with certainty. [ev:one] [ev:two]" },
  { name: "broad substantive coverage", value: "Required bonus safeguards evidence baseline calibration provenance simulation hypothetical uncertainty consent oversight transparency monitoring governance detection deception CBRN replication controls authority statistical temporal independent evaluation safety risk management.\n[ev:one] [ev:two]" },
];
const levels = [-Infinity, -1, 0, 9.999, 10, 29.999, 30, 49.999, 50, 69.999, 70, 89.999, 90, 100, Infinity, NaN];
const criteriaCases = [
  { name: "empty criteria", make: () => ({ required: [], bonus: [] }) },
  { name: "ordinary criteria", make: () => ({ required: [/required/i, /safeguards/i], bonus: [/bonus/i] }) },
  { name: "duplicate criteria", make: () => ({ required: [/evidence/i, /evidence/i], bonus: [/documented/i, /documented/i] }) },
  { name: "stateful expressions", make: () => ({ required: [/evidence/gi, /a/y], bonus: [/safeguards/g] }) },
];

for (const [name, publicFunction, expectedHash] of modules) {
  const originalSource = read(`${archive}/originals/src/score/${name}.ts.original`);
  if (createHash("sha256").update(originalSource).digest("hex") !== expectedHash) throw new Error(`Original changed: ${name}`);
  const currentSource = read(`src/score/${name}.ts`);
  const forecast = name === "forecastLegitimacy";
  const original = load(originalSource, false, forecast);
  const current = load(currentSource, true, forecast);
  // Public report comparisons exercise the real module imports and integration
  // with the shared helpers. Only the forecast's private response declaration
  // still needs source extraction because its distinct penalty stays private.
  current[publicFunction] = implementations[name][publicFunction] as Calculation;
  current.privateLevel = scoreToLevel as Calculation;
  if (!forecast) current.privateResponse = scoreResponse as Calculation;
  const ids = [...new Set([...originalSource.matchAll(/"(AMC-[\d.]+)":/g)].map(match => match[1]))];

  describe(`diagnostic scoring parity: ${name}`, () => {
    test("preserves all criteria, public reports, exports and infrastructure functions", () => {
      expect(untouched(currentSource, forecast)).toBe(untouched(originalSource, forecast));
      expect(ids.length).toBeGreaterThan(0);
      expect(current.privateLevel.length).toBe(original.privateLevel.length);
      expect(current.privateResponse.length).toBe(original.privateResponse.length);
    });
    for (const score of levels) {
      test(`level boundary ${String(score)}`, () => {
        expect(outcome(current.privateLevel, score)).toEqual(outcome(original.privateLevel, score));
      });
    }
    for (const fixture of responses) {
      test(`complete public report: ${fixture.name}`, () => {
        const input = { responses: Object.fromEntries(ids.map(id => [id, fixture.value])) };
        expect(outcome(current[publicFunction], input)).toEqual(outcome(original[publicFunction], input));
      });
      if (!forecast) for (const criteria of criteriaCases) {
        test(`response calculation: ${fixture.name}, ${criteria.name}`, () => {
          expect(outcome(current.privateResponse, fixture.value, criteria.make()))
            .toEqual(outcome(original.privateResponse, fixture.value, criteria.make()));
        });
      }
    }
    test("complete report with missing, unknown and mixed answers", () => {
      for (const input of [{ responses: {} }, { responses: { unknown: "unused evidence" } },
        { responses: Object.fromEntries(ids.filter((_, index) => index % 2 === 0).map((id, index) => [id, responses[index % responses.length].value])) }]) {
        expect(outcome(current[publicFunction], input)).toEqual(outcome(original[publicFunction], input));
      }
    });
    test("invalid runtime inputs retain error behavior", () => {
      for (const response of [null, undefined, 42, {}, []]) {
        expect(outcome(current.privateResponse, response, { required: [], bonus: [] }))
          .toEqual(outcome(original.privateResponse, response, { required: [], bonus: [] }));
      }
    });
  });
}

describe("diagnostic infrastructure inventories retain AMC source scope", () => {
  const scanners = [
    [factSimulationBoundary.scanFactSimBoundaryInfrastructure, "src/provenance", "provenance-tagging"],
    [forecastLegitimacy.scanForecastLegitimacyInfrastructure, "src/calibration", "calibration-infra"],
    [scenarioProvenance.scanScenarioProvenanceInfrastructure, "src/provenance", "lineage-tracking"],
    [simulationValidity.scanSimulationValidityInfrastructure, "src/population", "diversity-controls"],
    [syntheticIdentityGovernance.scanSyntheticIdentityInfrastructure, "src/privacy", "privacy-protection"],
  ] as const;
  for (const [scan, control, evidence] of scanners) {
    test(`${scan.name} counts source paths only in its stated source scope`, () => {
      const root = mkdtempSync(join(tmpdir(), "amc-diagnostic-inventory-"));
      try {
        mkdirSync(join(root, control), { recursive: true });
        expect(scan(root).evidenceFound).not.toContain(evidence);
        for (const marker of ["src/score", "src/diagnostic", "src/ledger"]) mkdirSync(join(root, marker), { recursive: true });
        const inventory = scan(root);
        expect(inventory.evidenceFound).toContain(evidence);
        expect(inventory.score).toBeGreaterThan(0);
        // This is a controlled source-path inventory fixture, not an executed
        // agent task or a measurement of behavioral safety.
        if ("applicable" in inventory) expect(inventory.applicable).toBe(true);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
});

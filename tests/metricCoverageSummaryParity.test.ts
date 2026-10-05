import * as predictiveValidity from "../src/score/predictiveValidity.js";
import * as hashUtils from "../src/utils/hash.js";
import * as jsonUtils from "../src/utils/json.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { buildMetricValidationReport, type BuildMetricValidationInput } from "../src/score/metricValidity.js";

const archive = "unused-code/2026-10-01-main/metric-coverage-summaries";
const names = [
  "validationFacetSummary", "processEvidenceSummary", "safetyUtilitySummary",
  "modalityTransformationSummary", "lifecycleObservabilitySummary", "rankingStabilitySummary",
  "toolSandboxSummary", "strategicInteractionSummary", "ragPipelineSummary",
  "businessWorkflowSummary", "dataAgentAnalyticalSummary"
];
type Summary = (checks: unknown, metricId: string) => unknown;
const originalBytes = readFileSync(resolve(process.cwd(), archive, "metricValidity.ts.original"));
const expectedHash = "d5fbabc7ac33244bf5bf7a4a9f33d08c46a0d132d137ef94cd5aa876a87583e1";
if (createHash("sha256").update(originalBytes).digest("hex") !== expectedHash) {
  throw new Error("Original metric summary source changed");
}

// Execute the actual function declarations from each source. These summaries
// have no runtime dependency beyond their shared helper and standard builtins.
function loadSummaries(source: string, current: boolean): Record<string, Summary> {
  const parsed = ts.createSourceFile("metricValidity.ts", source, ts.ScriptTarget.ES2022, true);
  const required = new Set(current ? [...names, "coveredMetricSummary"] : names);
  const declarations = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && statement.name && required.has(statement.name.text));
  expect(declarations).toHaveLength(required.size);
  const text = declarations.map(statement => statement.getText(parsed)).join("\n")
    + names.map(name => `\nexports.${name} = ${name};`).join("");
  const compiled = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true
  });
  expect(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports: Record<string, Summary> = {};
  runInNewContext(compiled.outputText, { exports }, { timeout: 1_000 });
  return exports;
}

const original = loadSummaries(originalBytes.toString("utf8"), false);
const current = loadSummaries(readFileSync(resolve(process.cwd(), "src/score/metricValidity.ts"), "utf8"), true);
const cases: { name: string; checks: unknown; metric: string }[] = [
  { name: "missing evidence", checks: undefined, metric: "overall_maturity_score" },
  { name: "null evidence", checks: null, metric: "overall_maturity_score" },
  { name: "empty evidence", checks: [], metric: "overall_maturity_score" },
  { name: "unrelated metric", checks: [{ metricId: "other", covered: true, evidenceRefs: ["ev:other"] }], metric: "selected" },
  { name: "default metric", checks: [{ covered: true, evidenceRefs: ["ev:default"] }], metric: "overall_maturity_score" },
  { name: "six-decimal ratio and stable references", checks: [
    { covered: true, evidenceRefs: ["ev:first", "", "  ", " ev:spaced "] },
    { covered: false, evidenceRefs: ["ev:second", "ev:first"] },
    { covered: false, evidenceRefs: [] }
  ], metric: "overall_maturity_score" },
  { name: "explicit metric filtering", checks: [
    { metricId: "selected", covered: false, evidenceRefs: ["ev:selected"] },
    { metricId: "other", covered: true, evidenceRefs: ["ev:excluded"] },
    { covered: true, evidenceRefs: ["ev:default"] }
  ], metric: "selected" },
  { name: "empty metric remains explicit", checks: [{ metricId: "", covered: true, evidenceRefs: ["ev:empty-id"] }], metric: "" },
  { name: "malformed collection", checks: {}, metric: "overall_maturity_score" },
  { name: "malformed row", checks: [null], metric: "overall_maturity_score" },
  { name: "malformed reference", checks: [{ covered: true, evidenceRefs: [null] }], metric: "overall_maturity_score" }
];

function outcome(fn: Summary, checks: unknown, metric: string) {
  try { return { value: JSON.stringify(fn(checks, metric)) }; }
  catch (error) {
    const failure = error as Error;
    return { name: failure.name, message: failure.message };
  }
}

for (const name of names) {
  describe(`metric coverage summary parity: ${name}`, () => {
    for (const fixture of cases) {
      test(fixture.name, () => {
        expect(outcome(current[name], fixture.checks, fixture.metric))
          .toEqual(outcome(original[name], fixture.checks, fixture.metric));
      });
    }
    test("empty evidence remains unknown", () => {
      expect(JSON.parse(JSON.stringify(current[name]([], "overall_maturity_score"))))
        .toEqual({ sampleSize: 0, coverage: null, evidenceRefs: [] });
    });
    test("retains property access order", () => {
      const observed = () => {
        const accesses: string[] = [];
        const checks = [new Proxy({ metricId: "selected", covered: true, evidenceRefs: ["ev:one"] }, {
          get(target, key, receiver) {
            accesses.push(String(key));
            return Reflect.get(target, key, receiver);
          }
        })];
        return { checks, accesses };
      };
      const before = observed();
      const after = observed();
      expect(outcome(current[name], after.checks, "selected"))
        .toEqual(outcome(original[name], before.checks, "selected"));
      expect(after.accesses).toEqual(before.accesses);
    });
  });
}


type ProjectionSummary = (checks: unknown, metricId: string, thresholds: unknown, required: boolean) => unknown;
const projectionArchive = "unused-code/2026-10-01-main/metric-projections";
const projectionMap = JSON.parse(readFileSync(resolve(process.cwd(), projectionArchive, "restoration.json"), "utf8")) as {
  files: Array<{ originalPath: string; archivePath: string; sha256: string }>;
  summaries: Array<{ name: string; signalField: string; fields: string[]; outputFields: string[] }>;
};

function loadProjectionSummaries(source: string): Record<string, ProjectionSummary> {
  // Execute the full actual module, with its three unchanged runtime dependencies.
  const compiled = ts.transpileModule(source + projectionMap.summaries.map(row =>
    "\nexports." + row.name + " = " + row.name + ";").join(""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true
  });
  expect(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([]);
  const exports: Record<string, ProjectionSummary> = {};
  const dependencies: Record<string, unknown> = {
    "./predictiveValidity.js": predictiveValidity, "../utils/hash.js": hashUtils, "../utils/json.js": jsonUtils
  };
  runInNewContext(compiled.outputText, { exports, require: (name: string) => {
    if (!(name in dependencies)) throw new Error("Unexpected metric dependency: " + name);
    return dependencies[name];
  } }, { timeout: 1_000 });
  return exports;
}

const projectionOriginalRow = projectionMap.files.find(row => row.originalPath === "src/score/metricValidity.ts")!;
const projectionOriginalBytes = readFileSync(resolve(process.cwd(), projectionOriginalRow.archivePath));
if (createHash("sha256").update(projectionOriginalBytes).digest("hex") !== projectionOriginalRow.sha256) {
  throw new Error("Original metric projection source changed");
}
const projectionOriginal = loadProjectionSummaries(projectionOriginalBytes.toString("utf8"));
const projectionCurrent = loadProjectionSummaries(readFileSync(resolve(process.cwd(), "src/score/metricValidity.ts"), "utf8"));
const projectionCases = [
  { name: "absent fields", value: undefined }, { name: "null fields", value: null },
  { name: "empty fields", value: [] },
  { name: "trimmed first occurrence order", value: [" first ", "", "\t", "first", " second\u00a0", "漢字", " second "] },
  { name: "malformed null element", value: [null] }, { name: "malformed undefined element", value: [undefined] },
  { name: "malformed numeric element", value: [17] }, { name: "malformed object element", value: [{}] },
  { name: "native flatMap scalar string", value: " scalar " }
];
function projectionOutcome(fn: ProjectionSummary, checks: unknown, required = false) {
  try { return { value: JSON.stringify(fn(checks, "selected", {}, required)) }; }
  catch (error) { const failure = error as Error; return { name: failure.name, message: failure.message }; }
}
function projectionFixture(row: typeof projectionMap.summaries[number], value: unknown) {
  return { metricId: "selected", [row.signalField]: "owned-unrecognized-signal", covered: false,
    evidenceRefs: ["fixture:projection"], ...Object.fromEntries(row.fields.map(field => [field, value])) };
}
for (const row of projectionMap.summaries) {
  describe("runtime metric projection parity: " + row.name, () => {
    for (const fixture of projectionCases) {
      test(fixture.name, () => {
        const input = [projectionFixture(row, fixture.value)];
        expect(projectionOutcome(projectionCurrent[row.name], input))
          .toEqual(projectionOutcome(projectionOriginal[row.name], input));
      });
    }
    test("trimmed projection actually retains first occurrence order", () => {
      const outcome = projectionOutcome(projectionCurrent[row.name], [projectionFixture(row, projectionCases[3].value)]);
      expect("value" in outcome).toBe(true);
      const output = JSON.parse((outcome as { value: string }).value);
      for (const field of row.outputFields) expect(output[field]).toEqual(["first", "second", "漢字"]);
    });
    test("unrelated malformed row stays outside the selected metric", () => {
      const input = [{ ...projectionFixture(row, [null]), metricId: "other" }];
      expect(projectionOutcome(projectionCurrent[row.name], input)).toEqual(projectionOutcome(projectionOriginal[row.name], input));
    });
    test("retains all property accesses and their order", () => {
      const observed = () => {
        const accesses: string[] = [], input = [new Proxy(projectionFixture(row, [" a ", "a", " b "]), {
          get(target, key, receiver) { accesses.push(String(key)); return Reflect.get(target, key, receiver); }
        })];
        return { accesses, input };
      };
      const before = observed(), after = observed();
      expect(projectionOutcome(projectionCurrent[row.name], after.input)).toEqual(projectionOutcome(projectionOriginal[row.name], before.input));
      expect(after.accesses).toEqual(before.accesses);
    });
    test("malformed collection and absent inputs preserve their outcomes", () => {
      for (const input of [undefined, null, [], {}, [null]]) for (const required of [false, true]) {
        expect(projectionOutcome(projectionCurrent[row.name], input, required)).toEqual(projectionOutcome(projectionOriginal[row.name], input, required));
      }
    });
  });
}

const publicProjectionInputs: Record<string, string> = {
  mirageRagMetricSummary: "ragPipelineChecks", guardbenchMetricSummary: "guardbenchChecks",
  embodiedAgentSummary: "embodiedAgentChecks", evaluatorSuiteSummary: "evaluatorSuiteChecks",
  pentestBenchmarkSummary: "pentestBenchmarkChecks", traceEvaluationSummary: "traceEvaluationChecks",
  livingEnvironmentSummary: "livingEnvironmentChecks", mobileAgentSummary: "mobileAgentChecks",
  personaAgentSummary: "personaAgentChecks", scientificLiteratureSummary: "scientificLiteratureChecks",
  bioinformaticsAgentSummary: "bioinformaticsAgentChecks", networkTroubleshootingSummary: "networkTroubleshootingChecks",
  inferenceOptimizationSummary: "inferenceOptimizationChecks"
};
const originalPublicReport = projectionOriginal.buildMetricValidationReport as unknown as typeof buildMetricValidationReport;
function publicProjectionInput(row: typeof projectionMap.summaries[number], value: unknown, metricId = "overall_maturity_score"): BuildMetricValidationInput {
  return {
    agentId: "owned-projection-fixture", runId: "owned-projection-run", ts: Date.UTC(2026, 9, 1),
    trustLabel: "LOW TRUST", integrityIndex: 0, evidenceCoverage: 0, correlationRatio: 0,
    unsupportedClaimCount: 0, layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 0, confidenceWeightedFinalLevel: 0 }],
    questionScores: [], sourceRefs: ["fixture:public-metric-projection"], gateMode: "ci",
    // Deliberately uncovered, unrecognized signals exercise metadata projection;
    // these fixtures provide no signed evidence or behavioral measurement.
    [publicProjectionInputs[row.name]]: [
      { ...projectionFixture(row, value), metricId },
      { ...projectionFixture(row, undefined), metricId }
    ]
  };
}
function publicProjectionOutcome(build: typeof buildMetricValidationReport, input: BuildMetricValidationInput) {
  try { return { report: JSON.stringify(build(input, [])) }; }
  catch (error) { const failure = error as Error; return { name: failure.name, message: failure.message }; }
}
for (const row of projectionMap.summaries) {
  describe("public metric projection pipeline: " + row.name, () => {
    test("projects actual report metadata without admitting uncovered proof", () => {
      for (const metricId of ["overall_maturity_score", "layer:Strategic Agent Operations"]) {
        const input = publicProjectionInput(row, [" first ", "", "\t", "first", " second\u00a0", "漢字", " second "], metricId);
        const report = buildMetricValidationReport(input, []);
        expect(JSON.stringify(report)).toBe(JSON.stringify(originalPublicReport(input, [])));
        expect(report.failClosed).toBe(true);
        const selected = report.rows.find(item => item.metricId === metricId)!;
        const projected = Object.values(selected).filter(value => JSON.stringify(value) === JSON.stringify(["first", "second", "漢字"]));
        expect(projected.length).toBeGreaterThanOrEqual(row.fields.length);
      }
    });
    test("preserves absent optional metadata through the exported report", () => {
      const input = publicProjectionInput(row, undefined);
      expect(publicProjectionOutcome(buildMetricValidationReport, input)).toEqual(publicProjectionOutcome(originalPublicReport, input));
      expect(buildMetricValidationReport(input, []).failClosed).toBe(true);
    });
    test("retains native malformed metadata refusal through the exported report", () => {
      const input = publicProjectionInput(row, [null]);
      const outcome = publicProjectionOutcome(buildMetricValidationReport, input);
      expect(outcome).toEqual(publicProjectionOutcome(originalPublicReport, input));
      expect(outcome).toHaveProperty("name", "TypeError");
      expect(outcome).not.toHaveProperty("report");
    });
    test("a covered declaration without an owner remains missing proof", () => {
      const input = publicProjectionInput(row, []);
      const check = { ...projectionFixture(row, []), metricId: "overall_maturity_score", covered: true,
        [row.signalField]: "metric_owner", owner: " \t ", artifactHash: "a".repeat(64) };
      Object.assign(input, { [publicProjectionInputs[row.name]]: [check] });
      const report = buildMetricValidationReport(input, []);
      expect(JSON.stringify(report)).toBe(JSON.stringify(originalPublicReport(input, [])));
      expect(report.failClosed).toBe(true);
      expect(Object.values(report.rows[0]).some(value => Array.isArray(value) && value.includes("metric_owner"))).toBe(true);
    });
  });
}

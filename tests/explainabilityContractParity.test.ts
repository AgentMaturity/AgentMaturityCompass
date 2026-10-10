import { createHash } from "node:crypto";
import { ARCHIVED_PACKAGE_ENTRIES_SHA256, ARCHIVED_PACKAGE_MANIFEST_SHA256, packageEntriesSha256 } from "./helpers/packageEntries.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import * as currentQuestion from "../src/diagnostic/questionScoreExplainability.js";
import * as currentDrilldown from "../src/diagnostic/evidenceDrilldown.js";
import * as contracts from "../src/diagnostic/explainabilityContracts.js";
import * as realHash from "../src/utils/hash.js";
import * as realJson from "../src/utils/json.js";
import * as levelSemantics from "../src/diagnostic/levelSemantics.js";
import { buildWatchObsStudioSourceArtifactLinks } from "../src/watch/evidenceDrilldown.js";
import type { DiagnosticReport } from "../src/types.js";
import { landedBytes, landedText } from "./helpers/landedSource.js";

const archive = "unused-code/2026-10-02-native/explainability-contracts";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const originals = JSON.parse(readFileSync(resolve(archive, "originals.json"), "utf8")) as {
  files: Array<{ path: string; originalArchive: string; sha256: string }>;
  fixtureSource: { archive: string; sha256: string };
  additionalFixtureSource: { archive: string; sha256: string };
  heldReadOnly: Array<{ path: string; sha256: string }>;
};
const restoration = JSON.parse(readFileSync(resolve(archive, "restoration.json"), "utf8")) as {
  inverseEdits: Array<{ path: string; before: string; after: string }>;
  statusSites: string[];
  projections: Array<{ name: string; keys: string[] }>;
};

/**
 * Intended behaviour changes since the archive, applied to the archived source as forward edits so the parity still runs
 * every other archived byte. Each `before` occurs once in the archive and each `after` once in the live source, so an edit
 * is exactly the landed change. P1-07 follow-up (8f6665727): repairHintFor names a not-evaluated next level and its
 * reason instead of advising toward it; rowHash, manifestHash and packHash follow from that hint.
 */
const P1_07_HINT_HEAD = "function repairHintFor(question: DiagnosticQuestion, score: QuestionScore): string {\n  const nextLevel = Math.min(score.finalLevel + 1, 5);\n";
const forwardEdits = [
  { issue: "P1-07", path: "src/diagnostic/questionScoreExplainability.ts", before: 'import { sha256Hex } from "../utils/hash.js";\n',
    after: 'import { notEvaluatedLevel } from "./levelSemantics.js";\nimport { sha256Hex } from "../utils/hash.js";\n' },
  { issue: "P1-07", path: "src/diagnostic/questionScoreExplainability.ts", before: P1_07_HINT_HEAD,
    after: P1_07_HINT_HEAD + "  // P1-07: a next level AMC cannot evaluate gets its reason, not advice that would promise it.\n"
      + "  const notEvaluated = notEvaluatedLevel(question, score.finalLevel, nextLevel);\n"
      + "  if (notEvaluated) {\n    return `Target L${nextLevel}: ${notEvaluated.notice}`;\n  }\n" },
];

function originalModule<T>(file: string, applyForwardEdits = true): T {
  const row = originals.files.find(item => item.path === file)!;
  const bytes = readFileSync(resolve(row.originalArchive));
  if (hash(bytes) !== row.sha256) throw new Error("Original changed: " + file);
  let source = bytes.toString("utf8");
  for (const edit of applyForwardEdits ? forwardEdits.filter(item => item.path === file) : []) {
    if (source.split(edit.before).length !== 2) throw new Error(`${edit.issue} forward edit does not apply once to the archive: ${file}`);
    source = source.replace(edit.before, edit.after);
  }
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new Error("Original did not transpile");
  const exports = {};
  // Both original modules execute intact. Their value dependencies are the actual unchanged modules.
  const dependencies: Record<string, unknown> = { "../utils/hash.js": realHash, "../utils/json.js": realJson,
    ...(source.includes('from "./levelSemantics.js"') ? { "./levelSemantics.js": levelSemantics } : {}) };
  new Function("exports", "require", compiled.outputText)(exports, (specifier: string) => {
    if (!(specifier in dependencies)) throw new Error("Unexpected original dependency: " + specifier);
    return dependencies[specifier];
  });
  return exports as T;
}
const originalQuestion = originalModule<typeof currentQuestion>("src/diagnostic/questionScoreExplainability.ts");
const archivedQuestion = originalModule<typeof currentQuestion>("src/diagnostic/questionScoreExplainability.ts", false);
const originalDrilldown = originalModule<typeof currentDrilldown>("src/diagnostic/evidenceDrilldown.ts");
type Input = currentQuestion.BuildQuestionExplainabilityReportInput;
const fixtureBytes = readFileSync(resolve(originals.fixtureSource.archive));
if (hash(fixtureBytes) !== originals.fixtureSource.sha256) throw new Error("Original fixture source changed");
const fixtureAst = ts.createSourceFile("fixtures.ts", fixtureBytes.toString("utf8"), ts.ScriptTarget.ES2022, true);
const expressions: string[] = [];
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "buildQuestionExplainabilityReport"
    && node.arguments.length === 1 && ts.isObjectLiteralExpression(node.arguments[0])) expressions.push(node.arguments[0].getText(fixtureAst));
  ts.forEachChild(node, visit);
}
visit(fixtureAst);
const fixtureHelpers = fixtureAst.statements.filter((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && (node.name?.text === "question" || node.name?.text === "score"))
  .map(node => node.getText(fixtureAst)).join("\n");
const fixtures: Input[] = [];
for (const expression of expressions) {
  const compiled = ts.transpileModule(fixtureHelpers + "\nreturn (" + expression + ");", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  try {
    fixtures.push(new Function("getQuestionSet", "DAY_MS", compiled)(getQuestionSet, 24 * 60 * 60 * 1000) as Input);
  } catch (error) {
    // Only self-contained literal fixture calls are selected; references to test-local setup are held.
    if (!(error instanceof ReferenceError)) throw error;
  }
}
// Reuse the intact ready observability fixture from an actual paper drilldown consumer.
const obsBytes = readFileSync(resolve(originals.additionalFixtureSource.archive));
if (hash(obsBytes) !== originals.additionalFixtureSource.sha256) throw new Error("Original observability fixture changed");
const obsAst = ts.createSourceFile("obs-fixture.ts", obsBytes.toString("utf8"), ts.ScriptTarget.ES2022, true);
const obsDeclarations = obsAst.statements.filter(node => ts.isVariableStatement(node)
  || (ts.isFunctionDeclaration(node) && (node.name?.text === "hash" || node.name?.text === "obsLens")))
  .map(node => node.getText(obsAst)).join("\n");
const obsCode = ts.transpileModule(obsDeclarations + "\nreturn obsLens();", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const obsInput = structuredClone(fixtures.find(input => {
  const report = originalQuestion.buildQuestionExplainabilityReport(input);
  return report.replayable && !report.failClosed && input.rows.length === 1;
})!);
obsInput.rows[0].obsStudioDrilldownLens = [new Function("buildWatchObsStudioSourceArtifactLinks", obsCode)(buildWatchObsStudioSourceArtifactLinks)];
fixtures.push(obsInput);
const lensKeys = ["ragFlowDiagnostics", "incidentTriageLens", "benchmarkSubmissionLens", "testSuiteEvaluationLens",
  "evalAiLibraryQuestionLens", "openModelRagQuestionLens", "opikEvaluationQuestionLens", "deepEvalQuestionLens",
  "statisticalAgentTrialLens", "codeQuestQualityLens", "multiUserBenchmarkLens", "professionalTaskLens",
  "iotFirmwareQuestionLens", "retailSalesQuestionLens", "continualLearningBenchmarkLens", "hermesTurboPerformanceLens",
  "obsStudioDrilldownLens", "scorableStudioDrilldownLens"] as const;
type LensKey = typeof lensKeys[number];
const positive = new Map<LensKey, Input>();
for (const input of fixtures) {
  const report = originalQuestion.buildQuestionExplainabilityReport(input);
  if (!report.replayable || report.failClosed) continue;
  for (const key of lensKeys) if (input.rows.length === 1 && input.rows[0][key]?.length === 1) positive.set(key, input);
}
function diagnostic(questionExplainability?: ReturnType<typeof currentQuestion.buildQuestionExplainabilityReport>): DiagnosticReport {
  // Drilldown reads only these fields, as in its real report/router boundary.
  return { agentId: "parity-agent", runId: "run / ?", reportJsonSha256: "b".repeat(64), questionExplainability } as DiagnosticReport;
}
function parity(input: Input) {
  const expected = originalQuestion.buildQuestionExplainabilityReport(structuredClone(input));
  const actual = currentQuestion.buildQuestionExplainabilityReport(structuredClone(input));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  expect(JSON.stringify(currentQuestion.buildEvalScoreExplainabilityPack(actual)))
    .toBe(JSON.stringify(originalQuestion.buildEvalScoreExplainabilityPack(expected)));
  for (const row of expected.rows) {
    const report = diagnostic(expected);
    expect(JSON.stringify(currentDrilldown.buildScoreEvidenceDrilldown(report, row.questionId)))
      .toBe(JSON.stringify(originalDrilldown.buildScoreEvidenceDrilldown(report, row.questionId)));
  }
  return actual;
}

describe("explainability shared contracts retain complete original exported flows", () => {
  test("restores full original bytes and keeps public types, callers, package entries and historical guards untouched", () => {
    expect(restoration.statusSites).toHaveLength(18);
    expect(restoration.projections).toHaveLength(9);
    for (const row of originals.files.filter(item => item.path.startsWith("src/"))) {
      let restored = landedText(row.path);
      for (const edit of [...restoration.inverseEdits].reverse().filter(item => item.path === row.path)) {
        expect(restored.split(edit.after)).toHaveLength(2);
        restored = restored.replace(edit.after, edit.before);
      }
      expect(hash(restored)).toBe(row.sha256);
    }
    const immutableContracts = originals.heldReadOnly.filter(row => !row.path.startsWith("tests/")
      && !["src/api/scoreRouter.ts", "package.json"].includes(row.path));
    for (const row of immutableContracts) expect(hash(landedBytes(row.path))).toBe(row.sha256);
    expect(originals.heldReadOnly.find(row => row.path === "package.json")?.sha256).toBe(ARCHIVED_PACKAGE_MANIFEST_SHA256);
    expect(packageEntriesSha256(landedBytes("package.json"))).toBe(ARCHIVED_PACKAGE_ENTRIES_SHA256);
    expect(Object.keys(currentQuestion)).toEqual(Object.keys(originalQuestion));
    expect(Object.keys(currentDrilldown)).toEqual(Object.keys(originalDrilldown));
  });
  test("forward edits are exactly the landed intended changes and only move repair hints and the hashes over them", () => {
    for (const edit of forwardEdits) expect(readFileSync(resolve(edit.path), "utf8").split(edit.after)).toHaveLength(2);
    const leaves = (value: unknown, path = ""): Array<[string, string]> => value !== null && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`)) : [[path, JSON.stringify(value)]];
    let changedHints = 0;
    for (const input of fixtures) {
      const archived = archivedQuestion.buildQuestionExplainabilityReport(structuredClone(input));
      const edited = originalQuestion.buildQuestionExplainabilityReport(structuredClone(input));
      const before = new Map(leaves(archived)), after = leaves(edited);
      expect(after.map(([path]) => path)).toEqual([...before.keys()]);
      for (const [path, value] of after.filter(([path, value]) => before.get(path) !== value)) {
        expect(path).toMatch(/^\.rows\.\d+\.(repairHint|rowHash)$|^\.manifestHash$/);
        if (path.endsWith(".repairHint")) { changedHints++; expect(JSON.parse(value)).toMatch(/^Target L[1-5]: Not evaluated: /); }
      }
    }
    expect(changedHints).toBeGreaterThan(0);
  });
  test("rows whose next level is evaluable keep the archived repair advice byte for byte", () => {
    // Every literal fixture sits below a not-evaluated level, so lower each row to an evaluable one to run the archived advice.
    let advised = 0;
    for (const input of fixtures) for (const [index, row] of input.rows.entries()) {
      const level = [0, 1, 2, 3, 4].find(value => !levelSemantics.notEvaluatedLevel(row.question, value, value + 1));
      if (level === undefined) continue;
      const lowered = structuredClone(input);
      lowered.rows[index].score.finalLevel = level as typeof row.score.finalLevel;
      expect(parity(lowered).rows[index].repairHint).not.toContain("Not evaluated");
      advised++;
    }
    expect(advised).toBeGreaterThan(0);
  });
  test("uses existing literal report inputs and exercises every changed domain with a ready original receipt", () => {
    expect(fixtures.length).toBeGreaterThan(20);
    expect([...positive.keys()].sort()).toEqual([...lensKeys].sort());
    for (const input of fixtures) parity(input);
    console.log(JSON.stringify({ originalLiteralFixtures: fixtures.length, changedDomainsWithReadyReceipt: positive.size }));
  });
  for (const key of lensKeys) {
    test(`${key}: satisfied proof, failed proof, pending repair and missing evidence preserve bytes`, () => {
      const fixture = positive.get(key);
      expect(fixture, "Missing ready fixture: " + key).toBeDefined();
      for (const status of ["satisfied", "failed", "missing", "not_applicable"]) {
        for (const evidenceRefs of [["ev-pass"], []]) {
          const input = structuredClone(fixture!);
          Object.assign(input.rows[0][key]![0], { status, evidenceRefs, rejectedEvidenceRefs: [] });
          parity(input);
        }
      }
    });
  }
  for (const projection of restoration.projections) {
    const key = (projection.name.replace(/ProofHashes$/, "") + "Lens") as LensKey;
    test(`${projection.name}: each omitted or malformed proof retains original refusal`, () => {
      const fixture = positive.get(key);
      expect(fixture).toBeDefined();
      for (const field of projection.keys) for (const value of [null, "invalid-proof"]) {
        const input = structuredClone(fixture!);
        Object.assign(input.rows[0][key]![0], { [field]: value });
        expect(parity(input).replayable).toBe(false);
      }
    });
    test(`${projection.name}: getter order stays eager when an early hash is missing`, () => {
      const trace: string[] = [];
      const ref = Object.fromEntries(projection.keys.map((field, index) => [field, index === 0 ? null : "a".repeat(64)]));
      for (const field of projection.keys) Object.defineProperty(ref, field, { get() { trace.push(field); return field === projection.keys[0] ? null : "a".repeat(64); } });
      const fn = contracts[projection.name as keyof typeof contracts] as (ref: Record<string, unknown>) => Array<string | null>;
      expect(fn(ref)).toHaveLength(projection.keys.length);
      expect(trace).toEqual(projection.keys);
    });
  }
  test("status callback stays lazy and failed receipts remain replayable without satisfying proof", () => {
    const trace: string[] = [];
    const ref = { status: "satisfied" as const, evidenceRefs: [], rejectedEvidenceRefs: [], repairHint: "repair" };
    expect(contracts.replayableLensStatus(ref, () => { trace.push("proof"); throw new Error("unexpected proof read"); })).toBe(false);
    expect(trace).toEqual([]);
    expect(contracts.replayableLensStatus({ ...ref, status: "failed" }, () => { throw new Error("unexpected proof read"); })).toBe(true);
  });
  test("drilldown empty branches, additional professional proof and malformed paper metadata retain distinct refusals", () => {
    for (const report of [diagnostic(), diagnostic(originalQuestion.buildQuestionExplainabilityReport({ agentId: "a", runId: "r", generatedAt: "date", rows: [] }))]) {
      expect(JSON.stringify(currentDrilldown.buildScoreEvidenceDrilldown(report, "missing")))
        .toBe(JSON.stringify(originalDrilldown.buildScoreEvidenceDrilldown(report, "missing")));
    }
    for (const [key, patch] of [["professionalTaskLens", { debugTraceHash: null }], ["obsStudioDrilldownLens", { sourceKind: "paper", doi: null, openAlexWorkId: null }]] as const) {
      const report = originalQuestion.buildQuestionExplainabilityReport(structuredClone(positive.get(key)!));
      Object.assign(report.rows[0][key]![0], patch);
      const actual = currentDrilldown.buildScoreEvidenceDrilldown(diagnostic(report), report.rows[0].questionId);
      expect(JSON.stringify(actual)).toBe(JSON.stringify(originalDrilldown.buildScoreEvidenceDrilldown(diagnostic(report), report.rows[0].questionId)));
      expect(actual.failClosed).toBe(true);
    }
  });
});

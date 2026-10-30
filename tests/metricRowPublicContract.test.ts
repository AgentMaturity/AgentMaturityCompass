import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, test } from "vitest";
import { restorePrivateHelperVisibility } from "./helpers/restorePrivateHelperVisibility.js";
import { landedText } from "./helpers/landedSource.js";

const metricNames = ["MetricValidationRow", "MetricValidationEvalPackRow"] as const;
const providerNames = ["ProviderDriftComparison", "ProviderDriftEvalPackRow"] as const;
const publicNames = [...metricNames, ...providerNames];
type PropertyContract = { name: string; type: string; optional: boolean; readonly: boolean };
let original: Record<string, PropertyContract[]>;
let current: Record<string, PropertyContract[]>;

function publicContracts(relativePath: string, names: readonly string[], originalText?: string): Record<string, PropertyContract[]> {
  const root = process.cwd();
  const filename = resolve(root, relativePath);
  const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  if (originalText !== undefined) {
    host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
      resolve(path) === filename
        ? ts.createSourceFile(path, originalText, languageVersion, true)
        : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
  }
  const program = ts.createProgram([filename], options, host);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(filename);
  if (!source) throw new Error("Public type source was not loaded");
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error("Public type module was not resolved");
  const exports = checker.getExportsOfModule(moduleSymbol);
  return Object.fromEntries(names.map(name => {
    const symbol = exports.find(value => value.name === name);
    if (!symbol) throw new Error(`Missing public interface: ${name}`);
    const properties = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol)).map(property => {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (!declaration) throw new Error(`Missing property declaration: ${property.name}`);
      return {
        name: property.name,
        type: checker.typeToString(checker.getTypeOfSymbolAtLocation(property, declaration), declaration,
          ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope),
        optional: Boolean(property.flags & ts.SymbolFlags.Optional),
        readonly: ts.canHaveModifiers(declaration) && Boolean(ts.getModifiers(declaration)?.some(
          modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword))
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return [name, properties];
  }));
}

beforeAll(() => {
  original = {
    ...publicContracts("src/types.ts", metricNames, readFileSync(resolve(process.cwd(),
      "unused-code/2026-10-01-main/metric-row-types/types.ts.original"), "utf8")),
    ...publicContracts("src/benchmarks/providerDriftBenchmark.ts", providerNames, readFileSync(resolve(process.cwd(),
      "unused-code/2026-10-01-main/provider-row-types/providerDriftBenchmark.ts.original"), "utf8"))
  };
  current = {
    ...publicContracts("src/types.ts", metricNames, landedText("src/types.ts")),
    ...publicContracts("src/benchmarks/providerDriftBenchmark.ts", providerNames, landedText("src/benchmarks/providerDriftBenchmark.ts"))
  };
}, 120_000);

describe("evidence row public TypeScript contracts", () => {
  for (const name of publicNames) {
    test(`${name} retains every property, type and modifier from the original`, () => {
      expect(original[name].length).toBeGreaterThan(metricNames.includes(name as typeof metricNames[number]) ? 700 : 390);
      expect(current[name]).toEqual(original[name]);
    });
  }
});


const inputOriginalSource = readFileSync(resolve(process.cwd(),
  "unused-code/2026-10-01-main/metric-input-contracts/originals/src/score/metricValidity.ts.original"), "utf8");
const inputOriginalAst = ts.createSourceFile("metricValidity.ts", inputOriginalSource, ts.ScriptTarget.ES2022, true);
const inputNames = inputOriginalAst.statements.filter(ts.isInterfaceDeclaration)
  .map(node => node.name.text).filter(name => /^MetricValidation.*Check$/.test(name));
let inputOriginal: Record<string, PropertyContract[]>;
let inputCurrent: Record<string, PropertyContract[]>;

describe("metric validation input public TypeScript contracts", () => {
  beforeAll(() => {
    inputOriginal = publicContracts("src/score/metricValidity.ts", inputNames, inputOriginalSource);
    inputCurrent = publicContracts("src/score/metricValidity.ts", inputNames, landedText("src/score/metricValidity.ts"));
  }, 120_000);

  for (const name of inputNames) {
    test(name + " retains every input property, type and modifier from the original", () => {
      expect(inputOriginal[name].length).toBeGreaterThanOrEqual(4);
      expect(inputCurrent[name]).toEqual(inputOriginal[name]);
    });
  }

  test("all original input names remain interfaces supporting declaration merging", () => {
    expect(inputNames).toHaveLength(50);
    const currentSource = landedText("src/score/metricValidity.ts");
    const currentAst = ts.createSourceFile("metricValidity.ts", currentSource, ts.ScriptTarget.ES2022, true);
    const names = currentAst.statements.filter(ts.isInterfaceDeclaration).map(node => node.name.text);
    for (const name of inputNames) expect(names).toContain(name);
  });

  for (const file of ["src/types.ts", "src/score/metricValidity.ts"]) {
    test(file + " preserves identical emitted runtime JavaScript", () => {
      const originalSource = readFileSync(resolve(process.cwd(),
        "unused-code/2026-10-01-main/metric-input-contracts/originals/" + file + ".original"), "utf8");
      const currentSource = restorePrivateHelperVisibility(file,
        landedText(file));
      const emit = (source: string) => ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: true
      } }).outputText;
      const qualifiedSource = file === "src/score/metricValidity.ts"
        ? reverseDeclaredMetricProjectionSharing(currentSource) : currentSource;
      expect(emit(qualifiedSource)).toBe(emit(originalSource));
    });
  }
});


// Keep the original whole-module runtime freeze after reversing only the
// independently tested projection sharing declared in its restoration map.
function reverseDeclaredMetricProjectionSharing(source: string): string {
  const ast = ts.createSourceFile("metricValidity.ts", source, ts.ScriptTarget.ES2022, true);
  const helper = ast.statements.find(node => ts.isFunctionDeclaration(node)
    && node.name?.text === "uniqueProjectedMetricValues");
  if (!helper) return source;
  const map = JSON.parse(readFileSync(resolve(process.cwd(),
    "unused-code/2026-10-01-main/metric-projections/restoration.json"), "utf8")) as {
    projectionExpressions: Array<{ parentFunction: string; text: string; replacement: string }>;
  };
  const replacements = [{ start: helper.getStart(ast), end: helper.end, text: "" }];
  const seen = new Set<number>();
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "uniqueProjectedMetricValues") {
      let parent: ts.Node | undefined = node;
      while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
      if (!parent || !ts.isFunctionDeclaration(parent)) throw new Error("Projection has no owning function");
      const owner = parent.name?.text;
      const matches = map.projectionExpressions.map((row, index) => ({ row, index })).filter(({ row }) =>
        row.parentFunction === owner && row.replacement === node.getText(ast));
      if (matches.length !== 1 || seen.has(matches[0].index)) throw new Error("Uninventoried metric projection change");
      seen.add(matches[0].index);
      replacements.push({ start: node.getStart(ast), end: node.end, text: matches[0].row.text });
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  expect(seen.size).toBe(74);
  expect(seen.size).toBe(map.projectionExpressions.length);
  let restored = source;
  for (const edit of replacements.sort((a, b) => b.start - a.start)) {
    restored = restored.slice(0, edit.start) + edit.text + restored.slice(edit.end);
  }
  return restored;
}

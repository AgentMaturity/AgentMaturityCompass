import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

const map = JSON.parse(readFileSync(resolve(
  "unused-code/2026-10-02-main/metric-private-parameter-contracts/restoration.json"), "utf8")) as {
  baseCommit: string; originalPath: string; archivePath: string; originalSha256: string; currentSha256: string;
  typesReadOnly: { file: string; sha256: string };
  scope: Array<{ name: string; alias: string; propertyCount: number; bodySha256: string;
    originalDeclaration: string; parameterName: string }>;
  edits: Array<{ start: number; end: number; before: string; after: string }>;
  compiledContracts: Array<{ file: string; sha256: string }>;
};
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const originalBytes = readFileSync(resolve(map.archivePath));
if (hash(originalBytes) !== map.originalSha256) throw new Error("Complete original metric source changed");
const original = originalBytes.toString("utf8");
const current = readFileSync(resolve(map.originalPath), "utf8");
type PropertyContract = { name: string; type: string; optional: boolean; readonly: boolean };
type Contract = { properties: PropertyContract[]; parameterName: string; parameterOptional: boolean;
  parameterRest: boolean; parameterCount: number; returnType: string; public: boolean };
type Compilation = { contracts: Record<string, Contract>; errors: string[] };

// TypeChecker union ordering depends on which declaration it encounters first.
// Compare the rendered type syntax with union members sorted, keeping every
// member and alias intact rather than treating display order as a type change.
function canonicalType(type: string): string {
  const source = ts.createSourceFile("contract.ts", `type Contract = ${type};`, ts.ScriptTarget.ES2022, true);
  const declaration = source.statements[0] as ts.TypeAliasDeclaration;
  const printer = ts.createPrinter({ removeComments: true });
  const transformed = ts.transform(declaration.type, [context => node => {
    const visit: ts.Visitor = child => {
      const visited = ts.visitEachChild(child, visit, context);
      return ts.isUnionTypeNode(visited) ? ts.factory.updateUnionTypeNode(visited, ts.factory.createNodeArray([...visited.types]
        .sort((a, b) => printer.printNode(ts.EmitHint.Unspecified, a, source)
          .localeCompare(printer.printNode(ts.EmitHint.Unspecified, b, source))))) : visited;
    };
    return ts.visitNode(node, visit) as ts.TypeNode;
  }]);
  const result = printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], source);
  transformed.dispose();
  return result;
}

// Compile these assertions inside the actual module so its private function
// parameter types remain private. A widened union leaves @ts-expect-error unused.
const compilerProbes = `
type AmcStatusSampleSize = Parameters<typeof statusForRow>[0]["sampleSize"];
const amcStatusSampleSize: AmcStatusSampleSize = 1;
// @ts-expect-error sampleSize remains numeric
const amcInvalidStatusSampleSize: AmcStatusSampleSize = "1";
type AmcMirageEvaluationModes = Parameters<typeof buildRow>[0]["mirageRagMetricEvaluationModes"];
const amcValidMirageEvaluationModes: AmcMirageEvaluationModes = ["base", "oracle", "mixed", "custom"];
// @ts-expect-error unrecognized evaluation modes remain rejected
const amcInvalidMirageEvaluationModes: AmcMirageEvaluationModes = ["unrecognized"];
`;

function parameterContracts(text: string): Compilation {
  const filename = resolve(map.originalPath), root = process.cwd();
  const config = ts.readConfigFile(resolve("tsconfig.json"), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, fresh) => resolve(file) === filename
    ? ts.createSourceFile(file, text + compilerProbes, version, true) : getSource(file, version, onError, fresh);
  const program = ts.createProgram([filename], options, host), checker = program.getTypeChecker();
  const source = program.getSourceFile(filename);
  if (!source) throw new Error("Metric module not loaded by actual TypeScript compiler");
  const contracts = Object.fromEntries(map.scope.map(row => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === row.name);
    if (!fn || !ts.isFunctionDeclaration(fn)) throw new Error("Private metric function missing: " + row.name);
    const parameter = fn.parameters[0], type = checker.getTypeAtLocation(parameter);
    const properties = checker.getPropertiesOfType(type).map(property => {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (!declaration) throw new Error("Effective parameter property has no declaration: " + property.name);
      return { name: property.name,
        type: canonicalType(checker.typeToString(checker.getTypeOfSymbolAtLocation(property, parameter), parameter,
          ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)),
        optional: Boolean(property.flags & ts.SymbolFlags.Optional),
        readonly: ts.canHaveModifiers(declaration) && Boolean(ts.getModifiers(declaration)?.some(
          modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)) };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const signature = checker.getSignatureFromDeclaration(fn);
    if (!signature) throw new Error("Private metric signature missing");
    return [row.name, { properties, parameterName: parameter.name.getText(source),
      parameterOptional: Boolean(parameter.questionToken || parameter.initializer), parameterRest: Boolean(parameter.dotDotDotToken),
      parameterCount: fn.parameters.length, returnType: checker.typeToString(checker.getReturnTypeOfSignature(signature), fn,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope),
      public: Boolean(fn.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) }];
  }));
  const errors = [...program.getOptionsDiagnostics(), ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source)].filter(row => row.category === ts.DiagnosticCategory.Error)
    .map(row => `${row.code}: ${ts.flattenDiagnosticMessageText(row.messageText, "\n")}`);
  return { contracts, errors };
}
let before: Record<string, Contract>, after: Record<string, Contract>;
let originalErrors: string[], currentErrors: string[];
beforeAll(() => {
  const oldCompilation = parameterContracts(original), newCompilation = parameterContracts(current);
  before = oldCompilation.contracts; after = newCompilation.contracts;
  originalErrors = oldCompilation.errors; currentErrors = newCompilation.errors;
}, 120_000);

describe("private metric parameter effective TypeScript contracts", () => {
  it("compiler accepts the actual module and enforces numeric and narrow-union inputs", () => {
    expect(originalErrors).toEqual([]);
    expect(currentErrors).toEqual([]);
  });
  for (const row of map.scope) {
    it(row.name + " retains every effective property, type, modifier and signature", () => {
      expect(before[row.name].properties).toHaveLength(row.propertyCount);
      expect(after[row.name]).toEqual(before[row.name]);
      expect(after[row.name].public).toBe(false);
      expect(after[row.name].parameterName).toBe(row.parameterName);
      expect(after[row.name].parameterCount).toBe(1);
    });
  }
  it("retains the specific build input evaluation-mode union", () => {
    const property = after.buildRow.properties.find(row => row.name === "mirageRagMetricEvaluationModes");
    expect(property).toEqual(before.buildRow.properties.find(row => row.name === "mirageRagMetricEvaluationModes"));
    expect(property!.type).toContain('"oracle"');
    expect(property!.optional).toBe(false);
    expect(property!.readonly).toBe(false);
  });
});

it("preserves entire runtime emission and actual built public contracts", () => {
  const emit = (source: string) => ts.transpileModule(source, { fileName: map.originalPath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: true } }).outputText;
  expect(emit(current)).toBe(emit(original));
  for (const contract of map.compiledContracts) expect(hash(readFileSync(resolve(contract.file)))).toBe(contract.sha256);
  expect(hash(readFileSync(resolve(map.typesReadOnly.file)))).toBe(map.typesReadOnly.sha256);
});
it("changes only the declared private annotations and introduces no new public API", () => {
  expect(map.baseCommit).toBe("b30e1c771b89e23ecedb13604cc0bf9102078136");
  expect(map.scope.map(row => row.propertyCount)).toEqual([86, 277, 838]);
  let expected = original;
  for (const edit of [...map.edits].sort((a, b) => b.start - a.start)) {
    expect(original.slice(edit.start, edit.end)).toBe(edit.before);
    expected = expected.slice(0, edit.start) + edit.after + expected.slice(edit.end);
  }
  expect(current).toBe(expected);
  expect(hash(current)).toBe(map.currentSha256);
  const oldAst = ts.createSourceFile(map.originalPath, original, ts.ScriptTarget.ES2022, true);
  const newAst = ts.createSourceFile(map.originalPath, current, ts.ScriptTarget.ES2022, true);
  for (const row of map.scope) {
    const oldFn = oldAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === row.name) as ts.FunctionDeclaration;
    const newFn = newAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === row.name) as ts.FunctionDeclaration;
    expect(oldFn.getText(oldAst)).toBe(row.originalDeclaration);
    expect(hash(newFn.body!.getText(newAst))).toBe(row.bodySha256);
    expect(newFn.body!.getText(newAst)).toBe(oldFn.body!.getText(oldAst));
  }
  const publicSyntax = (source: ts.SourceFile) => source.statements.filter(node => ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).map(node => node.getText(source));
  expect(publicSyntax(newAst)).toEqual(publicSyntax(oldAst));
  for (const row of map.scope) {
    const alias = newAst.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === row.alias);
    expect(alias).toBeDefined();
    expect(alias && ts.canHaveModifiers(alias) && ts.getModifiers(alias)?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) || false).toBe(false);
  }
  const typesAst = ts.createSourceFile(map.typesReadOnly.file,
    readFileSync(resolve(map.typesReadOnly.file), "utf8"), ts.ScriptTarget.ES2022, true);
  const shared = typesAst.statements.find(node => ts.isInterfaceDeclaration(node)
    && node.name.text === "MetricValidationSharedFields");
  expect(shared).toBeDefined();
  expect(shared && ts.canHaveModifiers(shared) && ts.getModifiers(shared)?.some(
    modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) || false).toBe(false);
});

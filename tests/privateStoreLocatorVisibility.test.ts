import { createHash } from "node:crypto";
import { ARCHIVED_PACKAGE_ENTRIES_SHA256, ARCHIVED_PACKAGE_MANIFEST_SHA256, packageEntriesSha256 } from "./helpers/packageEntries.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { restorePrivateHelperVisibility } from "./helpers/restorePrivateHelperVisibility.js";

const prefix = "unused-code/2026-10-02-main/private-store-locators";
const map = JSON.parse(readFileSync(resolve(prefix, "restoration.json"), "utf8")) as {
  declarations: number;
  changedSourceFiles: number;
  preservedExports: Array<{ file: string; name: string; originalDeclaration: string; bodySha256: string }>;
  preservedBarrel: { file: string; sha256: string };
  packageManifestSha256: string;
  packageEntries: Array<{ name: string; file: string; sha256: string }>;
  files: Array<{ originalPath: string; archivePath: string; sha256: string;
    declarations: Array<{ name: string; start: number; end: number; token: string; originalDeclaration: string; bodySha256: string }> }>;
};
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sourceAst = (name: string, source: string) => ts.createSourceFile(name, source, ts.ScriptTarget.ES2022, true);

function compile(name: string, source: string): string {
  const result = ts.transpileModule(source, { fileName: name,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, reportDiagnostics: true });
  if (result.diagnostics?.some(row => row.category === ts.DiagnosticCategory.Error)) throw new Error("Source fragment did not transpile: " + name);
  return result.outputText;
}
function withoutPrivateExportAssignments(source: string, names: string[]): string {
  const ast = sourceAst("emitted.js", source), assignments: ts.ExpressionStatement[] = [];
  for (const node of ast.statements) {
    if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) continue;
    const expression = node.expression;
    if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isPropertyAccessExpression(expression.left)
      || !ts.isIdentifier(expression.left.expression) || expression.left.expression.text !== "exports"
      || !ts.isIdentifier(expression.right)) continue;
    const name = expression.left.name.text;
    if (names.includes(name) && expression.right.text === name) assignments.push(node);
  }
  expect(assignments.map(node => (node.expression as ts.BinaryExpression).right.getText(ast)).sort()).toEqual([...names].sort());
  let restored = source;
  for (const node of assignments.reverse()) {
    expect(source[node.end]).toBe("\n");
    restored = restored.slice(0, node.getStart(ast)) + restored.slice(node.end + 1);
  }
  return restored;
}

describe("reviewed module-private store locator visibility", () => {
  it("retains the exact finite declaration manifest and supported package entries", () => {
    expect(map.files).toHaveLength(49);
    expect(map.declarations).toBe(96);
    expect(map.changedSourceFiles).toBe(46);
    expect(map.files.filter(file => file.declarations.length)).toHaveLength(map.changedSourceFiles);
    expect(map.preservedExports).toHaveLength(4);
    expect(hash(readFileSync(resolve(map.preservedBarrel.file)))).toBe(map.preservedBarrel.sha256);
    for (const declaration of map.preservedExports) {
      const ast = sourceAst(declaration.file, readFileSync(resolve(declaration.file), "utf8"));
      const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === declaration.name);
      if (!node || !ts.isFunctionDeclaration(node)) throw new Error("Referenced barrel export missing: " + declaration.name);
      expect(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).toBe(true);
      expect(node.getText(ast)).toBe(declaration.originalDeclaration);
      expect(hash(node.body!.getText(ast))).toBe(declaration.bodySha256);
    }
    expect(map.files.reduce((sum, file) => sum + file.declarations.length, 0)).toBe(map.declarations);
    const manifest = readFileSync(resolve("package.json"));
    expect(map.packageManifestSha256).toBe(ARCHIVED_PACKAGE_MANIFEST_SHA256);
    expect(packageEntriesSha256(manifest)).toBe(ARCHIVED_PACKAGE_ENTRIES_SHA256);
    const pkg = JSON.parse(manifest.toString("utf8")) as { exports: Record<string, { types: string }> };
    expect(Object.keys(pkg.exports).sort()).toEqual(map.packageEntries.map(row => row.name).sort());
    for (const entry of map.packageEntries) {
      expect(pkg.exports[entry.name].types.replace(/^\.\/dist\//, "src/").replace(/\.d\.ts$/, ".ts")).toBe(entry.file);
      expect(hash(readFileSync(resolve(entry.file)))).toBe(entry.sha256);
    }
  });
  for (const row of map.files) {
    describe(row.originalPath, () => {
      const bytes = readFileSync(resolve(row.archivePath));
      if (hash(bytes) !== row.sha256) throw new Error("Complete source original changed: " + row.originalPath);
      const original = bytes.toString("utf8"), current = restorePrivateHelperVisibility(
        row.originalPath, readFileSync(resolve(row.originalPath), "utf8"));
      it("retains every function, parameter, body and caller while changing only the declared visibility", () => {
        let expected = original;
        for (const declaration of [...row.declarations].sort((a, b) => b.start - a.start)) {
          expect(original.slice(declaration.start, declaration.end)).toBe(declaration.token);
          expected = expected.slice(0, declaration.start) + expected.slice(declaration.end);
        }
        expect(current).toBe(expected);
        const ast = sourceAst(row.originalPath, current), functions: ts.FunctionDeclaration[] = [];
        function walk(node: ts.Node) { if (ts.isFunctionDeclaration(node)) functions.push(node); ts.forEachChild(node, walk); }
        walk(ast);
        for (const declaration of row.declarations) {
          const matches = functions.filter(node => node.name?.text === declaration.name);
          expect(matches).toHaveLength(1);
          const node = matches[0];
          expect(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false).toBe(false);
          expect(node.getText(ast)).toBe(declaration.originalDeclaration.replace(/^export /, ""));
          expect(hash(node.body!.getText(ast))).toBe(declaration.bodySha256);
        }
      });
      it("retains the entire emitted implementation except those unused export assignments", () => {
        const names = row.declarations.map(declaration => declaration.name);
        const originalJavaScript = compile(row.originalPath, original);
        const currentJavaScript = compile(row.originalPath, current);
        expect(currentJavaScript).toBe(withoutPrivateExportAssignments(originalJavaScript, names));
      });
    });
  }
});

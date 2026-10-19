import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, test } from "vitest";

/**
 * src/compliance/builtInMappings.ts is exempt from the 800-line cap only as a data registry
 * (scripts/line-budgets.json `dataRegistries`). The logic-ratio check there lets a 60-line function
 * through in a 2,700-line file, so this test pins the file to data: the two helper functions it has
 * always had, constant declarations, and nothing else that executes.
 */

const FILE = new URL("../src/compliance/builtInMappings.ts", import.meta.url);
const ALLOWED_FUNCTIONS: Record<string, number> = { mapping: 1, defaultComplianceMapsFile: 1 };

function parse(text: string): ts.SourceFile {
  return ts.createSourceFile("builtInMappings.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Function-like nodes with their statement counts, and top-level statements that are not data. */
function logicIn(source: ts.SourceFile): { functions: Array<{ name: string; statements: number }>; nonData: string[] } {
  const functions: Array<{ name: string; statements: number }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
      || ts.isGetAccessor(node) || ts.isSetAccessor(node) || ts.isConstructorDeclaration(node)) {
      const name = ts.isFunctionDeclaration(node) && node.name ? node.name.text : `<${ts.SyntaxKind[node.kind]}>`;
      const body = node.body;
      functions.push({ name, statements: body && ts.isBlock(body) ? body.statements.length : 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const nonData = source.statements
    .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isFunctionDeclaration(statement) && !ts.isVariableStatement(statement))
    .map((statement) => ts.SyntaxKind[statement.kind]);
  return { functions, nonData };
}

function violations(text: string): string[] {
  const { functions, nonData } = logicIn(parse(text));
  const found: string[] = nonData.map((kind) => `top-level ${kind}`);
  const seen: Record<string, number> = {};
  for (const fn of functions) {
    seen[fn.name] = (seen[fn.name] ?? 0) + 1;
    if (!(fn.name in ALLOWED_FUNCTIONS) || seen[fn.name]! > ALLOWED_FUNCTIONS[fn.name]!) found.push(`function ${fn.name}`);
    else if (fn.statements > 2) found.push(`function ${fn.name} has ${fn.statements} statements`);
  }
  return found;
}

describe("builtInMappings.ts stays a data registry", () => {
  const text = readFileSync(FILE, "utf8");

  test("only the two data helpers exist, each a single return", () => {
    expect(violations(text)).toEqual([]);
  });

  test("an added 60-line function fails", () => {
    const body = Array.from({ length: 58 }, (_, i) => `  if (input.length > ${i}) total += ${i};`).join("\n");
    const mutated = `${text}\nexport function scoreMappings(input: string[]): number {\n  let total = 0;\n${body}\n  return total;\n}\n`;
    expect(mutated.split("\n").length - text.split("\n").length).toBeGreaterThanOrEqual(60);
    expect(violations(mutated)).toContain("function scoreMappings");
  });

  test("logic hidden in data fails too: an arrow function, a loop, or a grown helper", () => {
    expect(violations(`${text}\nconst pick = (rows: string[]) => rows[0];\n`)).toContain("function <ArrowFunction>");
    expect(violations(`${text}\nfor (const row of []) console.log(row);\n`)).toContain("top-level ForOfStatement");
    const grown = text.replace("function mapping(params: ComplianceMapping): ComplianceMapping {\n  return params;",
      "function mapping(params: ComplianceMapping): ComplianceMapping {\n  if (!params.id) throw new Error(\"id\");\n  params.id.trim();\n  return params;");
    expect(grown).not.toBe(text);
    expect(violations(grown)).toContain("function mapping has 3 statements");
  });
});

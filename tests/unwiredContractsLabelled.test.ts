import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import * as approvalClient from "../src/runtime/approvalClient.js";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = [
  "src/runtime/approvalClient.ts",
  "src/runtime/autonomyBoundary.ts",
  "src/runtime/stateCheckpoint.ts",
  "src/runtime/degradedModeContract.ts",
  "src/vault/secretsBroker.ts",
  "src/kernel/services/jobServices.ts",
  "src/kernel/services/terminalServices.ts",
  "src/llm/providers/gatewayAdapter.ts",
  "src/ops/otelExporter.ts"
];

function dependency(file: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\.js$/, ".ts");
}

const reverseImports = new WeakMap<Map<string, string>, Map<string, string[]>>();
/** The target, every file that names it in an import, export-from, import() or require() specifier, and so on through
 * files with an export-from (the only re-exports exposes follows): a superset of the consumers and barrels
 * productionConsumers can find, read with TypeScript's import scanner so only these files get a full parse (parsing
 * and walking all of src, or every transitive importer, per contract took 20-40 s under coverage on CI). */
function importersOf(target: string, sources: Map<string, string>): Set<string> {
  let reverse = reverseImports.get(sources);
  if (!reverse) {
    reverse = new Map();
    for (const [file, text] of sources) {
      for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
        const next = dependency(file, fileName);
        reverse.set(next, [...(reverse.get(next) ?? []), file]);
      }
    }
    reverseImports.set(sources, reverse);
  }
  const reached = new Set([target]);
  for (const file of reached) {
    if (file !== target && !/\bexport\b[^;]*\bfrom\s*["'`]/.test(sources.get(file)!)) continue;
    for (const importer of reverse.get(file) ?? []) reached.add(importer);
  }
  return reached;
}

// Re-exports publish a library API; only value imports count as production use.
function productionConsumers(target: string, sources: Map<string, string>, parsed = new Map<string, ts.SourceFile>()): string[] {
  function source(file: string): ts.SourceFile {
    if (!parsed.has(file)) parsed.set(file, ts.createSourceFile(file, sources.get(file)!, ts.ScriptTarget.Latest, true));
    return parsed.get(file)!;
  }
  function exposes(file: string, name: string, seen = new Set<string>()): boolean {
    if (file === target) return true;
    const key = `${file}:${name}`;
    if (!sources.has(file) || seen.has(key)) return false;
    seen.add(key);
    return source(file).statements.some(statement => {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
      const next = dependency(file, statement.moduleSpecifier.text);
      if (!statement.exportClause) return exposes(next, name, seen);
      if (ts.isNamespaceExport(statement.exportClause)) return (name === "*" || statement.exportClause.name.text === name) && exposes(next, "*", seen);
      return statement.exportClause.elements.some(element => !element.isTypeOnly && (name === "*" || element.name.text === name) && exposes(next, (element.propertyName ?? element.name).text, seen));
    });
  }
  const candidates = importersOf(target, sources);
  return [...sources.keys()].filter(file => {
    if (file === target || !candidates.has(file)) return false;
    let used = false;
    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
        const next = dependency(file, node.moduleSpecifier.text);
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        if (!clause || (bindings && ts.isNamespaceImport(bindings))) used ||= exposes(next, "*");
        if (clause?.name) used ||= exposes(next, "default");
        if (bindings && ts.isNamedImports(bindings)) used ||= bindings.elements.some(element => !element.isTypeOnly && exposes(next, (element.propertyName ?? element.name).text));
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) {
          const next = dependency(file, argument.text);
          const value = ts.isAwaitExpression(node.parent) ? node.parent : node;
          const parent = value.parent;
          if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
            used ||= parent.name.elements.some(element => {
              const name = element.propertyName ?? element.name;
              const key = ts.isComputedPropertyName(name) ? name.expression : name;
              return exposes(next, !element.dotDotDotToken && (ts.isIdentifier(key) || ts.isStringLiteral(key)) ? key.text : "*");
            });
          } else if (ts.isPropertyAccessExpression(parent)) used ||= exposes(next, parent.name.text);
          else used ||= exposes(next, "*");
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source(file));
    return used;
  });
}

function readProductionSources(directory = "src"): Map<string, string> {
  return new Map(readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return /^(tests?|__tests__)$/.test(entry.name) ? [] : [...readProductionSources(file)];
    return /\.ts$/.test(file) && !/\.(test|spec|d)\.ts$/.test(file) ? [[file, readFileSync(resolve(root, file), "utf8")] as const] : [];
  }));
}

describe("WP46 unwired contract labels", () => {
  const sources = readProductionSources();
  const parsed = new Map<string, ts.SourceFile>();
  test.each(contracts)("%s labels match production usage", file => {
    const text = sources.get(file)!;
    const consumers = productionConsumers(file, sources, parsed);
    const header = text.match(/^\/\*\*[\s\S]*?\*\//)?.[0] ?? "";
    const labelled = /library-only, not enforced/i.test(header);
    expect({ file, consumers, labelled }).toEqual({ file, consumers, labelled: consumers.length === 0 });
    if (labelled) expect(header).toMatch(/src\/[\w/]+\.ts/);
  });

  test("WP16 job and terminal services have a real native composition consumer", () => {
    for (const file of ["src/kernel/services/jobServices.ts", "src/kernel/services/terminalServices.ts"]) {
      expect(productionConsumers(file, sources, parsed)).toContain("src/agent/nativeBackground.ts");
      expect(sources.get(file)).not.toMatch(/library-only, not enforced/i);
    }
    const composition = sources.get("src/agent/nativeBackground.ts")!;
    expect(composition).toContain("ctx.plugin(jobServices");
    expect(composition).toContain("ctx.plugin(terminalServices");
    expect(sources.get("src/agent/agentToolset.ts")).toContain("composeNativeBackground");
  });

  test("WP13 wires semantic search into native metadata discovery", () => {
    const target = "src/product/toolSemanticDocs.ts";
    expect(productionConsumers(target, sources, parsed)).toContain("src/tools/builtin/toolSearchTool.ts");
    expect(sources.get(target)).not.toMatch(/library-only, not enforced/i);
  });

  test("marker detection is named honestly and the old export remains deprecated", () => {
    const marker = (approvalClient as unknown as Record<string, unknown>).hasApprovalTokenMarker;
    expect(typeof marker).toBe("function");
    const detect = marker as (text: string) => boolean;
    expect(detect("APPROVED_BY_OWNER:abcdef")).toBe(true); // Syntax is not a signed approval.
    expect(detect("APPROVED_BY_OWNER:abc")).toBe(false);
    expect(approvalClient.hasValidApprovalToken).toBe(marker);
    expect(sources.get(contracts[0]!)).toMatch(/@deprecated[\s\S]*hasValidApprovalToken/);
    expect(sources.get(contracts[0]!)).toContain("verifyApprovalForExecution");
    expect(sources.get("src/runtime/index.ts")).toContain("hasApprovalTokenMarker");
    expect(sources.get("src/index.ts")).toContain("hasApprovalTokenMarker");
  });

  test("legacy registry and public cancellation help disclose their limits", async () => {
    expect(sources.get("src/runtimes/index.ts")).toMatch(/@deprecated[\s\S]*src\/adapters\//);
    // The CLI takes one subcommand per process, so both help processes run at once. Both took 5.7 s together, run one
    // after the other, on a CI shard under coverage; each is bounded at 50 s inside the test's 60 s.
    await Promise.all(["cancel", "resume"].map(async operation => {
      const { stdout: help } = await execFileAsync(process.execPath, [resolve(root, "dist/cli.js"), "runtime", operation, "--help"], { encoding: "utf8", timeout: 50_000 });
      expect(help).toContain("record-only");
      expect(help.replace(/\s+/g, " ")).toContain(`does not ${operation} native execution`);
    }));
  }, 60_000);

  test("the guard follows value imports through barrels and ignores type-only references", () => {
    const fixture = new Map([
      ["src/contract.ts", "export const helper = 1;"],
      ["src/barrel.ts", "export { helper as renamed } from './contract.js'; export const other = 2;"],
      ["src/outer.ts", "export * from './barrel.js';"],
      ["src/value.ts", "import { renamed } from './outer.js';"],
      ["src/dynamic.ts", "void import('./contract.js');"],
      ["src/require.ts", "require('./contract.js');"],
      ["src/namespace.ts", "import * as api from './outer.js';"],
      ["src/types.ts", "import type { helper } from './contract.js'; import { type helper as H } from './contract.js';"],
      ["src/other.ts", "import { other } from './outer.js';"],
      ["src/otherDynamic.ts", "const { other } = await import('./outer.js');"],
      ["src/valueDynamic.ts", "const { renamed: helper } = await import('./outer.js');"],
      ["src/quotedDynamic.ts", "const { 'renamed': helper } = await import('./outer.js');"],
      ["src/computedDynamic.ts", "const { ['renamed']: helper } = await import('./outer.js');"],
      ["src/lines.ts", "export {\n  helper\n} from './contract.js'"],
      ["src/viaLines.ts", "import { helper } from './lines.js';"],
      ["src/user.ts", "import { helper } from './contract.js'; export const used = helper;"],
      ["src/indirect.ts", "import { used } from './user.js';"]
    ]);
    expect(productionConsumers("src/contract.ts", fixture)).toEqual(["src/value.ts", "src/dynamic.ts", "src/require.ts", "src/namespace.ts", "src/valueDynamic.ts", "src/quotedDynamic.ts", "src/computedDynamic.ts", "src/viaLines.ts", "src/user.ts"]);
  });
});

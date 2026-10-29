/**
 * Regenerate the thirteen ADR-0025 whole-result pins after an intentional
 * live-drift contract change. Build first, then run with --check or --write.
 * Fixture declarations and callbacks come from their original tests, using the
 * same TypeScript AST/VM technique as the live-drift parity suites. No archived
 * source hashes, fixture inputs, or behavioral assertions are rewritten.
 */
import assert from "node:assert";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const mode = process.argv.slice(2);
if (mode.length > 1 || (mode.length === 1 && !["--check", "--write"].includes(mode[0]))) {
  throw new Error("Usage: node scripts/gen-live-drift-characterization.mjs [--check|--write]");
}
const files = [
  "aiReputationClaude", "darwinGodelMachine", "garage", "railScore", "paperReadSkill",
  "braintrust", "decibenchVoice", "skillMatch", "reflexionAgent", "liveDriftAlerts",
].map(name => `tests/${name}${name === "liveDriftAlerts" ? "" : "LiveDrift"}.test.ts`);
const ownDistribution = new Set(files.slice(0, 4));
const tableNames = ["Awesome Agent Memory", "Agent Reading Test", "CTF Agent Benchmark", "LLM Fighter"];
const reason = file => "Empty specialty ratios and their drift fields now serialize as null, and window EvidenceOutcome is explicit."
  + (ownDistribution.has(file) || file === "tests/liveDriftAlerts.test.ts"
    ? " The domain distribution also records EvidenceOutcome." : "");
const expect = actual => ({
  toBe: expected => assert.strictEqual(actual, expected),
  toEqual: expected => assert.deepEqual(actual, expected),
});

function evaluate(source, file) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error), []);
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, Buffer, Date,
    require: name => {
      if (name === "vitest") return { expect };
      if (name.startsWith("../src/")) {
        const sourcePath = resolve(root, "src", name.slice("../src/".length).replace(/\.js$/, ".ts"));
        const builtPath = resolve(root, "dist", name.slice("../src/".length));
        if (statSync(sourcePath).mtimeMs > statSync(builtPath).mtimeMs) {
          throw new Error(`Build first: ${sourcePath} is newer than ${builtPath}`);
        }
        return require(builtPath);
      }
      if (name === "./helpers/liveDriftEvidence.js") {
        return evaluate(readFileSync(resolve(root, "tests/helpers/liveDriftEvidence.ts"), "utf8"), file);
      }
      throw new Error(`Unexpected fixture dependency in ${file}: ${name}`);
    },
  }, { timeout: 10_000 });
  return exports;
}

const plans = files.map(file => {
  const source = readFileSync(resolve(root, file), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const pins = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "toBe" && ts.isCallExpression(node.expression.expression)) {
      const expectation = node.expression.expression;
      if (expectation.expression.getText(tree) === "expect"
        && expectation.arguments[0]?.getText(tree) === "sha256Hex(canonicalize(result))") pins.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.strictEqual(pins.length, 1, `${file}: expected exactly one whole-result assertion`);
  const pin = pins[0];
  const block = pin.parent.parent;
  assert(ts.isBlock(block) && ts.isExpressionStatement(pin.parent), `${file}: unsupported pin location`);
  const callback = block.parent;
  assert(ts.isArrowFunction(callback), `${file}: expected a fixture callback`);
  const prefix = block.statements.slice(0, block.statements.indexOf(pin.parent)).map(node => node.getText(tree)).join("\n");
  const declarations = tree.statements.filter(node => ts.isImportDeclaration(node)
    || ts.isVariableStatement(node) || ts.isFunctionDeclaration(node)).map(node => node.getText(tree)).join("\n");
  const digestExpression = pin.expression.expression.arguments[0].getText(tree);
  const argument = pin.arguments[0];
  const records = [];
  if (ts.isStringLiteral(argument)) {
    assert(/^[a-f0-9]{64}$/.test(argument.text), `${file}: invalid digest literal`);
    const output = evaluate(`${declarations}\n${prefix}\nexports.digest = ${digestExpression};`, file);
    records.push({ file, fixture: callback.parent.arguments[0].text, old: argument.text,
      new: output.digest, reason: reason(file), start: argument.getStart(tree) + 1, end: argument.end - 1 });
  } else {
    assert.strictEqual(file, "tests/liveDriftAlerts.test.ts");
    assert.strictEqual(argument.getText(tree), "resultHash");
    const table = callback.parent.expression.arguments[0];
    assert(ts.isArrayLiteralExpression(table));
    const output = evaluate(`${declarations}\nexports.entries = (${table.getText(tree)}).map(entry => {\n`
      + `const ${callback.parameters[0].name.getText(tree)} = entry;\n${prefix}\n`
      + `return { name: entry.name, digest: ${digestExpression} };\n});`, file);
    assert.deepEqual(Array.from(output.entries, entry => entry.name), tableNames);
    table.elements.forEach((entry, index) => {
      assert(ts.isObjectLiteralExpression(entry));
      const literal = entry.properties.find(property => property.name?.getText(tree) === "resultHash")?.initializer;
      assert(literal && ts.isStringLiteral(literal) && /^[a-f0-9]{64}$/.test(literal.text));
      records.push({ file, fixture: tableNames[index], old: literal.text, new: output.entries[index].digest,
        reason: reason(file), start: literal.getStart(tree) + 1, end: literal.end - 1 });
    });
  }
  for (const record of records) assert(/^[a-f0-9]{64}$/.test(record.new), `${file}: generator did not capture a digest`);
  let updated = source;
  for (const record of [...records].sort((left, right) => right.start - left.start)) {
    updated = updated.slice(0, record.start) + record.new + updated.slice(record.end);
  }
  return { file, source, updated, records };
});

if (mode[0] === "--write") {
  for (const plan of plans) if (plan.source !== plan.updated) writeFileSync(resolve(root, plan.file), plan.updated);
}
console.log(JSON.stringify(plans.flatMap(plan => plan.records.map(({ start: _start, end: _end, ...record }) => record)), null, 2));
if (mode[0] !== "--write" && plans.some(plan => plan.source !== plan.updated)) process.exitCode = 1;

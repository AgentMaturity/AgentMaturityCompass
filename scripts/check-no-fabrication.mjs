#!/usr/bin/env node
// P0-16: proves no fabricated-score path remains in src/ (contract truth rules 1 and 4).
// Sibling of scripts/lint-contract.mjs: oxlint has no rule for these patterns, so this
// script parses src/ with the TypeScript compiler API and checks four rules:
//   R1 random value in a guarded root, R2 fabricated-result identifier,
//   R3 path-presence scoring, R4 certification wording in output text.
// Usage: node scripts/check-no-fabrication.mjs [--root <dir>] [--json] [--strict]
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const RULES = ["R1", "R2", "R3", "R4"];
const GUARDED_ROOTS = ["score", "domains", "assurance", "shield", "compliance", "diagnostic", "claims", "exports"]
  .map((dir) => `src/${dir}/`);
const MARKER = /\/\/\s*amc-allow-random:\s*(id|fuzz-input)\b/;
const RANDOM_CALLEE = /^(Math\.random|randomInt|(\w+\.)*crypto\.(randomInt|getRandomValues))$/;
const FABRICATED_NAME = [/^pseudoRandom/i, /^(fake|mock|canned|synthetic)(Score|Level|Result|Verdict|Response)/i];
const EXAMPLE_MODE = "src/claims/eligibility/exampleMode.ts";
const CERTIFICATION_WORDING = /\bcertified\b|\bcertification\s+read(y|iness)\b/i;
const ISSUE_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = resolve(rootIndex >= 0 ? args[rootIndex + 1] ?? "" : process.cwd());

function exitWith(message) {
  console.error(`check-no-fabrication: ${message}`);
  process.exit(2);
}

let ts;
try {
  ts = createRequire(import.meta.url)("typescript");
} catch (error) {
  exitWith(`cannot load the TypeScript compiler API (${error.message}); run pnpm install`);
}

let allowlist;
try {
  allowlist = JSON.parse(readFileSync(join(root, "scripts/no-fabrication-allowlist.json"), "utf8"));
} catch (error) {
  exitWith(`cannot read scripts/no-fabrication-allowlist.json under ${root} (${error.message})`);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const findings = [];
let markers = 0;
const report = (file, line, rule, message) => findings.push({ file, line, rule, message });
function checkWording(file, line, text) {
  const match = CERTIFICATION_WORDING.exec(text);
  if (match) report(file, line, "R4", `certification wording "${match[0]}"; AMC output is evidence of conformity`);
}

function scanLines(file, lines) {
  lines.forEach((text, index) => checkWording(file, index + 1, text));
}

function scanSource(file, text, lines) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const guarded = GUARDED_ROOTS.some((dir) => file.startsWith(dir));
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const marked = (line) => MARKER.test(lines[line - 1] ?? "") || MARKER.test(lines[line - 2] ?? "");
  let pathCallDepth = 0;

  function visit(node) {
    // A call, or a reference passed along uncalled (e.g. `.map(Math.random)`).
    const callee = ts.isCallExpression(node) ? node.expression
      : ts.isPropertyAccessExpression(node) && !(ts.isCallExpression(node.parent) && node.parent.expression === node) ? node : undefined;
    if (guarded && callee) {
      const name = callee.getText(source).replaceAll("?.", ".");
      if (RANDOM_CALLEE.test(name) && !marked(lineOf(node))) {
        report(file, lineOf(node), "R1", `${name} in a guarded root; mark ids with // amc-allow-random: id and attack inputs with // amc-allow-random: fuzz-input`);
      }
    }
    if (node.name && ts.isIdentifier(node.name) && (ts.isVariableDeclaration(node) || ts.isFunctionLike(node)
      || ts.isClassLike(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node))
      && FABRICATED_NAME.some((pattern) => pattern.test(node.name.text)) && file !== EXAMPLE_MODE) {
      report(file, lineOf(node.name), "R2", `identifier ${node.name.text} names a fabricated result; examples live only in ${EXAMPLE_MODE}`);
    }
    const pathCall = guarded && ts.isCallExpression(node) && /(^|\.)(existsSync|statSync)$/.test(node.expression.getText(source));
    if (pathCall) pathCallDepth += 1;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node)) {
      const literal = node.text;
      if (literal.startsWith("src/") && (file.startsWith("src/score/") || pathCallDepth > 0)) {
        report(file, lineOf(node), "R3", `path-presence check on "${literal}": file existence is not evidence`);
      }
      checkWording(file, lineOf(node), literal);
    }
    ts.forEachChild(node, visit);
    if (pathCall) pathCallDepth -= 1;
  }
  visit(source);
}

for (const file of walk("src")) {
  const lineScanned = /^src\/(console|dashboard)\/.*\.(html|js)$/.test(file);
  if (!lineScanned && !/\.(ts|mts|cts|tsx)$/.test(file)) continue;
  const text = readFileSync(join(root, file), "utf8");
  const lines = text.split("\n");
  markers += lines.filter((line) => MARKER.test(line)).length;
  if (lineScanned) scanLines(file, lines);
  else scanSource(file, text, lines);
}

const failures = [];
const permanent = allowlist.permanent ?? [];
const pending = allowlist.pending ?? [];
const pathPresence = allowlist.pathPresence ?? [];
const entries = [
  ...permanent.map((entry) => ({ ...entry, list: "permanent" })),
  ...pending.map((entry) => ({ ...entry, list: "pending" })),
  ...pathPresence.map((file) => ({ file, rule: "R3", list: "pathPresence", reason: "control-surface scorer retired by P1-53" }))
];
for (const entry of entries) {
  const where = `${entry.file} ${entry.rule} (${entry.list})`;
  if (!RULES.includes(entry.rule)) failures.push(`scripts/no-fabrication-allowlist.json: ${where}: unknown rule`);
  if (!entry.reason?.trim()) failures.push(`scripts/no-fabrication-allowlist.json: ${where}: every entry needs a reason`);
  if (entry.list === "pending" && !ISSUE_KEY.test(entry.owner ?? "")) {
    failures.push(`scripts/no-fabrication-allowlist.json: ${where}: owner must be an issue key such as P0-21`);
  }
  entry.used = false;
}
const baseline = allowlist.pathPresenceBaseline;
if (pathPresence.length > baseline || !Number.isInteger(baseline)) {
  failures.push(`scripts/no-fabrication-allowlist.json: pathPresence has ${pathPresence.length} files; pathPresenceBaseline is ${baseline} and may only go down`);
} else if (pathPresence.length < baseline) {
  failures.push(`scripts/no-fabrication-allowlist.json: pathPresence has ${pathPresence.length} files; lower pathPresenceBaseline from ${baseline} to ${pathPresence.length}`);
}

const counts = Object.fromEntries(RULES.map((rule) => [rule, { found: 0, allowlisted: 0, failing: 0 }]));
for (const finding of findings) {
  const entry = entries.find((candidate) => candidate.file === finding.file && candidate.rule === finding.rule);
  counts[finding.rule].found += 1;
  if (entry) {
    entry.used = true;
    counts[finding.rule].allowlisted += 1;
  } else {
    counts[finding.rule].failing += 1;
    failures.push(`${finding.file}:${finding.line} ${finding.rule} ${finding.message}`);
  }
}
for (const entry of entries.filter((candidate) => !candidate.used)) {
  failures.push(`scripts/no-fabrication-allowlist.json: stale allowlist entry ${entry.file} ${entry.rule} (${entry.list}) matches nothing; remove it`);
}
const strict = args.includes("--strict");
if (strict) {
  for (const entry of pending) {
    failures.push(`${entry.file} ${entry.rule}: pending allowlist entry owned by ${entry.owner}; --strict (Gate G0) requires none`);
  }
}

if (args.includes("--json")) {
  console.log(JSON.stringify({ ok: failures.length === 0, strict, rules: counts, markers, pending: pending.length, failures }, null, 2));
} else if (failures.length > 0) {
  console.error(failures.join("\n"));
  console.error(`check-no-fabrication: ${failures.length} failure(s)`);
} else {
  const found = RULES.map((rule) => `${rule} ${counts[rule].found}`).join(", ");
  console.log(`check-no-fabrication: passed${strict ? " (strict)" : ""}; allowlisted findings ${found}; ${markers} random marker(s); ${pending.length} pending entr${pending.length === 1 ? "y" : "ies"}.`);
}
process.exit(failures.length > 0 ? 1 : 0);

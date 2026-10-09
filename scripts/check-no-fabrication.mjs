#!/usr/bin/env node
// P0-16: proves no fabricated-score path remains in src/ (contract truth rules 1 and 4).
// Sibling of scripts/lint-contract.mjs: oxlint has no rule for these patterns, so this
// script parses src/ with the TypeScript compiler API and checks four rules:
//   R1 random or hash-derived value in a guarded root, R2 fabricated-result identifier,
//   R3 path-presence scoring, R4 certification wording in output text.
// Usage: node scripts/check-no-fabrication.mjs [--root <dir>] [--json] [--strict]
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const RULES = ["R1", "R2", "R3", "R4"];
const GUARDED_ROOTS = ["score", "domains", "assurance", "shield", "compliance", "diagnostic", "claims", "exports", "a4"]
  .map((dir) => `src/${dir}/`);
// Matched against the text of a // comment, never against raw lines, so a marker in a string does not count.
const MARKER = /^\/\/\s*amc-allow-random:\s*(id|fuzz-input)\b/;
const RANDOM_CALLEE = /^(Math\.random|randomInt|(\w+\.)*crypto\.(randomInt|getRandomValues))$/;
const RANDOM_EXPORTS = new Set(["randomInt", "getRandomValues"]);
const CRYPTO_MODULE = /^(node:)?crypto$/;
// ponytail: R1 sees a hash only where `%` is applied to a hash/digest/imul call in the same
// expression; a hash stored in a variable first is not traced. Add data flow if that appears.
const HASH_CALLEE = /hash|digest|imul/i;
const PERMANENT_R3 = "src/score/controlSurfaceScope.ts";
// The control-surface scorers left after P0-15. pathPresence may only drop names from this set,
// so a retired scorer's slot cannot be handed to a new one.
const FROZEN_PATH_PRESENCE = new Set([
  "adaptiveAccessControl", "agentProtocolSecurity", "agentStatePortability", "auditDepth", "calibrationGap",
  "densityMap", "evidenceConflict", "factSimulationBoundary", "failSecureGovernance", "forecastLegitimacy",
  "gamingResistance", "kernelSandboxMaturity", "levelTransition", "memorySecurityArchitecture",
  "monitorBypassResistance", "outputIntegrityMaturity", "policyConsistency", "reasoningEfficiency",
  "runtimeIdentityMaturity", "scenarioProvenance", "selfKnowledgeMaturity", "simulationValidity",
  "sleeperDetection", "syntheticIdentityGovernance", "trustAuthorizationSync"
].map((name) => `src/score/${name}.ts`));
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
const DECLARATIONS = [ts.isVariableDeclaration, ts.isFunctionLike, ts.isClassLike, ts.isPropertyDeclaration, ts.isParameter,
  ts.isBindingElement, ts.isTypeAliasDeclaration, ts.isInterfaceDeclaration, ts.isEnumDeclaration, ts.isEnumMember,
  ts.isImportSpecifier, ts.isImportClause, ts.isNamespaceImport, ts.isImportEqualsDeclaration];
const report = (file, line, rule, message) => findings.push({ file, line, rule, message });
function checkWording(file, line, text) {
  const match = CERTIFICATION_WORDING.exec(text);
  if (match) report(file, line, "R4", `certification wording "${match[0]}"; AMC output is evidence of conformity`);
}

function scanLines(file, lines) {
  lines.forEach((text, index) => checkWording(file, index + 1, text));
}

// Lines holding a marker comment. Every comment sits in the trivia before some token (same-line
// "trailing" or later-line "leading" ranges), so reading both at each token finds them all without
// mistaking string text for a comment.
function markerLines(source) {
  const found = new Set();
  if (!source.text.includes("amc-allow-random")) return found;
  (function leaves(node) {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(source);
    if (children.length > 0) return children.forEach(leaves);
    const ranges = [...ts.getTrailingCommentRanges(source.text, node.pos) ?? [], ...ts.getLeadingCommentRanges(source.text, node.pos) ?? []];
    for (const range of ranges) {
      if (MARKER.test(source.text.slice(range.pos, range.end))) found.add(source.getLineAndCharacterOfPosition(range.pos).line + 1);
    }
  })(source);
  return found;
}

// Local names bound to crypto's random functions or to the crypto module itself.
function cryptoImports(source) {
  const randomNames = new Set();
  const modules = new Set();
  for (const statement of source.statements) {
    const clause = ts.isImportDeclaration(statement) && CRYPTO_MODULE.test(statement.moduleSpecifier.text) && statement.importClause;
    if (!clause) continue;
    if (clause.name) modules.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) modules.add(bindings.name.text);
    for (const element of bindings && ts.isNamedImports(bindings) ? bindings.elements : []) {
      const imported = (element.propertyName ?? element.name).text;
      if (RANDOM_EXPORTS.has(imported)) randomNames.add(element.name.text);
      if (imported === "webcrypto") modules.add(element.name.text);
    }
  }
  return (name) => {
    const dot = name.lastIndexOf(".");
    return RANDOM_CALLEE.test(name) || randomNames.has(name) || (modules.has(name.slice(0, dot)) && RANDOM_EXPORTS.has(name.slice(dot + 1)));
  };
}

function scanSource(file, text, lines) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const guarded = GUARDED_ROOTS.some((dir) => file.startsWith(dir));
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const markerAt = guarded ? markerLines(source) : new Set();
  markers += markerAt.size;
  // A marker counts on the call's own line, or on the line above when that line is only the marker comment.
  const marked = (line) => markerAt.has(line) || (markerAt.has(line - 1) && /^\s*\/\//.test(lines[line - 2] ?? ""));
  const isRandom = cryptoImports(source);
  const hashCall = (node) => ts.isCallExpression(node) && HASH_CALLEE.test(node.expression.getText(source))
    ? node.expression.getText(source) : ts.forEachChild(node, hashCall);
  let pathCallDepth = 0;

  function visit(node) {
    // A call, or a reference passed along uncalled (e.g. `.map(Math.random)`).
    const callee = ts.isCallExpression(node) ? node.expression
      : ts.isPropertyAccessExpression(node) && !(ts.isCallExpression(node.parent) && node.parent.expression === node) ? node : undefined;
    if (guarded && callee) {
      const name = callee.getText(source).replaceAll("?.", ".");
      if (isRandom(name) && !marked(lineOf(node))) {
        report(file, lineOf(node), "R1", `${name} in a guarded root; mark ids with // amc-allow-random: id and attack inputs with // amc-allow-random: fuzz-input`);
      }
    }
    if (guarded && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PercentToken && !marked(lineOf(node))) {
      const hash = hashCall(node.left) ?? hashCall(node.right);
      if (hash) report(file, lineOf(node), "R1", `hash-derived value (${hash}(...) % n) in a guarded root; a hash is not evidence`);
    }
    if (node.name && ts.isIdentifier(node.name) && DECLARATIONS.some((isDeclaration) => isDeclaration(node))
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
  if (entry.list === "permanent" && entry.rule === "R3" && entry.file !== PERMANENT_R3) {
    failures.push(`scripts/no-fabrication-allowlist.json: ${where}: only ${PERMANENT_R3} may be a permanent R3 entry; path scorers go in pathPresence`);
  }
  if (entry.list === "pathPresence" && !FROZEN_PATH_PRESENCE.has(entry.file)) {
    failures.push(`scripts/no-fabrication-allowlist.json: ${entry.file} is not one of the control-surface scorers frozen by P0-16; pathPresence may only shrink`);
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

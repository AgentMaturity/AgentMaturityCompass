import ts from "typescript";
import { landedText } from "./landedSource.js";

const source = landedText("src/watch/liveDriftAlerts.ts");
const file = ts.createSourceFile("landed-live-drift.ts", source, ts.ScriptTarget.ES2022, true);
const emptyRatios = new Set<string>();
function collect(node: ts.Node): void {
  if (ts.isPropertyAssignment(node)) {
    const field = node.name.getText(file);
    const expression = node.initializer.getText(file);
    const empty = expression.match(/(\w+)\.length\s*===\s*0\s*\?\s*1\s*:/);
    if (empty) {
      emptyRatios.add(field);
    }
  }
  ts.forEachChild(node, collect);
}
collect(file);
if (emptyRatios.size !== 112) throw new Error("AXE-23 expected the 112 preserved empty-window defaults");
// These four coverage fields used an unconditional fallback of 1, including empty builder windows.
for (const field of ["ragPassageGroundingCoverage0to1", "ragHumanVerificationCoverage0to1", "ragCitationCoverage0to1", "ragAnswerSupportCoverage0to1"]) {
  emptyRatios.add(field);
}

/**
 * The two Family-B archived parity runners assemble their own hashes from private thresholds.
 * Keep those original assemblers and update only the distribution outcome and empty coverage/delta
 * expressions before evaluating the preserved source. All other code and getter reads stay exact.
 */
export function migrateLegacySatelliteExpectations(archived: string): string {
  const parsed = ts.createSourceFile("archived-satellite.ts", archived, ts.ScriptTarget.ES2022, true);
  const distribution = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "distribution");
  if (!distribution || !ts.isFunctionDeclaration(distribution) || !distribution.body) throw new Error("Missing archived satellite distribution");
  const returned = distribution.body.statements.find(ts.isReturnStatement)?.expression;
  if (!returned || !ts.isObjectLiteralExpression(returned)) throw new Error("Missing archived satellite distribution object");
  const insertAt = returned.end - 1;
  let updated = archived.slice(0, insertAt) + '  evidenceOutcome: rows.length > 0 ? "measured" : "not_evaluated",\n  ' + archived.slice(insertAt);
  const coverage = "mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? 1 : 0)";
  if (!updated.includes(coverage)) throw new Error("Missing archived satellite empty coverage default");
  updated = updated.replace(coverage, "mean(rows.map((row) => row.evidenceCoverage0to1), rows.length === 0 ? null : 0)");
  const delta = "round(Math.max(0, baselineDistribution.evidenceCoverage0to1 - liveDistribution.evidenceCoverage0to1))";
  if (!updated.includes(delta)) throw new Error("Missing archived satellite coverage delta");
  updated = updated.replace(delta, `baselineDistribution.evidenceCoverage0to1 === null || liveDistribution.evidenceCoverage0to1 === null ? null : ${delta}`);
  const coverageThreshold = "thresholds.minEvidenceCoverage0to1, ";
  if (!updated.includes(coverageThreshold)) throw new Error("Missing archived satellite coverage alert");
  updated = updated.replace(coverageThreshold,
    `${coverageThreshold}liveDistribution.evidenceCoverage0to1 === null ? "Live evidence missing; coverage is not evaluated." : `);
  return updated.replace("if (liveDistribution.evidenceCoverage0to1 <",
    "if (liveDistribution.evidenceCoverage0to1 === null || liveDistribution.evidenceCoverage0to1 <");
}

/**
 * Update only the archived empty-window methodology before its original score, alert and hash
 * assemblers run. Positional AST edits retain every unrelated source byte and all caller reads.
 */
export function migrateLegacyCoreExpectations(archived: string): string {
  const parsed = ts.createSourceFile("archived-core.ts", archived, ts.ScriptTarget.ES2022, true);
  const nodes: ts.Node[] = [];
  function collectNodes(node: ts.Node): void { nodes.push(node); ts.forEachChild(node, collectNodes); }
  collectNodes(parsed);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const replace = (node: ts.Node, text: string) => edits.push({ start: node.getStart(parsed), end: node.end, text });
  const nullableFields = new Set(emptyRatios.keys());
  const refs = (node: ts.Node) => [...new Set([...node.getText(parsed).matchAll(/(?:baseline|live)Distribution\.(\w+)/g)]
    .filter(match => nullableFields.has(match[1]!)).map(match => match[0]))];
  const nullableDrifts = new Set<string>();
  const nullableMinima = new Set<string>();
  let defaults = 0, ragDefaults = 0;
  for (const node of nodes) {
    if (ts.isConditionalExpression(node) && /^\w+\.length\s*===\s*0$/.test(node.condition.getText(parsed))
      && node.whenTrue.getText(parsed) === "1") {
      replace(node.whenTrue, "null"); defaults++;
    }
    if (ts.isPropertyAssignment(node) && ["ragPassageGroundingCoverage0to1", "ragHumanVerificationCoverage0to1",
      "ragCitationCoverage0to1", "ragAnswerSupportCoverage0to1"].includes(node.name.getText(parsed))
      && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(parsed) === "numericMean") {
      const fallback = node.initializer.arguments[1];
      if (!fallback || fallback.getText(parsed) !== "1") throw new Error("Changed archived RAG coverage fallback");
      replace(fallback, "ragDatasetBuilderRows.length === 0 ? null : 1"); ragDefaults++;
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "scoreDrift" && node.initializer
      && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const dependencies = refs(property.initializer);
        if (!dependencies.length) continue;
        nullableDrifts.add(property.name.getText(parsed));
        replace(property.initializer, `${dependencies.map(ref => `${ref} === null`).join(" || ")} ? null : (${property.initializer.getText(parsed)})`);
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(parsed) === "Math.min") {
      const dependencies = refs(node.initializer);
      if (!dependencies.length) continue;
      nullableMinima.add(node.name.getText(parsed));
      replace(node.initializer, `${dependencies.map(ref => `${ref} === null`).join(" || ")} ? null : ${node.initializer.getText(parsed)}`);
    }
  }
  if (defaults !== 112 || ragDefaults !== 4 || nullableDrifts.size !== 115 || nullableMinima.size !== 13) {
    throw new Error(`Changed archived AXE-23 scope: defaults=${defaults}, rag=${ragDefaults}, drifts=${nullableDrifts.size}, minima=${nullableMinima.size}`);
  }
  let sampleObservations = 0;
  for (const node of nodes) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === "makeAlert"
      && node.arguments[3] && ts.isStringLiteral(node.arguments[3]) && node.arguments[3].text === "sampleSize") {
      const observed = node.arguments[4];
      if (!observed || !/^(?:baseline|live)Distribution\.sampleSize$/.test(observed.getText(parsed))) {
        throw new Error("Changed archived sample-size alert observation");
      }
      const value = observed.getText(parsed);
      replace(observed, `${value} === 0 ? null : ${value}`); sampleObservations++;
    }
    if (ts.isBinaryExpression(node)) {
      const left = node.left.getText(parsed), original = node.getText(parsed);
      if (node.operatorToken.kind === ts.SyntaxKind.LessThanToken
        && (nullableMinima.has(left) || /^(?:baseline|live)Distribution\./.test(left) && refs(node.left).length)) {
        replace(node, `(${left} === null || ${original})`);
      } else if (node.operatorToken.kind === ts.SyntaxKind.GreaterThanToken && left.startsWith("scoreDrift.")
        && nullableDrifts.has(left.slice("scoreDrift.".length))) {
        replace(node, `(${left} !== null && ${original})`);
      } else if (node.operatorToken.kind === ts.SyntaxKind.LessThanToken
        && /^(?:baseline|live)Distribution\.sampleSize$/.test(left)) {
        replace(node, `(${left} === 0 || ${original})`);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === "distribution" && node.body) {
      const statement = node.body.statements.find(ts.isReturnStatement);
      if (!statement?.expression || !ts.isObjectLiteralExpression(statement.expression)) throw new Error("Missing archived distribution return");
      edits.push({ start: statement.getStart(parsed), end: statement.expression.getStart(parsed), text: "const result = " });
      edits.push({ start: statement.expression.end, end: statement.expression.end,
        text: '; return { ...result, evidenceOutcome: result.sampleSize > 0 ? "measured" : "not_evaluated" }' });
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === "makeAlert" && node.body) {
      const returned = node.body.statements.find(ts.isReturnStatement)?.expression;
      if (!returned || !ts.isObjectLiteralExpression(returned)) throw new Error("Missing archived alert object");
      for (const property of returned.properties) {
        if (ts.isPropertyAssignment(property) && property.name.getText(parsed) === "severity") {
          replace(property.initializer, `observed === null ? "high" : ${property.initializer.getText(parsed)}`);
        } else if (ts.isPropertyAssignment(property) && property.name.getText(parsed) === "observed") {
          replace(property.initializer, `observed === null ? null : ${property.initializer.getText(parsed)}`);
        } else if (ts.isShorthandPropertyAssignment(property) && property.name.text === "message") {
          replace(property, 'message: observed === null ? `Live drift evidence missing for ${metricId}; not evaluated. ${message}` : message');
        }
      }
    }
  }
  if (sampleObservations !== 2) throw new Error("Expected two archived empty sample-size alert observations");
  edits.sort((left, right) => right.start - left.start);
  let result = archived;
  for (let index = 0; index < edits.length; index++) {
    const edit = edits[index]!;
    if (index > 0 && edit.end > edits[index - 1]!.start) throw new Error("Overlapping archived AXE-23 expectation edits");
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

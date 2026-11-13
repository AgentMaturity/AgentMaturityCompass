/**
 * Terminal text for `amc domain pack describe` and `amc domain pack run` beyond the headline result: the five level
 * choices, per-question levels, the scale note, top gaps and key-risk coverage. Kept here so the command file stays
 * under its size cap. Everything printed is self-reported.
 */
import chalk from "chalk";
import type { IndustryPack, IndustryPackQuestion, IndustryPackScoreResult } from "./industryPacks.js";
import { levelDescriptor } from "./packInsights.js";

/** The five levels `pack run` offers; L2/L4 show the question's descriptor or a neutral "between" label. */
export function packLevelChoices(q: IndustryPackQuestion): Array<{ name: string; short: string; value: number }> {
  return [1, 2, 3, 4, 5].map((level) => ({ name: `L${level} — ${levelDescriptor(q, level)}`, short: `L${level}`, value: level }));
}

/** Response keys that are not questions of the pack (a typo would otherwise leave a question silently unanswered). */
export function unknownResponseIds(pack: IndustryPack, responses: Record<string, number>): string[] {
  const ids = new Set(pack.questions.map((q) => q.id));
  return Object.keys(responses).filter((id) => !ids.has(id));
}

/** The key-risk section of `pack describe`, with how many questions point at each risk when any does. */
export function describeKeyRiskLines(pack: IndustryPack): string[] {
  if (pack.keyRisks.length === 0) return [];
  const mapped = pack.questions.some((q) => q.keyRisk !== undefined);
  const lines = [chalk.bold(`\n  Key risks (${pack.keyRisks.length}):`)];
  pack.keyRisks.forEach((risk, index) => {
    const ids = pack.questions.filter((q) => q.keyRisk === index).map((q) => q.id);
    lines.push(`    ${index + 1}. ${risk}${mapped ? chalk.gray(` — ${ids.length ? ids.join(", ") : "no question mapped"}`) : ""}`);
  });
  return lines;
}

/** One describe line per question detail field the question carries (failure mode, key risk). */
export function describeQuestionDetailLines(pack: IndustryPack, q: IndustryPackQuestion): string[] {
  const lines: string[] = [];
  if (q.failureMode) lines.push(chalk.gray(`        Prevents: ${q.failureMode}`));
  if (q.keyRisk !== undefined && pack.keyRisks[q.keyRisk]) lines.push(chalk.gray(`        Key risk ${q.keyRisk + 1}: ${pack.keyRisks[q.keyRisk]}`));
  return lines;
}

/** Per-question levels beside the pack percentage, and what the percentage band means. */
export function questionLevelLines(result: IndustryPackScoreResult): string[] {
  if (result.questionResults.length === 0) return [];
  const lines = [chalk.bold("\n  Per-question levels (self-reported):")];
  for (const r of result.questionResults) lines.push(`    ${chalk.cyan(r.id)} L${r.level} (${r.percentage}%) · ${r.dimension} · weight ${r.weight}`);
  lines.push(chalk.gray(`\n  How to read the score: ${result.scaleNote}`));
  return lines;
}

/** The prioritized gaps: lowest answers weighted by question weight, with each question's own detail when present. */
export function topGapLines(result: IndustryPackScoreResult): string[] {
  if (result.topGaps.length === 0) return [];
  const lines = [chalk.yellow(`\n  Top gaps (answered below L4, by gap x weight):`)];
  for (const g of result.topGaps) {
    lines.push(`    ${chalk.cyan(g.id)} ${g.dimension} — L${g.level} → L${g.targetLevel}: ${g.targetDescriptor}`);
    if (g.failureMode) lines.push(chalk.gray(`      Prevents: ${g.failureMode}`));
    if (g.remediation) lines.push(`      Next step: ${g.remediation}`);
    if (g.evidence?.length) lines.push(chalk.gray(`      Evidence: ${g.evidence.join(", ")}`));
    if (g.keyRisk) lines.push(chalk.gray(`      Key risk ${g.keyRisk.index + 1}: ${g.keyRisk.risk}`));
  }
  return lines;
}

/** The pack's key risks in the score result, with per-risk coverage and the weakest risk when questions are mapped. */
export function scoreKeyRiskLines(result: IndustryPackScoreResult): string[] {
  if (result.keyRisks.length === 0) return [];
  const lines = [chalk.bold(`\n  Key risks (${result.keyRisks.length}):`)];
  result.keyRisks.forEach((risk, index) => {
    const row = result.riskCoverage[index];
    const detail = !row ? "" : row.questionIds.length === 0 ? " — no question mapped"
      : ` — ${row.questionIds.length} question(s); ${row.averageLevel === null ? "not evaluated" : `mean L${row.averageLevel}`}`;
    lines.push(`    ${index + 1}. ${risk}${chalk.gray(detail)}`);
  });
  if (result.weakestRisk) lines.push(chalk.yellow(`    Weakest risk: ${result.weakestRisk.index + 1}. ${result.weakestRisk.risk} (mean L${result.weakestRisk.averageLevel})`));
  else if (result.riskCoverage.length === 0) lines.push(chalk.gray("    Questions are not mapped to these risks yet; per-risk coverage is unknown."));
  return lines;
}

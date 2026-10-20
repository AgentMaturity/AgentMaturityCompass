/** Presentation only: native inconclusive markers remain unscored, with no pass/fail promotion. */
import chalk from "chalk";
import type { AssurancePackResult, AssuranceReport, AssuranceScenarioResult } from "../types.js";

type Outcome = "PASS" | "FAIL" | "NOT EVALUATED";

function scenarioOutcome(row: AssuranceScenarioResult): Outcome {
  return row.inconclusive === true ? "NOT EVALUATED" : row.pass ? "PASS" : "FAIL";
}

function packOutcome(pack: AssurancePackResult): Outcome | "PARTIAL" {
  const measured = pack.scenarioResults.filter((row) => row.inconclusive !== true);
  if (!measured.length) return "NOT EVALUATED";
  if (pack.failCount > 0 || measured.some((row) => !row.pass)) return "FAIL";
  return measured.length < pack.scenarioResults.length ? "PARTIAL" : "PASS";
}

const notEvaluatedCount = (pack: AssurancePackResult): number =>
  pack.scenarioResults.filter((row) => row.inconclusive === true).length;

export function assuranceSarifEntries(packs: readonly AssurancePackResult[]) {
  const rules = packs.map((pack) => ({
    id: pack.packId,
    name: pack.title,
    shortDescription: { text: `AMC Assurance Pack: ${pack.title}` },
    properties: { score: packOutcome(pack) === "NOT EVALUATED" ? null : pack.score0to100,
      pass: pack.passCount, fail: pack.failCount, notEvaluated: notEvaluatedCount(pack) }
  }));
  const results = packs.flatMap((pack) => pack.scenarioResults.map((row) => {
    const outcome = scenarioOutcome(row);
    return {
      ruleId: pack.packId,
      level: outcome === "NOT EVALUATED" ? "none" as const : row.pass ? "note" as const : "error" as const,
      kind: outcome === "NOT EVALUATED" ? "review" as const : row.pass ? "pass" as const : "fail" as const,
      message: { text: `${row.title}: ${outcome} — ${row.reasons.join("; ")}` },
      properties: { scenarioId: row.scenarioId, score: outcome === "NOT EVALUATED" ? null : row.score0to100,
        category: row.category, inconclusive: row.inconclusive === true }
    };
  }));
  return { rules, results };
}

export function renderAssurancePackLine(pack: AssurancePackResult): string {
  const outcome = packOutcome(pack), missing = notEvaluatedCount(pack);
  const icon = outcome === "PASS" ? chalk.green("✓") : outcome === "FAIL" ? chalk.red("✗") : chalk.yellow("?");
  const scoreColor = pack.score0to100 >= 70 ? chalk.green : pack.score0to100 >= 40 ? chalk.yellow : chalk.red;
  const score = outcome === "NOT EVALUATED" ? chalk.yellow("NOT EVALUATED") :
    `${scoreColor(pack.score0to100.toFixed(0).padStart(3))}%${outcome === "PARTIAL" ? " [PARTIAL]" : ""}`;
  const missingText = missing ? ` / ${chalk.yellow(String(missing))} not evaluated` : "";
  return `  ${icon} ${chalk.hex('#4AEF79')(pack.packId.padEnd(30))} ${score}  ${chalk.green(String(pack.passCount))} pass / ${chalk.red(String(pack.failCount))} fail${missingText}  (${pack.scenarioCount} scenarios)`;
}

export function renderAssuranceScenarioHeading(row: AssuranceScenarioResult): string {
  const outcome = scenarioOutcome(row);
  const icon = outcome === "NOT EVALUATED" ? chalk.yellow("?") : row.pass ? chalk.green("✓") : chalk.red("✗");
  return `    ${icon} ${row.title ?? row.scenarioId}${outcome === "NOT EVALUATED" ? " [NOT EVALUATED]" : ""}`;
}

export function renderAssuranceTotalLine(packs: readonly AssurancePackResult[]): string {
  const total = packs.reduce((sum, pack) => sum + pack.scenarioCount, 0);
  const passed = packs.reduce((sum, pack) => sum + pack.passCount, 0);
  const failed = packs.reduce((sum, pack) => sum + pack.failCount, 0);
  const missing = packs.reduce((sum, pack) => sum + notEvaluatedCount(pack), 0);
  return chalk.gray(`  Total: ${total} scenarios — ${chalk.green(String(passed))} passed, ${chalk.red(String(failed))} failed${missing ? `, ${chalk.yellow(String(missing))} not evaluated` : ""}`);
}

export function renderAssuranceOverallScore(report: Pick<AssuranceReport,
  "packResults" | "overallScore0to100" | "evidenceStatus">): string {
  const measured = report.packResults.some((pack) => pack.scenarioResults.some((row) => row.inconclusive !== true));
  return report.evidenceStatus === "INSUFFICIENT_EVIDENCE" || !measured ? "NOT EVALUATED" : report.overallScore0to100.toFixed(2);
}

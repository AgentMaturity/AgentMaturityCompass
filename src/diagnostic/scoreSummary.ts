import type { DiagnosticQuestion, DiagnosticReport } from "../types.js";
import { levelReach, overallScore, overallScoreBand } from "./levelSemantics.js";
import { applicabilityLine } from "./questionApplicability.js";
import { allKnownQuestions } from "./questionSets.js";

/**
 * What every score surface says next to the overall number (P2, P8, P1): the overall with its range and how the range
 * is computed (or "no range" when there is no evidence or no spread), which levels the questions can reach today, and which questions were left out as not
 * applicable. Read from the report alone, so an older report renders the same way.
 */
export function scoreSummary(report: Pick<DiagnosticReport, "layerScores" | "questionScores" | "questionApplicability">) {
  const known = new Map(allKnownQuestions().map((question) => [question.id, question]));
  const questions = report.questionScores.flatMap((score) => known.get(score.questionId) ?? []) as DiagnosticQuestion[];
  const excluded = new Set((report.questionApplicability?.notApplicable ?? []).map((row) => row.questionId));
  const counted = questions.filter((question) => !excluded.has(question.id));
  const overall = overallScore(report.layerScores);
  const countedScores = report.questionScores.filter((score) => !excluded.has(score.questionId));
  const spread = overallScoreBand(overall, report.questionScores, counted);
  // A zero-width range, or one drawn from no evidence at all, would read as a precise score: show none instead.
  const band = countedScores.some((score) => score.evidenceEventIds.length > 0) && spread.low < spread.high ? spread : null;
  return {
    overall,
    band,
    range: band
      ? `range L${band.low.toFixed(2)} to L${band.high.toFixed(2)} (${band.method})`
      : "no range: not enough evidence to estimate one",
    reach: levelReach(questions).sentence,
    applicability: applicabilityLine(report.questionApplicability),
    notApplicable: report.questionApplicability?.notApplicable ?? []
  };
}

/** The same summary as plain lines (no colour); `prefix` is "- " for Markdown lists, spaces for the terminal. */
export function scoreSummaryLines(report: Pick<DiagnosticReport, "layerScores" | "questionScores" | "questionApplicability">, prefix: string): string[] {
  const summary = scoreSummary(report);
  return [
    `${prefix}Overall: L${summary.overall.toFixed(2)}, ${summary.range}`,
    `${prefix}Levels AMC can evaluate today: ${summary.reach}`,
    `${prefix}${summary.applicability}`,
    ...summary.notApplicable.map((row) => `  ${prefix}${row.title} (${row.questionId}): ${row.reason}`)
  ];
}

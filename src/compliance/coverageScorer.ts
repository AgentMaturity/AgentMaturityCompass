import type { ComplianceCategoryResult, ComplianceReportJson } from "./mappingSchema.js";

/**
 * Only a verified pass earns credit (P1-11): PARTIAL, MISSING, NOT_EVALUATED and legacy UNKNOWN earn nothing and stay in
 * the denominator, and so does a pass or partial that is only self-reported (D-03 shows it, never credits it), counted
 * as not evaluated. When no category was evaluated the score is null rather than a number that reads like a measurement.
 */
export function coverageScore(categories: ComplianceCategoryResult[]): ComplianceReportJson["coverage"] {
  const counts = {
    satisfied: 0,
    partial: 0,
    missing: 0,
    unknown: 0,
    notEvaluated: 0
  };
  for (const row of categories) {
    // A row that cannot be traced to a control cannot count toward coverage (S6, ratified 2026-10-04).
    if (row.id.trim() === "") {
      throw new Error(`Compliance category "${row.category}" has no control id; refusing to score it.`);
    }
    const observed = row.claimKind === "observed" || row.claimKind === "independently_reviewed";
    if (row.status === "SATISFIED" && observed) counts.satisfied += 1;
    // A self-reported pass or partial is shown, never evaluated (D-03, P1-45).
    else if (row.status === "SATISFIED" || (row.status === "PARTIAL" && !observed)) counts.notEvaluated += 1;
    else if (row.status === "PARTIAL") counts.partial += 1;
    else if (row.status === "MISSING") counts.missing += 1;
    else if (row.status === "NOT_EVALUATED") counts.notEvaluated += 1;
    else counts.unknown += 1;
  }
  const evaluated = counts.satisfied + counts.partial + counts.missing;
  return {
    ...counts,
    evaluated,
    score: evaluated === 0 ? null : Number((counts.satisfied / categories.length).toFixed(4))
  };
}

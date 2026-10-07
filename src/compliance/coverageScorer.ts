import type { ComplianceCategoryResult, ComplianceReportJson } from "./mappingSchema.js";

/**
 * NOT_EVALUATED and legacy UNKNOWN earn nothing and stay in the denominator; when no category was
 * evaluated the score is null rather than a number that reads like a measurement.
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
    if (row.status === "SATISFIED") counts.satisfied += 1;
    else if (row.status === "PARTIAL") counts.partial += 1;
    else if (row.status === "MISSING") counts.missing += 1;
    else if (row.status === "NOT_EVALUATED") counts.notEvaluated += 1;
    else counts.unknown += 1;
  }
  const evaluated = counts.satisfied + counts.partial + counts.missing;
  const weighted = counts.satisfied * 1 + counts.partial * 0.5;
  return {
    ...counts,
    evaluated,
    score: evaluated === 0 ? null : Number((weighted / categories.length).toFixed(4))
  };
}

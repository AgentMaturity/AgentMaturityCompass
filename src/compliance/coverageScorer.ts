import type { ComplianceCategoryResult, ComplianceReportJson } from "./mappingSchema.js";

export function coverageScore(categories: ComplianceCategoryResult[]): ComplianceReportJson["coverage"] {
  const counts = {
    satisfied: 0,
    partial: 0,
    missing: 0,
    unknown: 0
  };
  for (const row of categories) {
    // A row that cannot be traced to a control cannot count toward coverage.
    if (row.id.trim() === "") {
      throw new Error(`Compliance category "${row.category}" has no control id; refusing to score it.`);
    }
    if (row.status === "SATISFIED") counts.satisfied += 1;
    else if (row.status === "PARTIAL") counts.partial += 1;
    else if (row.status === "MISSING") counts.missing += 1;
    else counts.unknown += 1;
  }
  const total = Math.max(1, categories.length);
  // UNKNOWN means no evidence was evaluated, so it earns no credit.
  const weighted = counts.satisfied * 1 + counts.partial * 0.5;
  return {
    ...counts,
    score: Number((weighted / total).toFixed(4))
  };
}

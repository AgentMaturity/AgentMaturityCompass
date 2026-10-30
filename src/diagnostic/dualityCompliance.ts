import type { DiagnosticReport } from "../types.js";

export function formatDualityCompliance(report: Pick<DiagnosticReport, "dualityCompliance">): string {
  const duality = report.dualityCompliance ?? {
    executeWithValidTicket: 0,
    executeAttempted: 0,
    ratio: null
  };
  return duality.executeAttempted > 0 && duality.ratio !== null
    ? `${duality.executeWithValidTicket}/${duality.executeAttempted} (${(duality.ratio * 100).toFixed(1)}%)`
    : "n/a (no EXECUTE attempts)";
}

import type { CorrelationMetrics } from "./correlate.js";

export function correlationWarnings(metrics: CorrelationMetrics): string[] {
  const warnings: string[] = [];
  if (metrics.totalTracesWithReceipt === 0 && metrics.totalTraces > 0) {
    warnings.push("Trace logs were present but no receipts were provided; traces are SELF_REPORTED only.");
  }
  if (metrics.invalidReceipts > 0) {
    warnings.push(`${metrics.invalidReceipts} trace receipt(s) failed verification checks.`);
  }
  if (metrics.unmatchedReceipts > 0) {
    warnings.push(`${metrics.unmatchedReceipts} receipt(s) referenced missing event hashes.`);
  }
  if (metrics.bodyHashMismatches > 0) {
    warnings.push(`${metrics.bodyHashMismatches} receipt(s) had body hash mismatches.`);
  }
  if (metrics.mismatchedAgentId > 0) {
    warnings.push(`${metrics.mismatchedAgentId} trace receipt(s) had agent attribution mismatches.`);
  }
  if (metrics.correlationRatio !== null && metrics.correlationRatio < 0.9) {
    warnings.push(`Trace correlation ratio ${metrics.correlationRatio.toFixed(3)} is below recommended 0.90.`);
  }
  return warnings;
}

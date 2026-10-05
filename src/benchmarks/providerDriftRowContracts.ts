import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ProviderDriftBenchmarkReport, ProviderDriftCanaryRow, ProviderDriftCiGate } from "./providerDriftBenchmark.js";
import { normalizeProviderDriftMetadataId } from "./providerDriftDescriptor.js";

// Keep these operations at their original call sites: provider identifiers and
// Inspect scorer IDs are read between version, count, and coverage validation.
export function providerDriftProofVersion(
  side: "baseline" | "candidate",
  row: Pick<ProviderDriftCanaryRow, "version">,
  metadata: { providerVersion: string } | undefined,
  missingReasons: string[],
): string | undefined {
  const providerVersion = normalizeProviderDriftMetadataId(metadata?.providerVersion);
  if (!providerVersion) {
    missingReasons.push(`${side}:providerVersion`);
  } else if (row.version && providerVersion !== row.version) {
    missingReasons.push(`${side}:providerVersionMismatch`);
  }
  return providerVersion;
}

export function providerDriftProofMetricCount(metadata: { metricCount?: number } | undefined): number {
  return Number.isFinite(metadata?.metricCount) ? Math.max(0, metadata?.metricCount ?? 0) : 0;
}

export function validateProviderDriftProofMetricCoverage(
  side: "baseline" | "candidate",
  metricIds: string[],
  metricCount: number,
  missingReasons: string[],
): void {
  if (metricIds.length === 0) missingReasons.push(`${side}:metricIds`);
  if (metricCount < Math.max(1, metricIds.length)) missingReasons.push(`${side}:metricCount`);
}

export function hashProviderDriftProof<Payload extends { missingReasons: string[] }>(
  proofPayload: Payload,
): Payload & { proofHash: string } {
  return {
    ...proofPayload,
    proofHash: sha256Hex(canonicalize(proofPayload)),
  };
}

type ScoreProjection = Pick<ProviderDriftBenchmarkReport, "reportId" | "recommendation" | "failClosed" | "providerVersions"> & {
  driftStatistics: Array<Pick<ProviderDriftBenchmarkReport["comparisons"][number], "provider" | "model" | "canaryId" | "driftStatistic" | "status">>;
};

export function projectProviderDriftScore(report: ProviderDriftBenchmarkReport, includeCanaryResults: true): ScoreProjection & {
  canaryResults: ProviderDriftBenchmarkReport["comparisons"];
};
export function projectProviderDriftScore(report: ProviderDriftBenchmarkReport, includeCanaryResults: false): ScoreProjection;
export function projectProviderDriftScore(report: ProviderDriftBenchmarkReport, includeCanaryResults: boolean) {
  return {
    reportId: report.reportId,
    recommendation: report.recommendation,
    failClosed: report.failClosed,
    providerVersions: report.providerVersions,
    ...(includeCanaryResults ? { canaryResults: report.comparisons } : {}),
    driftStatistics: report.comparisons.map((comparison) => ({
      provider: comparison.provider,
      model: comparison.model,
      canaryId: comparison.canaryId,
      driftStatistic: comparison.driftStatistic,
      status: comparison.status,
    })),
  };
}

export function projectProviderDriftShield(ciGate: ProviderDriftCiGate, report: ProviderDriftBenchmarkReport) {
  return {
    gate: ciGate,
    blocked: ciGate.failClosed,
    activeAlertIds: report.alerts.filter((alert) => !alert.waived).map((alert) => alert.alertId),
    waivedAlertIds: report.alerts.filter((alert) => alert.waived).map((alert) => alert.alertId),
  };
}

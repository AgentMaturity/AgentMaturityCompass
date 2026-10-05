import type { ProviderDriftBenchmarkReport, ProviderDriftCiGate, ProviderDriftWatchAlert } from "../benchmarks/providerDriftBenchmark.js";

type DriftResult<K extends string> = {
  report: ProviderDriftBenchmarkReport;
  ciGate: ProviderDriftCiGate;
  watchAlerts: ProviderDriftWatchAlert[];
} & Record<K, string>;

type DriftSurfaces = {
  score: unknown;
  shield: unknown;
  watch: unknown;
  sourceRefs: readonly string[];
};

/** Preserve the literal projection's property reads and JSON insertion order. */
export function providerDriftBasicScoreResponse<K extends string>(result: DriftResult<K>, evidenceField: K) {
  return {
    report: result.report,
    providerVersions: result.report.providerVersions,
    canaryResults: result.report.comparisons,
    driftStatistics: result.report.comparisons.map((item) => ({
      canaryId: item.canaryId,
      provider: item.provider,
      model: item.model,
      driftStatistic: item.driftStatistic,
      status: item.status,
    })),
    [evidenceField]: result[evidenceField],
    failClosed: result.report.failClosed,
  };
}

export function providerDriftScoreResponse<K extends string>(result: DriftResult<K> & {
  score: { providerVersions: string[]; canaryResults: unknown; driftStatistics: unknown };
  sourceRefs: readonly string[];
}, evidenceField: K) {
  return {
    report: result.report,
    providerVersions: result.score.providerVersions,
    canaryResults: result.score.canaryResults,
    driftStatistics: result.score.driftStatistics,
    [evidenceField]: result[evidenceField],
    failClosed: result.report.failClosed,
    sourceRefs: result.sourceRefs,
  };
}

export function providerDriftVerificationResponse<K extends string>(result: DriftResult<K>, evidenceField: K) {
  return {
    verification: result.ciGate.passed ? "passed" : "blocked",
    ciGate: result.ciGate,
    [evidenceField]: result[evidenceField],
    failClosed: result.report.failClosed,
    activeAlerts: result.report.alerts.filter((alert) => !alert.waived).map((alert) => alert.alertId),
    waivedAlerts: result.report.alerts.filter((alert) => alert.waived).map((alert) => alert.alertId),
  };
}

export function providerDriftBasicWatchResponse<K extends string>(result: DriftResult<K>, evidenceField: K) {
  return {
    report: result.report,
    [evidenceField]: result[evidenceField],
    watchAlerts: result.watchAlerts,
    failClosed: result.report.failClosed,
  };
}

export function providerDriftWatchResponse<K extends string>(result: DriftResult<K> & DriftSurfaces, evidenceField: K) {
  return {
    report: result.report,
    [evidenceField]: result[evidenceField],
    score: result.score,
    shield: result.shield,
    watch: result.watch,
    watchAlerts: result.watchAlerts,
    failClosed: result.report.failClosed,
    sourceRefs: result.sourceRefs,
  };
}

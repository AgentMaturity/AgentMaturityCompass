/**
 * Vendor-named drift receipt builder — NO VENDOR API IS CONTACTED.
 *
 * The caller supplies the sample rows; this module validates them, computes
 * drift against thresholds and emits a hash-canonicalised receipt. The vendor
 * in the module name identifies the ecosystem the samples are expected to come
 * from, and any URLs below are documentation references. Nothing here fetches
 * from, authenticates to, or verifies anything with that vendor, so a receipt
 * attests only to the data the caller provided.
 */
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  normalizeProviderDriftCanaryRowEvidence,
  runProviderDriftBenchmark,
  type BuildProviderDriftCiGateInput,
  type BuildProviderDriftEvalPackInput,
  type ProviderDriftAlert,
  type ProviderDriftBenchmarkReport,
  type ProviderDriftCanaryRow,
  type ProviderDriftCiGate,
  type ProviderDriftEvalPackManifest,
  type ProviderDriftRecommendation,
  type ProviderDriftThresholds,
  type ProviderDriftWaiver,
  type ProviderDriftWatchAlert,
} from "./providerDriftBenchmark.js";

import {
  activeProviderDriftMetadataWaivers as activeWaivers,
  createProviderDriftDescriptor,
  isProviderDriftSha256 as isSha256,
  normalizeProviderDriftMetadataId as normalizedId,
  normalizeProviderDriftMetadataList as normalizedStringList,
  providerDriftMetadataKey as metadataKey,
  providerDriftMetadataKey as rowKey,
  providerDriftMetadataRecommendation as recommendationFromReport,
} from "./providerDriftDescriptor.js";

export const TENSORZERO_PROVIDER_DRIFT_SOURCE_REFS = [
  "https://github.com/tensorzero/tensorzero",
] as const;

export type TensorZeroProviderDriftSide = "baseline" | "candidate";

export interface TensorZeroProviderDriftMetadata {
  provider: string;
  model: string;
  canaryId: string;
  /** Provider/model version observed by the provider drift canary. */
  providerVersion: string;
  /** TensorZero release, tag, commit, or deployment identifier used to route the metadata-only canary. */
  tensorZeroVersion: string;
  /** Routing target identifier for the canary; metadata only, never copied gateway/config content. */
  providerRouteId?: string;
  /** Evaluation, experiment, or run identifier that produced the canary result; metadata only. */
  evaluationRunId?: string;
  sourceRefHash?: string;
  repositorySnapshotHash?: string;
  licenseRefHash?: string;
  defaultBranchHash?: string;
  releaseTagHash?: string;
  benchmarkModuleHash?: string;
  watchModuleHash?: string;
  apiModuleHash?: string;
  routingConfigHash?: string;
  canaryDatasetHash?: string;
  evaluatorConfigHash?: string;
  inferenceTraceHash?: string;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  signedEvidenceBundleHash?: string;
  noSourceCopyProofHash?: string;
  metricIds?: string[];
  metricCount?: number;
}

export interface TensorZeroProviderDriftProof {
  side: TensorZeroProviderDriftSide;
  provider: string;
  model: string;
  canaryId: string;
  providerVersion?: string;
  tensorZeroVersion?: string;
  providerRouteId?: string;
  evaluationRunId?: string;
  metricIds: string[];
  metricCount: number;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  missingReasons: string[];
  proofHash: string;
}

export interface TensorZeroProviderDriftScoreSurface {
  reportId: string;
  recommendation: ProviderDriftRecommendation;
  failClosed: boolean;
  providerVersions: string[];
  canaryResults: ProviderDriftBenchmarkReport["comparisons"];
  driftStatistics: Array<{ provider: string; model: string; canaryId: string; driftStatistic: number; status: string }>;
  tensorZeroEvidenceHash: string;
}

export interface TensorZeroProviderDriftShieldSurface {
  gate: ProviderDriftCiGate;
  blocked: boolean;
  activeAlertIds: string[];
  waivedAlertIds: string[];
  tensorZeroEvidenceHash: string;
}

export interface TensorZeroProviderDriftWatchSurface {
  alerts: ProviderDriftWatchAlert[];
  alertCount: number;
  tensorZeroEvidenceHash: string;
}

export interface RunTensorZeroProviderDriftInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  tensorZero: {
    baseline?: TensorZeroProviderDriftMetadata[];
    candidate?: TensorZeroProviderDriftMetadata[];
  };
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  evalPack?: BuildProviderDriftEvalPackInput;
  gate?: BuildProviderDriftCiGateInput;
  now?: Date | string;
}

export interface TensorZeroProviderDriftResult {
  report: ProviderDriftBenchmarkReport;
  tensorZeroEvidence: TensorZeroProviderDriftProof[];
  tensorZeroEvidenceHash: string;
  watchAlerts: ProviderDriftWatchAlert[];
  evalPack: ProviderDriftEvalPackManifest;
  ciGate: ProviderDriftCiGate;
  score: TensorZeroProviderDriftScoreSurface;
  shield: TensorZeroProviderDriftShieldSurface;
  watch: TensorZeroProviderDriftWatchSurface;
  sourceRefs: readonly string[];
}

const REQUIRED_HASH_FIELDS: Array<keyof TensorZeroProviderDriftMetadata> = [
  "sourceRefHash",
  "repositorySnapshotHash",
  "licenseRefHash",
  "defaultBranchHash",
  "releaseTagHash",
  "benchmarkModuleHash",
  "watchModuleHash",
  "apiModuleHash",
  "routingConfigHash",
  "canaryDatasetHash",
  "evaluatorConfigHash",
  "inferenceTraceHash",
  "canaryResultHash",
  "driftStatisticHash",
  "alertOrWaiverHash",
  "signedEvidenceBundleHash",
  "noSourceCopyProofHash",
];

const FORBIDDEN_CONTENT_FIELDS = [
  "prompt",
  "promptText",
  "messages",
  "inputs",
  "outputs",
  "responseText",
  "completionText",
  "datasetRows",
  "tracePayload",
  "gatewayConfig",
  "routingConfig",
  "functionConfig",
  "variantConfig",
  "tensorZeroConfig",
  "upstreamCode",
  "upstreamProse",
];

const descriptor = createProviderDriftDescriptor<TensorZeroProviderDriftMetadata>({
  metadataReason: "tensorZeroMetadata",
  requiredHashFields: REQUIRED_HASH_FIELDS,
  forbiddenContentFields: FORBIDDEN_CONTENT_FIELDS,
  proofRefPrefix: "tensorzero-proof",
  alertIdSuffix: "tensorZeroMetadataEvidence",
  metricId: "evaluationFrameworkEvidence",
  incompleteMessage: "TensorZero provider drift metadata proof is incomplete",
});

function buildTensorZeroProof(
  side: TensorZeroProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: TensorZeroProviderDriftMetadata | undefined,
): TensorZeroProviderDriftProof {
  const missingReasons = descriptor.missingReasons(side, metadata);

  const providerVersion = normalizedId(metadata?.providerVersion);
  if (!providerVersion) {
    missingReasons.push(`${side}:providerVersion`);
  } else if (row.version && providerVersion !== row.version) {
    missingReasons.push(`${side}:providerVersionMismatch`);
  }
  const tensorZeroVersion = normalizedId(metadata?.tensorZeroVersion);
  const providerRouteId = normalizedId(metadata?.providerRouteId);
  const evaluationRunId = normalizedId(metadata?.evaluationRunId);
  if (!tensorZeroVersion) missingReasons.push(`${side}:tensorZeroVersion`);
  if (!providerRouteId) missingReasons.push(`${side}:providerRouteId`);
  if (!evaluationRunId) missingReasons.push(`${side}:evaluationRunId`);

  const metricIds = normalizedStringList(metadata?.metricIds);
  const metricCount = Number.isFinite(metadata?.metricCount) ? Math.max(0, metadata?.metricCount ?? 0) : 0;
  if (metricIds.length === 0) missingReasons.push(`${side}:metricIds`);
  if (metricCount < Math.max(1, metricIds.length)) missingReasons.push(`${side}:metricCount`);

  const proofPayload = {
    side,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion,
    tensorZeroVersion,
    providerRouteId,
    evaluationRunId,
    metricIds,
    metricCount,
    canaryResultHash: isSha256(metadata?.canaryResultHash) ? metadata?.canaryResultHash.toLowerCase() : undefined,
    driftStatisticHash: isSha256(metadata?.driftStatisticHash) ? metadata?.driftStatisticHash.toLowerCase() : undefined,
    alertOrWaiverHash: isSha256(metadata?.alertOrWaiverHash) ? metadata?.alertOrWaiverHash.toLowerCase() : undefined,
    missingReasons,
  };
  return {
    ...proofPayload,
    proofHash: sha256Hex(canonicalize(proofPayload)),
  };
}

function buildScoreSurface(report: ProviderDriftBenchmarkReport, tensorZeroEvidenceHash: string): TensorZeroProviderDriftScoreSurface {
  return {
    reportId: report.reportId,
    recommendation: report.recommendation,
    failClosed: report.failClosed,
    providerVersions: report.providerVersions,
    canaryResults: report.comparisons,
    driftStatistics: report.comparisons.map((comparison) => ({
      provider: comparison.provider,
      model: comparison.model,
      canaryId: comparison.canaryId,
      driftStatistic: comparison.driftStatistic,
      status: comparison.status,
    })),
    tensorZeroEvidenceHash,
  };
}

function buildShieldSurface(
  ciGate: ProviderDriftCiGate,
  report: ProviderDriftBenchmarkReport,
  tensorZeroEvidenceHash: string,
): TensorZeroProviderDriftShieldSurface {
  return {
    gate: ciGate,
    blocked: ciGate.failClosed,
    activeAlertIds: report.alerts.filter((alert) => !alert.waived).map((alert) => alert.alertId),
    waivedAlertIds: report.alerts.filter((alert) => alert.waived).map((alert) => alert.alertId),
    tensorZeroEvidenceHash,
  };
}

function buildWatchSurface(watchAlerts: ProviderDriftWatchAlert[], tensorZeroEvidenceHash: string): TensorZeroProviderDriftWatchSurface {
  return {
    alerts: watchAlerts,
    alertCount: watchAlerts.length,
    tensorZeroEvidenceHash,
  };
}

function coerceNow(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}

export function runTensorZeroProviderDrift(input: RunTensorZeroProviderDriftInput): TensorZeroProviderDriftResult {
  const now = coerceNow(input.now);
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid TensorZero provider drift timestamp");
  }
  const baseline = input.baseline.map(normalizeProviderDriftCanaryRowEvidence);
  const candidate = input.candidate.map(normalizeProviderDriftCanaryRowEvidence);
  const baseReport = runProviderDriftBenchmark({
    agentId: input.agentId,
    baseline,
    candidate,
    thresholds: input.thresholds,
    waivers: input.waivers,
    now,
  });
  const baselineMetadata = new Map((input.tensorZero.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.tensorZero.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(baseReport.waivers, now);
  const rowsByKey = new Map([...baseline, ...candidate].map((row) => [rowKey(row), row]));
  const tensorZeroEvidence: TensorZeroProviderDriftProof[] = [];
  const tensorZeroAlerts: ProviderDriftAlert[] = [];

  for (const comparison of baseReport.comparisons) {
    const key = rowKey(comparison);
    const row = rowsByKey.get(key);
    if (!row) continue;
    const baselineRow = baseline.find((item) => rowKey(item) === key) ?? row;
    const candidateRow = candidate.find((item) => rowKey(item) === key) ?? row;
    const proofs = [
      buildTensorZeroProof("baseline", baselineRow, baselineMetadata.get(key)),
      buildTensorZeroProof("candidate", candidateRow, candidateMetadata.get(key)),
    ];
    tensorZeroEvidence.push(...proofs);
    const alert = descriptor.alert(row, proofs, active);
    if (alert) {
      tensorZeroAlerts.push(alert);
      if (!alert.waived) comparison.status = "alert";
      else if (comparison.status === "passed") comparison.status = "waived";
    }
  }

  const tensorZeroEvidenceHash = sha256Hex(canonicalize(tensorZeroEvidence));
  const reportWithoutSummary = {
    ...baseReport,
    alerts: [...baseReport.alerts, ...tensorZeroAlerts],
  };
  const recommendation = recommendationFromReport(reportWithoutSummary);
  const report: ProviderDriftBenchmarkReport = {
    ...reportWithoutSummary,
    recommendation,
    failClosed: reportWithoutSummary.alerts.some((alert) => !alert.waived),
    summary: `${reportWithoutSummary.comparisons.length} provider canary comparison(s), ${reportWithoutSummary.alerts.filter((alert) => !alert.waived).length} active alert(s), recommendation=${recommendation}; tensorZeroEvidenceHash=${tensorZeroEvidenceHash}`,
  };
  const watchAlerts = buildProviderDriftWatchAlerts(report);
  const evalPack = buildProviderDriftEvalPack(report, {
    sourceRefs: [...TENSORZERO_PROVIDER_DRIFT_SOURCE_REFS],
    ...input.evalPack,
  });
  const ciGate = buildProviderDriftCiGate(report, input.gate);

  return {
    report,
    tensorZeroEvidence,
    tensorZeroEvidenceHash,
    watchAlerts,
    evalPack,
    ciGate,
    score: buildScoreSurface(report, tensorZeroEvidenceHash),
    shield: buildShieldSurface(ciGate, report, tensorZeroEvidenceHash),
    watch: buildWatchSurface(watchAlerts, tensorZeroEvidenceHash),
    sourceRefs: TENSORZERO_PROVIDER_DRIFT_SOURCE_REFS,
  };
}

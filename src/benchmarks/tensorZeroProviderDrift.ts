import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  normalizeProviderDriftCanaryRowEvidence,
  normalizeProviderDriftEvidenceRefs,
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

const SHA256_RE = /^[a-f0-9]{64}$/i;

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

function rowKey(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "canaryId">): string {
  return `${row.provider}\u0000${row.model}\u0000${row.canaryId}`;
}

function metadataKey(row: Pick<TensorZeroProviderDriftMetadata, "provider" | "model" | "canaryId">): string {
  return `${row.provider}\u0000${row.model}\u0000${row.canaryId}`;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

function normalizedId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function activeWaivers(waivers: ProviderDriftWaiver[], now: Date): ProviderDriftWaiver[] {
  return waivers.filter((waiver) => {
    const expiresAt = Date.parse(waiver.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now.getTime();
  });
}

function waiverCoversTensorZeroAlert(waiver: ProviderDriftWaiver, alert: Omit<ProviderDriftAlert, "waived" | "waiverId">): boolean {
  if (waiver.provider && waiver.provider !== alert.provider) return false;
  if (waiver.model && waiver.model !== alert.model) return false;
  if (waiver.canaryId && waiver.canaryId !== alert.canaryId) return false;
  if (
    waiver.metricIds !== undefined
    && (!Array.isArray(waiver.metricIds) || !waiver.metricIds.includes(alert.metricId))
  ) return false;
  return normalizeProviderDriftEvidenceRefs(waiver.evidenceRefs).length > 0;
}

function recommendationFromReport(report: ProviderDriftBenchmarkReport): ProviderDriftRecommendation {
  if (report.alerts.some((alert) => !alert.waived)) return "alert";
  if (report.alerts.length > 0 && report.alerts.every((alert) => alert.waived)) return "waive";
  if (report.comparisons.some((comparison) => comparison.status === "monitor")) return "monitor";
  return "approve";
}

function buildTensorZeroProof(
  side: TensorZeroProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: TensorZeroProviderDriftMetadata | undefined,
): TensorZeroProviderDriftProof {
  const missingReasons: string[] = [];
  if (!metadata) missingReasons.push(`${side}:tensorZeroMetadata`);
  for (const field of REQUIRED_HASH_FIELDS) {
    if (!isSha256(metadata?.[field])) missingReasons.push(`${side}:${String(field)}`);
  }
  for (const field of FORBIDDEN_CONTENT_FIELDS) {
    if (metadata && Object.hasOwn(metadata as object, field)) missingReasons.push(`${side}:metadataOnly:${field}`);
  }

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

function tensorZeroAlert(
  row: ProviderDriftCanaryRow,
  proofs: TensorZeroProviderDriftProof[],
  active: ProviderDriftWaiver[],
): ProviderDriftAlert | undefined {
  const missingReasons = proofs.flatMap((proof) => proof.missingReasons);
  if (missingReasons.length === 0) return undefined;
  const evidenceRefs = [...new Set([
    ...normalizeProviderDriftEvidenceRefs(row.evidenceRefs),
    ...proofs.map((proof) => `tensorzero-proof:${proof.proofHash}`),
  ])];
  const base = {
    alertId: `pdrift:${row.provider}:${row.model}:${row.canaryId}:tensorZeroMetadataEvidence`,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    metricId: "evaluationFrameworkEvidence" as const,
    severity: "critical" as const,
    message: `TensorZero provider drift metadata proof is incomplete: ${missingReasons.join(", ")}.`,
    threshold: 1,
    observed: 0,
    evidenceRefs,
  };
  const waiver = active.find((item) => waiverCoversTensorZeroAlert(item, base));
  return {
    ...base,
    waived: Boolean(waiver),
    waiverId: waiver?.waiverId,
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
    const alert = tensorZeroAlert(row, proofs, active);
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

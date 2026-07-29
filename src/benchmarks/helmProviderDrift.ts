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

export const HELM_PROVIDER_DRIFT_SOURCE_REFS = [
  "https://crfm.stanford.edu/helm/",
] as const;

export type HelmProviderDriftSide = "baseline" | "candidate";

export interface HelmProviderDriftMetadata {
  provider: string;
  model: string;
  canaryId: string;
  /** Provider/model version observed by the HELM-backed canary. */
  providerVersion: string;
  /** HELM release, site snapshot, or runner identifier used by the canary; metadata only. */
  helmVersion: string;
  /** HELM scenario/suite identifier selected by the caller; metadata only, never copied benchmark rows. */
  scenarioSuiteId?: string;
  /** HELM run or export identifier that produced the canary result; metadata only. */
  runId?: string;
  /** Provider route/model alias under AMC control for this canary. */
  providerRouteId?: string;
  sourceRefHash?: string;
  websiteSnapshotHash?: string;
  benchmarkCatalogHash?: string;
  scenarioSuiteManifestHash?: string;
  modelRegistrySnapshotHash?: string;
  runSpecHash?: string;
  adapterConfigHash?: string;
  metricSuiteHash?: string;
  leaderboardSnapshotHash?: string;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  signedEvidenceBundleHash?: string;
  noSourceCopyProofHash?: string;
  metricIds?: string[];
  metricCount?: number;
}

export interface HelmProviderDriftProof {
  side: HelmProviderDriftSide;
  provider: string;
  model: string;
  canaryId: string;
  providerVersion?: string;
  helmVersion?: string;
  scenarioSuiteId?: string;
  runId?: string;
  providerRouteId?: string;
  metricIds: string[];
  metricCount: number;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  missingReasons: string[];
  proofHash: string;
}

export interface HelmProviderDriftScoreSurface {
  reportId: string;
  recommendation: ProviderDriftRecommendation;
  failClosed: boolean;
  providerVersions: string[];
  canaryResults: ProviderDriftBenchmarkReport["comparisons"];
  driftStatistics: Array<{ provider: string; model: string; canaryId: string; driftStatistic: number; status: string }>;
  helmEvidenceHash: string;
}

export interface HelmProviderDriftShieldSurface {
  gate: ProviderDriftCiGate;
  blocked: boolean;
  activeAlertIds: string[];
  waivedAlertIds: string[];
  helmEvidenceHash: string;
}

export interface HelmProviderDriftWatchSurface {
  alerts: ProviderDriftWatchAlert[];
  alertCount: number;
  helmEvidenceHash: string;
}

export interface RunHelmProviderDriftInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  helm: {
    baseline?: HelmProviderDriftMetadata[];
    candidate?: HelmProviderDriftMetadata[];
  };
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  evalPack?: BuildProviderDriftEvalPackInput;
  gate?: BuildProviderDriftCiGateInput;
  now?: Date | string;
}

export interface HelmProviderDriftResult {
  report: ProviderDriftBenchmarkReport;
  helmEvidence: HelmProviderDriftProof[];
  helmEvidenceHash: string;
  watchAlerts: ProviderDriftWatchAlert[];
  evalPack: ProviderDriftEvalPackManifest;
  ciGate: ProviderDriftCiGate;
  score: HelmProviderDriftScoreSurface;
  shield: HelmProviderDriftShieldSurface;
  watch: HelmProviderDriftWatchSurface;
  sourceRefs: readonly string[];
}

const SHA256_RE = /^[a-f0-9]{64}$/i;

const REQUIRED_HASH_FIELDS: Array<keyof HelmProviderDriftMetadata> = [
  "sourceRefHash",
  "websiteSnapshotHash",
  "benchmarkCatalogHash",
  "scenarioSuiteManifestHash",
  "modelRegistrySnapshotHash",
  "runSpecHash",
  "adapterConfigHash",
  "metricSuiteHash",
  "leaderboardSnapshotHash",
  "canaryResultHash",
  "driftStatisticHash",
  "alertOrWaiverHash",
  "signedEvidenceBundleHash",
  "noSourceCopyProofHash",
];

const FORBIDDEN_CONTENT_FIELDS = [
  "prompt",
  "promptText",
  "systemPrompt",
  "messages",
  "samples",
  "inputs",
  "outputs",
  "completionText",
  "responseText",
  "datasetRows",
  "benchmarkRows",
  "scenarioContents",
  "runSpec",
  "adapterConfig",
  "metricDefinitions",
  "leaderboardRows",
  "rawResults",
  "websiteText",
  "docsText",
  "copiedProse",
];

function rowKey(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "canaryId">): string {
  return `${row.provider}\u0000${row.model}\u0000${row.canaryId}`;
}

function metadataKey(row: Pick<HelmProviderDriftMetadata, "provider" | "model" | "canaryId">): string {
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

function waiverCoversHelmAlert(waiver: ProviderDriftWaiver, alert: Omit<ProviderDriftAlert, "waived" | "waiverId">): boolean {
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

function buildHelmProof(
  side: HelmProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: HelmProviderDriftMetadata | undefined,
): HelmProviderDriftProof {
  const missingReasons: string[] = [];
  if (!metadata) missingReasons.push(`${side}:helmMetadata`);
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

  const helmVersion = normalizedId(metadata?.helmVersion);
  const scenarioSuiteId = normalizedId(metadata?.scenarioSuiteId);
  const runId = normalizedId(metadata?.runId);
  const providerRouteId = normalizedId(metadata?.providerRouteId);
  if (!helmVersion) missingReasons.push(`${side}:helmVersion`);
  if (!scenarioSuiteId) missingReasons.push(`${side}:scenarioSuiteId`);
  if (!runId) missingReasons.push(`${side}:runId`);
  if (!providerRouteId) missingReasons.push(`${side}:providerRouteId`);

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
    helmVersion,
    scenarioSuiteId,
    runId,
    providerRouteId,
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

function helmAlert(
  row: ProviderDriftCanaryRow,
  proofs: HelmProviderDriftProof[],
  active: ProviderDriftWaiver[],
): ProviderDriftAlert | undefined {
  const missingReasons = proofs.flatMap((proof) => proof.missingReasons);
  if (missingReasons.length === 0) return undefined;
  const evidenceRefs = [...new Set([
    ...normalizeProviderDriftEvidenceRefs(row.evidenceRefs),
    ...proofs.map((proof) => `helm-proof:${proof.proofHash}`),
  ])];
  const base = {
    alertId: `pdrift:${row.provider}:${row.model}:${row.canaryId}:helmMetadataEvidence`,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    metricId: "evaluationFrameworkEvidence" as const,
    severity: "critical" as const,
    message: `HELM provider drift metadata proof is incomplete: ${missingReasons.join(", ")}.`,
    threshold: 1,
    observed: 0,
    evidenceRefs,
  };
  const waiver = active.find((item) => waiverCoversHelmAlert(item, base));
  return {
    ...base,
    waived: Boolean(waiver),
    waiverId: waiver?.waiverId,
  };
}

function buildScoreSurface(report: ProviderDriftBenchmarkReport, helmEvidenceHash: string): HelmProviderDriftScoreSurface {
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
    helmEvidenceHash,
  };
}

function buildShieldSurface(
  ciGate: ProviderDriftCiGate,
  report: ProviderDriftBenchmarkReport,
  helmEvidenceHash: string,
): HelmProviderDriftShieldSurface {
  return {
    gate: ciGate,
    blocked: ciGate.failClosed,
    activeAlertIds: report.alerts.filter((alert) => !alert.waived).map((alert) => alert.alertId),
    waivedAlertIds: report.alerts.filter((alert) => alert.waived).map((alert) => alert.alertId),
    helmEvidenceHash,
  };
}

function buildWatchSurface(watchAlerts: ProviderDriftWatchAlert[], helmEvidenceHash: string): HelmProviderDriftWatchSurface {
  return {
    alerts: watchAlerts,
    alertCount: watchAlerts.length,
    helmEvidenceHash,
  };
}

function coerceNow(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}

export function runHelmProviderDrift(input: RunHelmProviderDriftInput): HelmProviderDriftResult {
  const now = coerceNow(input.now);
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid HELM provider drift timestamp");
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
  const baselineMetadata = new Map((input.helm.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.helm.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(baseReport.waivers, now);
  const rowsByKey = new Map([...baseline, ...candidate].map((row) => [rowKey(row), row]));
  const helmEvidence: HelmProviderDriftProof[] = [];
  const helmAlerts: ProviderDriftAlert[] = [];

  for (const comparison of baseReport.comparisons) {
    const key = rowKey(comparison);
    const row = rowsByKey.get(key);
    if (!row) continue;
    const baselineRow = baseline.find((item) => rowKey(item) === key) ?? row;
    const candidateRow = candidate.find((item) => rowKey(item) === key) ?? row;
    const proofs = [
      buildHelmProof("baseline", baselineRow, baselineMetadata.get(key)),
      buildHelmProof("candidate", candidateRow, candidateMetadata.get(key)),
    ];
    helmEvidence.push(...proofs);
    const alert = helmAlert(row, proofs, active);
    if (alert) {
      helmAlerts.push(alert);
      if (!alert.waived) comparison.status = "alert";
      else if (comparison.status === "passed") comparison.status = "waived";
    }
  }

  const helmEvidenceHash = sha256Hex(canonicalize(helmEvidence));
  const reportWithoutSummary = {
    ...baseReport,
    alerts: [...baseReport.alerts, ...helmAlerts],
  };
  const recommendation = recommendationFromReport(reportWithoutSummary);
  const report: ProviderDriftBenchmarkReport = {
    ...reportWithoutSummary,
    recommendation,
    failClosed: reportWithoutSummary.alerts.some((alert) => !alert.waived),
    summary: `${reportWithoutSummary.comparisons.length} provider canary comparison(s), ${reportWithoutSummary.alerts.filter((alert) => !alert.waived).length} active alert(s), recommendation=${recommendation}; helmEvidenceHash=${helmEvidenceHash}`,
  };
  const watchAlerts = buildProviderDriftWatchAlerts(report);
  const evalPack = buildProviderDriftEvalPack(report, {
    sourceRefs: [...HELM_PROVIDER_DRIFT_SOURCE_REFS],
    ...input.evalPack,
  });
  const ciGate = buildProviderDriftCiGate(report, input.gate);

  return {
    report,
    helmEvidence,
    helmEvidenceHash,
    watchAlerts,
    evalPack,
    ciGate,
    score: buildScoreSurface(report, helmEvidenceHash),
    shield: buildShieldSurface(ciGate, report, helmEvidenceHash),
    watch: buildWatchSurface(watchAlerts, helmEvidenceHash),
    sourceRefs: HELM_PROVIDER_DRIFT_SOURCE_REFS,
  };
}

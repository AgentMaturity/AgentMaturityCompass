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

export const INSPECT_PROVIDER_DRIFT_SOURCE_REFS = [
  "https://inspect.aisi.org.uk/",
  "https://inspect.aisi.org.uk/llms.txt",
  "https://inspect.aisi.org.uk/index.html.md",
  "https://inspect.aisi.org.uk/models.html.md",
  "https://inspect.aisi.org.uk/eval-logs.html.md",
  "https://inspect.aisi.org.uk/scorers.html.md",
] as const;

export type InspectProviderDriftSide = "baseline" | "candidate";

export interface InspectProviderDriftMetadata {
  provider: string;
  model: string;
  canaryId: string;
  /** Provider/model version observed by the Inspect-backed canary. */
  providerVersion: string;
  /** Inspect task or task alias identifier; metadata only, not task source/config. */
  taskId?: string;
  /** Inspect eval run or log identifier; metadata only, not log contents. */
  evalRunId?: string;
  /** Inspect package/CLI version used by the canary runner. */
  inspectVersion?: string;
  /** Provider route/model alias under AMC control for this canary. */
  providerRouteId?: string;
  sourceRefHash?: string;
  websiteSnapshotHash?: string;
  docsIndexHash?: string;
  taskManifestHash?: string;
  datasetManifestHash?: string;
  solverConfigHash?: string;
  scorerConfigHash?: string;
  evalLogManifestHash?: string;
  scoreReportHash?: string;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  signedEvidenceBundleHash?: string;
  noSourceCopyProofHash?: string;
  metricIds?: string[];
  metricCount?: number;
  scorerIds?: string[];
}

export interface InspectProviderDriftProof {
  side: InspectProviderDriftSide;
  provider: string;
  model: string;
  canaryId: string;
  providerVersion?: string;
  taskId?: string;
  evalRunId?: string;
  inspectVersion?: string;
  providerRouteId?: string;
  metricIds: string[];
  metricCount: number;
  scorerIds: string[];
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  missingReasons: string[];
  proofHash: string;
}

export interface InspectProviderDriftScoreSurface {
  reportId: string;
  recommendation: ProviderDriftRecommendation;
  failClosed: boolean;
  providerVersions: string[];
  canaryResults: ProviderDriftBenchmarkReport["comparisons"];
  driftStatistics: Array<{ provider: string; model: string; canaryId: string; driftStatistic: number; status: string }>;
  inspectEvidenceHash: string;
}

export interface InspectProviderDriftShieldSurface {
  gate: ProviderDriftCiGate;
  blocked: boolean;
  activeAlertIds: string[];
  waivedAlertIds: string[];
  inspectEvidenceHash: string;
}

export interface InspectProviderDriftWatchSurface {
  alerts: ProviderDriftWatchAlert[];
  alertCount: number;
  inspectEvidenceHash: string;
}

export interface RunInspectProviderDriftInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  inspect: {
    baseline?: InspectProviderDriftMetadata[];
    candidate?: InspectProviderDriftMetadata[];
  };
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  evalPack?: BuildProviderDriftEvalPackInput;
  gate?: BuildProviderDriftCiGateInput;
  now?: Date | string;
}

export interface InspectProviderDriftResult {
  report: ProviderDriftBenchmarkReport;
  inspectEvidence: InspectProviderDriftProof[];
  inspectEvidenceHash: string;
  watchAlerts: ProviderDriftWatchAlert[];
  evalPack: ProviderDriftEvalPackManifest;
  ciGate: ProviderDriftCiGate;
  score: InspectProviderDriftScoreSurface;
  shield: InspectProviderDriftShieldSurface;
  watch: InspectProviderDriftWatchSurface;
  sourceRefs: readonly string[];
}

const SHA256_RE = /^[a-f0-9]{64}$/i;

const REQUIRED_HASH_FIELDS: Array<keyof InspectProviderDriftMetadata> = [
  "sourceRefHash",
  "websiteSnapshotHash",
  "docsIndexHash",
  "taskManifestHash",
  "datasetManifestHash",
  "solverConfigHash",
  "scorerConfigHash",
  "evalLogManifestHash",
  "scoreReportHash",
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
  "taskSource",
  "taskConfig",
  "solverConfig",
  "scorerConfig",
  "evalLog",
  "evalLogContents",
  "scoreReport",
  "rawConfig",
  "websiteText",
  "docsText",
];

function rowKey(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "canaryId">): string {
  return `${row.provider}\u0000${row.model}\u0000${row.canaryId}`;
}

function metadataKey(row: Pick<InspectProviderDriftMetadata, "provider" | "model" | "canaryId">): string {
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

function waiverCoversInspectAlert(waiver: ProviderDriftWaiver, alert: Omit<ProviderDriftAlert, "waived" | "waiverId">): boolean {
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

function buildInspectProof(
  side: InspectProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: InspectProviderDriftMetadata | undefined,
): InspectProviderDriftProof {
  const missingReasons: string[] = [];
  if (!metadata) missingReasons.push(`${side}:inspectMetadata`);
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

  const taskId = normalizedId(metadata?.taskId);
  const evalRunId = normalizedId(metadata?.evalRunId);
  const inspectVersion = normalizedId(metadata?.inspectVersion);
  const providerRouteId = normalizedId(metadata?.providerRouteId);
  if (!taskId) missingReasons.push(`${side}:taskId`);
  if (!evalRunId) missingReasons.push(`${side}:evalRunId`);
  if (!inspectVersion) missingReasons.push(`${side}:inspectVersion`);
  if (!providerRouteId) missingReasons.push(`${side}:providerRouteId`);

  const metricIds = normalizedStringList(metadata?.metricIds);
  const scorerIds = normalizedStringList(metadata?.scorerIds);
  const metricCount = Number.isFinite(metadata?.metricCount) ? Math.max(0, metadata?.metricCount ?? 0) : 0;
  if (metricIds.length === 0) missingReasons.push(`${side}:metricIds`);
  if (metricCount < Math.max(1, metricIds.length)) missingReasons.push(`${side}:metricCount`);
  if (scorerIds.length === 0) missingReasons.push(`${side}:scorerIds`);

  const proofPayload = {
    side,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion,
    taskId,
    evalRunId,
    inspectVersion,
    providerRouteId,
    metricIds,
    metricCount,
    scorerIds,
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

function inspectAlert(
  row: ProviderDriftCanaryRow,
  proofs: InspectProviderDriftProof[],
  active: ProviderDriftWaiver[],
): ProviderDriftAlert | undefined {
  const missingReasons = proofs.flatMap((proof) => proof.missingReasons);
  if (missingReasons.length === 0) return undefined;
  const evidenceRefs = [...new Set([
    ...normalizeProviderDriftEvidenceRefs(row.evidenceRefs),
    ...proofs.map((proof) => `inspect-proof:${proof.proofHash}`),
  ])];
  const base = {
    alertId: `pdrift:${row.provider}:${row.model}:${row.canaryId}:inspectMetadataEvidence`,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    metricId: "evaluationFrameworkEvidence" as const,
    severity: "critical" as const,
    message: `Inspect provider drift metadata proof is incomplete: ${missingReasons.join(", ")}.`,
    threshold: 1,
    observed: 0,
    evidenceRefs,
  };
  const waiver = active.find((item) => waiverCoversInspectAlert(item, base));
  return {
    ...base,
    waived: Boolean(waiver),
    waiverId: waiver?.waiverId,
  };
}

function buildScoreSurface(report: ProviderDriftBenchmarkReport, inspectEvidenceHash: string): InspectProviderDriftScoreSurface {
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
    inspectEvidenceHash,
  };
}

function buildShieldSurface(
  ciGate: ProviderDriftCiGate,
  report: ProviderDriftBenchmarkReport,
  inspectEvidenceHash: string,
): InspectProviderDriftShieldSurface {
  return {
    gate: ciGate,
    blocked: ciGate.failClosed,
    activeAlertIds: report.alerts.filter((alert) => !alert.waived).map((alert) => alert.alertId),
    waivedAlertIds: report.alerts.filter((alert) => alert.waived).map((alert) => alert.alertId),
    inspectEvidenceHash,
  };
}

function buildWatchSurface(watchAlerts: ProviderDriftWatchAlert[], inspectEvidenceHash: string): InspectProviderDriftWatchSurface {
  return {
    alerts: watchAlerts,
    alertCount: watchAlerts.length,
    inspectEvidenceHash,
  };
}

function coerceNow(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}

export function runInspectProviderDrift(input: RunInspectProviderDriftInput): InspectProviderDriftResult {
  const now = coerceNow(input.now);
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid Inspect provider drift timestamp");
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
  const baselineMetadata = new Map((input.inspect.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.inspect.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(baseReport.waivers, now);
  const rowsByKey = new Map([...baseline, ...candidate].map((row) => [rowKey(row), row]));
  const inspectEvidence: InspectProviderDriftProof[] = [];
  const inspectAlerts: ProviderDriftAlert[] = [];

  for (const comparison of baseReport.comparisons) {
    const key = rowKey(comparison);
    const row = rowsByKey.get(key);
    if (!row) continue;
    const baselineRow = baseline.find((item) => rowKey(item) === key) ?? row;
    const candidateRow = candidate.find((item) => rowKey(item) === key) ?? row;
    const proofs = [
      buildInspectProof("baseline", baselineRow, baselineMetadata.get(key)),
      buildInspectProof("candidate", candidateRow, candidateMetadata.get(key)),
    ];
    inspectEvidence.push(...proofs);
    const alert = inspectAlert(row, proofs, active);
    if (alert) {
      inspectAlerts.push(alert);
      if (!alert.waived) comparison.status = "alert";
      else if (comparison.status === "passed") comparison.status = "waived";
    }
  }

  const inspectEvidenceHash = sha256Hex(canonicalize(inspectEvidence));
  const reportWithoutSummary = {
    ...baseReport,
    alerts: [...baseReport.alerts, ...inspectAlerts],
  };
  const recommendation = recommendationFromReport(reportWithoutSummary);
  const report: ProviderDriftBenchmarkReport = {
    ...reportWithoutSummary,
    recommendation,
    failClosed: reportWithoutSummary.alerts.some((alert) => !alert.waived),
    summary: `${reportWithoutSummary.comparisons.length} provider canary comparison(s), ${reportWithoutSummary.alerts.filter((alert) => !alert.waived).length} active alert(s), recommendation=${recommendation}; inspectEvidenceHash=${inspectEvidenceHash}`,
  };
  const watchAlerts = buildProviderDriftWatchAlerts(report);
  const evalPack = buildProviderDriftEvalPack(report, {
    sourceRefs: [...INSPECT_PROVIDER_DRIFT_SOURCE_REFS],
    ...input.evalPack,
  });
  const ciGate = buildProviderDriftCiGate(report, input.gate);

  return {
    report,
    inspectEvidence,
    inspectEvidenceHash,
    watchAlerts,
    evalPack,
    ciGate,
    score: buildScoreSurface(report, inspectEvidenceHash),
    shield: buildShieldSurface(ciGate, report, inspectEvidenceHash),
    watch: buildWatchSurface(watchAlerts, inspectEvidenceHash),
    sourceRefs: INSPECT_PROVIDER_DRIFT_SOURCE_REFS,
  };
}

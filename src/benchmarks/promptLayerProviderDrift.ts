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
  type ProviderDriftRecommendation,
  type ProviderDriftThresholds,
  type ProviderDriftWaiver,
  type ProviderDriftWatchAlert,
} from "./providerDriftBenchmark.js";

export type PromptLayerProviderDriftSide = "baseline" | "candidate";

export interface PromptLayerProviderDriftMetadata {
  provider: string;
  model: string;
  canaryId: string;
  /** Provider/model/prompt route version observed by the canary run. */
  providerVersion: string;
  /** Prompt or template version identifier, stored as metadata only. */
  promptVersionId?: string;
  sourceRefHash?: string;
  websiteSnapshotHash?: string;
  docsIndexHash?: string;
  promptRegistryHash?: string;
  promptTemplateSetHash?: string;
  evaluationDatasetHash?: string;
  traceExportHash?: string;
  metricReportHash?: string;
  providerRouteId?: string;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  replayCommandHash?: string;
  signedEvidenceBundleHash?: string;
  noSourceCopyProofHash?: string;
  metricIds?: string[];
  metricCount?: number;
}

export interface PromptLayerProviderDriftProof {
  side: PromptLayerProviderDriftSide;
  provider: string;
  model: string;
  canaryId: string;
  providerVersion?: string;
  promptVersionId?: string;
  providerRouteId?: string;
  metricIds: string[];
  metricCount: number;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  missingReasons: string[];
  proofHash: string;
}

export interface RunPromptLayerProviderDriftInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  promptLayer: {
    baseline?: PromptLayerProviderDriftMetadata[];
    candidate?: PromptLayerProviderDriftMetadata[];
  };
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  evalPack?: BuildProviderDriftEvalPackInput;
  gate?: BuildProviderDriftCiGateInput;
  now?: Date;
}

export interface PromptLayerProviderDriftResult {
  report: ProviderDriftBenchmarkReport;
  promptLayerEvidence: PromptLayerProviderDriftProof[];
  promptLayerEvidenceHash: string;
  watchAlerts: ProviderDriftWatchAlert[];
  evalPack: ReturnType<typeof buildProviderDriftEvalPack>;
  ciGate: ReturnType<typeof buildProviderDriftCiGate>;
}

const SHA256_RE = /^[a-f0-9]{64}$/i;

const REQUIRED_HASH_FIELDS: Array<keyof PromptLayerProviderDriftMetadata> = [
  "sourceRefHash",
  "websiteSnapshotHash",
  "docsIndexHash",
  "promptRegistryHash",
  "promptTemplateSetHash",
  "evaluationDatasetHash",
  "traceExportHash",
  "metricReportHash",
  "canaryResultHash",
  "driftStatisticHash",
  "alertOrWaiverHash",
  "replayCommandHash",
  "signedEvidenceBundleHash",
  "noSourceCopyProofHash",
];

const FORBIDDEN_CONTENT_FIELDS = [
  "promptText",
  "promptTemplate",
  "templateText",
  "completionText",
  "responseText",
  "tracePayload",
  "datasetRows",
];

function rowKey(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "canaryId">): string {
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

function metadataKey(row: Pick<PromptLayerProviderDriftMetadata, "provider" | "model" | "canaryId">): string {
  return `${row.provider}\u0000${row.model}\u0000${row.canaryId}`;
}

function activeWaivers(waivers: ProviderDriftWaiver[], now: Date): ProviderDriftWaiver[] {
  return waivers.filter((waiver) => {
    const expiresAt = Date.parse(waiver.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now.getTime();
  });
}

function waiverCoversPromptLayerAlert(waiver: ProviderDriftWaiver, alert: Omit<ProviderDriftAlert, "waived" | "waiverId">): boolean {
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

function buildPromptLayerProof(
  side: PromptLayerProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: PromptLayerProviderDriftMetadata | undefined,
): PromptLayerProviderDriftProof {
  const missingReasons: string[] = [];
  if (!metadata) {
    missingReasons.push(`${side}:promptLayerMetadata`);
  }
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
  if (!normalizedId(metadata?.promptVersionId)) missingReasons.push(`${side}:promptVersionId`);
  if (!normalizedId(metadata?.providerRouteId)) missingReasons.push(`${side}:providerRouteId`);
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
    promptVersionId: normalizedId(metadata?.promptVersionId),
    providerRouteId: normalizedId(metadata?.providerRouteId),
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

function promptLayerAlert(
  report: ProviderDriftBenchmarkReport,
  row: ProviderDriftCanaryRow,
  proofs: PromptLayerProviderDriftProof[],
  active: ProviderDriftWaiver[],
): ProviderDriftAlert | undefined {
  const missingReasons = proofs.flatMap((proof) => proof.missingReasons);
  if (missingReasons.length === 0) return undefined;
  const evidenceRefs = [...new Set([
    ...normalizeProviderDriftEvidenceRefs(row.evidenceRefs),
    ...proofs.map((proof) => `promptlayer-proof:${proof.proofHash}`),
  ])];
  const base = {
    alertId: `pdrift:${row.provider}:${row.model}:${row.canaryId}:promptLayerMetadataEvidence`,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    metricId: "observabilityPipelineEvidence" as const,
    severity: "critical" as const,
    message: `PromptLayer relevance metadata proof is incomplete: ${missingReasons.join(", ")}.`,
    threshold: 1,
    observed: 0,
    evidenceRefs,
  };
  const waiver = active.find((item) => waiverCoversPromptLayerAlert(item, base));
  return {
    ...base,
    waived: Boolean(waiver),
    waiverId: waiver?.waiverId,
  };
}

export function runPromptLayerProviderDrift(input: RunPromptLayerProviderDriftInput): PromptLayerProviderDriftResult {
  const now = input.now ?? new Date();
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
  const baselineMetadata = new Map((input.promptLayer.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.promptLayer.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(baseReport.waivers, now);
  const rowsByKey = new Map([...baseline, ...candidate].map((row) => [rowKey(row), row]));
  const promptLayerEvidence: PromptLayerProviderDriftProof[] = [];
  const promptLayerAlerts: ProviderDriftAlert[] = [];

  for (const comparison of baseReport.comparisons) {
    const key = rowKey(comparison);
    const row = rowsByKey.get(key);
    if (!row) continue;
    const baselineRow = baseline.find((item) => rowKey(item) === key) ?? row;
    const candidateRow = candidate.find((item) => rowKey(item) === key) ?? row;
    const proofs = [
      buildPromptLayerProof("baseline", baselineRow, baselineMetadata.get(key)),
      buildPromptLayerProof("candidate", candidateRow, candidateMetadata.get(key)),
    ];
    promptLayerEvidence.push(...proofs);
    const alert = promptLayerAlert(baseReport, row, proofs, active);
    if (alert) {
      promptLayerAlerts.push(alert);
      if (!alert.waived) comparison.status = "alert";
      else if (comparison.status === "passed") comparison.status = "waived";
    }
  }

  const promptLayerEvidenceHash = sha256Hex(canonicalize(promptLayerEvidence));
  const reportWithoutSummary = {
    ...baseReport,
    alerts: [...baseReport.alerts, ...promptLayerAlerts],
  };
  const recommendation = recommendationFromReport(reportWithoutSummary);
  const report: ProviderDriftBenchmarkReport = {
    ...reportWithoutSummary,
    recommendation,
    failClosed: reportWithoutSummary.alerts.some((alert) => !alert.waived),
    summary: `${reportWithoutSummary.comparisons.length} provider canary comparison(s), ${reportWithoutSummary.alerts.filter((alert) => !alert.waived).length} active alert(s), recommendation=${recommendation}; promptLayerEvidenceHash=${promptLayerEvidenceHash}`,
  };

  return {
    report,
    promptLayerEvidence,
    promptLayerEvidenceHash,
    watchAlerts: buildProviderDriftWatchAlerts(report),
    evalPack: buildProviderDriftEvalPack(report, input.evalPack),
    ciGate: buildProviderDriftCiGate(report, input.gate),
  };
}

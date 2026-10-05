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

import {
  hashProviderDriftProof,
  projectProviderDriftScore,
  projectProviderDriftShield,
  providerDriftProofMetricCount,
  providerDriftProofVersion,
  validateProviderDriftProofMetricCoverage,
} from "./providerDriftRowContracts.js";

export const HUMANLOOP_PROVIDER_DRIFT_SOURCE_REFS = [
  "https://humanloop.com/docs/getting-started/overview.md",
  "https://humanloop.com/docs/guides/migrating-from-humanloop.md",
  "https://humanloop.com/docs/guides/observability/monitoring.md",
  "https://humanloop.com/docs/guides/evals/run-evaluation-api.md",
] as const;

export type HumanloopProviderDriftSide = "baseline" | "candidate";

export interface HumanloopProviderDriftMetadata {
  provider: string;
  model: string;
  canaryId: string;
  /** Provider/model version observed by the Humanloop evaluation or monitoring canary. */
  providerVersion: string;
  /** Humanloop File/Prompt/Agent version identifier; metadata only, never exported content. */
  fileVersionId?: string;
  /** Humanloop Environment used for the canary, e.g. development/staging/production. */
  environmentId?: string;
  /** Humanloop Evaluation Run or online Evaluator result batch identifier. */
  evaluationRunId?: string;
  sourceRefHash?: string;
  websiteSnapshotHash?: string;
  docsIndexHash?: string;
  fileVersionExportHash?: string;
  logsExportHash?: string;
  datasetHash?: string;
  evaluatorConfigHash?: string;
  evaluatorResultsHash?: string;
  providerRouteId?: string;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  signedEvidenceBundleHash?: string;
  noSourceCopyProofHash?: string;
  metricIds?: string[];
  metricCount?: number;
}

export interface HumanloopProviderDriftProof {
  side: HumanloopProviderDriftSide;
  provider: string;
  model: string;
  canaryId: string;
  providerVersion?: string;
  fileVersionId?: string;
  environmentId?: string;
  evaluationRunId?: string;
  providerRouteId?: string;
  metricIds: string[];
  metricCount: number;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  missingReasons: string[];
  proofHash: string;
}

export interface HumanloopProviderDriftScoreSurface {
  reportId: string;
  recommendation: ProviderDriftRecommendation;
  failClosed: boolean;
  providerVersions: string[];
  driftStatistics: Array<{ provider: string; model: string; canaryId: string; driftStatistic: number; status: string }>;
  humanloopEvidenceHash: string;
}

export interface HumanloopProviderDriftShieldSurface {
  gate: ProviderDriftCiGate;
  blocked: boolean;
  activeAlertIds: string[];
  waivedAlertIds: string[];
  humanloopEvidenceHash: string;
}

export interface HumanloopProviderDriftWatchSurface {
  alerts: ProviderDriftWatchAlert[];
  alertCount: number;
  humanloopEvidenceHash: string;
}

export interface RunHumanloopProviderDriftInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  humanloop: {
    baseline?: HumanloopProviderDriftMetadata[];
    candidate?: HumanloopProviderDriftMetadata[];
  };
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  evalPack?: BuildProviderDriftEvalPackInput;
  gate?: BuildProviderDriftCiGateInput;
  now?: Date | string;
}

export interface HumanloopProviderDriftResult {
  report: ProviderDriftBenchmarkReport;
  humanloopEvidence: HumanloopProviderDriftProof[];
  humanloopEvidenceHash: string;
  watchAlerts: ProviderDriftWatchAlert[];
  evalPack: ProviderDriftEvalPackManifest;
  ciGate: ProviderDriftCiGate;
  score: HumanloopProviderDriftScoreSurface;
  shield: HumanloopProviderDriftShieldSurface;
  watch: HumanloopProviderDriftWatchSurface;
  sourceRefs: readonly string[];
}

const REQUIRED_HASH_FIELDS: Array<keyof HumanloopProviderDriftMetadata> = [
  "sourceRefHash",
  "websiteSnapshotHash",
  "docsIndexHash",
  "fileVersionExportHash",
  "logsExportHash",
  "datasetHash",
  "evaluatorConfigHash",
  "evaluatorResultsHash",
  "canaryResultHash",
  "driftStatisticHash",
  "alertOrWaiverHash",
  "signedEvidenceBundleHash",
  "noSourceCopyProofHash",
];

const FORBIDDEN_CONTENT_FIELDS = [
  "promptText",
  "promptTemplate",
  "templateText",
  "messages",
  "inputs",
  "outputs",
  "completionText",
  "responseText",
  "logPayload",
  "tracePayload",
  "datasetRows",
  "fileContents",
  "versionContents",
];

const descriptor = createProviderDriftDescriptor<HumanloopProviderDriftMetadata>({
  metadataReason: "humanloopMetadata",
  requiredHashFields: REQUIRED_HASH_FIELDS,
  forbiddenContentFields: FORBIDDEN_CONTENT_FIELDS,
  proofRefPrefix: "humanloop-proof",
  alertIdSuffix: "humanloopMetadataEvidence",
  metricId: "observabilityPipelineEvidence",
  incompleteMessage: "Humanloop provider drift metadata proof is incomplete",
});

function buildHumanloopProof(
  side: HumanloopProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: HumanloopProviderDriftMetadata | undefined,
): HumanloopProviderDriftProof {
  const missingReasons = descriptor.missingReasons(side, metadata);

  const providerVersion = providerDriftProofVersion(side, row, metadata, missingReasons);
  const fileVersionId = normalizedId(metadata?.fileVersionId);
  const environmentId = normalizedId(metadata?.environmentId);
  const evaluationRunId = normalizedId(metadata?.evaluationRunId);
  const providerRouteId = normalizedId(metadata?.providerRouteId);
  if (!fileVersionId) missingReasons.push(`${side}:fileVersionId`);
  if (!environmentId) missingReasons.push(`${side}:environmentId`);
  if (!evaluationRunId) missingReasons.push(`${side}:evaluationRunId`);
  if (!providerRouteId) missingReasons.push(`${side}:providerRouteId`);

  const metricIds = normalizedStringList(metadata?.metricIds);
  const metricCount = providerDriftProofMetricCount(metadata);
  validateProviderDriftProofMetricCoverage(side, metricIds, metricCount, missingReasons);

  const proofPayload = {
    side,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion,
    fileVersionId,
    environmentId,
    evaluationRunId,
    providerRouteId,
    metricIds,
    metricCount,
    canaryResultHash: isSha256(metadata?.canaryResultHash) ? metadata?.canaryResultHash.toLowerCase() : undefined,
    driftStatisticHash: isSha256(metadata?.driftStatisticHash) ? metadata?.driftStatisticHash.toLowerCase() : undefined,
    alertOrWaiverHash: isSha256(metadata?.alertOrWaiverHash) ? metadata?.alertOrWaiverHash.toLowerCase() : undefined,
    missingReasons,
  };
  return hashProviderDriftProof(proofPayload);
}

function buildScoreSurface(report: ProviderDriftBenchmarkReport, humanloopEvidenceHash: string): HumanloopProviderDriftScoreSurface {
  return {
    ...projectProviderDriftScore(report, false),
    humanloopEvidenceHash,
  };
}

function buildShieldSurface(
  ciGate: ProviderDriftCiGate,
  report: ProviderDriftBenchmarkReport,
  humanloopEvidenceHash: string,
): HumanloopProviderDriftShieldSurface {
  return {
    ...projectProviderDriftShield(ciGate, report),
    humanloopEvidenceHash,
  };
}

function buildWatchSurface(watchAlerts: ProviderDriftWatchAlert[], humanloopEvidenceHash: string): HumanloopProviderDriftWatchSurface {
  return {
    alerts: watchAlerts,
    alertCount: watchAlerts.length,
    humanloopEvidenceHash,
  };
}

function coerceNow(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}

export function runHumanloopProviderDrift(input: RunHumanloopProviderDriftInput): HumanloopProviderDriftResult {
  const now = coerceNow(input.now);
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid Humanloop provider drift timestamp");
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
  const baselineMetadata = new Map((input.humanloop.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.humanloop.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(baseReport.waivers, now);
  const rowsByKey = new Map([...baseline, ...candidate].map((row) => [rowKey(row), row]));
  const humanloopEvidence: HumanloopProviderDriftProof[] = [];
  const humanloopAlerts: ProviderDriftAlert[] = [];

  for (const comparison of baseReport.comparisons) {
    const key = rowKey(comparison);
    const row = rowsByKey.get(key);
    if (!row) continue;
    const baselineRow = baseline.find((item) => rowKey(item) === key) ?? row;
    const candidateRow = candidate.find((item) => rowKey(item) === key) ?? row;
    const proofs = [
      buildHumanloopProof("baseline", baselineRow, baselineMetadata.get(key)),
      buildHumanloopProof("candidate", candidateRow, candidateMetadata.get(key)),
    ];
    humanloopEvidence.push(...proofs);
    const alert = descriptor.alert(row, proofs, active);
    if (alert) {
      humanloopAlerts.push(alert);
      if (!alert.waived) comparison.status = "alert";
      else if (comparison.status === "passed") comparison.status = "waived";
    }
  }

  const humanloopEvidenceHash = sha256Hex(canonicalize(humanloopEvidence));
  const reportWithoutSummary = {
    ...baseReport,
    alerts: [...baseReport.alerts, ...humanloopAlerts],
  };
  const recommendation = recommendationFromReport(reportWithoutSummary);
  const report: ProviderDriftBenchmarkReport = {
    ...reportWithoutSummary,
    recommendation,
    failClosed: reportWithoutSummary.alerts.some((alert) => !alert.waived),
    summary: `${reportWithoutSummary.comparisons.length} provider canary comparison(s), ${reportWithoutSummary.alerts.filter((alert) => !alert.waived).length} active alert(s), recommendation=${recommendation}; humanloopEvidenceHash=${humanloopEvidenceHash}`,
  };
  const watchAlerts = buildProviderDriftWatchAlerts(report);
  const evalPack = buildProviderDriftEvalPack(report, {
    sourceRefs: [...HUMANLOOP_PROVIDER_DRIFT_SOURCE_REFS],
    ...input.evalPack,
  });
  const ciGate = buildProviderDriftCiGate(report, input.gate);

  return {
    report,
    humanloopEvidence,
    humanloopEvidenceHash,
    watchAlerts,
    evalPack,
    ciGate,
    score: buildScoreSurface(report, humanloopEvidenceHash),
    shield: buildShieldSurface(ciGate, report, humanloopEvidenceHash),
    watch: buildWatchSurface(watchAlerts, humanloopEvidenceHash),
    sourceRefs: HUMANLOOP_PROVIDER_DRIFT_SOURCE_REFS,
  };
}

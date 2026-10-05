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

const descriptor = createProviderDriftDescriptor<InspectProviderDriftMetadata>({
  metadataReason: "inspectMetadata",
  requiredHashFields: REQUIRED_HASH_FIELDS,
  forbiddenContentFields: FORBIDDEN_CONTENT_FIELDS,
  proofRefPrefix: "inspect-proof",
  alertIdSuffix: "inspectMetadataEvidence",
  metricId: "evaluationFrameworkEvidence",
  incompleteMessage: "Inspect provider drift metadata proof is incomplete",
});

function buildInspectProof(
  side: InspectProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: InspectProviderDriftMetadata | undefined,
): InspectProviderDriftProof {
  const missingReasons = descriptor.missingReasons(side, metadata);

  const providerVersion = providerDriftProofVersion(side, row, metadata, missingReasons);

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
  const metricCount = providerDriftProofMetricCount(metadata);
  validateProviderDriftProofMetricCoverage(side, metricIds, metricCount, missingReasons);
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
  return hashProviderDriftProof(proofPayload);
}

function buildScoreSurface(report: ProviderDriftBenchmarkReport, inspectEvidenceHash: string): InspectProviderDriftScoreSurface {
  return {
    ...projectProviderDriftScore(report, true),
    inspectEvidenceHash,
  };
}

function buildShieldSurface(
  ciGate: ProviderDriftCiGate,
  report: ProviderDriftBenchmarkReport,
  inspectEvidenceHash: string,
): InspectProviderDriftShieldSurface {
  return {
    ...projectProviderDriftShield(ciGate, report),
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
    const alert = descriptor.alert(row, proofs, active);
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

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

export const PATRONUS_PROVIDER_DRIFT_SOURCE_REFS = [
  "https://www.patronus.ai/",
] as const;

export type PatronusProviderDriftSide = "baseline" | "candidate";

export interface PatronusProviderDriftMetadata {
  provider: string;
  model: string;
  canaryId: string;
  /** Provider/model version observed by the provider drift canary. */
  providerVersion: string;
  /** External evaluation project identifier; metadata only, never copied datasets/prompts/results. */
  projectId?: string;
  /** External evaluation run or experiment identifier; metadata only. */
  evaluationRunId?: string;
  sourceRefHash?: string;
  websiteSnapshotHash?: string;
  docsIndexHash?: string;
  datasetHash?: string;
  evaluatorConfigHash?: string;
  traceExportHash?: string;
  providerRouteHash?: string;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  signedEvidenceBundleHash?: string;
  noSourceCopyProofHash?: string;
  metricIds?: string[];
  metricCount?: number;
}

export interface PatronusProviderDriftProof {
  side: PatronusProviderDriftSide;
  provider: string;
  model: string;
  canaryId: string;
  providerVersion?: string;
  projectId?: string;
  evaluationRunId?: string;
  metricIds: string[];
  metricCount: number;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  missingReasons: string[];
  proofHash: string;
}

export interface PatronusProviderDriftScoreSurface {
  reportId: string;
  recommendation: ProviderDriftRecommendation;
  failClosed: boolean;
  providerVersions: string[];
  canaryResults: ProviderDriftBenchmarkReport["comparisons"];
  driftStatistics: Array<{ provider: string; model: string; canaryId: string; driftStatistic: number; status: string }>;
  patronusEvidenceHash: string;
}

export interface PatronusProviderDriftShieldSurface {
  gate: ProviderDriftCiGate;
  blocked: boolean;
  activeAlertIds: string[];
  waivedAlertIds: string[];
  patronusEvidenceHash: string;
}

export interface PatronusProviderDriftWatchSurface {
  alerts: ProviderDriftWatchAlert[];
  alertCount: number;
  patronusEvidenceHash: string;
}

export interface RunPatronusProviderDriftInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  patronus: {
    baseline?: PatronusProviderDriftMetadata[];
    candidate?: PatronusProviderDriftMetadata[];
  };
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  evalPack?: BuildProviderDriftEvalPackInput;
  gate?: BuildProviderDriftCiGateInput;
  now?: Date | string;
}

export interface PatronusProviderDriftResult {
  report: ProviderDriftBenchmarkReport;
  patronusEvidence: PatronusProviderDriftProof[];
  patronusEvidenceHash: string;
  watchAlerts: ProviderDriftWatchAlert[];
  evalPack: ProviderDriftEvalPackManifest;
  ciGate: ProviderDriftCiGate;
  score: PatronusProviderDriftScoreSurface;
  shield: PatronusProviderDriftShieldSurface;
  watch: PatronusProviderDriftWatchSurface;
  sourceRefs: readonly string[];
}

const REQUIRED_HASH_FIELDS: Array<keyof PatronusProviderDriftMetadata> = [
  "sourceRefHash",
  "websiteSnapshotHash",
  "docsIndexHash",
  "datasetHash",
  "evaluatorConfigHash",
  "traceExportHash",
  "providerRouteHash",
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
  "evalConfig",
  "rawConfig",
  "guardrailConfig",
  "websiteText",
  "docsText",
];

const descriptor = createProviderDriftDescriptor<PatronusProviderDriftMetadata>({
  metadataReason: "patronusMetadata",
  requiredHashFields: REQUIRED_HASH_FIELDS,
  forbiddenContentFields: FORBIDDEN_CONTENT_FIELDS,
  proofRefPrefix: "patronus-proof",
  alertIdSuffix: "patronusMetadataEvidence",
  metricId: "evaluationFrameworkEvidence",
  incompleteMessage: "Patronus provider drift metadata proof is incomplete",
});

function buildPatronusProof(
  side: PatronusProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: PatronusProviderDriftMetadata | undefined,
): PatronusProviderDriftProof {
  const missingReasons = descriptor.missingReasons(side, metadata);

  const providerVersion = providerDriftProofVersion(side, row, metadata, missingReasons);
  const projectId = normalizedId(metadata?.projectId);
  const evaluationRunId = normalizedId(metadata?.evaluationRunId);
  if (!projectId) missingReasons.push(`${side}:projectId`);
  if (!evaluationRunId) missingReasons.push(`${side}:evaluationRunId`);

  const metricIds = normalizedStringList(metadata?.metricIds);
  const metricCount = providerDriftProofMetricCount(metadata);
  validateProviderDriftProofMetricCoverage(side, metricIds, metricCount, missingReasons);

  const proofPayload = {
    side,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion,
    projectId,
    evaluationRunId,
    metricIds,
    metricCount,
    canaryResultHash: isSha256(metadata?.canaryResultHash) ? metadata?.canaryResultHash.toLowerCase() : undefined,
    driftStatisticHash: isSha256(metadata?.driftStatisticHash) ? metadata?.driftStatisticHash.toLowerCase() : undefined,
    alertOrWaiverHash: isSha256(metadata?.alertOrWaiverHash) ? metadata?.alertOrWaiverHash.toLowerCase() : undefined,
    missingReasons,
  };
  return hashProviderDriftProof(proofPayload);
}

function buildScoreSurface(report: ProviderDriftBenchmarkReport, patronusEvidenceHash: string): PatronusProviderDriftScoreSurface {
  return {
    ...projectProviderDriftScore(report, true),
    patronusEvidenceHash,
  };
}

function buildShieldSurface(
  ciGate: ProviderDriftCiGate,
  report: ProviderDriftBenchmarkReport,
  patronusEvidenceHash: string,
): PatronusProviderDriftShieldSurface {
  return {
    ...projectProviderDriftShield(ciGate, report),
    patronusEvidenceHash,
  };
}

function buildWatchSurface(watchAlerts: ProviderDriftWatchAlert[], patronusEvidenceHash: string): PatronusProviderDriftWatchSurface {
  return {
    alerts: watchAlerts,
    alertCount: watchAlerts.length,
    patronusEvidenceHash,
  };
}

function coerceNow(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}

export function runPatronusProviderDrift(input: RunPatronusProviderDriftInput): PatronusProviderDriftResult {
  const now = coerceNow(input.now);
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Invalid Patronus provider drift timestamp");
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
  const baselineMetadata = new Map((input.patronus.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.patronus.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(baseReport.waivers, now);
  const rowsByKey = new Map([...baseline, ...candidate].map((row) => [rowKey(row), row]));
  const patronusEvidence: PatronusProviderDriftProof[] = [];
  const patronusAlerts: ProviderDriftAlert[] = [];

  for (const comparison of baseReport.comparisons) {
    const key = rowKey(comparison);
    const row = rowsByKey.get(key);
    if (!row) continue;
    const baselineRow = baseline.find((item) => rowKey(item) === key) ?? row;
    const candidateRow = candidate.find((item) => rowKey(item) === key) ?? row;
    const proofs = [
      buildPatronusProof("baseline", baselineRow, baselineMetadata.get(key)),
      buildPatronusProof("candidate", candidateRow, candidateMetadata.get(key)),
    ];
    patronusEvidence.push(...proofs);
    const alert = descriptor.alert(row, proofs, active);
    if (alert) {
      patronusAlerts.push(alert);
      if (!alert.waived) comparison.status = "alert";
      else if (comparison.status === "passed") comparison.status = "waived";
    }
  }

  const patronusEvidenceHash = sha256Hex(canonicalize(patronusEvidence));
  const reportWithoutSummary = {
    ...baseReport,
    alerts: [...baseReport.alerts, ...patronusAlerts],
  };
  const recommendation = recommendationFromReport(reportWithoutSummary);
  const report: ProviderDriftBenchmarkReport = {
    ...reportWithoutSummary,
    recommendation,
    failClosed: reportWithoutSummary.alerts.some((alert) => !alert.waived),
    summary: `${reportWithoutSummary.comparisons.length} provider canary comparison(s), ${reportWithoutSummary.alerts.filter((alert) => !alert.waived).length} active alert(s), recommendation=${recommendation}; patronusEvidenceHash=${patronusEvidenceHash}`,
  };
  const watchAlerts = buildProviderDriftWatchAlerts(report);
  const evalPack = buildProviderDriftEvalPack(report, {
    sourceRefs: [...PATRONUS_PROVIDER_DRIFT_SOURCE_REFS],
    ...input.evalPack,
  });
  const ciGate = buildProviderDriftCiGate(report, input.gate);

  return {
    report,
    patronusEvidence,
    patronusEvidenceHash,
    watchAlerts,
    evalPack,
    ciGate,
    score: buildScoreSurface(report, patronusEvidenceHash),
    shield: buildShieldSurface(ciGate, report, patronusEvidenceHash),
    watch: buildWatchSurface(watchAlerts, patronusEvidenceHash),
    sourceRefs: PATRONUS_PROVIDER_DRIFT_SOURCE_REFS,
  };
}

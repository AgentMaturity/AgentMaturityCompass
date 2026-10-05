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
  providerDriftProofMetricCount,
  providerDriftProofVersion,
  validateProviderDriftProofMetricCoverage,
} from "./providerDriftRowContracts.js";

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

const descriptor = createProviderDriftDescriptor<PromptLayerProviderDriftMetadata>({
  metadataReason: "promptLayerMetadata",
  requiredHashFields: REQUIRED_HASH_FIELDS,
  forbiddenContentFields: FORBIDDEN_CONTENT_FIELDS,
  proofRefPrefix: "promptlayer-proof",
  alertIdSuffix: "promptLayerMetadataEvidence",
  metricId: "observabilityPipelineEvidence",
  incompleteMessage: "PromptLayer relevance metadata proof is incomplete",
});

function buildPromptLayerProof(
  side: PromptLayerProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: PromptLayerProviderDriftMetadata | undefined,
): PromptLayerProviderDriftProof {
  const missingReasons = descriptor.missingReasons(side, metadata);

  const providerVersion = providerDriftProofVersion(side, row, metadata, missingReasons);
  if (!normalizedId(metadata?.promptVersionId)) missingReasons.push(`${side}:promptVersionId`);
  if (!normalizedId(metadata?.providerRouteId)) missingReasons.push(`${side}:providerRouteId`);
  const metricIds = normalizedStringList(metadata?.metricIds);
  const metricCount = providerDriftProofMetricCount(metadata);
  validateProviderDriftProofMetricCoverage(side, metricIds, metricCount, missingReasons);

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
  return hashProviderDriftProof(proofPayload);
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
    const alert = descriptor.alert(row, proofs, active);
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

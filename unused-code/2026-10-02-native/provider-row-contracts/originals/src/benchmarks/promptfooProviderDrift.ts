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

export type PromptfooProviderDriftSide = "baseline" | "candidate";

export interface PromptfooProviderDriftMetadata {
  provider: string;
  model: string;
  canaryId: string;
  /** Provider/model version observed by the canary run. */
  providerVersion: string;
  /** promptfoo package/release identifier used to run or review the canary. */
  promptfooVersion: string;
  sourceRefHash?: string;
  repositorySnapshotHash?: string;
  packageManifestHash?: string;
  benchmarksModuleHash?: string;
  watchModuleHash?: string;
  apiModuleHash?: string;
  providerRouteHash?: string;
  evalConfigHash?: string;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  replayCommandHash?: string;
  signedEvidenceBundleHash?: string;
  noSourceCopyProofHash?: string;
  metricIds?: string[];
  metricCount?: number;
}

export interface PromptfooProviderDriftProof {
  side: PromptfooProviderDriftSide;
  provider: string;
  model: string;
  canaryId: string;
  providerVersion?: string;
  promptfooVersion?: string;
  metricIds: string[];
  metricCount: number;
  canaryResultHash?: string;
  driftStatisticHash?: string;
  alertOrWaiverHash?: string;
  missingReasons: string[];
  proofHash: string;
}

export interface RunPromptfooProviderDriftInput {
  agentId: string;
  baseline: ProviderDriftCanaryRow[];
  candidate: ProviderDriftCanaryRow[];
  promptfoo: {
    baseline?: PromptfooProviderDriftMetadata[];
    candidate?: PromptfooProviderDriftMetadata[];
  };
  thresholds?: Partial<ProviderDriftThresholds>;
  waivers?: ProviderDriftWaiver[];
  evalPack?: BuildProviderDriftEvalPackInput;
  gate?: BuildProviderDriftCiGateInput;
  now?: Date;
}

export interface PromptfooProviderDriftResult {
  report: ProviderDriftBenchmarkReport;
  promptfooEvidence: PromptfooProviderDriftProof[];
  promptfooEvidenceHash: string;
  watchAlerts: ProviderDriftWatchAlert[];
  evalPack: ReturnType<typeof buildProviderDriftEvalPack>;
  ciGate: ReturnType<typeof buildProviderDriftCiGate>;
}

const REQUIRED_HASH_FIELDS: Array<keyof PromptfooProviderDriftMetadata> = [
  "sourceRefHash",
  "repositorySnapshotHash",
  "packageManifestHash",
  "benchmarksModuleHash",
  "watchModuleHash",
  "apiModuleHash",
  "providerRouteHash",
  "evalConfigHash",
  "canaryResultHash",
  "driftStatisticHash",
  "alertOrWaiverHash",
  "replayCommandHash",
  "signedEvidenceBundleHash",
  "noSourceCopyProofHash",
];

const FORBIDDEN_CONTENT_FIELDS = [
  "prompt",
  "promptText",
  "vars",
  "assertions",
  "config",
  "configYaml",
  "rawConfig",
  "providerResponse",
  "completionText",
  "tracePayload",
  "datasetRows",
  "upstreamProse",
];

const descriptor = createProviderDriftDescriptor<PromptfooProviderDriftMetadata>({
  metadataReason: "promptfooMetadata",
  requiredHashFields: REQUIRED_HASH_FIELDS,
  forbiddenContentFields: FORBIDDEN_CONTENT_FIELDS,
  proofRefPrefix: "promptfoo-proof",
  alertIdSuffix: "promptfooMetadataEvidence",
  metricId: "evaluationFrameworkEvidence",
  incompleteMessage: "promptfoo provider-drift metadata proof is incomplete",
});

function buildPromptfooProof(
  side: PromptfooProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: PromptfooProviderDriftMetadata | undefined,
): PromptfooProviderDriftProof {
  const missingReasons = descriptor.missingReasons(side, metadata);

  const providerVersion = normalizedId(metadata?.providerVersion);
  if (!providerVersion) {
    missingReasons.push(`${side}:providerVersion`);
  } else if (row.version && providerVersion !== row.version) {
    missingReasons.push(`${side}:providerVersionMismatch`);
  }
  const promptfooVersion = normalizedId(metadata?.promptfooVersion);
  if (!promptfooVersion) missingReasons.push(`${side}:promptfooVersion`);
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
    promptfooVersion,
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

export function runPromptfooProviderDrift(input: RunPromptfooProviderDriftInput): PromptfooProviderDriftResult {
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
  const baselineMetadata = new Map((input.promptfoo.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.promptfoo.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(baseReport.waivers, now);
  const rowsByKey = new Map<string, { baseline?: ProviderDriftCanaryRow; candidate?: ProviderDriftCanaryRow }>();
  for (const row of baseline) {
    rowsByKey.set(rowKey(row), { ...(rowsByKey.get(rowKey(row)) ?? {}), baseline: row });
  }
  for (const row of candidate) {
    rowsByKey.set(rowKey(row), { ...(rowsByKey.get(rowKey(row)) ?? {}), candidate: row });
  }
  const promptfooEvidence: PromptfooProviderDriftProof[] = [];
  const promptfooAlerts: ProviderDriftAlert[] = [];

  for (const [key, rows] of rowsByKey.entries()) {
    const alertRow = rows.candidate ?? rows.baseline;
    if (!alertRow) continue;
    const baselineProof = buildPromptfooProof("baseline", rows.baseline ?? alertRow, baselineMetadata.get(key));
    const candidateProof = buildPromptfooProof("candidate", rows.candidate ?? alertRow, candidateMetadata.get(key));
    promptfooEvidence.push(baselineProof, candidateProof);
    const alert = descriptor.alert(alertRow, [baselineProof, candidateProof], active);
    if (alert) promptfooAlerts.push(alert);
  }

  const alerts = [...baseReport.alerts, ...promptfooAlerts];
  const recommendation = recommendationFromReport({ ...baseReport, alerts });
  const report: ProviderDriftBenchmarkReport = {
    ...baseReport,
    alerts,
    recommendation,
    failClosed: alerts.some((alert) => !alert.waived),
  };
  const promptfooEvidenceHash = sha256Hex(canonicalize(promptfooEvidence));
  const evalPack = buildProviderDriftEvalPack(report, input.evalPack);
  const ciGate = buildProviderDriftCiGate(report, input.gate);
  const watchAlerts = buildProviderDriftWatchAlerts(report);
  return {
    report,
    promptfooEvidence,
    promptfooEvidenceHash,
    watchAlerts,
    evalPack,
    ciGate,
  };
}

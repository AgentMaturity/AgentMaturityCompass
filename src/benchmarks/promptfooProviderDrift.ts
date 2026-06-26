import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
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

const SHA256_RE = /^[a-f0-9]{64}$/i;

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

function rowKey(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "canaryId">): string {
  return `${row.provider}\u0000${row.model}\u0000${row.canaryId}`;
}

function metadataKey(row: Pick<PromptfooProviderDriftMetadata, "provider" | "model" | "canaryId">): string {
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

function waiverCoversPromptfooAlert(waiver: ProviderDriftWaiver, alert: Omit<ProviderDriftAlert, "waived" | "waiverId">): boolean {
  if (waiver.provider && waiver.provider !== alert.provider) return false;
  if (waiver.model && waiver.model !== alert.model) return false;
  if (waiver.canaryId && waiver.canaryId !== alert.canaryId) return false;
  if (waiver.metricIds && !waiver.metricIds.includes(alert.metricId)) return false;
  return waiver.evidenceRefs.length > 0;
}

function recommendationFromReport(report: ProviderDriftBenchmarkReport): ProviderDriftRecommendation {
  if (report.alerts.some((alert) => !alert.waived)) return "alert";
  if (report.alerts.length > 0 && report.alerts.every((alert) => alert.waived)) return "waive";
  if (report.comparisons.some((comparison) => comparison.status === "monitor")) return "monitor";
  return "approve";
}

function buildPromptfooProof(
  side: PromptfooProviderDriftSide,
  row: ProviderDriftCanaryRow,
  metadata: PromptfooProviderDriftMetadata | undefined,
): PromptfooProviderDriftProof {
  const missingReasons: string[] = [];
  if (!metadata) missingReasons.push(`${side}:promptfooMetadata`);
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

function promptfooAlert(
  row: ProviderDriftCanaryRow,
  proofs: PromptfooProviderDriftProof[],
  active: ProviderDriftWaiver[],
): ProviderDriftAlert | undefined {
  const missingReasons = proofs.flatMap((proof) => proof.missingReasons);
  if (missingReasons.length === 0) return undefined;
  const evidenceRefs = [...new Set([
    ...row.evidenceRefs,
    ...proofs.map((proof) => `promptfoo-proof:${proof.proofHash}`),
  ])];
  const base = {
    alertId: `pdrift:${row.provider}:${row.model}:${row.canaryId}:promptfooMetadataEvidence`,
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    metricId: "evaluationFrameworkEvidence" as const,
    severity: "critical" as const,
    message: `promptfoo provider-drift metadata proof is incomplete: ${missingReasons.join(", ")}.`,
    threshold: 1,
    observed: 0,
    evidenceRefs,
  };
  const waiver = active.find((item) => waiverCoversPromptfooAlert(item, base));
  return {
    ...base,
    waived: Boolean(waiver),
    waiverId: waiver?.waiverId,
  };
}

export function runPromptfooProviderDrift(input: RunPromptfooProviderDriftInput): PromptfooProviderDriftResult {
  const now = input.now ?? new Date();
  const baseReport = runProviderDriftBenchmark({
    agentId: input.agentId,
    baseline: input.baseline,
    candidate: input.candidate,
    thresholds: input.thresholds,
    waivers: input.waivers,
    now,
  });
  const baselineMetadata = new Map((input.promptfoo.baseline ?? []).map((row) => [metadataKey(row), row]));
  const candidateMetadata = new Map((input.promptfoo.candidate ?? []).map((row) => [metadataKey(row), row]));
  const active = activeWaivers(input.waivers ?? [], now);
  const rowsByKey = new Map<string, { baseline?: ProviderDriftCanaryRow; candidate?: ProviderDriftCanaryRow }>();
  for (const row of input.baseline) {
    rowsByKey.set(rowKey(row), { ...(rowsByKey.get(rowKey(row)) ?? {}), baseline: row });
  }
  for (const row of input.candidate) {
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
    const alert = promptfooAlert(alertRow, [baselineProof, candidateProof], active);
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

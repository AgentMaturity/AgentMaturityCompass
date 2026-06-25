import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type RouterFallbackSafetyDecision = "allow" | "block";

export interface RouterFallbackSafetySourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface RouterFallbackEvalThreshold {
  metricId: string;
  minScore: number;
  actualScore: number;
  evidenceRef: string;
}

export interface RouterFallbackCostBudget {
  maxEstimatedCostUsd: number;
  estimatedCostUsd: number;
  evidenceRef: string;
}

export interface RouterFallbackLatencySlo {
  p95TargetMs: number;
  observedP95Ms: number;
  evidenceRef: string;
}

export interface RouterFallbackProviderSnapshot {
  providerId: string;
  modelId: string;
  routeId: string;
  safetyPolicyIds: string[];
  dataResidencyRegions: string[];
  allowedDataClasses: string[];
  evalThresholds: RouterFallbackEvalThreshold[];
  auditReceiptRefs: string[];
  costBudget?: RouterFallbackCostBudget;
  latencySlo?: RouterFallbackLatencySlo;
}

export interface BuildRouterFallbackSafetyReceiptInput {
  receiptId: string;
  policyId: string;
  routeId: string;
  fallbackReason: string;
  fallbackPolicyRef: string;
  providerComparisonRef: string;
  testRunRef: string;
  routingReceiptRef: string;
  primary: RouterFallbackProviderSnapshot;
  fallback: RouterFallbackProviderSnapshot;
  sourceCitations: RouterFallbackSafetySourceCitation[];
  generatedAt?: string;
}

export interface RouterFallbackSafetyReceipt {
  receiptId: string;
  generatedAt: string;
  policyId: string;
  routeId: string;
  fallbackReason: string;
  surfaceBindings: string[];
  primaryProviderId: string;
  fallbackProviderId: string;
  primaryModelId: string;
  fallbackModelId: string;
  preservesSafetyPolicies: boolean;
  preservesDataResidency: boolean;
  preservesEvalThresholds: boolean;
  hasAuditReceipts: boolean;
  preservesCostBudget: boolean;
  preservesLatencySlo: boolean;
  requiredEvidenceRefs: string[];
  sourceCitations: RouterFallbackSafetySourceCitation[];
  decision: RouterFallbackSafetyDecision;
  scorePenalty: number;
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface RouterFallbackSafetyVerification {
  valid: boolean;
  reasons: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function requiredEvidenceRefs(input: BuildRouterFallbackSafetyReceiptInput): string[] {
  return unique([
    input.fallbackPolicyRef,
    input.providerComparisonRef,
    input.testRunRef,
    input.routingReceiptRef,
    ...input.fallback.auditReceiptRefs,
    ...input.fallback.evalThresholds.map((threshold) => threshold.evidenceRef),
    input.fallback.costBudget?.evidenceRef ?? "",
    input.fallback.latencySlo?.evidenceRef ?? ""
  ].filter(nonEmpty));
}

function receiptHash(receipt: Omit<RouterFallbackSafetyReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function sourceCitationReasons(citations: RouterFallbackSafetySourceCitation[]): string[] {
  if (citations.length === 0) {
    return ["sourceCitations:missing"];
  }
  return citations.flatMap((citation) => {
    if (
      nonEmpty(citation.sourceId)
      && nonEmpty(citation.title)
      && nonEmpty(citation.url)
      && nonEmpty(citation.retrievedAt)
    ) {
      return [];
    }
    return [`sourceCitation:${citation.sourceId || "unknown"}:invalid`];
  });
}

function providerIdentityReasons(provider: RouterFallbackProviderSnapshot, role: "primary" | "fallback"): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(provider.providerId)) {
    reasons.push(`${role}:providerId:missing`);
  }
  if (!nonEmpty(provider.modelId)) {
    reasons.push(`${role}:modelId:missing`);
  }
  if (!nonEmpty(provider.routeId)) {
    reasons.push(`${role}:routeId:missing`);
  }
  return reasons;
}

function safetyPolicyReasons(primary: RouterFallbackProviderSnapshot, fallback: RouterFallbackProviderSnapshot): string[] {
  const reasons: string[] = [];
  if (primary.safetyPolicyIds.length === 0) {
    reasons.push(`${primary.providerId}:safetyPolicyIds:missing`);
  }
  if (fallback.safetyPolicyIds.length === 0) {
    reasons.push(`${fallback.providerId}:safetyPolicyIds:missing`);
  }
  const fallbackPolicies = new Set(fallback.safetyPolicyIds);
  for (const policyId of primary.safetyPolicyIds) {
    if (!fallbackPolicies.has(policyId)) {
      reasons.push(`${fallback.providerId}:safetyPolicy:${policyId}:missing`);
    }
  }
  return reasons;
}

function dataResidencyReasons(primary: RouterFallbackProviderSnapshot, fallback: RouterFallbackProviderSnapshot): string[] {
  const reasons: string[] = [];
  if (primary.dataResidencyRegions.length === 0) {
    reasons.push(`${primary.providerId}:dataResidency:missing`);
  }
  if (fallback.dataResidencyRegions.length === 0) {
    reasons.push(`${fallback.providerId}:dataResidency:missing`);
  }
  const primaryRegions = new Set(primary.dataResidencyRegions);
  for (const region of fallback.dataResidencyRegions) {
    if (!primaryRegions.has(region)) {
      reasons.push(`${fallback.providerId}:dataResidency:${region}:not-allowed`);
    }
  }

  if (primary.allowedDataClasses.length === 0) {
    reasons.push(`${primary.providerId}:dataClasses:missing`);
  }
  if (fallback.allowedDataClasses.length === 0) {
    reasons.push(`${fallback.providerId}:dataClasses:missing`);
  }
  const primaryDataClasses = new Set(primary.allowedDataClasses);
  for (const dataClass of fallback.allowedDataClasses) {
    if (!primaryDataClasses.has(dataClass)) {
      reasons.push(`${fallback.providerId}:dataClass:${dataClass}:not-allowed`);
    }
  }
  return reasons;
}

function evalThresholdReasons(primary: RouterFallbackProviderSnapshot, fallback: RouterFallbackProviderSnapshot): string[] {
  const reasons: string[] = [];
  if (primary.evalThresholds.length === 0) {
    reasons.push(`${primary.providerId}:evalThresholds:missing`);
  }
  if (fallback.evalThresholds.length === 0) {
    reasons.push(`${fallback.providerId}:evalThresholds:missing`);
  }

  const fallbackByMetric = new Map(fallback.evalThresholds.map((threshold) => [threshold.metricId, threshold]));
  for (const primaryThreshold of primary.evalThresholds) {
    const fallbackThreshold = fallbackByMetric.get(primaryThreshold.metricId);
    if (!fallbackThreshold) {
      reasons.push(`${fallback.providerId}:evalThreshold:${primaryThreshold.metricId}:missing`);
      continue;
    }
    const requiredScore = Math.max(primaryThreshold.minScore, fallbackThreshold.minScore);
    if (fallbackThreshold.actualScore < requiredScore) {
      reasons.push(`${fallback.providerId}:evalThreshold:${primaryThreshold.metricId}:below-threshold`);
    }
    if (!nonEmpty(fallbackThreshold.evidenceRef)) {
      reasons.push(`${fallback.providerId}:evalThreshold:${primaryThreshold.metricId}:evidence:missing`);
    }
  }
  return reasons;
}

function auditReceiptReasons(fallback: RouterFallbackProviderSnapshot): string[] {
  if (fallback.auditReceiptRefs.some(nonEmpty) && fallback.auditReceiptRefs.length > 0) {
    return [];
  }
  return [`${fallback.providerId}:auditReceiptRefs:missing`];
}

function costBudgetReasons(fallback: RouterFallbackProviderSnapshot): string[] {
  const budget = fallback.costBudget;
  if (!budget) {
    return [`${fallback.providerId}:costBudget:missing`];
  }
  const reasons: string[] = [];
  if (!nonEmpty(budget.evidenceRef)) {
    reasons.push(`${fallback.providerId}:costBudget:evidence:missing`);
  }
  if (budget.estimatedCostUsd > budget.maxEstimatedCostUsd) {
    reasons.push(`${fallback.providerId}:costBudget:exceeded`);
  }
  return reasons;
}

function latencySloReasons(fallback: RouterFallbackProviderSnapshot): string[] {
  const slo = fallback.latencySlo;
  if (!slo) {
    return [`${fallback.providerId}:latencySlo:missing`];
  }
  const reasons: string[] = [];
  if (!nonEmpty(slo.evidenceRef)) {
    reasons.push(`${fallback.providerId}:latencySlo:evidence:missing`);
  }
  if (slo.observedP95Ms > slo.p95TargetMs) {
    reasons.push(`${fallback.providerId}:latencySlo:exceeded`);
  }
  return reasons;
}

function requiredReceiptReasons(input: BuildRouterFallbackSafetyReceiptInput): string[] {
  const checks: Array<[string, string]> = [
    ["receiptId:missing", input.receiptId],
    ["policyId:missing", input.policyId],
    ["routeId:missing", input.routeId],
    ["fallbackReason:missing", input.fallbackReason],
    ["fallbackPolicyRef:missing", input.fallbackPolicyRef],
    ["providerComparisonRef:missing", input.providerComparisonRef],
    ["testRunRef:missing", input.testRunRef],
    ["routingReceiptRef:missing", input.routingReceiptRef]
  ];
  return checks.filter(([, value]) => !nonEmpty(value)).map(([reason]) => reason);
}

export function buildRouterFallbackSafetyReceipt(
  input: BuildRouterFallbackSafetyReceiptInput
): RouterFallbackSafetyReceipt {
  const safetyReasons = safetyPolicyReasons(input.primary, input.fallback);
  const residencyReasons = dataResidencyReasons(input.primary, input.fallback);
  const thresholdReasons = evalThresholdReasons(input.primary, input.fallback);
  const auditReasons = auditReceiptReasons(input.fallback);
  const budgetReasons = costBudgetReasons(input.fallback);
  const sloReasons = latencySloReasons(input.fallback);
  const failClosedReasons = unique([
    ...requiredReceiptReasons(input),
    ...sourceCitationReasons(input.sourceCitations),
    ...providerIdentityReasons(input.primary, "primary"),
    ...providerIdentityReasons(input.fallback, "fallback"),
    ...safetyReasons,
    ...residencyReasons,
    ...thresholdReasons,
    ...auditReasons,
    ...budgetReasons,
    ...sloReasons
  ]);

  const withoutHash: Omit<RouterFallbackSafetyReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    policyId: input.policyId,
    routeId: input.routeId,
    fallbackReason: input.fallbackReason,
    surfaceBindings: ["API", "Studio", "Fleet"],
    primaryProviderId: input.primary.providerId,
    fallbackProviderId: input.fallback.providerId,
    primaryModelId: input.primary.modelId,
    fallbackModelId: input.fallback.modelId,
    preservesSafetyPolicies: safetyReasons.length === 0,
    preservesDataResidency: residencyReasons.length === 0,
    preservesEvalThresholds: thresholdReasons.length === 0,
    hasAuditReceipts: auditReasons.length === 0,
    preservesCostBudget: budgetReasons.length === 0,
    preservesLatencySlo: sloReasons.length === 0,
    requiredEvidenceRefs: requiredEvidenceRefs(input),
    sourceCitations: input.sourceCitations,
    decision: failClosedReasons.length === 0 ? "allow" : "block",
    scorePenalty: Math.min(100, failClosedReasons.length * 5),
    failClosed: failClosedReasons.length > 0,
    failClosedReasons
  };

  return {
    ...withoutHash,
    receiptHash: receiptHash(withoutHash)
  };
}

export function verifyRouterFallbackSafetyReceipt(
  receipt: RouterFallbackSafetyReceipt
): RouterFallbackSafetyVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.decision === "allow" && receipt.failClosed) {
    reasons.push("decision:allow-with-fail-closed");
  }
  if (receipt.decision === "block" && !receipt.failClosed) {
    reasons.push("decision:block-without-fail-closed");
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  if (receipt.requiredEvidenceRefs.length === 0) {
    reasons.push("requiredEvidenceRefs:missing");
  }
  if (!receipt.surfaceBindings.includes("API") || !receipt.surfaceBindings.includes("Studio") || !receipt.surfaceBindings.includes("Fleet")) {
    reasons.push("surfaceBindings:missing");
  }
  const { receiptHash: actualReceiptHash, ...withoutReceiptHash } = receipt;
  if (receiptHash(withoutReceiptHash) !== actualReceiptHash) {
    reasons.push("receiptHash:mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons: unique(reasons)
  };
}

export function renderRouterFallbackSafetyMarkdown(receipt: RouterFallbackSafetyReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Router Fallback Safety Receipt");
  lines.push("");
  lines.push(`- Receipt: \`${receipt.receiptId}\``);
  lines.push(`- Generated: \`${receipt.generatedAt}\``);
  lines.push(`- Decision: ${receipt.decision}`);
  lines.push(`- Status: ${receipt.failClosed ? "FAIL-CLOSED" : "VALID"}`);
  lines.push(`- Surfaces: ${receipt.surfaceBindings.join(", ")}`);
  lines.push(`- Route: \`${receipt.routeId}\``);
  lines.push(`- Primary: \`${receipt.primaryProviderId}\` / \`${receipt.primaryModelId}\``);
  lines.push(`- Fallback: \`${receipt.fallbackProviderId}\` / \`${receipt.fallbackModelId}\``);
  lines.push(`- Receipt hash: \`${receipt.receiptHash}\``);
  lines.push("");
  lines.push("## Safety Checks");
  lines.push("");
  lines.push(`- Safety policies preserved: ${receipt.preservesSafetyPolicies ? "yes" : "no"}`);
  lines.push(`- Data residency preserved: ${receipt.preservesDataResidency ? "yes" : "no"}`);
  lines.push(`- Eval thresholds preserved: ${receipt.preservesEvalThresholds ? "yes" : "no"}`);
  lines.push(`- Audit receipts present: ${receipt.hasAuditReceipts ? "yes" : "no"}`);
  lines.push(`- Cost budget preserved: ${receipt.preservesCostBudget ? "yes" : "no"}`);
  lines.push(`- Latency SLO preserved: ${receipt.preservesLatencySlo ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Required Evidence");
  for (const ref of receipt.requiredEvidenceRefs) {
    lines.push(`- ${ref}`);
  }
  if (receipt.failClosedReasons.length > 0) {
    lines.push("");
    lines.push("## Fail-Closed Reasons");
    for (const reason of receipt.failClosedReasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

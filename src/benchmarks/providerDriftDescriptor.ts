import {
  normalizeProviderDriftEvidenceRefs,
  type ProviderDriftAlert,
  type ProviderDriftBenchmarkReport,
  type ProviderDriftCanaryRow,
  type ProviderDriftMetricId,
  type ProviderDriftRecommendation,
  type ProviderDriftWaiver,
} from "./providerDriftBenchmark.js";

const SHA256_RE = /^[a-f0-9]{64}$/i;

/** Wrapper keys deliberately retain NUL separators, unlike the core benchmark keys. */
export function providerDriftMetadataKey(row: Pick<ProviderDriftCanaryRow, "provider" | "model" | "canaryId">): string {
  return `${row.provider}\u0000${row.model}\u0000${row.canaryId}`;
}

export function isProviderDriftSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

export function normalizeProviderDriftMetadataId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Metadata lists preserve the wrappers' single trim and native Array method order. */
export function normalizeProviderDriftMetadataList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

export function activeProviderDriftMetadataWaivers(waivers: ProviderDriftWaiver[], now: Date): ProviderDriftWaiver[] {
  return waivers.filter((waiver) => {
    const expiresAt = Date.parse(waiver.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now.getTime();
  });
}

function waiverCoversMetadataAlert(waiver: ProviderDriftWaiver, alert: Omit<ProviderDriftAlert, "waived" | "waiverId">): boolean {
  if (waiver.provider && waiver.provider !== alert.provider) return false;
  if (waiver.model && waiver.model !== alert.model) return false;
  if (waiver.canaryId && waiver.canaryId !== alert.canaryId) return false;
  if (
    waiver.metricIds !== undefined
    && (!Array.isArray(waiver.metricIds) || !waiver.metricIds.includes(alert.metricId))
  ) return false;
  return normalizeProviderDriftEvidenceRefs(waiver.evidenceRefs).length > 0;
}

export function providerDriftMetadataRecommendation(report: ProviderDriftBenchmarkReport): ProviderDriftRecommendation {
  if (report.alerts.some((alert) => !alert.waived)) return "alert";
  if (report.alerts.length > 0 && report.alerts.every((alert) => alert.waived)) return "waive";
  if (report.comparisons.some((comparison) => comparison.status === "monitor")) return "monitor";
  return "approve";
}

interface ProviderDriftDescriptor<Metadata> {
  metadataReason: string;
  requiredHashFields: Array<keyof Metadata>;
  forbiddenContentFields: string[];
  proofRefPrefix: string;
  alertIdSuffix: string;
  metricId: ProviderDriftMetricId;
  incompleteMessage: string;
}

/** Share only the verified metadata envelope and alert policy; proof callbacks stay local. */
export function createProviderDriftDescriptor<Metadata>(descriptor: ProviderDriftDescriptor<Metadata>) {
  return {
    missingReasons(side: "baseline" | "candidate", metadata: Metadata | undefined): string[] {
      const missingReasons: string[] = [];
      if (!metadata) missingReasons.push(`${side}:${descriptor.metadataReason}`);
      for (const field of descriptor.requiredHashFields) {
        if (!isProviderDriftSha256(metadata?.[field])) missingReasons.push(`${side}:${String(field)}`);
      }
      for (const field of descriptor.forbiddenContentFields) {
        if (metadata && Object.hasOwn(metadata as object, field)) missingReasons.push(`${side}:metadataOnly:${field}`);
      }
      return missingReasons;
    },
    alert(
      row: ProviderDriftCanaryRow,
      proofs: Array<{ missingReasons: string[]; proofHash: string }>,
      active: ProviderDriftWaiver[],
    ): ProviderDriftAlert | undefined {
      const missingReasons = proofs.flatMap((proof) => proof.missingReasons);
      if (missingReasons.length === 0) return undefined;
      const evidenceRefs = [...new Set([
        ...normalizeProviderDriftEvidenceRefs(row.evidenceRefs),
        ...proofs.map((proof) => `${descriptor.proofRefPrefix}:${proof.proofHash}`),
      ])];
      const base = {
        alertId: `pdrift:${row.provider}:${row.model}:${row.canaryId}:${descriptor.alertIdSuffix}`,
        provider: row.provider,
        model: row.model,
        canaryId: row.canaryId,
        metricId: descriptor.metricId,
        severity: "critical" as const,
        message: `${descriptor.incompleteMessage}: ${missingReasons.join(", ")}.`,
        threshold: 1,
        observed: 0,
        evidenceRefs,
      };
      const waiver = active.find((item) => waiverCoversMetadataAlert(item, base));
      return {
        ...base,
        waived: Boolean(waiver),
        waiverId: waiver?.waiverId,
      };
    },
  };
}

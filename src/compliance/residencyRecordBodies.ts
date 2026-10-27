import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import type { createResidencyPolicy, registerTenant, ResidencyPolicy, TenantBoundary } from "./dataResidency.js";

/** Shared legacy body spelling. The async caller passes its own copied inputs; no store or signer is used here. */
export function buildResidencyPolicy(opts: Parameters<typeof createResidencyPolicy>[0]): ResidencyPolicy {
  const policy: ResidencyPolicy = {
    policyId: `rp_${randomUUID().slice(0, 12)}`,
    region: opts.region,
    customRegionLabel: opts.customRegionLabel,
    allowedRegions: opts.allowedRegions ?? [opts.region],
    denyRegions: opts.denyRegions ?? [],
    isolationLevel: opts.isolationLevel ?? "strict",
    keyCustodyMode: opts.keyCustodyMode ?? "local",
    requireEncryptionAtRest: opts.requireEncryptionAtRest ?? true,
    requireEncryptionInTransit: opts.requireEncryptionInTransit ?? true,
    retentionMinDays: opts.retentionMinDays ?? 30,
    retentionMaxDays: opts.retentionMaxDays ?? 3650,
    legalHoldEnabled: opts.legalHoldEnabled ?? false,
    privacyRedactionEnabled: opts.privacyRedactionEnabled ?? false,
    createdTs: Date.now(),
    policyHash: "",
  };
  policy.policyHash = sha256Hex(JSON.stringify({ ...policy, policyHash: "" }));
  return policy;
}

export function buildTenantBoundary(opts: Parameters<typeof registerTenant>[0]): TenantBoundary {
  return {
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
    region: opts.region,
    isolationLevel: opts.isolationLevel ?? "strict",
    keyCustodyMode: opts.keyCustodyMode ?? "local",
    createdTs: Date.now(),
  };
}

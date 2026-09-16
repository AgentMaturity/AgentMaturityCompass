import { issueLeaseToken } from "./leaseSigner.js";
import { verifyLeaseToken } from "./leaseVerifier.js";
import {
  LeaseRevocationUnverifiableError,
  revokeLease,
  revokedLeaseIdSet,
  signLeaseRevocations,
  verifyLeaseRevocationsSignature
} from "./leaseStore.js";
import type { LeaseScope } from "./leaseSchema.js";

export function parseLeaseTtlToMs(ttl: string): number {
  const text = ttl.trim().toLowerCase();
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(text);
  if (!match) {
    throw new Error(`Invalid lease TTL: ${ttl}`);
  }
  const value = Number(match[1]);
  const unit = match[2] ?? "m";
  const factor = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return value * factor;
}

export function parseLeaseScopes(raw: string): LeaseScope[] {
  const scopes = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return scopes as LeaseScope[];
}

export function parseStringList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function issueLeaseForCli(params: {
  workspace: string;
  workspaceId?: string;
  agentId: string;
  ttl: string;
  scopes: string;
  routes: string;
  models: string;
  rpm: number;
  tpm: number;
  maxCostUsdPerDay?: number | null;
  workOrderId?: string;
}): { token: string } {
  const lease = issueLeaseToken({
    workspace: params.workspace,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    ttlMs: parseLeaseTtlToMs(params.ttl),
    scopes: parseLeaseScopes(params.scopes),
    routeAllowlist: parseStringList(params.routes),
    modelAllowlist: parseStringList(params.models),
    maxRequestsPerMinute: params.rpm,
    maxTokensPerMinute: params.tpm,
    maxCostUsdPerDay: params.maxCostUsdPerDay ?? null,
    workOrderId: params.workOrderId ?? null
  });
  return {
    token: lease.token
  };
}

export function verifyLeaseForCli(params: {
  workspace: string;
  token: string;
}): { ok: boolean; payload: unknown; error?: string } {
  let revokedLeaseIds: Set<string>;
  try {
    revokedLeaseIds = revokedLeaseIdSet(params.workspace);
  } catch (error) {
    if (error instanceof LeaseRevocationUnverifiableError) {
      return { ok: false, payload: null, error: error.message };
    }
    throw error;
  }
  const verify = verifyLeaseToken({
    workspace: params.workspace,
    token: params.token,
    revokedLeaseIds
  });
  return {
    ok: verify.ok,
    payload: verify.payload,
    error: verify.error
  };
}

export function revokeLeaseForCli(params: {
  workspace: string;
  leaseId: string;
  reason: string;
}): { leaseId: string } {
  revokeLease(params.workspace, params.leaseId, params.reason);
  return {
    leaseId: params.leaseId
  };
}

export function ensureLeaseRevocationStore(workspace: string): { signatureValid: boolean } {
  signLeaseRevocations(workspace);
  const verify = verifyLeaseRevocationsSignature(workspace);
  return {
    signatureValid: verify.valid
  };
}

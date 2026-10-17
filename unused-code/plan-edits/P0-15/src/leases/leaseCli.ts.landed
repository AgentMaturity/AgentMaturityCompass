import { issueLeaseToken } from "./leaseSigner.js";
import { verifyLeaseToken } from "./leaseVerifier.js";
import { loadLeaseRevocations, revokeLease, revokedLeaseIdSet, signLeaseRevocations, verifyLeaseRevocationsSignature } from "./leaseStore.js";
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

function parseLeaseScopes(raw: string): LeaseScope[] {
  const scopes = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return scopes as LeaseScope[];
}

function parseStringList(raw: string): string[] {
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
  // The set comes through `revokedLeaseIdSet`, which checks the store's own
  // signature. Reading the file directly meant `amc lease verify` honoured a
  // tampered revocation list -- the one caller most likely to be consulted
  // after a compromise was the one not checking.
  let revokedLeaseIds: Set<string>;
  try {
    revokedLeaseIds = revokedLeaseIdSet(params.workspace);
  } catch (error) {
    return { ok: false, payload: null, error: String(error instanceof Error ? error.message : error) };
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
  // Verify BEFORE signing. The old order signed the store and then verified
  // the signature it had just written, which certified whatever the file
  // contained -- tampering included -- and made this result a value that could
  // not be false. A store that fails verification is left exactly as found:
  // the stale signature is the evidence of what was altered.
  const existing = verifyLeaseRevocationsSignature(workspace);
  if (existing.signatureExists) {
    return { signatureValid: existing.valid };
  }
  if (!existing.valid) {
    // A store file with no signature at all: refusing to bless it is the
    // point -- signing here would launder content nobody has vouched for.
    return { signatureValid: false };
  }
  // No store yet: bootstrap an empty one and sign it.
  signLeaseRevocations(workspace);
  return { signatureValid: verifyLeaseRevocationsSignature(workspace).valid };
}

/**
 * Explicitly re-sign the revocation store as the workspace owner.
 *
 * This is the ONE deliberate path that signs over a failing signature --
 * `ensureLeaseRevocationStore` refuses to, precisely so that repair is a
 * reviewed human action rather than a side effect of issuing a lease. The
 * result reports what the operator just vouched for.
 */
export function resignLeaseRevocationsForCli(workspace: string): {
  wasValid: boolean;
  previousReason: string | null;
  revocationCount: number;
} {
  const before = verifyLeaseRevocationsSignature(workspace);
  signLeaseRevocations(workspace);
  return {
    wasValid: before.valid,
    previousReason: before.reason,
    revocationCount: loadLeaseRevocations(workspace).revocations.length
  };
}

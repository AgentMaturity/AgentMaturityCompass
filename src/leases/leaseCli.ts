import { issueLeaseForPrincipal } from "./leasePrincipal.js";
import { issueLeaseToken } from "./leaseSigner.js";
import { verifyLeaseToken } from "./leaseVerifier.js";
import { bootstrapLeaseRevocations, revokeLease, revokeLeaseAsync, revokedLeaseIdSet, signLeaseRevocations, signLeaseRevocationsAsync, verifyLeaseRevocationsSignature } from "./leaseStore.js";
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
  claimKind?: "synthetic_example";
  ttl: string;
  scopes: string;
  routes: string;
  models: string;
  rpm: number;
  tpm: number;
  maxCostUsdPerDay?: number | null;
  workOrderId?: string;
  /**
   * An authenticated session's principal (P1-78; A4 Assemble connect): when given, the lease is minted through
   * issueLeaseForPrincipal, naming that users.yaml user or refusing (LeasePrincipalRefused) before anything is minted.
   */
  principalKey?: string | null;
}): { token: string } {
  const input = {
    workspace: params.workspace,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    ...(params.claimKind === undefined ? {} : { claimKind: params.claimKind }),
    ttlMs: parseLeaseTtlToMs(params.ttl),
    scopes: parseLeaseScopes(params.scopes),
    routeAllowlist: parseStringList(params.routes),
    modelAllowlist: parseStringList(params.models),
    maxRequestsPerMinute: params.rpm,
    maxTokensPerMinute: params.tpm,
    maxCostUsdPerDay: params.maxCostUsdPerDay ?? null,
    workOrderId: params.workOrderId ?? null
  };
  const lease = params.principalKey === undefined ? issueLeaseToken(input) : issueLeaseForPrincipal({ ...input, principalKey: params.principalKey });
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

function leaseExpiryForCli(params: Parameters<typeof revokeLeaseForCli>[0]): number | undefined {
  let expiresTs: number | undefined;
  if (params.token !== undefined) {
    // Only a payload whose signature verified carries a usable expiry; an expired or already revoked lease still does.
    const verified = verifyLeaseToken({ workspace: params.workspace, token: params.token });
    if (!verified.ok && verified.error !== "lease expired" && verified.error !== "lease revoked") throw new Error(`--token does not verify: ${verified.error}`);
    if (verified.payload?.leaseId !== params.leaseId) throw new Error("--token is not the lease named by --lease-id");
    expiresTs = verified.payload.expiresTs;
  }
  return expiresTs;
}

export function revokeLeaseForCli(params: {
  workspace: string;
  leaseId: string;
  reason: string;
  /** The lease itself: its signed expiry lets a later write prune the revocation once the lease has lapsed. */
  token?: string;
}): { leaseId: string } {
  const expiresTs = leaseExpiryForCli(params);
  revokeLease(params.workspace, params.leaseId, params.reason, { expiresTs });
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
  // No store yet: bootstrap an empty one. The bootstrap re-checks absence under the lock and publishes only the
  // default list, so a file dropped since the check above is left unsigned and reported invalid below.
  bootstrapLeaseRevocations(workspace);
  return { signatureValid: verifyLeaseRevocationsSignature(workspace).valid };
}

/**
 * Explicitly re-sign the revocation store as the workspace owner.
 *
 * This is the ONE deliberate path that signs over a failing signature --
 * `ensureLeaseRevocationStore` refuses to, precisely so that repair is a
 * reviewed human action rather than a side effect of issuing a lease. It signs
 * only bytes whose sha256 is `reviewedDigestSha256`, the digest of the list the
 * operator reviewed, and reports what was vouched for from those same bytes.
 */
export function resignLeaseRevocationsForCli(workspace: string, reviewedDigestSha256: string): {
  wasValid: boolean;
  previousReason: string | null;
  revocationCount: number;
} {
  const before = verifyLeaseRevocationsSignature(workspace);
  const signed = signLeaseRevocations(workspace, reviewedDigestSha256);
  return {
    wasValid: before.valid,
    previousReason: before.reason,
    revocationCount: signed.revocations.length
  };
}


export async function revokeLeaseForCliAsync(params: Parameters<typeof revokeLeaseForCli>[0] & { beforeSign?: () => void }) {
  const fixed = { workspace: params.workspace, leaseId: params.leaseId, reason: params.reason, token: params.token };
  const beforeSign = params.beforeSign, expiresTs = leaseExpiryForCli(fixed);
  const completed = await revokeLeaseAsync(fixed.workspace, fixed.leaseId, fixed.reason, { expiresTs, beforeSign });
  completed.assertCurrent();
  return Object.freeze({ leaseId: fixed.leaseId, assertCurrent: completed.assertCurrent });
}

export async function resignLeaseRevocationsForCliAsync(workspace: string, reviewedDigestSha256: string,
  opts: { beforeSign?: () => void } = {}) {
  const beforeSign = opts.beforeSign;
  const before = verifyLeaseRevocationsSignature(workspace);
  const completed = await signLeaseRevocationsAsync(workspace, reviewedDigestSha256, { beforeSign });
  completed.assertCurrent();
  return Object.freeze({ wasValid: before.valid, previousReason: before.reason,
    revocationCount: completed.store.revocations.length, assertCurrent: completed.assertCurrent });
}

/**
 * Delegated leases (P2-25): the lease a session's runtime or a delegated child runs under, bound to a signed delegation
 * chain (lease v2).
 *
 * - A session lease starts a chain at the session's principal: the active users.yaml user the session authenticated as
 *   (resolved as P1-78 resolves it), or a service principal the signed workload trust config declares. With neither,
 *   a regulated profile refuses; elsewhere the lease is a v1 lease naming no one, as before.
 * - A child lease extends its parent's chain by one link (narrowing only, depth cap 3) and dies with any lease it
 *   descends from. A v1 parent lease is inherited unchanged.
 *
 * Chains are stored under their digest before the lease that binds them is signed, so a verifier never sees a lease
 * whose chain is missing.
 */
import { chainLeaf, extendDelegationSync, issueRootDelegationSync, loadDelegationChain, saveDelegationChain,
  type ChainTrust, type DelegationChain, type DelegationLink } from "../agent/delegationChain.js";
import { loadWorkloadTrustConfig } from "../identity/workload/workloadTrust.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import type { ActionClass } from "../types.js";
import { LeasePrincipalRefused, resolveLeasePrincipal } from "./leasePrincipal.js";
import { issueLeaseToken, type IssueLeaseInput } from "./leaseSigner.js";
import { revokedLeaseIdSet } from "./leaseStore.js";
import { verifyLeaseToken } from "./leaseVerifier.js";
import { regulatedLeaseProfile } from "./regulatedProfile.js";

type Issued = ReturnType<typeof issueLeaseToken> & { readonly chain: DelegationChain | null };

function chainTrust(workspace: string): ChainTrust {
  return { workspace, declaredServices: loadWorkloadTrustConfig(workspace)?.services ?? [], revokedIds: revokedLeaseIdSet(workspace) };
}

/** A chain's scopes: the lease's scopes and the action classes it may execute, so a child can only narrow either. */
const chainScopes = (lease: Pick<IssueLeaseInput, "scopes" | "executeActionClasses">): string[] =>
  [...lease.scopes, ...(lease.executeActionClasses ?? ACTION_CLASSES).map((actionClass) => `class:${actionClass}`)];

/**
 * The lease for a session's runtime. `principalKey` is the session's principal keyed as A4 keys one; `serviceId` names a
 * declared service principal for a run no human started.
 */
export function issueSessionLease(input: Omit<IssueLeaseInput, "principal" | "delegation"> & {
  readonly principalKey: string | null; readonly serviceId?: string;
}): Issued {
  const { principalKey, serviceId, ...lease } = input;
  const user = resolveLeasePrincipal(lease.workspace, principalKey);
  const principal: DelegationLink["principal"] | null = user !== null
    ? { kind: "human", providerId: principalKey!.slice(0, principalKey!.indexOf(":")), subject: user.userId }
    : serviceId !== undefined ? { kind: "service", serviceId } : null;
  if (principal === null) {
    if (regulatedLeaseProfile(lease.workspace).regulated) {
      throw new LeasePrincipalRefused("a regulated profile issues only delegated leases, and this session has no authenticated user or declared service to delegate from; no lease was minted");
    }
    return { ...issueLeaseToken(lease), chain: null };
  }
  const now = Date.now();
  // The chain outlives the lease it binds by a second: the lease's own clock starts after this one.
  const chain = issueRootDelegationSync(lease.workspace, { principal, delegate: { agentId: lease.agentId, runAs: lease.agentId, spiffeId: null },
    scopes: chainScopes(lease), resources: [`workspace:${lease.workspaceId ?? "default"}`], purpose: lease.workOrderId ?? null,
    notBefore: now, notAfter: now + Math.max(60_000, lease.ttlMs) + 1_000, approvalId: null }, chainTrust(lease.workspace));
  saveDelegationChain(lease.workspace, chain);
  return { ...issueLeaseToken({ ...lease, ...(user === null ? {} : { principal: { userId: user.userId } }),
    delegation: { chainDigest: chain.digest, spiffeId: null } }), chain };
}

/**
 * The lease a delegated in-process child composes with: its parent's chain extended to `child.runAs`, narrowed to
 * `allowedActionClasses`, ending no later than the parent lease. A v1 parent lease is returned unchanged. Throws when
 * the parent lease does not verify or the extension would widen or exceed the depth cap.
 */
export function issueChildLease(workspace: string, parentToken: string, child: { readonly runAs: string; readonly allowedActionClasses?: readonly ActionClass[] }): string {
  const trust = chainTrust(workspace);
  const parent = verifyLeaseToken({ workspace, token: parentToken, revokedLeaseIds: new Set(trust.revokedIds) });
  if (!parent.ok || parent.payload === null) throw new Error(`delegation refused: the parent lease does not verify (${parent.error ?? "unknown"})`);
  const lease = parent.payload;
  if (lease.v === 1) return parentToken;
  const chain = loadDelegationChain(workspace, lease.delegationChainDigest ?? "");
  if (chain === null) throw new Error("delegation refused: the parent lease's chain is unavailable");
  const leaf = chainLeaf(chain);
  const allowed = child.allowedActionClasses === undefined ? null : new Set<string>(child.allowedActionClasses.map((actionClass) => `class:${actionClass}`));
  const now = Date.now(), remaining = lease.expiresTs - now;
  if (remaining < 61_000) throw new Error("delegation refused: the parent lease expires within a minute");
  const extended = extendDelegationSync(workspace, chain, { delegate: { agentId: lease.agentId, runAs: child.runAs, spiffeId: null },
    scopes: leaf.scopes.filter((scope) => !scope.startsWith("class:") || allowed === null || allowed.has(scope)),
    resources: leaf.resources, purpose: leaf.purpose, notBefore: now, notAfter: leaf.notAfter, approvalId: null }, trust);
  saveDelegationChain(workspace, extended);
  const classes = lease.executeActionClasses === undefined ? child.allowedActionClasses
    : lease.executeActionClasses.filter((actionClass) => child.allowedActionClasses === undefined || child.allowedActionClasses.includes(actionClass));
  return issueLeaseToken({ workspace, workspaceId: lease.workspaceId, agentId: lease.agentId, ttlMs: remaining - 1_000, scopes: lease.scopes,
    ...(classes === undefined ? {} : { executeActionClasses: [...classes] }), routeAllowlist: lease.routeAllowlist, modelAllowlist: lease.modelAllowlist,
    maxTokensPerMinute: lease.maxTokensPerMinute, maxRequestsPerMinute: lease.maxRequestsPerMinute, maxCostUsdPerDay: lease.maxCostUsdPerDay,
    workOrderId: lease.workOrderId ?? null, ...(lease.principal === undefined ? {} : { principal: lease.principal }),
    delegation: { chainDigest: extended.digest, spiffeId: null, ancestorLeaseIds: [...(lease.ancestorLeaseIds ?? []), lease.leaseId] } }).token;
}

import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { extendDelegation, issueRootDelegation, saveDelegationChain, type ChainTrust, type DelegationChain } from "../../src/agent/delegationChain.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { activateControlPlan } from "../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../src/catalog/compiler/compile.js";
import { signPlan } from "../../src/catalog/compiler/sign.js";
import { revokedLeaseIdSet, revokeLease } from "../../src/leases/leaseStore.js";
import { issueLeaseToken, type IssueLeaseInput } from "../../src/leases/leaseSigner.js";
import { verifyLeaseToken } from "../../src/leases/leaseVerifier.js";
import { leaseLifetimeRefusal, regulatedLeaseProfile } from "../../src/leases/regulatedProfile.js";
import { authenticateStudioAgent } from "../../src/studio/agentCredentialAuth.js";
import { issueAgentToken } from "../../src/studio/studioState.js";
import { catalog } from "../catalog/l0/harness.js";
import { newWorkspace } from "../catalog/l0/workspaces.js";

/**
 * P2-25 lease v2: a lease bound to a signed delegation chain is accepted only while that exact chain, loaded by its
 * digest, verifies and ends at the lease's agent; static agent tokens are refused under a regulated profile; v1 leases
 * keep working outside one.
 */
const HOUR = 3_600_000;
let workspace = "";
const trust = (): ChainTrust => ({ workspace, declaredServices: [], revokedIds: new Set() });
const lease = (overrides: Partial<IssueLeaseInput> = {}) => issueLeaseToken({ workspace, agentId: "default", ttlMs: HOUR / 4,
  scopes: ["toolhub:execute"], routeAllowlist: ["/"], modelAllowlist: ["*"], maxTokensPerMinute: 10, maxRequestsPerMinute: 10,
  maxCostUsdPerDay: null, ...overrides });
const verify = (token: string) => verifyLeaseToken({ workspace, token, revokedLeaseIds: revokedLeaseIdSet(workspace) });

async function chainFor(agentId: string, spiffeId: string | null = null): Promise<DelegationChain> {
  const now = Date.now();
  const root = await issueRootDelegation(workspace, { principal: { kind: "human", providerId: "okta", subject: "00u-alice" },
    delegate: { agentId, runAs: agentId, spiffeId }, scopes: ["toolhub:execute"], resources: ["*"], purpose: null,
    notBefore: now - 60_000, notAfter: now + HOUR, approvalId: null }, trust());
  saveDelegationChain(workspace, root);
  return root;
}

beforeEach(() => {
  workspace = newWorkspace("amc-lease-v2-");
});

describe("lease v2 binding", () => {
  it("accepts a v2 lease whose chain verifies and ends at its agent and SPIFFE ID", async () => {
    const chain = await chainFor("default", "spiffe://example.org/agent/default");
    const { token, payload } = lease({ delegation: { chainDigest: chain.digest, spiffeId: "spiffe://example.org/agent/default" } });
    expect(payload).toMatchObject({ v: 2, delegationChainDigest: chain.digest, spiffeId: "spiffe://example.org/agent/default" });
    expect(verify(token)).toMatchObject({ ok: true });
  });

  it("refuses a chain digest the store does not hold, or holds other links under", async () => {
    const chain = await chainFor("default");
    const other = await extendDelegation(workspace, chain, { delegate: { agentId: "default", runAs: "default/sub", spiffeId: null },
      scopes: ["toolhub:execute"], resources: ["*"], purpose: null, notBefore: Date.now() - 1, notAfter: Date.now() + HOUR / 2, approvalId: null }, trust());
    saveDelegationChain(workspace, other);
    const unknown = "f".repeat(64);
    expect(verify(lease({ delegation: { chainDigest: unknown, spiffeId: null } }).token)).toMatchObject({ ok: false, error: "delegation chain unavailable for this lease" });
    // The file named by the lease's digest now holds another chain: the digest does not match its content.
    const dir = join(workspace, ".amc", "delegation", "chains");
    copyFileSync(join(dir, `${other.digest}.json`), join(dir, `${chain.digest}.json`));
    expect(verify(lease({ delegation: { chainDigest: chain.digest, spiffeId: null } }).token)).toMatchObject({ ok: false, error: "delegation chain unavailable for this lease" });
  });

  it("refuses a chain whose delegate is another agent, or whose SPIFFE ID differs", async () => {
    const chain = await chainFor("someone-else");
    expect(verify(lease({ delegation: { chainDigest: chain.digest, spiffeId: null } }).token))
      .toMatchObject({ ok: false, error: /its delegate is not this lease's agent/ });
    const mine = await chainFor("default", "spiffe://example.org/agent/default");
    expect(verify(lease({ delegation: { chainDigest: mine.digest, spiffeId: "spiffe://example.org/agent/other" } }).token))
      .toMatchObject({ ok: false, error: /SPIFFE ID is not this lease's/ });
  });

  it("refuses a lease that outlives its chain", async () => {
    const chain = await chainFor("default");
    expect(verify(lease({ ttlMs: 2 * HOUR, delegation: { chainDigest: chain.digest, spiffeId: null } }).token))
      .toMatchObject({ ok: false, error: /outlives its delegation/ });
  });

  it("refuses once a link of its chain is revoked", async () => {
    const chain = await chainFor("default");
    const { token } = lease({ delegation: { chainDigest: chain.digest, spiffeId: null } });
    expect(verify(token).ok).toBe(true);
    revokeLease(workspace, `link:${chain.links[0]!.linkId}`, "lease v2 fixture revocation");
    expect(verify(token)).toMatchObject({ ok: false, error: "lease revoked" });
  });

  it("refuses a lease longer than a regulated plan's maximum lifetime", () => {
    const { token } = lease({ ttlMs: HOUR });
    expect(verifyLeaseToken({ workspace, token, maxLifetimeMs: HOUR / 2 })).toMatchObject({ ok: false, error: /exceeds the regulated plan's maximum/ });
    expect(verifyLeaseToken({ workspace, token, maxLifetimeMs: null }).ok).toBe(true);
    expect(leaseLifetimeRefusal({ regulated: true, maxLeaseTtlMs: HOUR / 2 }, HOUR)).toMatch(/60 minutes exceeds the regulated plan's maximum of 30 minutes/);
  });
});

describe("static agent tokens", () => {
  const request = (ws: string, headers: Record<string, string>) => authenticateStudioAgent({ workspace: ws, headers,
    rawHeaders: Object.entries(headers).flat(), url: new URL("http://127.0.0.1/toolhub/intent"), allowQueryCarrier: false });

  it("accepts a v1 lease and a static token outside a regulated profile, and refuses the token once a plan is active", () => {
    const ws = newWorkspace("amc-static-token-");
    initApprovalPolicy(ws);
    const token = issueAgentToken(ws, "default", { scopes: ["toolhub:intent"], executeActionClasses: [], grantedBy: { kind: "operator", reason: "fixture" } }).token;
    const v1 = issueLeaseToken({ workspace: ws, agentId: "default", ttlMs: HOUR, scopes: ["toolhub:intent"], routeAllowlist: ["/"], modelAllowlist: ["*"],
      maxTokensPerMinute: 10, maxRequestsPerMinute: 10, maxCostUsdPerDay: null });
    expect(regulatedLeaseProfile(ws).regulated).toBe(false);
    expect(request(ws, { "x-amc-agent-token": token })).toMatchObject({ agentId: "default", username: "agent-token" });
    expect(request(ws, { "x-amc-lease": v1.token })).toMatchObject({ agentId: "default", username: "agent-lease" });

    const profile = (catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile;
    const plan = compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString() });
    const { signed } = signPlan({ workspace: ws, plan, previous: null, reviewAgentId: "default" });
    const approvalId = signed.review.approvalRequestId!;
    for (const userId of ["owner-1", "owner-2"]) {
      decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "lease v2 fixture plan review",
        userId, username: userId, userRoles: ["OWNER"] });
    }
    activateControlPlan({ workspace: ws, signed, approvalRequestId: approvalId, reviewAgentId: "default" });

    expect(regulatedLeaseProfile(ws).regulated).toBe(true);
    expect(request(ws, { "x-amc-agent-token": token }), "a static token under a regulated profile").toBeNull();
    expect(request(ws, { authorization: `Bearer ${token}` }), "the same token as a bearer").toBeNull();
    expect(request(ws, { "x-amc-agent-token": token, "x-amc-lease": v1.token }), "a static token beside a lease").toBeNull();
    expect(request(ws, { "x-amc-lease": v1.token }), "the lease alone still works").toMatchObject({ username: "agent-lease" });
  });
});

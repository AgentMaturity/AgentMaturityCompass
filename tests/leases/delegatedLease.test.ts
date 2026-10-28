import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { bindAuthorization } from "../../src/actions/authorize.js";
import { openActionJournal } from "../../src/actions/actionJournal.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { delegationChainView, loadDelegationChain } from "../../src/agent/delegationChain.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { initUsersConfig } from "../../src/auth/authApi.js";
import { activateControlPlan } from "../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../src/catalog/compiler/compile.js";
import { signPlan } from "../../src/catalog/compiler/sign.js";
import { publishWorkloadTrustConfig, workloadTrustConfigSchema } from "../../src/identity/workload/workloadTrust.js";
import { issueChildLease, issueSessionLease } from "../../src/leases/delegatedLease.js";
import type { LeasePayload } from "../../src/leases/leaseSchema.js";
import { revokedLeaseIdSet, revokeLease } from "../../src/leases/leaseStore.js";
import { verifyLeaseToken } from "../../src/leases/leaseVerifier.js";
import { runLease } from "../../src/leases/runLease.js";
import { renderTaskDelegation } from "../../src/console/assets/nativeTasksView.js";
import { catalog } from "../catalog/l0/harness.js";
import { newWorkspace } from "../catalog/l0/workspaces.js";

/**
 * P2-25 issuance: a session's lease roots a signed delegation chain at its authenticated user or a declared service
 * (lease v2); a delegated child extends its parent's chain, narrowing only, to depth 3, and dies with its ancestors. A
 * session with neither root gets a v1 lease outside a regulated profile and is refused inside one.
 */
const HOUR = 3_600_000;
// The L0-IDN-01 fixture plan requires a principal, which refuses earlier (P1-78). To reach the P2-25 refusal of a
// regulated session with no root, one test reads the plan as requiring a lease only.
const principalRequired = vi.hoisted(() => ({ override: null as boolean | null }));
vi.mock("../../src/tools/guards/compiledPolicyGuard.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/tools/guards/compiledPolicyGuard.js")>();
  return { ...actual, planRequiresPrincipal: (workspace: string) => principalRequired.override ?? actual.planRequiresPrincipal(workspace) };
});
let workspace = "";
beforeEach(() => { workspace = newWorkspace("amc-delegated-lease-"); principalRequired.override = null; });

const payloadOf = (token: string): LeasePayload => JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as LeasePayload;
const verify = (token: string) => verifyLeaseToken({ workspace, token, revokedLeaseIds: revokedLeaseIdSet(workspace) });
const sessionLease = (principalKey: string | null, extra: { serviceId?: string } = {}) => issueSessionLease({ workspace, agentId: "default",
  ttlMs: HOUR, scopes: ["toolhub:execute"], executeActionClasses: ["READ_ONLY", "WRITE_LOW"], routeAllowlist: ["/native-task"], modelAllowlist: ["*"],
  maxTokensPerMinute: 10, maxRequestsPerMinute: 10, maxCostUsdPerDay: null, principalKey, ...extra });

function activatePlan(): void {
  initApprovalPolicy(workspace);
  const profile = (catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile;
  const plan = compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString() });
  const { signed } = signPlan({ workspace, plan, previous: null, reviewAgentId: "default" });
  const approvalId = signed.review.approvalRequestId!;
  for (const userId of ["owner-1", "owner-2"]) {
    decideApprovalForIntent({ workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "delegated lease fixture",
      userId, username: userId, userRoles: ["OWNER"] });
  }
  activateControlPlan({ workspace, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
}

describe("session leases", () => {
  it("roots a v2 lease at the session's authenticated user", () => {
    const { owner } = initUsersConfig({ workspace, username: "alice", password: "delegated-lease-fixture-password" });
    const issued = sessionLease(`LOCAL_USER:${owner.userId}`);
    expect(issued.payload).toMatchObject({ v: 2, delegationChainDigest: issued.chain!.digest, spiffeId: null, principal: { userId: owner.userId } });
    expect(issued.chain!.links[0]!.principal).toEqual({ kind: "human", providerId: "LOCAL_USER", subject: owner.userId });
    expect(issued.chain!.links[0]!.scopes).toEqual(["toolhub:execute", "class:READ_ONLY", "class:WRITE_LOW"]);
    expect(verify(issued.token)).toMatchObject({ ok: true });
  });

  it("roots at a declared service, and refuses one the signed trust config does not declare", async () => {
    await publishWorkloadTrustConfig(workspace, workloadTrustConfigSchema.parse({ v: 1, services: ["svc-nightly"] }));
    const issued = sessionLease(null, { serviceId: "svc-nightly" });
    expect(issued.chain!.links[0]!.principal).toEqual({ kind: "service", serviceId: "svc-nightly" });
    expect(verify(issued.token).ok).toBe(true);
    expect(() => sessionLease(null, { serviceId: "svc-unknown" })).toThrow(/svc-unknown is not declared/);
  });

  it("issues a v1 lease without a root outside a regulated profile, and refuses inside one", () => {
    const v1 = sessionLease(null);
    expect(v1.chain).toBeNull();
    expect(v1.payload.v).toBe(1);
    expect(verify(v1.token).ok).toBe(true);
    activatePlan();
    expect(() => sessionLease(null)).toThrow(/PRINCIPAL_UNRESOLVED/);
    principalRequired.override = false;
    expect(() => sessionLease(null)).toThrow(/a regulated profile issues only delegated leases/);
  });

  it("runLease mints a v2 lease rooted at the OS user's users.yaml user under an identity-binding plan", () => {
    const { owner } = initUsersConfig({ workspace, username: userInfo().username, password: "delegated-lease-fixture-password" });
    activatePlan();
    const { leaseToken } = runLease({ workspace, agentId: "default", model: "stub", tools: "workspace" });
    const payload = payloadOf(leaseToken!);
    expect(payload).toMatchObject({ v: 2, principal: { userId: owner.userId } });
    expect(loadDelegationChain(workspace, payload.delegationChainDigest!)?.links[0]?.principal).toMatchObject({ kind: "human", subject: owner.userId });
    expect(verify(leaseToken!).ok).toBe(true);
  });
});

describe("child leases", () => {
  function root() {
    const { owner } = initUsersConfig({ workspace, username: "alice", password: "delegated-lease-fixture-password" });
    return sessionLease(`LOCAL_USER:${owner.userId}`);
  }

  it("extends the parent's chain by one narrowing link and binds the child lease to it", () => {
    const parent = root();
    const child = issueChildLease(workspace, parent.token, { runAs: "default/sub-1", allowedActionClasses: ["READ_ONLY"] });
    const payload = payloadOf(child);
    expect(payload).toMatchObject({ v: 2, agentId: "default", executeActionClasses: ["READ_ONLY"], ancestorLeaseIds: [parent.payload.leaseId] });
    expect(payload.expiresTs).toBeLessThanOrEqual(parent.payload.expiresTs);
    const chain = loadDelegationChain(workspace, payload.delegationChainDigest!)!;
    expect(chain.links.map((link) => [link.depth, link.delegate.runAs])).toEqual([[0, "default"], [1, "default/sub-1"]]);
    expect(chain.links[1]!.scopes).toEqual(["toolhub:execute", "class:READ_ONLY"]);
    expect(verify(child).ok).toBe(true);
  });

  it("dies with the parent lease", () => {
    const parent = root();
    const child = issueChildLease(workspace, parent.token, { runAs: "default/sub-1" });
    revokeLease(workspace, parent.payload.leaseId, "delegated lease fixture: parent revoked");
    expect(verify(child)).toMatchObject({ ok: false, error: "lease revoked" });
    expect(() => issueChildLease(workspace, parent.token, { runAs: "default/sub-2" })).toThrow(/parent lease does not verify/);
  });

  it("refuses depth 4", () => {
    let token = root().token;
    for (const depth of [1, 2, 3]) token = issueChildLease(workspace, token, { runAs: `default/d${depth}` });
    expect(verify(token).ok).toBe(true);
    expect(() => issueChildLease(workspace, token, { runAs: "default/d4" })).toThrow(/depth 4 exceeds maxDepth 3/);
  });

  it("inherits a v1 parent lease unchanged", () => {
    const v1 = sessionLease(null);
    expect(issueChildLease(workspace, v1.token, { runAs: "default/sub-1" })).toBe(v1.token);
  });
});

describe("receipts", () => {
  it("the authorization record and the started receipt's intent name the chain, its SPIFFE ID and the principal", () => {
    const { owner } = initUsersConfig({ workspace, username: "alice", password: "delegated-lease-fixture-password" });
    const issued = sessionLease(`LOCAL_USER:${owner.userId}`);
    const callId = `call-${randomUUID()}`;
    const execution: ToolExecution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null, workspace, name: "fs.write",
      agentId: "default", actionClass: "WRITE_LOW", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { path: "./workspace/output/a.txt", content: "x" } };
    const bound = bindAuthorization(execution, { leaseToken: issued.token });
    if (!bound.ok) throw new Error(bound.reason);
    expect(bound.record.delegation).toMatchObject({ leaseId: issued.payload.leaseId, chainDigest: issued.chain!.digest, spiffeId: null });
    const journal = openActionJournal(workspace);
    try {
      const id = bound.record.executionId;
      journal.request({ executionId: id, agentId: "default", toolName: "fs.write", actionClass: "WRITE_LOW", sessionId: null, callId,
        parentExecutionId: null, idempotencyKey: bound.record.idempotencyKey });
      journal.authorize(id, bound.digest);
      journal.start(id, bound.record);
      expect(journal.get(id)?.intent?.delegation).toEqual({ chainDigest: issued.chain!.digest, spiffeId: null, principal: `human:${owner.userId}` });
    } finally { journal.close(); }
  });
});

describe("display", () => {
  it("shows the chain's links as they verify now, and a revoked one as refused", () => {
    const { owner } = initUsersConfig({ workspace, username: "alice", password: "delegated-lease-fixture-password" });
    const issued = sessionLease(`LOCAL_USER:${owner.userId}`);
    const trust = () => ({ declaredServices: [], revokedIds: revokedLeaseIdSet(workspace) });
    const view = delegationChainView(workspace, issued.chain!.digest, trust());
    expect(view).toMatchObject({ chainDigest: issued.chain!.digest, status: "verified", reason: null,
      links: [{ depth: 0, principal: `human:LOCAL_USER:${owner.userId}`, delegate: "default" }] });
    const html = renderTaskDelegation(view);
    expect(html).toContain(issued.chain!.digest);
    expect(html).toContain("Verified now");
    revokeLease(workspace, `link:${issued.chain!.links[0]!.linkId}`, "display fixture");
    expect(delegationChainView(workspace, issued.chain!.digest, trust())).toMatchObject({ status: "refused", reason: expect.stringMatching(/revoked/) });
    expect(delegationChainView(workspace, "e".repeat(64), trust())).toMatchObject({ status: "unavailable", links: [] });
    expect(renderTaskDelegation(null)).toBe("");
  });
});

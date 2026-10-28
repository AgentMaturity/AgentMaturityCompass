import { beforeEach, describe, expect, it, vi } from "vitest";

// The real signer, observed: which leases the runner mints, and from which parent.
vi.mock("../../src/leases/leaseSigner.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/leases/leaseSigner.js")>();
  return { ...original, issueLeaseToken: vi.fn(original.issueLeaseToken) };
});

import { delegateTo, rootIdentity, type DelegationIdentity } from "../../src/agent/delegationIdentity.js";
import { delegateTool } from "../../src/agent/delegateTool.js";
import { createDriverRunner } from "../../src/agent/subagentRunner.js";
import { workflowTool } from "../../src/workflow/workflowTool.js";
import type { SubagentRunContext } from "../../src/agent/subagentSpawn.js";
import { initUsersConfig } from "../../src/auth/authApi.js";
import { issueChildLease, issueSessionLease } from "../../src/leases/delegatedLease.js";
import type { LeasePayload } from "../../src/leases/leaseSchema.js";
import { issueLeaseToken } from "../../src/leases/leaseSigner.js";
import { newWorkspace } from "../catalog/l0/workspaces.js";

/**
 * P2-25 security review: a delegated child's lease extends its OWN parent's lease, handed to it explicitly by the
 * parent's composition. A name the model chose (runAs) never selects a lineage, and a deeper child whose parent lease is
 * missing is refused instead of falling back to the root run's broader lease.
 */
const minted = vi.mocked(issueLeaseToken);
let workspace = "";
beforeEach(() => {
  workspace = newWorkspace("amc-child-lineage-");
  minted.mockClear();
});

const payloadOf = (token: string): LeasePayload => JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as LeasePayload;
const identity = (parent: DelegationIdentity, runAs: string): DelegationIdentity => {
  const next = delegateTo(parent, runAs);
  if (!next.ok) throw new Error(next.reason);
  return next.identity;
};

function rootLease(): string {
  const { owner } = initUsersConfig({ workspace, username: "alice", password: "child-lineage-fixture-password" });
  return issueSessionLease({ workspace, agentId: "default", ttlMs: 3_600_000, scopes: ["toolhub:execute"], routeAllowlist: ["/native-task"],
    modelAllowlist: ["*"], maxTokensPerMinute: 10, maxRequestsPerMinute: 10, maxCostUsdPerDay: null, principalKey: `LOCAL_USER:${owner.userId}` }).token;
}

// The child never reaches a model: the lease is minted before its session opens, then the model seam refuses.
const runnerFor = (leaseToken: string) => createDriverRunner({ workspace, route: { providerId: "fixture", model: "fixture", params: {} },
  makeLlm: () => { throw new Error("fixture: no model"); }, systemPrompt: "fixture", harnessVersion: "fixture",
  compositionDigest: "fixture", policyDigest: "fixture", leaseToken });
const context = (who: DelegationIdentity, extra: Partial<SubagentRunContext> = {}): SubagentRunContext =>
  ({ continuable: false, toolsetAgentId: who.governedAs, identity: who, childSessionId: `child-${Math.random().toString(16).slice(2)}`, goal: "fixture", ...extra });

describe("delegated child lease lineage", () => {
  it("refuses a grandchild whose parent lease was not handed to it, instead of extending the root's lease", async () => {
    const root = rootLease();
    const runner = runnerFor(root);
    const grandchild = identity(identity(rootIdentity("default"), "worker"), "worker/helper");
    minted.mockClear();
    const result = await runner(context(grandchild));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/parent lease was not handed to it/);
    expect(minted, "no lease was minted from the root's").not.toHaveBeenCalled();
  });

  it("extends the parent lease handed in the context, whatever names its siblings chose", async () => {
    const root = rootLease();
    const runner = runnerFor(root);
    const top = rootIdentity("default");
    // Two depth-1 children that both call themselves "worker": only the context decides which one is the parent.
    const firstWorker = issueChildLease(workspace, root, { runAs: "worker" });
    const secondWorker = issueChildLease(workspace, root, { runAs: "worker", allowedActionClasses: ["READ_ONLY"] });
    minted.mockClear();
    await runner(context(identity(identity(top, "worker"), "worker/helper"), { parentLeaseToken: secondWorker })).catch(() => undefined);
    expect(minted).toHaveBeenCalledTimes(1);
    const grandchild = minted.mock.results[0]!.value.payload as LeasePayload;
    expect(grandchild.ancestorLeaseIds).toEqual([payloadOf(root).leaseId, payloadOf(secondWorker).leaseId]);
    expect(grandchild.ancestorLeaseIds).not.toContain(payloadOf(firstWorker).leaseId);
    expect(grandchild.executeActionClasses).toEqual(["READ_ONLY"]);
  });

  it("a child of the root run extends the runner's own lease", async () => {
    const root = rootLease();
    minted.mockClear();
    await runnerFor(root)(context(identity(rootIdentity("default"), "worker"))).catch(() => undefined);
    expect(minted).toHaveBeenCalledTimes(1);
    expect((minted.mock.results[0]!.value.payload as LeasePayload).ancestorLeaseIds).toEqual([payloadOf(root).leaseId]);
  });

  it("the delegate and workflow tools hand their composer's lease, never a model argument, to the child's runner", async () => {
    for (const make of [delegateTool, workflowTool]) {
      const seen: SubagentRunContext[] = [];
      const runner = vi.fn(async (ctx: SubagentRunContext) => { seen.push(ctx); return { ok: true, text: "done" }; });
      const tool = make({ identity: rootIdentity("default"), runner, session: { recordLoopEvent: vi.fn(), recordProjectedEvidence: vi.fn() },
        parentLeaseToken: "composer-lease" });
      const args = make === delegateTool ? { runAs: "child", goal: "g", parentLeaseToken: "model-lease" }
        : { plan: { kind: "agent", id: "a", runAs: "child", goal: "g" }, parentLeaseToken: "model-lease" };
      await tool.body({ workspace, agentId: "default", name: tool.name, actionClass: "READ_ONLY", arguments: args,
        token: "fixture", callId: "fixture", rootCallId: "fixture", parentToken: null, requestedMode: "EXECUTE", effectiveMode: "EXECUTE" });
      expect(seen.map((ctx) => ctx.parentLeaseToken), make.name).toEqual(["composer-lease"]);
    }
  });
});

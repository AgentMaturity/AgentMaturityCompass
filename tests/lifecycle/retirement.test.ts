import { afterEach, describe, expect, test } from "vitest";
import { openAgentSession } from "../../src/agent/agentSession.js";
import { createApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { loadApprovalRequestRecord } from "../../src/approvals/approvalChainStore.js";
import { credentialRef } from "../../src/credentials/credentialRef.js";
import { issueLeaseToken } from "../../src/leases/leaseSigner.js";
import { revokedLeaseIdSet } from "../../src/leases/leaseStore.js";
import { verifyLeaseToken } from "../../src/leases/leaseVerifier.js";
import { lifecycleView } from "../../src/lifecycle/governanceLifecycle.js";
import { LifecycleRefusal } from "../../src/lifecycle/reassessment.js";
import { retireAgent } from "../../src/lifecycle/retirement.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import { ensureAgentToken, findAgentByToken } from "../../src/studio/studioState.js";
import { workspaceIdFromDirectory } from "../../src/workspaces/workspaceId.js";
import { cleanupGovernanceFixtures, governanceFixture } from "../governor/governanceFixture.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "../helpers/agentLoopHarness.js";
import { activate, AGENT, ownerActor } from "./lifecycleFixture.js";

afterEach(cleanupGovernanceFixtures);

function openSession(workspace: string) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("ok")]), baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  return openAgentSession({ workspace, agentId: AGENT, tools: "none", route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} },
    makeLlm: (session) => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport }),
    systemPrompt: "Fixture prompt.", harnessVersion: "1.2.0", compositionDigest: "composition-a", policyDigest: "policy-a" });
}

function lease(workspace: string): string {
  return issueLeaseToken({ workspace, workspaceId: workspaceIdFromDirectory(workspace), agentId: AGENT, ttlMs: 3_600_000, scopes: ["toolhub:execute"],
    routeAllowlist: ["/"], modelAllowlist: ["*"], maxTokensPerMinute: 1000, maxRequestsPerMinute: 10, maxCostUsdPerDay: null }).token;
}

const verify = (workspace: string, token: string) => verifyLeaseToken({ workspace, token, expectedAgentId: AGENT, revokedLeaseIds: revokedLeaseIdSet(workspace) });

function snapshot(f: ReturnType<typeof governanceFixture>) {
  return f.ledger.db.prepare("SELECT id, event_hash, payload_sha256 FROM evidence_events ORDER BY rowid").all() as Array<{ id: string; event_hash: string }>;
}

describe("retirement (P2-23)", () => {
  test("revokes leases and the static token, cancels pending approvals, refuses new sessions and keeps every evidence row", async () => {
    const f = governanceFixture();
    const actor = ownerActor(f.workspace);
    await activate(f.workspace, actor);
    const token = lease(f.workspace);
    expect(verify(f.workspace, token).ok).toBe(true);
    const staticToken = ensureAgentToken(f.workspace, AGENT).token;
    expect(findAgentByToken(f.workspace, staticToken)?.agentId).toBe(AGENT);
    const pending = createApprovalForIntent({ workspace: f.workspace, agentId: AGENT, intentId: "fixture-pending", toolName: REFUND_TOOL,
      actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: { fixture: true } }).request;
    openSession(f.workspace).close();
    const before = snapshot(f);

    const retired = await retireAgent({ workspace: f.workspace, agentId: AGENT, actor, note: "decommissioned fixture" });

    expect(lifecycleView(f.workspace, AGENT)).toMatchObject({ state: "retired", reason: "retired" });
    expect(verify(f.workspace, token)).toMatchObject({ ok: false, error: "lease revoked" });
    expect(findAgentByToken(f.workspace, staticToken)).toBeNull();
    expect(loadApprovalRequestRecord({ workspace: f.workspace, agentId: AGENT, approvalRequestId: pending.approvalRequestId }).status).toBe("CANCELLED");
    expect(retired.retirement).toMatchObject({ staticTokenRotated: true, cancelledApprovals: [pending.approvalRequestId],
      ledgerHeadHash: before.at(-1)!.event_hash, outcomeUnknown: [], bundleIds: [] });
    // Every row that existed is still there, unchanged; retirement only appended.
    expect(snapshot(f).slice(0, before.length)).toEqual(before);
    expect(() => openSession(f.workspace)).toThrow(LifecycleRefusal);
    expect(() => openSession(f.workspace)).toThrow("agent default is retired (retired)");
  });

  test("an open outcome_unknown receipt blocks retirement until an OWNER records an acceptance note", async () => {
    const f = governanceFixture();
    const actor = ownerActor(f.workspace);
    await activate(f.workspace, actor);
    const now = Date.now();
    f.ledger.db.prepare(`INSERT INTO action_executions (execution_id, workspace_id, agent_id, tool_name, action_class, state, created_ts, updated_ts, last_receipt_digest)
      VALUES ('exec_fixture_unknown', ?, ?, ?, 'FINANCIAL', 'outcome_unknown', ?, ?, ?)`).run(workspaceIdFromDirectory(f.workspace), AGENT, REFUND_TOOL, now, now, "0".repeat(64));
    await expect(retireAgent({ workspace: f.workspace, agentId: AGENT, actor })).rejects.toThrow(/1 outcome_unknown receipt\(s\) open/);
    expect(lifecycleView(f.workspace, AGENT).state).toBe("active");
    const retired = await retireAgent({ workspace: f.workspace, agentId: AGENT, actor, acceptOutcomeUnknown: "refund reconciled by hand with the bank" });
    expect(retired.retirement).toMatchObject({ outcomeUnknown: ["exec_fixture_unknown"],
      outcomeUnknownAcceptance: { note: "refund reconciled by hand with the bank", by: actor.userId } });
  });
});

const REFUND_TOOL = "payments.refund";

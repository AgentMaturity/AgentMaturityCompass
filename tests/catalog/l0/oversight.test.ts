import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { openActionJournal, type ActionJournal } from "../../../src/actions/actionJournal.js";
import { DEPLOYMENT_NOT_BOUND } from "../../../src/actions/authorize.js";
import { listApprovalRequests, loadApprovalRequestRecord, recordApprovalDecision } from "../../../src/approvals/approvalChainStore.js";
import { createApprovalForIntent, decideApprovalForIntent, verifyApprovalForExecution } from "../../../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../../../src/approvals/approvalPolicyEngine.js";
import type { UserRole } from "../../../src/auth/roles.js";
import { toolEvidenceFor } from "../../../src/tools/toolEvidence.js";
import { ToolPipeline } from "../../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../../src/tools/toolRegistry.js";
import type { ActionClass } from "../../../src/types.js";
import { fixturesFor, type L0Fixture } from "./harness.js";
import { newWorkspace, signPayTool } from "./workspaces.js";

/**
 * L0-OVS-01, L0-OVS-02 and L0-OVS-03 against the real approval engine and tool pipeline (P1-14). A FINANCIAL tool's
 * signed entry binds amount, currency and recipient; the composition requires a signed approval named through the
 * authority channel (`boundApprovalRequiredFor`), as a bound approval gate does. The oracle is the authorization
 * denial, the receipt chain and whether the body ran; for OVS-03 it is the engine's refusal and its quorum verdict.
 */
type Approver = { userId: string; roles: UserRole[]; decision?: "APPROVED" | "DENIED" };
type BoundSetup = { tool: string; actionClass: ActionClass; approved: Record<string, string>; call: Record<string, string>;
  approvers: Approver[]; scenario: "approved" | "no_approval" | "expired" | "second_use" };
type QuorumSetup = { actionClass: ActionClass; decisions: Approver[]; initiator?: string; writePath?: "store" };

function decide(ws: string, approvalId: string, a: Approver) {
  return decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: a.decision ?? "APPROVED", mode: "EXECUTE",
    reason: "layer0 fixture decision", userId: a.userId, username: a.userId, userRoles: a.roles });
}

describe("L0-OVS-01, L0-OVS-02 and L1-WLT-US-02: a signed human approval bound to the exact action", () => {
  const fixtures = fixturesFor("bound_approval");
  it("has fixtures for each control", () => expect(new Set(fixtures.map((f) => f.control.id))).toEqual(new Set(["L0-OVS-01", "L0-OVS-02", "L1-WLT-US-02"])));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, async () => {
      const s = f.envelope.setup as unknown as BoundSetup;
      const ws = newWorkspace();
      // The signed default approval policy exists before the intent is computed: its digest is part of the deployment the approver saw.
      initApprovalPolicy(ws);
      signPayTool(ws, s.tool, s.actionClass);
      let bodyRuns = 0;
      const registry = new ToolRegistry();
      registry.define(defineTool({ name: s.tool, actionClass: s.actionClass, description: "fixture payment",
        body: () => { bodyRuns += 1; return { ok: true, output: "paid", effect: "applied" }; } }));
      let journal: ActionJournal | undefined;
      const records: ReturnType<typeof toolEvidenceFor> = [];
      const pipeline = new ToolPipeline({ registry, workspace: ws, journal: () => (journal ??= openActionJournal(ws)),
        boundApprovalRequiredFor: new Set([s.actionClass]), record: (e, o) => records.push(...toolEvidenceFor(e, o)) });
      const request = (args: Record<string, string>) => ({ name: s.tool, agentId: "default", arguments: args, requestedMode: "EXECUTE" as const });

      let authority: { approvalRequestIds: string[] } | undefined;
      if (s.scenario !== "no_approval") {
        const intent = pipeline.authorizationIntent(request(s.approved));
        if (!intent?.ok) throw new Error(`no intent: ${JSON.stringify(intent)}`);
        const { approval } = createApprovalForIntent({ workspace: ws, agentId: "default", intentId: `intent-${f.ref}`, toolName: s.tool,
          actionClass: s.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: intent.payload as unknown as Record<string, unknown> });
        for (const a of s.approvers) decide(ws, approval.approvalRequestId, a);
        authority = { approvalRequestIds: [approval.approvalRequestId] };
      }
      if (s.scenario === "second_use") {
        const first = await pipeline.execute({ ...request(s.call), authority });
        expect(first.ok, "the approval authorizes its action once").toBe(true);
      }
      if (s.scenario === "expired") {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + 7 * 24 * 3_600_000);
      }
      const before = bodyRuns;
      const outcome = await pipeline.execute({ ...request(s.call), ...(authority ? { authority } : {}) });
      const id = outcome.action?.executionId;
      expect(id).toBeTruthy();
      const chain = journal!.verifyReceiptChain(id!);
      const state = journal!.get(id!)?.state;
      journal!.close();
      expect(chain.ok, chain.errors.join("; ")).toBe(true);
      if (f.envelope.expected.result === "allow") {
        expect(outcome.ok, JSON.stringify(outcome.denied)).toBe(true);
        expect(bodyRuns - before).toBe(1);
        expect(state).toBe("completed");
        const row = records.find((r) => r.meta?.auditType === "AUTHORIZATION_RECORD");
        const record = (JSON.parse(row?.payload ?? "{}") as { record?: { principal?: unknown; scope?: { deploymentId: string; tenantId: string | null } } }).record;
        expect(record?.principal, "the record names the approvers as the principal").toEqual({ principalId: "approver-1,approver-2", kind: "human", authenticatedVia: "approval-engine" });
        // No active plan names a deployment here: the record says so instead of a placeholder (P1-78).
        expect(record?.scope).toMatchObject({ tenantId: null, deploymentId: DEPLOYMENT_NOT_BOUND });
        return;
      }
      expect(outcome.ok).toBe(false);
      expect(outcome.denied?.stage).toBe("authorization");
      expect(bodyRuns - before, "a refused call never runs its body").toBe(0);
      expect(state).toBe("denied");
      expect(chain.receipts.at(-1)?.reasonCode).toBe(f.envelope.expected.reasonCode);
    });
  }
});

/** The engine's verdict on a request after the fixture's decisions: a refusal code, or the quorum result. */
function quorumVerdict(ws: string, f: L0Fixture): { result: "pass" | "fail"; code: string | null } {
  const s = f.envelope.setup as unknown as QuorumSetup;
  const { approval } = createApprovalForIntent({ workspace: ws, agentId: "default", intentId: `intent-${f.ref}`, toolName: "fixture.deploy",
    actionClass: s.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: { fixture: f.ref },
    ...(s.initiator ? { initiator: s.initiator } : {}) });
  // The signed request records who raised it, whatever the class's rule (P1-78).
  expect(loadApprovalRequestRecord({ workspace: ws, agentId: "default", approvalRequestId: approval.approvalRequestId }).initiator).toBe(s.initiator);
  for (const d of s.decisions) {
    try {
      // "store" writes the decision past the engine's refusals, as a tampering or foreign writer would: only the quorum stands.
      if (s.writePath === "store") {
        recordApprovalDecision({ workspace: ws, agentId: "default", approvalRequestId: approval.approvalRequestId, userId: d.userId, username: d.userId,
          roles: d.roles, decision: "APPROVE_EXECUTE", reason: "layer0 fixture decision" });
      } else decide(ws, approval.approvalRequestId, d);
    } catch (error) {
      if (/distinct approver required/.test(String(error))) return { result: "fail", code: "distinct_approver_required" };
      if (/initiator cannot approve/.test(String(error))) return { result: "fail", code: "initiator_cannot_approve" };
      throw error;
    }
  }
  const verified = verifyApprovalForExecution({ workspace: ws, approvalId: approval.approvalRequestId, expectedAgentId: "default",
    expectedIntentId: `intent-${f.ref}`, expectedToolName: "fixture.deploy", expectedActionClass: s.actionClass });
  return verified.ok ? { result: "pass", code: null } : { result: "fail", code: verified.status === "PENDING" ? "quorum_not_met" : String(verified.error) };
}

describe("L0-OVS-03 separation of duties (requireDistinctUsers in the approval engine)", () => {
  const fixtures = fixturesFor("approval_quorum", "L0-OVS-03");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, () => {
      const ws = newWorkspace();
      const verdict = quorumVerdict(ws, f);
      expect(verdict.result).toBe(f.envelope.expected.result);
      expect(verdict.code).toBe(f.envelope.expected.reasonCode);
    });
  }
});

describe("L0-OVS-03: the initiator check reads only the signed request (P1-78)", () => {
  it("an unsigned copy that drops the initiator cannot make the initiator's approval count", () => {
    const ws = newWorkspace();
    const { approval, filePath } = createApprovalForIntent({ workspace: ws, agentId: "default", intentId: "intent-tamper", toolName: "fixture.deploy",
      actionClass: "WRITE_HIGH", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: { fixture: "tamper" },
      initiator: "LOCAL_USER:approver-1" });
    for (const userId of ["approver-1", "approver-2"]) {
      recordApprovalDecision({ workspace: ws, agentId: "default", approvalRequestId: approval.approvalRequestId, userId, username: userId,
        roles: ["OWNER"], decision: "APPROVE_EXECUTE", reason: "layer0 fixture decision" });
    }
    const verify = () => verifyApprovalForExecution({ workspace: ws, approvalId: approval.approvalRequestId, expectedAgentId: "default",
      expectedIntentId: "intent-tamper", expectedToolName: "fixture.deploy", expectedActionClass: "WRITE_HIGH" });
    expect(verify().status, "the signed request excludes the initiator: one of two").toBe("PENDING");
    const record = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    delete record.initiator;
    writeFileSync(filePath, JSON.stringify(record, null, 2));
    const tampered = verify();
    expect(tampered.ok).toBe(false);
    expect(String(tampered.error)).toMatch(/invalid approval request signature/);
    expect(listApprovalRequests({ workspace: ws, agentId: "default" }), "the copy is not listed either").toEqual([]);
  });
});


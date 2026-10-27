import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { reviewStatusFor } from "../../src/approvals/reviewRecords.js";
import {
  createScopedExceptionAnswerer, issueScopedException, requestScopedException, revokeScopedException, scopedExceptionStatus
} from "../../src/governor/scopedExceptions.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { AGENT, AUDITOR, cleanupGovernanceFixtures, CONTROL, decideBound, governanceFixture, issueRefundException, OWNER, planWithControl, REFUND, requesterSession } from "./governanceFixture.js";

/**
 * P2-24 scoped exceptions on real signed records, real approval requests with bound decisions, and the real tool
 * pipeline and compiled-policy guard. The plan is a typed fixture with one control (C) that denies every call.
 */
afterEach(cleanupGovernanceFixtures);

const exceptionsDir = (workspace: string) => join(workspace, ".amc", "governor", "scoped-exceptions");

function deniedByControl(outcome: { ok: boolean; denied: { stage: string; reason: string } | null }): void {
  expect(outcome.ok).toBe(false);
  expect(outcome.denied?.stage).toBe("guard");
  expect(outcome.denied?.reason).toContain(`control ${CONTROL}@1.0.0`);
}

describe("P2-24 scoped exceptions at the enforcement point", () => {
  test("without an exception, control C denies the call", async () => {
    const f = governanceFixture();
    deniedByControl(await f.execute());
    expect(f.bodies).toHaveLength(0);
  });

  test("an exception for C, refund, max 100.00, in window: an 80.00 call runs and its record lists the exception", async () => {
    const f = governanceFixture();
    const exception = await issueRefundException(f.workspace);
    const outcome = await f.execute();
    expect(outcome.denied).toBeNull();
    expect(f.bodies).toHaveLength(1);
    expect(f.bodies[0]!.authorization!.record.authority.exceptions).toEqual([
      { exceptionId: exception.exceptionId, issuer: exception.approval.approvalRequestId, expiresAt: exception.window.notAfter }]);
  });

  test("the same exception does not cover 150.00: denied by the control (decisive L342)", async () => {
    const f = governanceFixture();
    await issueRefundException(f.workspace);
    deniedByControl(await f.execute({ arguments: { amount: "150.00", currency: "USD", resourceId: "invoice-001" } }));
    deniedByControl(await f.execute({ arguments: { amount: "80.00", currency: "EUR", resourceId: "invoice-001" } }));
    expect(f.bodies).toHaveLength(0);
  });

  test("an exception copied from another workspace, or with a broken signature, is ignored (decisive L348)", async () => {
    const other = governanceFixture();
    const foreign = await issueRefundException(other.workspace);
    const f = governanceFixture();
    cpSync(exceptionsDir(other.workspace), exceptionsDir(f.workspace), { recursive: true });
    expect(scopedExceptionStatus(f.workspace).honoured).toEqual([]);
    expect(scopedExceptionStatus(f.workspace).refused.map((row) => row.id)).toContain(foreign.exceptionId);
    deniedByControl(await f.execute());

    const own = await issueRefundException(f.workspace);
    const path = join(exceptionsDir(f.workspace), `${own.exceptionId}.json`);
    const tampered = JSON.parse(readFileSync(path, "utf8")) as { scope: { maxAmount: { value: string } } };
    tampered.scope.maxAmount.value = "1000000.00";
    writeFileSync(path, `${JSON.stringify(tampered, null, 2)}\n`);
    expect(scopedExceptionStatus(f.workspace).honoured).toEqual([]);
    deniedByControl(await f.execute());
    expect(f.bodies).toHaveLength(0);
  });

  test("an exception whose approval request no longer verifies is ignored", async () => {
    const f = governanceFixture();
    const exception = await issueRefundException(f.workspace);
    const request = join(getAgentPaths(f.workspace, AGENT).rootDir, "approvals", "requests", `${exception.approval.approvalRequestId}.json`);
    writeFileSync(request, readFileSync(request, "utf8").replace('"riskTier": "critical"', '"riskTier": "low"'));
    expect(scopedExceptionStatus(f.workspace).refused).toEqual([{ id: exception.exceptionId, reason: "its approval does not match" }]);
    deniedByControl(await f.execute());
  });

  test("a revoked exception, or one whose window ended, denies the next call", async () => {
    const f = governanceFixture();
    const exception = await issueRefundException(f.workspace);
    expect((await f.execute()).denied).toBeNull();
    await revokeScopedException(f.workspace, exception.exceptionId, "refund campaign ended", "fixture-owner");
    deniedByControl(await f.execute());

    const g = governanceFixture();
    const windowed = await issueRefundException(g.workspace);
    expect((await g.execute()).denied).toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(windowed.window.notAfter) + 1);
    deniedByControl(await g.execute());
    expect(g.bodies).toHaveLength(1);
  });

  test("a revocation between the guard and the recheck denies exception_not_honoured, and any revocation file revokes", async () => {
    const f = governanceFixture();
    const exception = await issueRefundException(f.workspace);
    f.registry.guard("revoke after the compiled-policy guard abstained", () => {
      mkdirSync(join(exceptionsDir(f.workspace), "revocations"), { recursive: true });
      writeFileSync(join(exceptionsDir(f.workspace), "revocations", `${exception.exceptionId}.json`), "unsigned revocation");
      return undefined;
    });
    const outcome = await f.execute();
    expect(outcome.denied?.stage).toBe("authorization");
    expect(outcome.denied?.reason).toContain("exception_not_honoured");
    expect(f.bodies).toHaveLength(0);
  });

  test("a control awaiting legal review: the exception lets the engineering fixture run, and Review stays pending (decisive L345)", async () => {
    const f = governanceFixture(planWithControl("pending"));
    const exception = await issueRefundException(f.workspace);
    expect((await f.execute()).denied).toBeNull();
    expect(f.plan.controls.find((c) => c.controlId === CONTROL)?.review).toBe("pending");
    expect(reviewStatusFor(f.workspace, { kind: "control-result", id: CONTROL, currentSha256: "1".repeat(64) })).toBe("pending");
    expect(reviewStatusFor(f.workspace, { kind: "scoped-exception", id: exception.exceptionId, currentSha256: "2".repeat(64) })).toBe("pending");
  });

  test("an exception for another control version never waives this one", async () => {
    const f = governanceFixture();
    await issueRefundException(f.workspace, { controlVersion: "2.0.0" });
    deniedByControl(await f.execute());
  });

  test("issuing refuses an approval without the quorum, an unbound decision or the requester as approver", async () => {
    const f = governanceFixture();
    const now = Date.now();
    const input = { control: { controlId: CONTROL, controlVersion: "1.0.0" },
      scope: { agentIds: [AGENT], toolNames: [REFUND], actionClasses: ["FINANCIAL" as const], resourceIds: null, maxAmount: null },
      window: { notBefore: new Date(now).toISOString(), notAfter: new Date(now + 3600_000).toISOString() },
      reason: "fixture refusal cases for the approval binding", compensatingControls: [], sessionTokenFile: requesterSession(f.workspace).tokenFile };
    const one = await requestScopedException(f.workspace, input);
    decideBound(f.workspace, one.approval, [AUDITOR]);
    await expect(issueScopedException(f.workspace, one.draft, one.approval)).rejects.toThrow(/approval_missing/);
    // The requester is the session user and the signed request's initiator: the engine refuses their decision under
    // their id or another display name, and it would never count here.
    expect(one.draft.requestedBy).toBe(requesterSession(f.workspace).userId);
    expect(() => decideBound(f.workspace, one.approval, [{ id: requesterSession(f.workspace).userId, role: "OWNER" }])).toThrow(/initiator cannot approve/);
    expect(() => decideApprovalForIntent({ workspace: f.workspace, agentId: AGENT, approvalId: one.approval.approvalRequestId, decision: "APPROVED",
      mode: "EXECUTE", reason: "alias", userId: requesterSession(f.workspace).userId, username: "requester-alias", userRoles: ["OWNER"],
      expectedRequestDigestSha256: one.approval.requestBindingDigest })).toThrow(/initiator cannot approve/);
    await expect(issueScopedException(f.workspace, one.draft, one.approval)).rejects.toThrow(/approval_missing/);
    const widened = { ...one.draft, scope: { ...one.draft.scope, toolNames: [REFUND, "payments.transfer"] } };
    await expect(issueScopedException(f.workspace, widened, one.approval)).rejects.toThrow(/approval_mismatch/);
    await expect(requestScopedException(f.workspace, { ...input, scope: { ...input.scope, toolNames: ["payments.*"] } })).rejects.toThrow(/wildcard/);
    await expect(requestScopedException(f.workspace, { ...input,
      window: { notBefore: input.window.notBefore, notAfter: new Date(now + 31 * 24 * 3600_000).toISOString() } })).rejects.toThrow(/invalid_window/);
    expect(scopedExceptionStatus(f.workspace).honoured).toEqual([]);
  });

  test("a request without an authenticated session, or naming its own requester, is refused (principal_unresolved)", async () => {
    const f = governanceFixture();
    const now = Date.now();
    const input = { control: { controlId: CONTROL, controlVersion: "1.0.0" },
      scope: { agentIds: [AGENT], toolNames: [REFUND], actionClasses: ["FINANCIAL" as const], resourceIds: null, maxAmount: null },
      window: { notBefore: new Date(now).toISOString(), notAfter: new Date(now + 3600_000).toISOString() },
      reason: "fixture refusal: an exception needs an authenticated requester", compensatingControls: [] };
    await expect(requestScopedException(f.workspace, { ...input, sessionTokenFile: join(f.workspace, "missing.token") })).rejects.toThrow(/principal_unresolved/);
    // A caller-supplied requester is never accepted in place of the session.
    await expect(requestScopedException(f.workspace, { ...input, requestedBy: "anyone" } as never)).rejects.toThrow(/principal_unresolved|sessionTokenFile/);
  });
});

describe("P2-24 regulated --approval-exception answerer", () => {
  test("answers only questions the signed exception covers, and abstains after revocation", async () => {
    const f = governanceFixture();
    const exception = await issueRefundException(f.workspace);
    expect(() => createScopedExceptionAnswerer({ workspace: f.workspace, agentId: AGENT, exceptionId: exception.exceptionId, approvalControls: [{ controlId: "L1-OTHER", controlVersion: "1.0.0" }] }))
      .toThrow(/not the approval control/);
    expect(() => createScopedExceptionAnswerer({ workspace: f.workspace, agentId: AGENT, exceptionId: "sex_000000000000000000000000", approvalControls: [{ controlId: CONTROL, controlVersion: "1.0.0" }] }))
      .toThrow(/not a signed, approved, live scoped exception/);
    const answerer = createScopedExceptionAnswerer({ workspace: f.workspace, agentId: AGENT, exceptionId: exception.exceptionId, approvalControls: [{ controlId: CONTROL, controlVersion: "1.0.0" }] });
    expect(answerer.name).toContain(exception.exceptionId);
    // Granted for v1.0.0: never for the same control at another version in the active plan.
    expect(() => createScopedExceptionAnswerer({ workspace: f.workspace, agentId: AGENT, exceptionId: exception.exceptionId,
      approvalControls: [{ controlId: CONTROL, controlVersion: "2.0.0" }] })).toThrow(/version 2.0.0/);
    const ask = (amount: string) => answerer.answer({ approvalId: "a", toolCallId: "t", toolName: REFUND, actionClass: "FINANCIAL", riskTier: "high",
      question: "refund", intentPayload: { bindings: { amount: { value: amount, currency: "USD" }, resourceId: "invoice-001" } } });
    expect(await ask("80")).toBe("allow");
    expect(await ask("150")).toBeNull();
    await revokeScopedException(f.workspace, exception.exceptionId, "ended", OWNER.id);
    expect(await ask("80")).toBeNull();
  });
});

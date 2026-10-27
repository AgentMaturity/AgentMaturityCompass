import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { fileReviewRecord, requestReviewRecord } from "../../src/approvals/reviewRecords.js";
import { createFreezeIncident } from "../../src/drift/freezeEngine.js";
import {
  activateBreakGlass, breakGlassActions, breakGlassPacketDigest, breakGlassRegister, requestBreakGlass, type BreakGlassRecordV1
} from "../../src/governor/breakGlass.js";
import { getActiveOverrides, getOverrideAlerts, isOverrideActive } from "../../src/governor/emergencyOverride.js";
import { generatePolicyCanaryReport, getActiveOverrides as getActiveCanaryOverrides } from "../../src/governor/policyCanary.js";
import { lockVault } from "../../src/vault/vault.js";
import { AGENT, AUDITOR, cleanupGovernanceFixtures, CONTROL, decideBound, governanceFixture, loginAs, OWNER, REFUND, type GovernanceFixture } from "./governanceFixture.js";

/**
 * P2-24 break-glass on real signed records, a real approval request with one bound decision, the real incident store,
 * freeze engine, tool pipeline, compiled-policy guard and signed ledger. The fixture plan's control C denies every call.
 */
afterEach(() => { people.clear(); cleanupGovernanceFixtures(); });

/** The on-call activator and the post-hoc reviewer, each a real users.yaml user with a tracked login (one per workspace). */
const people = new Map<string, { oncall: ReturnType<typeof loginAs>; reviewer: ReturnType<typeof loginAs> }>();
function who(f: GovernanceFixture) {
  let found = people.get(f.workspace);
  if (!found) {
    found = { oncall: loginAs(f.workspace, "fixture-oncall", ["OPERATOR"]), reviewer: loginAs(f.workspace, "fixture-reviewer", ["AUDITOR"]) };
    people.set(f.workspace, found);
  }
  return found;
}
const request = (f: GovernanceFixture, controlIds = [CONTROL]) => requestBreakGlass(f.workspace, {
  sessionTokenFile: who(f).oncall.tokenFile, reason: "payment processor outage needs manual refunds",
  scope: { agentIds: [AGENT], toolNames: [REFUND], actionClasses: ["FINANCIAL"], controlIds }, ttlMs: 3600_000 });

async function activate(f: GovernanceFixture, controlIds = [CONTROL]): Promise<BreakGlassRecordV1> {
  const { draft, approval } = await request(f, controlIds);
  decideBound(f.workspace, approval, [OWNER]);
  return activateBreakGlass(f.workspace, draft.breakGlassId, approval);
}

async function packetReview(f: GovernanceFixture, decision: "approved" | "rejected", tokenFile = who(f).reviewer.tokenFile) {
  const activated = breakGlassRegister(f.workspace).records[0]!;
  return requestReviewRecord(f.workspace, AGENT, { sessionTokenFile: tokenFile, subject: { kind: "break-glass-packet",
    id: activated.record.breakGlassId, sha256: breakGlassPacketDigest(f.workspace, activated) }, decision,
    requesterId: "someone-the-input-names", findings: [], expiresAt: null });
}

async function fileReview(f: GovernanceFixture, decision: "approved" | "rejected" = "approved"): Promise<void> {
  const { draft, approval } = await packetReview(f, decision);
  decideBound(f.workspace, approval, [OWNER, AUDITOR]);
  await fileReviewRecord(f.workspace, draft, approval);
}

describe("P2-24 break-glass", () => {
  test("one bound decision activates it; the call runs, the record names it and a BREAK_GLASS_ACTION row is appended", async () => {
    const f = governanceFixture();
    const record = await activate(f);
    expect(record.incidentId).toMatch(/^incident_/);
    expect(Date.parse(record.window.notAfter) - Date.parse(record.window.notBefore)).toBe(3600_000);
    const outcome = await f.execute();
    expect(outcome.denied).toBeNull();
    expect(f.bodies[0]!.authorization!.record.authority.breakGlassId).toBe(record.breakGlassId);
    const actions = breakGlassActions(f.workspace, record.breakGlassId);
    expect(actions).toEqual([expect.objectContaining({ breakGlassId: record.breakGlassId,
      executionId: f.bodies[0]!.authorization!.record.executionId, authorizationDigest: f.bodies[0]!.authorization!.digest })]);
    expect(readdirSync(join(f.workspace, ".amc", "governor", "break-glass")).filter((name) => name.startsWith("bg_"))).toEqual(
      [`${record.breakGlassId}.json`, `${record.breakGlassId}.json.sig`]);
  });

  test("covering FINANCIAL while a signed freeze for FINANCIAL is active: denied action_class_frozen", async () => {
    const f = governanceFixture();
    await activate(f);
    createFreezeIncident({ workspace: f.workspace, agentId: AGENT, ruleId: "p224-fixture-freeze", previousRunId: "run-a", currentRunId: "run-b",
      deltas: { overallDrop: 1, integrityDrop: 1, correlationDrop: 0, maxLayerDrop: 1 }, actionClasses: ["FINANCIAL"], reason: "fixture freeze" });
    const outcome = await f.execute();
    expect(outcome.denied?.stage).toBe("authorization");
    expect(outcome.denied?.reason).toContain("action_class_frozen");
    expect(f.bodies).toHaveLength(0);
  });

  test("without a signing key activation is refused and nothing is recorded", async () => {
    const f = governanceFixture();
    const { draft, approval } = await request(f);
    decideBound(f.workspace, approval, [OWNER]);
    vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(activateBreakGlass(f.workspace, draft.breakGlassId, approval)).rejects.toThrow(/signing_unavailable/);
    vi.stubEnv("AMC_NO_SIGN", "0");
    lockVault(f.workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    await expect(activateBreakGlass(f.workspace, draft.breakGlassId, approval)).rejects.toThrow(/signing_unavailable/);
    expect(existsSync(join(f.workspace, ".amc", "governor", "break-glass", `${draft.breakGlassId}.json`))).toBe(false);
    expect(breakGlassRegister(f.workspace).records).toEqual([]);
  });

  test("a second break-glass before the first one's review is refused previous_break_glass_unreviewed", async () => {
    const f = governanceFixture();
    await activate(f);
    expect((await f.execute()).denied).toBeNull();
    await expect(request(f)).rejects.toThrow(/previous_break_glass_unreviewed/);
    await fileReview(f, "rejected");
    // A rejected post-hoc review is still a filed review; the deviation stays recorded and reviewed.
    await expect(request(f)).resolves.toMatchObject({ draft: { prevBreakGlassDigest: breakGlassRegister(f.workspace).records[0]!.sha256 } });
  });

  test("an overdue post-hoc review raises POSTMORTEM_OVERDUE", async () => {
    const f = governanceFixture();
    const record = await activate(f);
    expect(getOverrideAlerts(f.workspace, AGENT)).toEqual([]);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(record.postHocReviewDueAt) + 1);
    expect(getOverrideAlerts(f.workspace, AGENT).map((alert) => [alert.alertType, alert.overrideId])).toEqual([["POSTMORTEM_OVERDUE", record.breakGlassId]]);
  });

  test("activation refuses the activator's own decision, an unbound decision and a denial", async () => {
    const f = governanceFixture();
    const own = await request(f);
    // The activator is the authenticated session user, recorded as the request's initiator: the engine refuses their
    // decision under their user id, and under another display name for the same id.
    expect(() => decideBound(f.workspace, own.approval, [{ id: who(f).oncall.userId, role: "OWNER" }])).toThrow(/initiator cannot approve/);
    expect(() => decideApprovalForIntent({ workspace: f.workspace, agentId: AGENT, approvalId: own.approval.approvalRequestId, decision: "APPROVED",
      mode: "EXECUTE", reason: "alias", userId: who(f).oncall.userId, username: "fixture-oncall-alias", userRoles: ["OWNER"],
      expectedRequestDigestSha256: own.approval.requestBindingDigest })).toThrow(/initiator cannot approve/);
    expect(own.draft.activatedBy).toEqual({ userId: who(f).oncall.userId, roles: ["OPERATOR"] });
    await expect(activateBreakGlass(f.workspace, own.draft.breakGlassId, own.approval)).rejects.toThrow(/approval_missing/);
    const g = governanceFixture();
    const unbound = await request(g);
    decideApprovalForIntent({ workspace: g.workspace, agentId: AGENT, approvalId: unbound.approval.approvalRequestId, decision: "APPROVED",
      mode: "EXECUTE", reason: "unbound fixture decision", userId: OWNER.id, username: OWNER.id, userRoles: ["OWNER"] });
    await expect(activateBreakGlass(g.workspace, unbound.draft.breakGlassId, unbound.approval)).rejects.toThrow(/approval_missing/);
    decideBound(g.workspace, unbound.approval, [AUDITOR], "DENIED");
    await expect(activateBreakGlass(g.workspace, unbound.draft.breakGlassId, unbound.approval)).rejects.toThrow(/approval_denied/);
  });

  test("break-glass for another control does not waive control C", async () => {
    const f = governanceFixture();
    await activate(f, ["L1-OTHER-01"]);
    const outcome = await f.execute();
    expect(outcome.denied?.reason).toContain(`control ${CONTROL}@1.0.0`);
  });

  test("legacy override files signed \"unsigned\" in either store are reported invalid and never honoured", async () => {
    const f = governanceFixture();
    const now = Date.now();
    const legacy = join(f.workspace, ".amc", "governor", "overrides");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "eor_legacy000001.json"), JSON.stringify({ overrideId: "eor_legacy000001", agentId: AGENT, reason: "legacy unsigned override",
      ttlMs: 3600_000, mode: "execute", startedTs: now, expiresTs: now + 3600_000, active: true, actionLog: [], postmortemRequired: true,
      postmortemDueTs: now + 3 * 3600_000, postmortemFiled: false, postmortemArtifactPath: null, prev_override_hash: "GENESIS_OVERRIDES",
      override_hash: "0".repeat(64), signature: "unsigned" }));
    const canary = join(f.workspace, ".amc", "governor", "emergency-overrides");
    mkdirSync(canary, { recursive: true });
    writeFileSync(join(canary, "emo_legacy000001.json"), JSON.stringify({ overrideId: "emo_legacy000001", agentId: AGENT, reason: "legacy",
      actionDescription: "allow refunds", ttlMs: 3600_000, startedTs: now, expiresTs: now + 3600_000, postmortemFiled: false,
      postmortemArtifactId: null, signature: "unsigned" }));
    expect(isOverrideActive(f.workspace, AGENT)).toBe(false);
    expect(getActiveOverrides(f.workspace, AGENT)).toEqual([]);
    expect(getOverrideAlerts(f.workspace, AGENT).map((alert) => alert.alertType)).toEqual(["INVALID_SIGNATURE"]);
    expect(getActiveCanaryOverrides(AGENT, f.workspace)).toEqual([]);
    expect(generatePolicyCanaryReport(AGENT, f.workspace).invalidOverrides).toBe(1);
    const outcome = await f.execute();
    expect(outcome.denied?.reason).toContain(`control ${CONTROL}@1.0.0`);
  });

  test("a request without an authenticated session is refused, from the API and from both CLI commands", async () => {
    const f = governanceFixture();
    await expect(requestBreakGlass(f.workspace, { sessionTokenFile: join(f.workspace, "no-such.token"), reason: "payment processor outage",
      scope: { agentIds: [AGENT], toolNames: [REFUND], actionClasses: ["FINANCIAL"], controlIds: [CONTROL] }, ttlMs: 3600_000 }))
      .rejects.toThrow(/principal_unresolved/);
    const cli = join(process.cwd(), "dist", "cli.js");
    for (const command of ["governor-override", "emergency-override"]) {
      const result = spawnSync(process.execPath, [cli, command, "--agent", AGENT, "--reason", "payment processor outage", "--tools", REFUND,
        "--action-classes", "FINANCIAL", "--controls", CONTROL], { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--session-token-file");
    }
    expect(breakGlassRegister(f.workspace).records).toEqual([]);
  });

  test("a packet review takes its reviewer from the session and its requester from the record, never from input", async () => {
    const f = governanceFixture();
    const record = await activate(f);
    const { draft, approval } = await packetReview(f, "approved");
    expect(draft.reviewer).toEqual({ userId: who(f).reviewer.userId, roles: ["AUDITOR"] });
    expect(draft.requesterId).toBe(record.activatedBy.userId);
    await expect(packetReview(f, "approved", who(f).oncall.tokenFile)).rejects.toThrow(/reviewer_is_requester/);
    // The activator's own bound decision never counts toward the review's quorum.
    decideBound(f.workspace, approval, [AUDITOR, { id: who(f).oncall.userId, role: "OWNER" }]);
    await expect(fileReviewRecord(f.workspace, draft, approval)).rejects.toThrow(/approval_missing/);
  });

  test("the CLI requests with a session, an approver's bound CLI decision counts, and activation signs the record", async () => {
    const f = governanceFixture();
    const approver = loginAs(f.workspace, "fixture-approver", ["OWNER"]);
    const cli = (...args: string[]) => spawnSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), ...args],
      { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8" });
    const requested = cli("governor-override", "--agent", AGENT, "--reason", "payment processor outage", "--tools", REFUND,
      "--action-classes", "FINANCIAL", "--controls", CONTROL, "--session-token-file", who(f).oncall.tokenFile);
    expect(requested.status, requested.stderr).toBe(0);
    const [, breakGlassId] = /Break-glass requested: (bg_[a-f0-9]{24})/.exec(requested.stdout)!;
    const [, digest, approvalId] = /--expect-request-digest ([a-f0-9]{64}) (apprreq_[a-f0-9]{32})/.exec(requested.stdout)!;
    const own = cli("approvals", "approve", "--agent", AGENT, "--mode", "execute", "--reason", "self", "--username", "fixture-oncall",
      "--roles", "OPERATOR", "--session-token-file", who(f).oncall.tokenFile, "--expect-request-digest", digest!, approvalId!);
    expect(own.status).not.toBe(0);
    const approved = cli("approvals", "approve", "--agent", AGENT, "--mode", "execute", "--reason", "reviewed the outage", "--username",
      approver.username, "--user-id", approver.userId, "--roles", "OWNER", "--session-token-file", approver.tokenFile, "--expect-request-digest", digest!, approvalId!);
    expect(approved.status, approved.stderr).toBe(0);
    const activated = cli("governor-override", "--agent", AGENT, "--activate", breakGlassId!, "--approval", approvalId!);
    expect(activated.status, activated.stderr).toBe(0);
    expect(breakGlassRegister(f.workspace).records.map((row) => row.record.activatedBy.userId)).toEqual([who(f).oncall.userId]);
  });
});

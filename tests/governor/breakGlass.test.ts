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
import { AGENT, AUDITOR, cleanupGovernanceFixtures, CONTROL, decideBound, governanceFixture, OWNER, REFUND, type GovernanceFixture } from "./governanceFixture.js";

/**
 * P2-24 break-glass on real signed records, a real approval request with one bound decision, the real incident store,
 * freeze engine, tool pipeline, compiled-policy guard and signed ledger. The fixture plan's control C denies every call.
 */
afterEach(cleanupGovernanceFixtures);

const ONCALL = "fixture-oncall";
const request = (f: GovernanceFixture, controlIds = [CONTROL]) => requestBreakGlass(f.workspace, {
  activatedBy: { userId: ONCALL, roles: ["OPERATOR"] }, reason: "payment processor outage needs manual refunds",
  scope: { agentIds: [AGENT], toolNames: [REFUND], actionClasses: ["FINANCIAL"], controlIds }, ttlMs: 3600_000 });

async function activate(f: GovernanceFixture, controlIds = [CONTROL]): Promise<BreakGlassRecordV1> {
  const { draft, approval } = await request(f, controlIds);
  decideBound(f.workspace, approval, [OWNER]);
  return activateBreakGlass(f.workspace, draft.breakGlassId, approval);
}

async function fileReview(f: GovernanceFixture, decision: "approved" | "rejected" = "approved"): Promise<void> {
  const activated = breakGlassRegister(f.workspace).records[0]!;
  const { draft, approval } = await requestReviewRecord(f.workspace, AGENT, { subject: { kind: "break-glass-packet",
    id: activated.record.breakGlassId, sha256: breakGlassPacketDigest(f.workspace, activated) }, decision,
    reviewer: { userId: "fixture-reviewer", roles: ["AUDITOR"] }, requesterId: ONCALL, findings: [], expiresAt: null });
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
    decideBound(f.workspace, own.approval, [{ id: ONCALL, role: "OWNER" }]);
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
});

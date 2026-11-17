/**
 * The A4 full walk (2026-11-17): right after an approver pressed Approve on the second request (Assemble's apply,
 * Adapt's plan activation), the panel still said "Your approval is needed on a second request ... If you have approved
 * it already, nothing more is needed from you", while the card below said "You have already decided this request."
 * The panel now reads the same per-tab memory as the card. Studio's rules are unchanged: it refuses any repeat.
 */
import { describe, expect, test } from "vitest";
import * as start from "../../src/console/assets/a4Start.js";
import { decidedByMe, rememberDecided } from "../../src/console/assets/a4Who.js";

const readiness = { status: "WAITING", allowed: {}, gates: { completion: { gateId: "g7", status: "QUORUM_MET" } },
  items: [{ id: "effect_gate", status: "WAITING", mandatory: false, reasonCodes: ["APPROVAL_REQUEST:r9:d1", "APPROVAL_STATUS:PENDING"], acknowledged: null, nextAction: null }] };
const ctx = { stage: "assemble", project: { projectId: "a4p_1", agentId: "helper", stage: "assemble", step: "reviewed", hold: false, members: [] },
  gates: [{ gateId: "g7", excludedKeys: ["LOCAL_USER:u1"] }], members: { candidates: [] }, questions: [], readiness,
  me: { userId: "u2", username: "second", roles: ["APPROVER"] }, allowed: { requestChanges: { allowed: true, reasonCodes: [] } } };
const move = () => start.nextMove(ctx as never) as { now: string; act?: { copy?: boolean; focus?: string } };

describe("the panel after an approver decided the second request", () => {
  test("before: asks for the approval; after: says it is decided and waits with the link", () => {
    expect(move().now).toContain("Your approval is needed on a second request");
    rememberDecided("r9", "second");
    expect(decidedByMe("second", "r9")).toBe(true);
    expect(decidedByMe("third", "r9")).toBe(false);
    const after = move();
    expect(after.now).toContain("You have decided the second request, which applies what was built");
    expect(after.now).not.toContain("Your approval is needed");
    expect(after.act?.copy).toBe(true);
  });
});

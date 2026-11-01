/**
 * P2-35 · design §17 "Unauthorized progression". Reason codes: SOD_VIOLATION (requester_not_approver, author_not_approver),
 * A4_NOT_A_MEMBER, ADMIN_TOKEN_REFUSED, DEMO_REFUSED, A4_NOT_READY (complete before quorum), A4_DUPLICATE_DECISION,
 * PRINCIPAL_ROLE_INSUFFICIENT, CROSS_PLANE (a hosted-router member voting after a local one). The router-entry refusals on every route are in routerAdmission.test.ts.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { pendingExecutors } from "../../src/a4/a4Gates.js";
import { addUser } from "../../src/auth/authApi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal, routerSession } from "./a4Harness.js";
import { ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => {
  pendingExecutors.clear();
  cleanupGovernanceFixtures();
});

describe("scenario: unauthorized progression", () => {
  test("only a distinct member approver progresses the gate; every other caller is refused and nothing is recorded", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const carol = { userId: addUser({ workspace, username: "carol", roles: ["APPROVER"], password: "p235-carol-password" }).userId };
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    await p.proposeAspire();
    const gate = await p.openGate(alice);
    const headBefore = p.head;

    const own = await p.decide(alice, gate);
    expect(refusal(own)).toEqual([400, "SOD_VIOLATION"]);
    expect((own.body.detail as { violations: string[] }).violations).toEqual(["requester_not_approver", "author_not_approver"]);
    expect(refusal(await p.decide(carol, gate))).toEqual([403, "A4_NOT_A_MEMBER"]);
    expect(refusal(await p.decide("admin", gate))).toEqual([403, "ADMIN_TOKEN_REFUSED"]);
    expect(refusal(await p.decide("demo", gate))).toEqual([403, "DEMO_REFUSED"]);
    // complete without the quorum names what is missing; a forged readiness digest does not help.
    const early = await p.post(alice, "/stages/aspire/complete", { gateId: gate.gateId });
    expect(refusal(early)).toEqual([409, "A4_NOT_READY"]);
    expect(early.body.detail).toMatchObject({ reasonCodes: ["GATE_PENDING"] });
    expect(refusal(await p.decide(bob, gate, "approve", { expectedReadinessBindingDigest: "f".repeat(64) }))[0]).toBe(409);
    // None of the refusals moved the head.
    expect((await p.get(alice)).body.data!.headSeq).toBe(headBefore);

    expect((await p.decide(bob, gate)).status).toBe(201);
    expect(refusal(await p.decide(bob, gate))).toEqual([409, "A4_DUPLICATE_DECISION"]);
    expect((await p.ok(alice, "/stages/aspire/complete", { gateId: gate.gateId })).body.data!.kind).toBe("GATE_CONSUMED");
    expect((await p.get(alice)).body.data).toMatchObject({ step: "direction_approved" });
  });

  test("a workspace APPROVER who is a project member still cannot hold or resume (the owner route class)", async () => {
    const { workspace, alice } = a4Workspace();
    const carol = { userId: addUser({ workspace, username: "carol", roles: ["APPROVER"], password: "p235-carol-password" }).userId };
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, carol);
    expect(refusal(await p.post(carol, "/hold", { reason: "not mine to hold" }))).toEqual([403, "PRINCIPAL_ROLE_INSUFFICIENT"]);
    await p.ok(alice, "/hold", { reason: "incident" });
    expect(refusal(await p.post(carol, "/resume", { reason: "not mine to resume" }))).toEqual([403, "PRINCIPAL_ROLE_INSUFFICIENT"]);
  });

  test("a revoked user's membership row is history, not authority", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    await p.proposeAspire();
    const gate = await p.openGate(alice);
    const { revokeUser } = await import("../../src/auth/authApi.js");
    revokeUser({ workspace, username: "bob" });
    expect(refusal(await p.decide(bob, gate))).toEqual([403, "A4_USER_DISABLED"]);
  });

  test("a WORKSPACE_ROUTER member's vote after a LOCAL_USER member's is refused as CROSS_PLANE, over HTTP", async () => {
    const j = await Journey.start();
    await j.throughAspire();
    await j.propose("assemble", ASSEMBLE_ANSWERS);
    expect((await j.complete("assemble", await j.approve("assemble", "direction"))).status).toBe(200);
    await j.build("assemble");
    const rita = routerSession(j.t.workspace, "router-rita", "rita", ["APPROVER", "OPERATOR"]);
    expect((await j.p.post(j.t.alice, "/members", { principalKey: "WORKSPACE_ROUTER:router-rita", projectRoles: ["approver"] })).status).toBe(200);
    // Assemble's completion gate takes two approvers, so a second vote is still open after bob's.
    const gate = await j.p.openGate(j.t.alice, "assemble", "completion");
    expect((await j.p.decide(j.t.bob, gate)).status).toBe(201);
    expect((await j.p.gate(j.t.alice, gate.gateId)).status).toBe("PENDING");
    const cross = await j.p.decide(rita, gate);
    expect(refusal(cross)).toEqual([400, "SOD_VIOLATION"]);
    expect(cross.body.error).toMatch(/CROSS_PLANE/);
    expect((cross.body.detail as { violations: string[] }).violations).toContain("one_plane");
  });
});

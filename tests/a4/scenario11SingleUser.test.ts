/**
 * P2-35 · design §17 "Single-user workspace". Reason codes: SOD_DEGRADED_SINGLE_USER (self_approved = 1, recorded with
 * its inputs), SOD_VIOLATION once a second ACTIVE principal exists, and the ratchet keeping it after `amc user revoke`.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { addUser, revokeUser } from "../../src/auth/authApi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

type Decision = { selfApproved: boolean; claimKind: string; selfApprovalFacts: Record<string, unknown> };

describe("scenario: single-user workspace", () => {
  test("the one ACTIVE local user self-approves, labelled self_reported with the inputs; a second user ends it for good", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const p = await A4Project.create(workspace, owner);
    await p.proposeAspire();
    const gate = await p.openGate(owner);
    expect((await p.decide(owner, gate)).status).toBe(201);
    const [decision] = (await p.gate(owner, gate.gateId)).decisions as Decision[];
    expect(decision).toMatchObject({ selfApproved: true, claimKind: "self_reported" });
    expect(decision!.selfApprovalFacts).toMatchObject({ activeUserCount: 1, hostPrincipals: 0 });
    await p.ok(owner, "/stages/aspire/complete", { gateId: gate.gateId });

    // A second ACTIVE user: the derived flag turns false, and stays false after the user is revoked (the ratchet).
    addUser({ workspace, username: "second", roles: ["VIEWER"], password: "p235-second-password" });
    await p.ok(owner, "/stages/aspire/build");
    await p.ok(owner, "/stages/aspire/review");
    const completion = await p.openGate(owner, "aspire", "completion");
    revokeUser({ workspace, username: "second" });
    const refused = await p.decide(owner, completion);
    expect(refusal(refused)).toEqual([400, "SOD_VIOLATION"]);
    expect((refused.body.detail as { degraded: string[] }).degraded).toEqual([]);
  });
});

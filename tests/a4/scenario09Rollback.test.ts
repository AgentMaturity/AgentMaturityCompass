/**
 * P2-35 · design §17 "Rollback". Reason codes: EFFECT_QUORUM_INSUFFICIENT, SOD_VIOLATION, RELEASE_ROLLED_BACK.
 * preview → effect gate (a DEPLOY engine request) → two approvers → rollback: every lease of the release revoked, a signed
 * rollback receipt, prepared commands and ROLLBACK; the lifecycle never moves backwards and `deployed_release_id` moves
 * only when the operator records the rollback row. Freeze-first applies to high and critical risk only (this one is low).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { revokedLeaseIdSet } from "../../src/leases/leaseStore.js";
import { verifyLeaseToken } from "../../src/leases/leaseVerifier.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { refusal } from "./a4Harness.js";
import { Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => cleanupGovernanceFixtures());

describe("scenario: rollback", () => {
  test("a production rollback runs through its effect gate, revokes the leases and moves the release only on the operator's row", async () => {
    const j = await Journey.start();
    await j.toActivate();
    const prod = await j.production();
    const agentId = (await j.p.get(j.t.alice)).body.data!.agentId as string;
    expect((await j.p.get(j.t.alice)).body.data!.deployedReleaseId).toBe(prod.releaseId);
    // As every caller verifies a lease: against the signed revocation list.
    const live = (token: string) => verifyLeaseToken({ workspace: j.t.workspace, token, expectedAgentId: agentId, revokedLeaseIds: revokedLeaseIdSet(j.t.workspace),
      maxLifetimeMs: 90 * 86_400_000 } as never);
    expect(live(prod.production.token)).toMatchObject({ ok: true });

    const preview = await j.p.post(j.t.alice, `/releases/${prod.releaseId}/rollback/preview`, { environment: "production" });
    expect(preview.status).toBe(201);
    expect(preview.body.data!.preview).toMatchObject({ schema: "amc.a4-rollback-preview/v1", releaseId: prod.releaseId, environment: "production",
      freezeFirst: false, leaseIds: expect.arrayContaining([prod.staging.leaseId, prod.production.leaseId]) });
    const body = { environment: "production", reason: "P2-35 fixture rollback", toReleaseId: null, confirmManifestId: null };

    // No approvals yet: refused before anything runs.
    expect(refusal(await j.p.post(j.t.alice, `/releases/${prod.releaseId}/rollback`, body))).toEqual([409, "EFFECT_QUORUM_INSUFFICIENT"]);
    const opened = (await j.transitions()).filter((link) => link.kind === "EFFECT_GATE_OPENED").at(-1)!;
    // The owner who previewed it cannot approve it.
    expect(refusal(await j.engineDecide(j.t.alice, opened.body))[1]).toBe("SOD_VIOLATION");
    for (const who of [j.t.bob, j.t.owner]) expect((await j.engineDecide(who, opened.body)).status).toBe(201);

    const done = await j.p.post(j.t.alice, `/releases/${prod.releaseId}/rollback`, body);
    expect(done.status).toBe(201);
    expect(done.body.data).toMatchObject({ kind: "EFFECT_FINISHED", leaseIdsRevoked: expect.arrayContaining([prod.staging.leaseId, prod.production.leaseId]),
      deployedReleaseId: "moves when the operator records the rollback row" });
    expect((await j.transitions()).some((link) => link.kind === "ROLLBACK")).toBe(true);
    expect(live(prod.production.token)).toMatchObject({ ok: false, error: expect.stringMatching(/revoked/) });
    expect(live(prod.staging.token)).toMatchObject({ ok: false });

    // Still the release the operator last recorded; the lifecycle stays at Activate.
    const head = (await j.p.get(j.t.alice)).body.data!;
    expect(head).toMatchObject({ deployedReleaseId: prod.releaseId, stage: "activate" });
    expect(await j.item("deployment.receipt")).toMatchObject({ status: "BLOCKED", reasonCodes: ["RELEASE_ROLLED_BACK", `RELEASE:${prod.releaseId}`] });

    // The operator's rollback row names the package rolled back to (none here: no earlier release), and only it moves the release.
    expect(refusal(await j.deploy(prod.releaseId, { packageDigest: prod.packageDigest, leaseIds: [] }, { kind: "rollback", environment: "production" })))
      .toEqual([409, "PACKAGE_DIGEST_MISMATCH"]);
    const row = await j.deploy(prod.releaseId, { packageDigest: null as never, leaseIds: [] }, { kind: "rollback", environment: "production" });
    expect(row.status).toBe(201);
    expect((await j.p.get(j.t.alice)).body.data!.deployedReleaseId).not.toBe(prod.releaseId);
  });
});

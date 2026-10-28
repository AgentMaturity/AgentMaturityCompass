/**
 * P2-35 · design §17 "Acknowledged blocker" (D-21 pattern), on a regulated project: the fixture's `default` agent
 * already carries a higher risk tier than the brief's `low`, so the project is regulated and its quorum of LOCAL_USER
 * keys is SOD_DEGRADED_SELF_PROVISIONED. Reason codes: SOD_DEGRADED_SELF_PROVISIONED, REVIEW_NOT_INDEPENDENT,
 * OWNER_ACKNOWLEDGED, A4_NOT_READY, A4_GATE_STALE. The owner's dated acknowledgement lets the gate open; the item stays
 * WAITING and labelled, never READY; it must precede the gate request (bound into the intent), and after 90 days the
 * item blocks again. (Unsupported-integration acknowledgements: scenario07; the acknowledgeable rule: guards.test.ts.)
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { refusal } from "./a4Harness.js";
import { Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => {
  vi.useRealTimers();
  cleanupGovernanceFixtures();
});

describe("scenario: acknowledged blocker", () => {
  test("a self-provisioned regulated quorum needs the owner's dated acknowledgement, which precedes the gate and expires", async () => {
    const j = await Journey.start(undefined, "default");
    await j.p.proposeAspire();
    const waiting = await j.item("sod.self_provisioned");
    expect(waiting).toMatchObject({ status: "WAITING", reasonCodes: ["SOD_DEGRADED_SELF_PROVISIONED", "REVIEW_NOT_INDEPENDENT"] });

    // Without the acknowledgement the approved gate does not complete.
    const first = await j.approve("aspire", "direction");
    const refused = await j.p.post(j.t.alice, "/stages/aspire/complete", { gateId: first.gateId });
    expect(refusal(refused)).toEqual([409, "A4_NOT_READY"]);
    expect((refused.body.detail as { reasonCodes: string[] }).reasonCodes).toEqual(["sod.self_provisioned"]);

    // Acknowledged while that gate is open: the gate it was not bound into is superseded.
    await j.acknowledge("aspire", "sod.self_provisioned");
    expect(refusal(await j.p.post(j.t.alice, "/stages/aspire/complete", { gateId: first.gateId }))).toEqual([409, "A4_GATE_STALE"]);
    const acknowledged = await j.item("sod.self_provisioned");
    expect(acknowledged?.status).toBe("WAITING");
    expect(acknowledged?.reasonCodes).toEqual(["SOD_DEGRADED_SELF_PROVISIONED", "REVIEW_NOT_INDEPENDENT", "OWNER_ACKNOWLEDGED"]);

    // A gate requested after it binds it, and completes.
    const second = await j.approve("aspire", "direction");
    const intent = (await j.p.gate(j.t.alice, second.gateId)).intent as { boundItemIds: string[] };
    expect(intent.boundItemIds).toContain("sod.self_provisioned");
    expect((await j.complete("aspire", second)).status).toBe(200);
    expect((await j.item("sod.self_provisioned"))?.status).not.toBe("READY");

    // Ninety days on, the acknowledgement no longer counts: the item blocks progression again.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 91 * 86_400_000 });
    const expired = await j.item("sod.self_provisioned");
    expect(expired?.status).toBe("WAITING");
    expect(expired?.reasonCodes).not.toContain("OWNER_ACKNOWLEDGED");
  });
});

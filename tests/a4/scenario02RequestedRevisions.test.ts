/**
 * P2-35 · design §17 "Requested revisions". Reason codes: GATE_CHANGES_REQUESTED (the gate's derived status), A4_GATE_STALE
 * (a decision on the superseded gate), A4_GATE_SEQ_MISMATCH. CHANGES_REQUESTED with findings supersedes the gate, the
 * step returns to `proposed`, and nothing carries over to the next request.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

describe("scenario: requested revisions", () => {
  test("request-changes supersedes the gate, returns the step to proposed, and the old gate takes no decision", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    await p.proposeAspire();
    const gate = await p.openGate(alice);
    const findings = [{ severity: "medium", message: "the goals are not measurable" }];
    // The gate's own seq, never the head's.
    expect(refusal(await p.post(bob, `/gates/${gate.gateId}/request-changes`, { reason: "tighten", expectedGateSeq: gate.gateSeq + 1, findings,
      expectedHeadSeq: undefined }))).toEqual([409, "A4_GATE_SEQ_MISMATCH"]);
    const changed = await p.ok(bob, `/gates/${gate.gateId}/request-changes`, { reason: "tighten", expectedGateSeq: gate.gateSeq, findings, expectedHeadSeq: undefined });
    expect(changed.body.data!.kind).toBe("CHANGES_REQUESTED");

    const view = await p.gate(alice, gate.gateId);
    expect(view.status).toBe("CHANGES_REQUESTED");
    expect(view.supersededBy).not.toBeNull();
    expect((await p.get(alice)).body.data).toMatchObject({ stage: "aspire", step: "proposed" });

    const stale = await p.decide(bob, gate);
    expect(refusal(stale)).toEqual([409, "A4_GATE_STALE"]);
    expect(stale.body.detail).toMatchObject({ supersededBy: "CHANGES_REQUESTED" });

    // A fresh request opens a new gate with no decisions carried over.
    const next = await p.openGate(alice);
    expect(next.gateId).not.toBe(gate.gateId);
    expect((await p.gate(alice, next.gateId)).decisions).toEqual([]);
  });
});

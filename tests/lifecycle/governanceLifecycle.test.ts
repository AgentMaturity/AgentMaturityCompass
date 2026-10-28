import { afterEach, describe, expect, test } from "vitest";
import {
  lifecycleEvents, LIFECYCLE_AUDIT, lifecycleView, liveLifecycleRows, rebuildLifecycleRows, requestTransitionApproval, suspendAgent, transitionAgent,
  type TransitionInput
} from "../../src/lifecycle/governanceLifecycle.js";
import { manifestDigest } from "../../src/lifecycle/versionManifest.js";
import { getPublicKeyPem, verifyHexDigest } from "../../src/crypto/keys.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { AUDITOR, cleanupGovernanceFixtures, decideBound, governanceFixture, OWNER } from "../governor/governanceFixture.js";
import { activate, AGENT, approvedMove, manifest, ownerActor } from "./lifecycleFixture.js";

afterEach(cleanupGovernanceFixtures);

function transitions(workspace: string) {
  const ledger = openLedger(workspace);
  try {
    return lifecycleEvents(ledger.db, LIFECYCLE_AUDIT.transition, AGENT);
  } finally {
    ledger.close();
  }
}

describe("governed lifecycle state machine (P2-23)", () => {
  test("legal transitions pass and each is a signed ledger row carrying the bound digests and the session actor", async () => {
    const { workspace } = governanceFixture();
    const actor = ownerActor(workspace);
    const m = manifest();
    await activate(workspace, actor, m);
    suspendAgent(workspace, { agentId: AGENT, reason: "manual", actor });
    await approvedMove(workspace, actor, "active", m);
    const rows = transitions(workspace);
    expect(rows.map((row) => [row.meta.from, row.meta.to, row.meta.reason])).toEqual([
      [null, "proposed", "registered"], ["proposed", "approved", "approval"], ["approved", "active", "activation"],
      ["active", "suspended", "manual"], ["suspended", "active", "resumed"]]);
    const approved = rows[1]!.meta;
    expect(approved.manifestDigest).toBe(manifestDigest(m));
    expect(approved.planDigest).toBe("none");
    expect(approved.approvalId).toMatch(/^apprreq_/);
    expect(approved.actor).toMatchObject({ userId: actor.userId, username: "lifecycle-owner", via: "approvals-session" });
    const ledger = openLedger(workspace);
    try {
      for (const row of rows) {
        const event = ledger.getEventById(row.id)!;
        expect(verifyHexDigest(event.event_hash, event.writer_sig, getPublicKeyPem(workspace, "monitor"))).toBe(true);
        expect(event.ts).toBe(row.meta.ts);
      }
    } finally {
      ledger.close();
    }
    expect(lifecycleView(workspace, AGENT)).toMatchObject({ state: "active", reason: "resumed", claimKind: "observed" });
  });

  test("retired is terminal: retired → active is refused", async () => {
    const { workspace } = governanceFixture();
    const actor = ownerActor(workspace);
    transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor });
    transitionAgent({ workspace, agentId: AGENT, to: "retired", actor, retirement: {} });
    expect(() => transitionAgent({ workspace, agentId: AGENT, to: "active", actor })).toThrow(/cannot move from retired to active/);
    expect(() => transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor })).toThrow(/cannot move from retired/);
  });

  test("an approval bound to manifest A cannot approve manifest B", async () => {
    const { workspace } = governanceFixture();
    const actor = ownerActor(workspace);
    transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor });
    const a = manifest(), b = manifest({ model: { providerId: "fixture-provider", model: "fixture-model-b", providerReportedVersion: "2026-10-01" } });
    const { approval } = await requestTransitionApproval({ workspace, agentId: AGENT, to: "approved", actor, manifest: a });
    decideBound(workspace, approval, [OWNER, AUDITOR]);
    expect(() => transitionAgent({ workspace, agentId: AGENT, to: "approved", actor, approvalId: approval.approvalRequestId, manifest: b }))
      .toThrow(/was not raised for this lifecycle-transition/);
    expect(lifecycleView(workspace, AGENT).state).toBe("proposed");
    // Without any approval the move is refused too, and the requester's own decision never counts.
    expect(() => transitionAgent({ workspace, agentId: AGENT, to: "approved", actor, manifest: a })).toThrow(/needs a bound approval/);
  });

  test("a caller-supplied timestamp is ignored: the row's time is AMC's clock", () => {
    const { workspace } = governanceFixture();
    const actor = ownerActor(workspace);
    const before = Date.now();
    transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor, ts: 1 } as TransitionInput);
    const [row] = transitions(workspace);
    expect(row!.ts).toBeGreaterThanOrEqual(before);
    expect(row!.meta.ts).toBe(row!.ts);
  });

  test("the actor comes from the authenticated session: a non-OWNER or a forged actor is refused", () => {
    const { workspace } = governanceFixture();
    const owner = ownerActor(workspace);
    transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor: owner });
    expect(transitions(workspace)[0]!.meta.actor).toMatchObject({ userId: owner.userId, roles: ["OWNER"] });
    const operator = { ...owner, roles: ["OPERATOR"] };
    expect(() => transitionAgent({ workspace, agentId: AGENT, to: "retired", actor: operator, retirement: {} })).toThrow(/authenticated OWNER/);
    expect(() => transitionAgent({ workspace, agentId: AGENT, to: "retired", actor: { ...owner, via: "amc" }, retirement: {} })).toThrow(/authenticated OWNER/);
  });

  test("the state table rebuilt from the ledger rows equals the live table; a tampered row refuses reads", async () => {
    const { workspace } = governanceFixture();
    const actor = ownerActor(workspace);
    await activate(workspace, actor);
    suspendAgent(workspace, { agentId: AGENT, reason: "incident" });
    const ledger = openLedger(workspace);
    try {
      expect(liveLifecycleRows(ledger.db)).toEqual(rebuildLifecycleRows(ledger.db));
      expect(liveLifecycleRows(ledger.db)[0]).toMatchObject({ agent_id: AGENT, state: "suspended", reason: "incident" });
      // Rolling the row back to an earlier genuine event is caught against the newest signed row.
      const first = transitions(workspace)[2]!.id;
      ledger.db.prepare("UPDATE agent_lifecycle_state SET state = 'active', reason = 'activation', last_event_id = ? WHERE agent_id = ?").run(first, AGENT);
    } finally {
      ledger.close();
    }
    expect(() => lifecycleView(workspace, AGENT)).toThrow(/does not match its ledger rows/);
  });
});

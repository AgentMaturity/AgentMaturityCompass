/**
 * P2-35 · design §17 "Stale approvals". Reason codes: A4_GATE_STALE (old digest, a superseding MEMBER, a consumed gate),
 * A4_GATE_SEQ_MISMATCH (a client expectedGateSeq that is not the gate's), GATE_EXPIRED, GATE_EXPIRING.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { addUser } from "../../src/auth/authApi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => {
  vi.useRealTimers();
  cleanupGovernanceFixtures();
});

async function openProject() {
  const ws = a4Workspace();
  const p = await A4Project.create(ws.workspace, ws.alice);
  await p.addMember(ws.alice, ws.bob);
  await p.proposeAspire();
  return { ...ws, p, gate: await p.openGate(ws.alice) };
}

describe("scenario: stale approvals", () => {
  test("a decision bound to another request digest is 409 A4_GATE_STALE naming the request", async () => {
    const { p, bob, gate } = await openProject();
    const reply = await p.decide(bob, { ...gate, bindingDigest: "0".repeat(64) });
    expect(refusal(reply)).toEqual([409, "A4_GATE_STALE"]);
    expect(reply.body.detail).toEqual({ moved: ["request"] });
  });

  test("a client expectedGateSeq that is not the gate's stored seq is 409, the head seq included once the head moved", async () => {
    const { p, alice, bob, gate } = await openProject();
    expect(refusal(await p.decide(bob, { ...gate, gateSeq: gate.gateSeq + 1 }))).toEqual([409, "A4_GATE_SEQ_MISMATCH"]);
    // Move the head past the gate without superseding it (a comment), then name the head seq.
    await p.ok(alice, "/comments", { body: "looks fine", cardId: "aspire.brief", expectedHeadSeq: undefined });
    expect(p.head).toBeGreaterThan(gate.gateSeq);
    expect(refusal(await p.decide(bob, { ...gate, gateSeq: p.head }))).toEqual([409, "A4_GATE_SEQ_MISMATCH"]);
    expect((await p.decide(bob, gate)).status).toBe(201);
  });

  test("a member added after the gate opened makes it stale, naming the member set", async () => {
    const { workspace, p, alice, bob, gate } = await openProject();
    const carol = addUser({ workspace, username: "carol", roles: ["APPROVER"], password: "p235-carol-password" });
    await p.addMember(alice, { userId: carol.userId }, ["viewer"]);
    const reply = await p.decide(bob, gate);
    expect(refusal(reply)).toEqual([409, "A4_GATE_STALE"]);
    expect(reply.body.detail).toEqual({ supersededBy: "MEMBER", moved: ["memberSet"] });
  });

  test("a decision or a second complete on a consumed gate is 409 A4_GATE_STALE naming consumed", async () => {
    const { p, alice, bob, gate } = await openProject();
    expect((await p.decide(bob, gate)).status).toBe(201);
    expect((await p.ok(alice, "/stages/aspire/complete", { gateId: gate.gateId })).body.data!.kind).toBe("GATE_CONSUMED");
    for (const reply of [await p.decide(bob, gate, "deny"), await p.post(alice, "/stages/aspire/complete", { gateId: gate.gateId })]) {
      expect(refusal(reply)).toEqual([409, "A4_GATE_STALE"]);
      expect(reply.body.detail).toEqual({ supersededBy: "GATE_CONSUMED", moved: ["consumed"] });
    }
  });

  test("TTL: inside the last minute GATE_EXPIRING; past expiry GATE_EXPIRED, and the request route opens a fresh gate", async () => {
    const { p, alice, bob, gate } = await openProject();
    const expiresTs = (await p.gate(alice, gate.gateId)).expiresTs as number;
    vi.useFakeTimers({ toFake: ["Date"], now: expiresTs - 30_000 });
    const item = ((await p.get(alice, "/readiness")).body.data!.items as Array<{ id: string; reasonCodes: string[] }>).find((entry) => entry.id === "gate.direction");
    expect(item?.reasonCodes).toEqual(["GATE_PENDING", "GATE_EXPIRING"]);
    expect(refusal(await p.decide(bob, gate))).toEqual([409, "GATE_EXPIRING"]);
    vi.setSystemTime(expiresTs + 1_000);
    expect(refusal(await p.decide(bob, gate))).toEqual([409, "GATE_EXPIRED"]);
    expect((await p.gate(alice, gate.gateId)).status).toBe("EXPIRED");
    const fresh = await p.openGate(alice);
    expect(fresh.gateId).not.toBe(gate.gateId);
    expect((await p.decide(bob, fresh)).status).toBe(201);
  });

  test("a quorum met before expiry is not consumed after it: complete counts the quorum at its commit time", async () => {
    const { p, alice, bob, gate } = await openProject();
    expect((await p.decide(bob, gate)).status).toBe(201);
    const expiresTs = (await p.gate(alice, gate.gateId)).expiresTs as number;
    vi.useFakeTimers({ toFake: ["Date"], now: expiresTs + 1_000 });
    expect(refusal(await p.post(alice, "/stages/aspire/complete", { gateId: gate.gateId }))).toEqual([409, "GATE_EXPIRED"]);
  });
});

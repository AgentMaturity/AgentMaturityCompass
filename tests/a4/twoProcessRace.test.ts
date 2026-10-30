/**
 * P2-35 · design §17 "Collaborative conflicts", across processes: two AMC processes (tests/fixtures/a4/a4Child.mjs, the
 * built code) send the same POST with one clientRequestId at the same instant, and two approvers decide one gate at the
 * same instant from two processes. BEGIN IMMEDIATE and the per-project lock serialise them: the duplicated request
 * executes once and the other answers its recorded result; both distinct approvals land and count.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { a4Child, requestId } from "./a4Harness.js";
import { Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => cleanupGovernanceFixtures());

type Child = { pid: number; status: number; body: { ok: boolean; data?: { seq: number; replay: boolean }; code?: string } };

describe("two-process request races", () => {
  test("one clientRequestId from two processes executes once; the other answers the recorded result", async () => {
    const j = await Journey.start();
    await j.p.proposeAspire();
    const gate = await j.p.openGate(j.t.alice);
    const path = `${j.p.path}/gates/${gate.gateId}/approve`;
    const body = { reason: "same request, two processes", expectedRequestDigestSha256: gate.bindingDigest, expectedGateSeq: gate.gateSeq, clientRequestId: requestId() };
    const wait = Date.now() + 1_500;
    const replies = await Promise.all([0, 1].map(() => a4Child({ action: "post", workspace: j.t.workspace, userId: j.t.bob.userId, path, body, wait }))) as Child[];
    expect(new Set(replies.map((reply) => reply.pid)).size).toBe(2);
    expect(replies.map((reply) => reply.body.ok)).toEqual([true, true]);
    expect(replies.map((reply) => reply.body.data!.replay).sort()).toEqual([false, true]);
    expect(new Set(replies.map((reply) => reply.body.data!.seq)).size).toBe(1);
    expect(((await j.p.gate(j.t.alice, gate.gateId)).decisions as unknown[]).length).toBe(1);
    expect((await j.transitions()).filter((link) => link.kind === "GATE_DECIDED")).toHaveLength(1);
  });

  test("two approvers deciding one gate at once from two processes both land and both count", async () => {
    const j = await Journey.start();
    await j.throughAspire();
    await j.propose("assemble", { capabilities: ["draft refund replies"], autonomy: "advise", providers: "stub", path: "other" });
    expect((await j.complete("assemble", await j.approve("assemble", "direction"))).status).toBe(200);
    await j.build("assemble");
    const gate = await j.p.openGate(j.t.alice, "assemble", "completion");
    expect((await j.p.gate(j.t.alice, gate.gateId)).quorum).toMatchObject({ required: 2, approvals: 0 });
    const wait = Date.now() + 1_500;
    const replies = await Promise.all([j.t.bob, j.t.owner].map((who) => a4Child({ action: "post", workspace: j.t.workspace, userId: who.userId,
      path: `${j.p.path}/gates/${gate.gateId}/approve`, wait,
      body: { reason: "concurrent approval", expectedRequestDigestSha256: gate.bindingDigest, expectedGateSeq: gate.gateSeq, clientRequestId: requestId() } }))) as Child[];
    expect(replies.map((reply) => [reply.status, reply.body.data?.replay])).toEqual([[201, false], [201, false]]);
    expect((await j.p.gate(j.t.alice, gate.gateId))).toMatchObject({ status: "QUORUM_MET", quorum: { approvals: 2, required: 2 } });
  });
});

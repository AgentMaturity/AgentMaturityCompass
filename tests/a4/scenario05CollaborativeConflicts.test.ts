/**
 * P2-35 · design §17 "Collaborative conflicts". Reason codes: A4_STALE_HEAD (with the head and a diff link),
 * REQUEST_CONFLICT, and a retried POST answering its recorded result via clientRequestId. Two concurrent POSTs with one
 * clientRequestId execute once. No credential is persisted in a4_requests.response_json.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { openA4Store } from "../../src/a4/a4Store.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4, a4Workspace, refusal, requestId } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

describe("scenario: collaborative conflicts", () => {
  test("a write naming an old head is 409 A4_STALE_HEAD with the head and the diff route", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    const reply = await p.post(alice, "/hold", { reason: "stale writer", expectedHeadSeq: 0 });
    expect(refusal(reply)).toEqual([409, "A4_STALE_HEAD"]);
    expect(reply.body).toMatchObject({ head: { headSeq: p.head }, diff: `${p.path}/transitions` });
  });

  test("two concurrent decisions with one clientRequestId record one decision; a different body under the id is REQUEST_CONFLICT", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    await p.proposeAspire();
    const gate = await p.openGate(alice);
    const body = { reason: "once", expectedRequestDigestSha256: gate.bindingDigest, expectedGateSeq: gate.gateSeq, clientRequestId: requestId() };
    const path = `${p.path}/gates/${gate.gateId}/approve`;
    const replies = await Promise.all([a4(workspace, bob, "POST", path, body), a4(workspace, bob, "POST", path, body)]);
    expect(replies.map((reply) => reply.body.data?.replay).sort()).toEqual([false, true]);
    expect(new Set(replies.map((reply) => reply.body.data?.seq)).size).toBe(1);
    expect(((await p.gate(alice, gate.gateId)).decisions as unknown[]).length).toBe(1);
    // A later retry answers the recorded result; the same id with another body is refused.
    expect((await a4(workspace, bob, "POST", path, body)).body.data).toMatchObject({ replay: true, seq: replies[0]!.body.data!.seq });
    expect(refusal(await a4(workspace, bob, "POST", path, { ...body, reason: "twice" }))).toEqual([409, "REQUEST_CONFLICT"]);
  });

  test("no recorded response holds a lease credential", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    await p.proposeAspire();
    const gate = await p.openGate(alice);
    await p.decide(bob, gate);
    await p.ok(alice, "/stages/aspire/complete", { gateId: gate.gateId });
    const store = openA4Store(workspace);
    try {
      const rows = store.ledger.db.prepare("SELECT response_json FROM a4_requests").all() as Array<{ response_json: string | null }>;
      expect(rows.length).toBeGreaterThan(5);
      expect(rows.filter((row) => /lease_/.test(row.response_json ?? ""))).toEqual([]);
    } finally {
      store.close();
    }
  });
});

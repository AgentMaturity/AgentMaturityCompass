/**
 * P2-35 · design §17 "Unsupported integrations" (with the D-21 acknowledgement pattern of "Acknowledged blocker").
 * Reason codes: UNSUPPORTED_INTEGRATION, PATH:<path>, STATUS:<preview|unsupported>, OWNER_ACKNOWLEDGED, A4_NOT_READY.
 * The path card states the claim; each unsupported item blocks progression until an owner records it out of scope; the
 * item stays WAITING and labelled, never READY; an acknowledgement binds one revision and supersedes an open gate.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { refusal } from "./a4Harness.js";
import { ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 180_000 });
afterEach(() => cleanupGovernanceFixtures());

const answers = (path: string) => Object.entries({ ...ASSEMBLE_ANSWERS, path }).map(([questionId, value]) => ({ questionId, value }));

async function atAssembleProposed(path: string): Promise<Journey> {
  const j = await Journey.start();
  await j.throughAspire();
  const { alice } = j.t;
  for (const tail of ["answers", "understand", "answers", "understand"]) {
    await j.p.ok(alice, `/stages/assemble/${tail}`, tail === "answers" ? { answers: answers(path) } : {});
  }
  await j.p.ok(alice, "/stages/assemble/confirm-understanding", { confirmed: true });
  await j.p.ok(alice, "/stages/assemble/explain", { level: "practitioner" });
  await j.p.ok(alice, "/stages/assemble/propose", { spec: {} });
  return j;
}

describe("scenario: unsupported integrations", () => {
  test("a preview path blocks progression until each unsupported item is acknowledged; it stays WAITING and labelled", async () => {
    const j = await atAssembleProposed("other");
    expect(await j.item("path_supported")).toMatchObject({ status: "WAITING",
      reasonCodes: ["UNSUPPORTED_INTEGRATION", "PATH:other", "STATUS:preview", "KEY:no integration path; only what the operator reports"] });
    expect((await j.item("unsupported_acknowledged"))?.reasonCodes).toContain("UNSUPPORTED_INTEGRATION");

    // The gate opens, but complete names the unacknowledged items.
    const direction = await j.approve("assemble", "direction");
    const refused = await j.p.post(j.t.alice, "/stages/assemble/complete", { gateId: direction.gateId });
    expect(refusal(refused)).toEqual([409, "A4_NOT_READY"]);
    expect((refused.body.detail as { reasonCodes: string[] }).reasonCodes).toEqual(["path_supported", "unsupported_acknowledged"]);

    // An acknowledgement on the gate's revision supersedes the open gate: it was not bound into its intent.
    await j.acknowledge("assemble", "path_supported");
    expect((await j.p.decide(j.t.owner, direction)).body.code).toBe("A4_GATE_STALE");
    await j.acknowledge("assemble", "unsupported_acknowledged");
    for (const id of ["path_supported", "unsupported_acknowledged"]) {
      const item = await j.item(id);
      expect(item?.status).toBe("WAITING");
      expect(item?.reasonCodes).toContain("OWNER_ACKNOWLEDGED");
    }
    const again = await j.approve("assemble", "direction");
    expect((await j.complete("assemble", again)).status).toBe(200);

    // Build records a new revision: the acknowledgements bound the old one and no longer count.
    await j.p.ok(j.t.alice, "/stages/assemble/build");
    expect((await j.item("path_supported"))?.reasonCodes).not.toContain("OWNER_ACKNOWLEDGED");
  });

  test("an acknowledgement is refused for an unlisted item, an item that is not WAITING, and anyone but an owner", async () => {
    const j = await atAssembleProposed("other");
    const ack = (who: typeof j.t.alice, itemId: string) => j.p.post(who, "/acknowledge", { itemId, stage: "assemble", reason: "fixture" });
    expect(refusal(await ack(j.t.alice, "store.integrity"))).toEqual([400, "INPUT_INVALID"]);
    // Listed, but not a WAITING item at this stage (absent here): never acknowledged into readiness.
    expect(refusal(await ack(j.t.alice, "lineage.independent_approvals"))).toEqual([409, "A4_NOT_ACKNOWLEDGEABLE"]);
    expect(refusal(await ack(j.t.audrey, "path_supported"))).toEqual([403, "PRINCIPAL_ROLE_INSUFFICIENT"]);
  });

  test("the native path is the supported one: no unsupported-integration item", async () => {
    const j = await atAssembleProposed("native");
    expect(await j.item("path_supported")).toMatchObject({ status: "READY" });
  });
});

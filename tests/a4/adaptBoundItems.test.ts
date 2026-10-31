/**
 * pending-checks P1-61 (lane S): Adapt's bound set carried no intent version, so an owner's `plan_unresolved` or D-21
 * `regulatory_sources_status` acknowledgement superseded an open Adapt gate without being in its intent. A gate now names
 * its `boundItemsVersion` (none is version 1); version 2 binds both items at Adapt, the verifier checks each gate against
 * its own version's set, and an acknowledgement supersedes only a gate whose intent binds the item (tests/a4/guards.test.ts).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { pendingExecutors } from "../../src/a4/a4Gates.js";
import { A4_BOUND_ITEMS_VERSION } from "../../src/a4/a4Schema.js";
import { openA4Store } from "../../src/a4/a4Store.js";
import { verifyA4Chain } from "../../src/a4/a4Verify.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { ADAPT_ANSWERS, ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => {
  pendingExecutors.clear();
  cleanupGovernanceFixtures();
});

describe("Adapt's bound set by intent version", () => {
  test("a new Adapt gate binds plan_unresolved under version 2, verifies, and an acknowledgement after it supersedes it", async () => {
    const j = await Journey.start();
    await j.throughAspire();
    await j.stage("assemble", ASSEMBLE_ANSWERS);
    await j.propose("adapt", ADAPT_ANSWERS);
    const gate = await j.p.openGate(j.t.alice, "adapt", "direction");
    const store = openA4Store(j.t.workspace);
    try {
      const requested = store.readChain(j.p.projectId).find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === gate.gateId)!;
      expect(requested.body.boundItemsVersion).toBe(A4_BOUND_ITEMS_VERSION);
      const row = store.snapshot(j.p.projectId).rows.a4_gates.find((candidate) => candidate.gate_id === gate.gateId)!;
      expect(JSON.parse(String(row.bound_items_json))).toEqual(expect.arrayContaining(["plan_unresolved", "regulatory_sources_status"]));
      expect(JSON.stringify(verifyA4Chain(store.ledger, j.p.projectId).integrity)).not.toMatch(/A4_BOUND_ITEMS|A4_INTENT_MISMATCH/);
    } finally {
      store.close();
    }
    expect((await j.p.gate(j.t.alice, gate.gateId)).status).toBe("PENDING");
    await j.acknowledge("adapt", "plan_unresolved");
    expect((await j.p.gate(j.t.alice, gate.gateId)).status).toBe("STALE");
  });
});

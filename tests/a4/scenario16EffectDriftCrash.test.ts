/**
 * P2-35 · design §17 "Effect drift and crash", on Assemble's completion effect (a4.assemble.apply: an effect gate whose
 * DEPLOY-class engine grant A4 consumes as step 0). Reason codes: EFFECT_QUORUM_INSUFFICIENT, SOD_VIOLATION,
 * EFFECT_FAILED (RESOURCE_DRIFTED <slot>, process_lost), EFFECT_RUNNING / EFFECT_NOT_RETRYABLE, A4_GATE_STALE.
 * - verifyAndConsumeEffect: the engine quorum is re-counted under A4's own SoD before consume.
 * - Drift: a bound resource edited between GATE_CONSUMED (EFFECT_STARTED) and the executor's preamble fails the effect
 *   naming the slot, and nothing is applied.
 * - Crash: an attempt whose owner process died (a real second process that exits after commit) is swept to
 *   process_lost by liveness; a live executor of this process is never swept, however old its heartbeat; a retry while
 *   it runs is refused; after the sweep a retry runs it to completion.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { pendingExecutors } from "../../src/a4/a4Gates.js";
import { completeStage, retryEffect, runA4Effect, sweepA4Effects } from "../../src/a4/a4Effects.js";
import { A4StoreError, openA4Store, type A4Store } from "../../src/a4/a4Store.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { cleanupGovernanceFixtures, REFUND } from "../governor/governanceFixture.js";
import { a4Child, refusal } from "./a4Harness.js";
import { ASSEMBLE_ANSWERS, Journey, type Gate } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
const stores: A4Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  pendingExecutors.clear();
  cleanupGovernanceFixtures();
});

/** A project at Assemble with its completion gate approved by two members, not yet completed. */
async function atAssembleCompletion(): Promise<{ j: Journey; gate: Gate }> {
  const j = await Journey.start();
  await j.throughAspire();
  await j.propose("assemble", ASSEMBLE_ANSWERS);
  expect((await j.complete("assemble", await j.approve("assemble", "direction"))).status).toBe(200);
  await j.build("assemble");
  return { j, gate: await j.approve("assemble", "completion") };
}
const store = (j: Journey): A4Store => {
  const opened = openA4Store(j.t.workspace);
  stores.push(opened);
  return opened;
};
const codeOf = async (run: () => unknown): Promise<string | null> => {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof A4StoreError ? error.code : String(error);
  }
};
/** Assemble's apply attempts as [kind, error] (EFFECT_FINISHED and EFFECT_FAILED name their attempt, not the effect). */
const effectLinks = async (j: Journey) => {
  const chain = await j.transitions();
  const attempts = new Set(chain.filter((link) => link.kind === "EFFECT_STARTED" && link.body.effect === "a4.assemble.apply").map((link) => link.body.effectId));
  return chain.filter((link) => /^EFFECT_(STARTED|FINISHED|FAILED)$/.test(link.kind) && attempts.has(link.body.effectId))
    .map((link) => [link.kind, link.body.error ?? null]);
};

describe("scenario: effect drift and crash", () => {
  test("the engine quorum is re-counted under A4's SoD before the grant is consumed", async () => {
    const { j, gate } = await atAssembleCompletion();
    expect((await j.p.post(j.t.alice, "/stages/assemble/effects/a4.assemble.apply/open", { gateId: gate.gateId })).status).toBe(201);
    const opened = (await j.transitions()).filter((link) => link.kind === "EFFECT_GATE_OPENED").at(-1)!.body;
    expect(refusal(await j.p.post(j.t.alice, "/stages/assemble/complete", { gateId: gate.gateId }))).toEqual([409, "EFFECT_QUORUM_INSUFFICIENT"]);
    // The owner who opened it (and built the revision) cannot count toward it.
    expect(refusal(await j.engineDecide(j.t.alice, opened))[1]).toBe("SOD_VIOLATION");
    expect((await j.engineDecide(j.t.bob, opened)).status).toBe(201);
    expect(refusal(await j.p.post(j.t.alice, "/stages/assemble/complete", { gateId: gate.gateId }))).toEqual([409, "EFFECT_QUORUM_INSUFFICIENT"]);
    expect((await j.engineDecide(j.t.owner, opened)).status).toBe(201);
    expect((await j.complete("assemble", gate)).status).toBe(200);
    expect(await effectLinks(j)).toContainEqual(["EFFECT_FINISHED", null]);
  });

  test("a bound resource edited after the attempt started fails the effect naming the slot, and nothing is applied", async () => {
    const { j, gate } = await atAssembleCompletion();
    await j.openEffect("assemble", "completion", gate);
    await j.p.sync();
    const s = store(j);
    const started = completeStage(s, j.p.projectId, { ...j.call(j.t.alice), stage: "assemble", gateId: gate.gateId, expectedHeadSeq: j.p.head });
    expect(started.attemptId).toMatch(/^a4e_/);
    // Between GATE_CONSUMED/EFFECT_STARTED and the executor's preamble: the signed tool allowlist changes.
    initToolsConfig(j.t.workspace, { tools: { version: 1, denyByDefault: true, allowedTools: [{ name: REFUND, actionClass: "FINANCIAL" as const,
      bindingFields: { amount: "amount", currency: "currency", recipient: "recipient", resourceId: "resourceId" } }] } } as never);
    await runA4Effect(s, j.p.projectId, started.attemptId!);
    const failed = (await effectLinks(j)).filter(([kind]) => kind !== "EFFECT_STARTED");
    expect(failed).toHaveLength(1);
    expect(failed[0]![0]).toBe("EFFECT_FAILED");
    expect(String(failed[0]![1])).toMatch(/RESOURCE_DRIFTED.*signedConfigs\.tools/);
    expect(await j.item("effects.failed", "adapt")).toMatchObject({ status: "BLOCKED" });
    expect((await j.p.get(j.t.alice)).body.data).toMatchObject({ stage: "adapt" });
  });

  test("a dead owner is swept to process_lost by liveness; a live executor is not; a retry waits for the sweep, then runs", async () => {
    const { j, gate } = await atAssembleCompletion();
    await j.openEffect("assemble", "completion", gate);
    await j.p.sync();
    // A second process records EFFECT_STARTED and exits before any executor runs.
    const crashed = await a4Child({ action: "start-effect-then-die", workspace: j.t.workspace, userId: j.t.alice.userId, projectId: j.p.projectId,
      stage: "assemble", gateId: gate.gateId, expectedHeadSeq: j.p.head });
    const attemptId = String(crashed.attemptId);
    expect(attemptId).toMatch(/^a4e_/);
    const s = store(j);
    expect(s.runningEffects().find((row) => row.effect_id === attemptId)).toMatchObject({ owner_pid: crashed.pid, state: "running" });

    // Swept by liveness (the owner pid is gone), with no wall-clock bound at all.
    expect(sweepA4Effects(s, Number.MAX_SAFE_INTEGER)).toEqual([attemptId]);
    expect(await effectLinks(j)).toContainEqual(["EFFECT_FAILED", "process_lost"]);

    // The retry: a new attempt of the same execution. While its executor runs here, however stale its heartbeat, the
    // sweeper leaves it and a second retry is refused.
    await j.p.sync();
    const retried = retryEffect(s, j.p.projectId, { ...j.call(j.t.alice), attemptId, expectedHeadSeq: j.p.head });
    pendingExecutors.add(retried.attemptId);
    expect(sweepA4Effects(s, 0)).toEqual([]);
    await j.p.sync();
    expect(await codeOf(() => retryEffect(s, j.p.projectId, { ...j.call(j.t.alice), attemptId, expectedHeadSeq: j.p.head })))
      .toMatch(/^EFFECT_(RUNNING|NOT_RETRYABLE)$/);
    const ran = await runA4Effect(s, j.p.projectId, retried.attemptId);
    pendingExecutors.delete(retried.attemptId);
    expect(ran).toMatchObject({ kind: "EFFECT_FINISHED" });
    expect((await j.p.get(j.t.alice)).body.data).toMatchObject({ stage: "adapt" });
  });
});

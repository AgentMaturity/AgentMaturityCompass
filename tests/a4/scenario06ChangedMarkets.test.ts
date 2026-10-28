/**
 * P2-35 · design §17 "Changed operating markets". Reason codes: PLAN_STALE, PLAN_MISSING_FACTS, UNRESOLVED:<control>,
 * A4_GATE_STALE. With a release running in production, an owner reopens Adapt and the jurisdiction answer moves: the
 * plan recompiles to a new digest on the shipped catalog (requirements left unresolved for missing facts), the proposal reads stale, the
 * deployed release keeps running (deployed_release_id unchanged), and Activate starts a new cycle with no release.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { openA4Store } from "../../src/a4/a4Store.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { ADAPT_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => cleanupGovernanceFixtures());

/** The plan digest the newest Adapt revision recorded. */
function adaptPlanDigest(j: Journey): string {
  const store = openA4Store(j.t.workspace);
  try {
    const row = store.ledger.db.prepare("SELECT spec_json FROM a4_revisions WHERE project_id = ? AND stage = 'adapt' ORDER BY revision_no DESC LIMIT 1")
      .get(j.p.projectId) as { spec_json: string };
    return (JSON.parse(row.spec_json) as { plan: { digest: string } }).plan.digest;
  } finally {
    store.close();
  }
}
const answers = (values: Record<string, unknown>) => Object.entries(values).map(([questionId, value]) => ({ questionId, value }));

describe("scenario: changed operating markets", () => {
  test("a jurisdiction moved at a deployed project recompiles the plan; the deployed release keeps running", async () => {
    const j = await Journey.start();
    await j.toActivate();
    const prod = await j.production();
    const planBefore = adaptPlanDigest(j);
    expect(planBefore).toMatch(/^sha256:[0-9a-f]{64}$/);

    expect((await j.p.post(j.t.alice, "/reopen", { toStage: "adapt", reason: "the operating market moved to the US" })).body.data).toMatchObject({ kind: "REOPEN" });
    expect((await j.p.get(j.t.alice)).body.data).toMatchObject({ stage: "adapt", deployedReleaseId: prod.releaseId });

    await j.p.ok(j.t.alice, "/stages/adapt/answers", { answers: answers({ ...ADAPT_ANSWERS, jurisdictions: ["US"] }) });
    const understood = await j.p.ok(j.t.alice, "/stages/adapt/understand");
    const planAfter = (understood.body.data!.understanding as { planDigest: string }).planDigest;
    expect(planAfter).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(planAfter).not.toBe(planBefore);
    expect(await j.item("plan_proposed", "adapt")).toMatchObject({ status: "WAITING", reasonCodes: ["PLAN_STALE"] });
    // On the shipped catalog the recompiled plan leaves requirements unresolved for missing facts (P2-42: no synthetic catalog).
    const unresolved = (await j.item("plan_unresolved", "adapt"))?.reasonCodes ?? [];
    expect(unresolved).toContain("PLAN_MISSING_FACTS");
    expect(unresolved.some((code) => /^UNRESOLVED:L[0-2]-[A-Z]+-[A-Z0-9-]+$/.test(code))).toBe(true);

    // The production release is untouched; Activate's new cycle has no release of its own yet.
    expect((await j.p.get(j.t.alice)).body.data!.deployedReleaseId).toBe(prod.releaseId);
    expect(await j.item("lifecycle.production_controls", "activate")).toMatchObject({ status: "WAITING", reasonCodes: ["NO_RELEASE"] });
    expect(await j.item("package.transparency", "activate")).toMatchObject({ reasonCodes: ["NO_RELEASE"] });
  });

  test("a jurisdiction answered while Adapt's direction gate is open supersedes the gate", async () => {
    const j = await Journey.start();
    await j.throughAspire();
    await j.stage("assemble", { capabilities: ["draft refund replies"], autonomy: "advise", providers: "stub", path: "other" });
    await j.propose("adapt", ADAPT_ANSWERS);
    const gate = await j.p.openGate(j.t.alice, "adapt", "direction");
    await j.p.ok(j.t.alice, "/stages/adapt/answers", { answers: answers({ ...ADAPT_ANSWERS, jurisdictions: ["US"] }) });
    const stale = await j.p.decide(j.t.bob, gate);
    expect(stale.body.code).toBe("A4_GATE_STALE");
  });
});

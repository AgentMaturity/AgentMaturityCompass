/**
 * P2-35 negative fixtures for hypothesis observation (design §10.1; POST …/hypotheses/:id/observe): only a runtime-written
 * (OBSERVED) ledger row of the agent, of the hypothesis's declared event type and metric, inside its window and written
 * after it was proposed, moves a hypothesis out of `proposed`; the human verdict stays a separate self_reported statement.
 * Reason codes: A4_STEP_ORDER, A4_HYPOTHESIS_NOT_FOUND, EVIDENCE_REF_DANGLING, HYPOTHESIS_NOT_OBSERVED,
 * HYPOTHESIS_SOURCE_MISMATCH, HYPOTHESIS_OUTSIDE_WINDOW, A4_HYPOTHESIS_OBSERVED.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openA4Store } from "../../src/a4/a4Store.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { Journey } from "./a4Journey.js";
import { refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 180_000 });
const ledgers: Ledger[] = [];
afterEach(() => {
  for (const ledger of ledgers.splice(0)) ledger.close();
  cleanupGovernanceFixtures();
});

type Hypothesis = { id: string; window: { from: string; to: string }; evidenceSource: { eventType: string; metric: string } };

async function proposed(j: Journey): Promise<{ hypothesis: Hypothesis; agentId: string }> {
  const store = openA4Store(j.t.workspace);
  try {
    const revision = store.readChain(j.p.projectId).filter((link) => link.kind === "REVISION" && link.body.stage === "aspire").at(-1)!;
    const head = store.readHead(j.p.projectId)!;
    const spec = JSON.parse((store.ledger.db.prepare("SELECT spec_json FROM a4_revisions WHERE project_id = ? AND revision_no = ?")
      .get(j.p.projectId, revision.revisionNo) as { spec_json: string }).spec_json) as { hypotheses: Hypothesis[] };
    return { hypothesis: spec.hypotheses[0]!, agentId: head.agent_id };
  } finally {
    store.close();
  }
}

/** One ledger row for `agentId`; `tier` OBSERVED is a runtime-declared tier (producer amc-runtime), absent is SELF_REPORTED. */
function row(workspace: string, agentId: string, meta: Record<string, unknown>, ts?: number): { refId: string; sha256: string } {
  const ledger = openLedger(workspace);
  ledgers.push(ledger);
  const sessionId = `p235-${randomUUID()}`;
  ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "p235-fixture", binarySha256: "f".repeat(64) });
  const written = ledger.appendEvidenceDetailed({ sessionId, runtime: "unknown", eventType: "audit", inline: true, payload: JSON.stringify({ value: 42 }),
    payloadExt: "json", meta: { agentId, auditType: "audit", value: 42, ...meta }, ...(ts === undefined ? {} : { ts }) });
  return { refId: written.id, sha256: written.payloadSha256 };
}

describe("hypothesis observation", () => {
  test("refusals and the one observation that counts", async () => {
    const j = await Journey.start();
    const { alice } = j.t;
    await j.p.proposeAspire();
    const { hypothesis, agentId } = await proposed(j);
    const observe = (refId: string, sha256: string, id = hypothesis.id) =>
      j.p.post(alice, `/hypotheses/${id}/observe`, { verdict: "observed", evidenceRef: { refId, sha256 } });
    const good = { trustTier: "OBSERVED", metricKey: hypothesis.evidenceSource.metric };

    // Nothing in Aspire is observed.
    const early = row(j.t.workspace, agentId, good);
    expect(refusal(await observe(early.refId, early.sha256))).toEqual([409, "A4_STEP_ORDER"]);

    must(await j.complete("aspire", await j.approve("aspire", "direction")));
    await j.build("aspire");
    must(await j.complete("aspire", await j.approve("aspire", "completion")));

    expect(refusal(await observe(early.refId, early.sha256, "h-000000000000"))).toEqual([404, "A4_HYPOTHESIS_NOT_FOUND"]);
    expect(refusal(await observe("no-such-row", "0".repeat(64)))).toEqual([409, "EVIDENCE_REF_DANGLING"]);
    const selfReported = row(j.t.workspace, agentId, { metricKey: hypothesis.evidenceSource.metric });
    expect(refusal(await observe(selfReported.refId, selfReported.sha256))).toEqual([409, "HYPOTHESIS_NOT_OBSERVED"]);
    // An imported row cannot even declare OBSERVED; imported without a tier, it reads SELF_REPORTED.
    expect(() => row(j.t.workspace, agentId, { ...good, source: "import" })).toThrow(/OBSERVED is not allowed for import/);
    const imported = row(j.t.workspace, agentId, { metricKey: hypothesis.evidenceSource.metric, source: "import" });
    expect(refusal(await observe(imported.refId, imported.sha256))).toEqual([409, "HYPOTHESIS_NOT_OBSERVED"]);
    const otherMetric = row(j.t.workspace, agentId, { ...good, metricKey: "another-metric" });
    expect(refusal(await observe(otherMetric.refId, otherMetric.sha256))).toEqual([400, "HYPOTHESIS_SOURCE_MISMATCH"]);
    const late = row(j.t.workspace, agentId, good, Date.parse(hypothesis.window.to) + 60_000);
    expect(refusal(await observe(late.refId, late.sha256))).toEqual([409, "HYPOTHESIS_OUTSIDE_WINDOW"]);
    const foreign = row(j.t.workspace, "another-agent", good);
    expect((await observe(foreign.refId, foreign.sha256)).status).toBeGreaterThanOrEqual(400);

    // The row written before the brief left Aspire still lies inside the window and after the proposal: it counts.
    const observed = await observe(early.refId, early.sha256);
    expect(observed.status).toBe(201);
    const link = (await j.transitions()).find((entry) => entry.seq === observed.body.data!.seq)!;
    expect(link.body).toMatchObject({ claimKind: "observed", lane: "observed", hypothesisId: hypothesis.id, observedOutcome: 42,
      verdict: { outcome: "observed", claimKind: "self_reported" } });
    expect(refusal(await observe(early.refId, early.sha256))).toEqual([409, "A4_HYPOTHESIS_OBSERVED"]);
  });
});

function must(reply: { status: number; body: unknown }): void {
  if (reply.status >= 300) throw new Error(`${reply.status} ${JSON.stringify(reply.body)}`);
}

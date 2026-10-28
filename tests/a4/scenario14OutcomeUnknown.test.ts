/**
 * P2-35 · design §17 "`outcome_unknown` lockout". Reason codes: OUTCOME_UNKNOWN_OPEN, EXECUTION:<id>, A4_NOT_READY,
 * SOD_VIOLATION, RESOLUTION_REFUSED. A journaled FINANCIAL call of the project's agent left `outcome_unknown` (a lost
 * reply) blocks Assemble's progression; the card's resolution flow files an engine request, a second person approves
 * it (the operator who stated it cannot), and "Resolve" records the operator's statement self_reported, which clears it.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openActionJournal } from "../../src/actions/actionJournal.js";
import { bindAuthorization } from "../../src/actions/authorize.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { cleanupGovernanceFixtures, REFUND } from "../governor/governanceFixture.js";
import { a4, refusal } from "./a4Harness.js";
import { ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => cleanupGovernanceFixtures());

/** A journaled refund of `agentId` that started and then lost its reply: `outcome_unknown`, as the tool pipeline leaves it. */
function lostReply(workspace: string, sessionId: string, agentId: string): string {
  const journal = openActionJournal(workspace);
  try {
    const callId = `p235-${randomUUID()}`;
    const execution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null, workspace, name: REFUND, agentId, actionClass: "FINANCIAL",
      requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { amount: "80.00", currency: "USD", recipient: "acme-001", resourceId: "invoice-001" } } as ToolExecution;
    const bound = bindAuthorization(execution, { sessionId });
    if (!bound.ok) throw new Error(`binding refused: ${bound.reason}`);
    const id = bound.record.executionId;
    journal.request({ executionId: id, agentId, toolName: REFUND, actionClass: "FINANCIAL", sessionId, callId, parentExecutionId: null,
      idempotencyKey: bound.record.idempotencyKey });
    journal.authorize(id, bound.digest);
    journal.start(id, bound.record);
    journal.markUnknown(id, "p235 fixture: the provider's reply was lost");
    return id;
  } finally {
    journal.close();
  }
}

describe("scenario: outcome_unknown lockout", () => {
  test("an open outcome_unknown blocks Assemble until its resolution is approved by a second person and recorded", async () => {
    const j = await Journey.start();
    await j.throughAspire();
    await j.propose("assemble", ASSEMBLE_ANSWERS);
    expect((await j.complete("assemble", await j.approve("assemble", "direction"))).status).toBe(200);
    await j.build("assemble");
    const agentId = (await j.p.get(j.t.alice)).body.data!.agentId as string;
    const executionId = lostReply(j.t.workspace, j.t.sessionId, agentId);

    expect(await j.item("no_open_outcome_unknown")).toMatchObject({ status: "BLOCKED", reasonCodes: ["OUTCOME_UNKNOWN_OPEN", `EXECUTION:${executionId}`] });
    const blocked = await j.p.post(j.t.alice, "/stages/assemble/gates/completion/request");
    expect(refusal(blocked)).toEqual([409, "A4_NOT_READY"]);

    const requested = await j.p.post(j.t.alice, `/outcome-unknown/${executionId}/request`,
      { effect: "not_applied", externalRef: null, note: "the payment provider shows no charge for this call" });
    expect(requested.status).toBe(201);
    const { approvalRequestId, requestDigestSha256 } = requested.body.data as { approvalRequestId: string; requestDigestSha256: string };
    const link = (await j.transitions()).find((entry) => entry.seq === requested.body.data!.seq)!;
    expect(link.body).toMatchObject({ purpose: "outcome_unknown_resolution", claimKind: "self_reported", lane: "implementation", requiredApprovals: 2 });
    expect(JSON.stringify(link.body)).not.toContain("shows no charge");

    // Resolve before approval: refused. The operator who stated it cannot approve it.
    expect((await j.p.post(j.t.alice, `/outcome-unknown/${executionId}/resolve`)).status).toBe(409);
    const decide = (who: { userId: string }) => a4(j.t.workspace, who, "POST", `${j.p.path}/approvals/${approvalRequestId}/approve`,
      { reason: "checked the provider", expectedRequestDigestSha256: requestDigestSha256 });
    expect(refusal(await decide(j.t.alice))).toEqual([400, "SOD_VIOLATION"]);
    for (const who of [j.t.bob, j.t.owner]) expect((await decide(who)).status).toBe(201);

    expect((await j.p.post(j.t.alice, `/outcome-unknown/${executionId}/resolve`)).status).toBe(201);
    expect(await j.item("no_open_outcome_unknown")).toMatchObject({ status: "READY" });
  });
});

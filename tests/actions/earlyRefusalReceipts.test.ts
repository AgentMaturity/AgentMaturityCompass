import { afterEach, describe, expect, test, vi } from "vitest";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import type { ToolDenial } from "../../src/tools/toolTypes.js";
import { FAULT_ARGUMENTS, PAYMENT_TOOL } from "../helpers/actionFaults.js";
import { checkedChain, createP104Fixture, oracleCounts, type P104Fixture } from "../helpers/p104Qualification.js";

/**
 * Refusals of a journaled call (P1-03): the early refusal decided before anyone was asked (UX-03), the trusted effect
 * guard and a person's refusal each end the call as a signed `denied` receipt with its reason code; a journal that cannot
 * open and a sub-call whose intent cannot bind are refused too. Nothing reaches the system of record.
 */
let f: P104Fixture | null = null;
afterEach(() => { f?.finish(true); f = null; });

function pay(pipeline: ToolPipeline, checks: { refusedBeforeApproval?: ToolDenial; beforeEffect?: () => string | null } = {}) {
  return pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] }, requestedMode: "EXECUTE", ...checks });
}

describe("early refusals on a journaled call", () => {
  test("the guards' early refusal is the denial, with an unlabelled guard named as such", async () => {
    f = createP104Fixture();
    const outcome = await pay(f.pipeline, { refusedBeforeApproval: { stage: "guard", reason: "a hook refused it before anyone was asked", guardLabel: null } });
    expect(outcome.denied).toEqual({ stage: "guard", reason: "a hook refused it before anyone was asked", guardLabel: null });
    expect(checkedChain(f, outcome.action!.executionId).at(-1)).toMatchObject({ state: "denied", reasonCode: "guard_denied:unlabelled" });
    expect(oracleCounts(f).effects).toHaveLength(0);
  });

  test("an early refusal by a labelled guard carries its label into the receipt", async () => {
    f = createP104Fixture();
    const outcome = await pay(f.pipeline, { refusedBeforeApproval: { stage: "guard", reason: "blocked in this folder", guardLabel: "PreToolUse #1" } });
    expect(checkedChain(f, outcome.action!.executionId).at(-1)).toMatchObject({ state: "denied", reasonCode: "guard_denied:PreToolUse #1" });
  });

  test("the trusted effect guard refuses after authorization, as the last check before the body", async () => {
    f = createP104Fixture();
    const outcome = await pay(f.pipeline, { beforeEffect: () => "not run: the automatic checks refused it before anyone was asked (late)" });
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.reason).toContain("not run: the automatic checks refused it before anyone was asked (late)");
    const chain = checkedChain(f, outcome.action!.executionId);
    expect(chain.map((row) => row.state)).toEqual(["requested", "authorized", "denied"]);
    expect(chain.at(-1)!.reasonCode).toBe("guard_denied:trusted-before-effect");
    expect(oracleCounts(f).effects).toHaveLength(0);
    expect(f.beforeEffects).toHaveLength(0);
  });

  const over = (fixture: P104Fixture, extra: Partial<ConstructorParameters<typeof ToolPipeline>[0]>) => new ToolPipeline({ registry: fixture.registry,
    workspace: fixture.workspace, journal: () => fixture.journal, authorizationContext: () => ({ sessionId: fixture.sessionId }), ...extra });

  test("a person's refusal of a journaled call is a denied receipt with the approval reason code", async () => {
    f = createP104Fixture();
    const outcome = await pay(over(f, { approvalRequiredFor: new Set(["FINANCIAL"]), approve: async () => "deny" }));
    expect(outcome.denied?.stage).toBe("approval");
    expect(checkedChain(f, outcome.action!.executionId).at(-1)).toMatchObject({ state: "denied", reasonCode: "approval_denied" });
    expect(oracleCounts(f).effects).toHaveLength(0);
  });

  test("a journal that cannot be opened refuses the call before anything is requested, naming the failure", async () => {
    f = createP104Fixture();
    const outcome = await pay(over(f, { journal: () => { throw new Error("journal disk is gone"); } }));
    expect(outcome.denied).toEqual({ stage: "authorization", guardLabel: null, reason: "journal_unavailable: Error: journal disk is gone" });
    expect(oracleCounts(f).effects).toHaveLength(0);
  });

  test("a Code Mode sub-call whose intent cannot bind is not put to a person, and is refused at authorization", async () => {
    f = createP104Fixture();
    const pipeline = over(f, {});
    const ask = vi.fn(async () => ({ approvalRequestIds: ["apr"] }));
    pipeline.bindApprovalGate({ gates: () => true, ask });
    const outcome = await pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", arguments: { currency: "USD" }, requestedMode: "EXECUTE", parentToken: "program" });
    expect(ask).not.toHaveBeenCalled();
    expect(outcome.denied?.stage).toBe("authorization");
    expect(oracleCounts(f).effects).toHaveLength(0);
  });
});

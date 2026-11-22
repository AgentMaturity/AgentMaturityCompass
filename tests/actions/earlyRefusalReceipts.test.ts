import { afterEach, describe, expect, test } from "vitest";
import type { ToolDenial } from "../../src/tools/toolTypes.js";
import { FAULT_ARGUMENTS, PAYMENT_TOOL } from "../helpers/actionFaults.js";
import { checkedChain, createP104Fixture, oracleCounts, type P104Fixture } from "../helpers/p104Qualification.js";

/**
 * UX-03 on a journaled call (P1-03): a refusal decided before anyone was asked, and the trusted effect guard, each end
 * the call as a signed `denied` receipt with its reason code, and nothing reaches the system of record.
 */
let f: P104Fixture | null = null;
afterEach(() => { f?.finish(true); f = null; });

function pay(fixture: P104Fixture, checks: { refusedBeforeApproval?: ToolDenial; beforeEffect?: () => string | null }) {
  return fixture.pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] }, requestedMode: "EXECUTE", ...checks });
}

describe("early refusals on a journaled call", () => {
  test("the guards' early refusal is the denial, with an unlabelled guard named as such", async () => {
    f = createP104Fixture();
    const outcome = await pay(f, { refusedBeforeApproval: { stage: "guard", reason: "a hook refused it before anyone was asked", guardLabel: null } });
    expect(outcome.denied).toEqual({ stage: "guard", reason: "a hook refused it before anyone was asked", guardLabel: null });
    expect(checkedChain(f, outcome.action!.executionId).at(-1)).toMatchObject({ state: "denied", reasonCode: "guard_denied:unlabelled" });
    expect(oracleCounts(f).effects).toHaveLength(0);
  });

  test("an early refusal by a labelled guard carries its label into the receipt", async () => {
    f = createP104Fixture();
    const outcome = await pay(f, { refusedBeforeApproval: { stage: "guard", reason: "blocked in this folder", guardLabel: "PreToolUse #1" } });
    expect(checkedChain(f, outcome.action!.executionId).at(-1)).toMatchObject({ state: "denied", reasonCode: "guard_denied:PreToolUse #1" });
  });

  test("the trusted effect guard refuses after authorization, as the last check before the body", async () => {
    f = createP104Fixture();
    const outcome = await pay(f, { beforeEffect: () => "not run: the automatic checks refused it before anyone was asked (late)" });
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.reason).toContain("not run: the automatic checks refused it before anyone was asked (late)");
    const chain = checkedChain(f, outcome.action!.executionId);
    expect(chain.map((row) => row.state)).toEqual(["requested", "authorized", "denied"]);
    expect(chain.at(-1)!.reasonCode).toBe("guard_denied:trusted-before-effect");
    expect(oracleCounts(f).effects).toHaveLength(0);
    expect(f.beforeEffects).toHaveLength(0);
  });
});

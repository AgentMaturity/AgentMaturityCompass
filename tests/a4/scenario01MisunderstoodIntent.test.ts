/**
 * P2-35 · design §17 "Misunderstood intent". Reason codes: A4_UNDERSTANDING_UNCONFIRMED (readiness item
 * `understanding_confirmed` WAITING, code UNDERSTANDING_NOT_CONFIRMED), A4_STEP_ORDER.
 * Understand needs an explicit confirm; a correction is new answers, Understand runs again, nothing proposes meanwhile,
 * and the first reflection stays in the chain.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, aspireAnswers, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

type Item = { id: string; status: string; reasonCodes: string[] };
const item = async (p: A4Project, id: string): Promise<Item | undefined> =>
  ((await p.get(p.author, "/readiness")).body.data!.items as Item[]).find((entry) => entry.id === id);

describe("scenario: misunderstood intent", () => {
  test("no explain or propose without a confirm; a correction re-runs Understand and keeps the first reflection", async () => {
    const { workspace, alice } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.ok(alice, "/stages/aspire/answers", { answers: aspireAnswers() });
    const first = await p.ok(alice, "/stages/aspire/understand");
    const firstSeq = first.body.data!.seq as number;
    expect(await item(p, "understanding_confirmed")).toMatchObject({ status: "WAITING", reasonCodes: ["UNDERSTANDING_NOT_CONFIRMED"] });
    expect(refusal(await p.post(alice, "/stages/aspire/explain", { level: "practitioner" }))).toEqual([409, "A4_STEP_ORDER"]);
    expect(refusal(await p.post(alice, "/stages/aspire/propose", { spec: {} }))).toEqual([409, "A4_STEP_ORDER"]);
    // A confirmation carries no corrections: corrections are new answers.
    expect(refusal(await p.post(alice, "/stages/aspire/confirm-understanding", { confirmed: true, corrections: ["the job is wrong"] }))[0]).toBe(400);

    // "Not quite": the corrected answer is a new revision; Understand runs again on it.
    const corrected = await p.ok(alice, "/stages/aspire/answers", { answers: aspireAnswers({ problem: "Refund replies are slow and inconsistent" }) });
    expect(corrected.body.data!.kind).toBe("REVISION");
    expect(await item(p, "understanding_confirmed")).toMatchObject({ status: "WAITING" });
    const second = await p.ok(alice, "/stages/aspire/understand");
    expect((second.body.data!.understanding as { reflection: { mission: string } }).reflection.mission).toBe("Refund replies are slow and inconsistent");

    // The wrong reflection stays in the chain.
    const transitions = (await p.get(alice, "/transitions")).body.data!.transitions as Array<{ seq: number; kind: string }>;
    expect(transitions.find((link) => link.seq === firstSeq)?.kind).toBe("EVIDENCE_REF");
    expect(transitions.filter((link) => link.kind === "EVIDENCE_REF").length).toBeGreaterThanOrEqual(2);

    await p.ok(alice, "/stages/aspire/confirm-understanding", { confirmed: true });
    expect(await item(p, "understanding_confirmed")).toMatchObject({ status: "READY" });
    await p.ok(alice, "/stages/aspire/explain", { level: "practitioner" });
  });
});

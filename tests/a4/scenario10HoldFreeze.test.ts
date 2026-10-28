/**
 * P2-35 · design §17 "Hold / freeze / kill switch". Reason codes: ON_HOLD (409 A4_NOT_READY naming it; the design names
 * `A4_ON_HOLD`, which the HTTP routes never answer, see the DEBT.md follow-up), NOT_ON_HOLD, `hold.none` WAITING.
 * Every mutation but comments, members and RESUME is refused while held; resume needs an owner.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { addUser } from "../../src/auth/authApi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, aspireAnswers, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

describe("scenario: hold", () => {
  test("a held project refuses stage writes and gate requests, takes comments and members, and resumes by an owner", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    await p.ok(alice, "/hold", { reason: "incident INC-42" });
    expect((await p.get(alice)).body.data).toMatchObject({ hold: true, holdReason: "incident INC-42" });
    const readiness = (await p.get(alice, "/readiness")).body.data!;
    expect(readiness.status).toBe("ON_HOLD");
    const items = readiness.items as Array<{ id: string; status: string; reasonCodes: string[] }>;
    expect(items.find((entry) => entry.id === "hold.none")).toMatchObject({ status: "WAITING", reasonCodes: ["ON_HOLD"] });

    const answer = await p.post(alice, "/stages/aspire/answers", { answers: aspireAnswers() });
    expect(refusal(answer)).toEqual([409, "A4_NOT_READY"]);
    expect(answer.body.detail).toMatchObject({ reasonCodes: ["ON_HOLD"] });
    expect(refusal(await p.post(alice, "/stages/aspire/gates/direction/request"))[0]).toBe(409);
    const again = await p.post(alice, "/hold", { reason: "again" });
    expect(refusal(again)).toEqual([409, "A4_NOT_READY"]);
    expect(again.body.detail).toMatchObject({ reasonCodes: ["ON_HOLD"] });

    expect((await p.post(bob, "/comments", { body: "noted", cardId: "aspire.brief", expectedHeadSeq: undefined })).status).toBe(201);
    const carol = addUser({ workspace, username: "carol", roles: ["APPROVER"], password: "p235-carol-password" });
    expect((await p.post(alice, "/members", { principalKey: `LOCAL_USER:${carol.userId}`, projectRoles: ["viewer"] })).status).toBe(200);

    await p.ok(alice, "/resume", { reason: "INC-42 closed" });
    expect((await p.get(alice)).body.data).toMatchObject({ hold: false });
    expect(refusal(await p.post(alice, "/resume", { reason: "twice" }))).toEqual([409, "A4_NOT_READY"]);
    expect((await p.post(alice, "/stages/aspire/answers", { answers: aspireAnswers() })).status).toBe(201);
  });
});

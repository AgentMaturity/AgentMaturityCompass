/**
 * 2026-11-15: one evaluator and a team. A project started from an Industry Pack names a high risk tier, which makes it
 * regulated, so a person alone stopped at the first approval. A practice project lets that one person approve their own
 * work (recorded and shown as self-approved) and never loosens a regulated project; inviting a second person is one call.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { addUser, authenticateUser, revokeUser } from "../../src/auth/authApi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { notReadyWords } from "../../src/a4/a4Words.js";
import { a4, A4Project, a4Workspace, aspireAnswers, refusal, requestId } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

const HIGH = aspireAnswers({ riskTier: "high", governance: "regulated" });
const create = (workspace: string, who: { userId: string }, body: Record<string, unknown> = {}) =>
  a4(workspace, who, "POST", "/api/v1/a4/projects", { clientRequestId: requestId(), name: "Pack start", expertise: "novice", ...body });

/** A regulated project with nobody else on it: the gate request itself waits on separation of duties. */
async function soloRefusal(p: A4Project, owner: { userId: string }): Promise<[number, string | undefined]> {
  const reply = await p.post(owner, "/stages/aspire/gates/direction/request");
  expect(reply.body.error).toContain("sod.self_provisioned");
  return refusal(reply);
}

describe("a person alone and a project that names a high risk tier", () => {
  test("a normal project stops at the first approval, and creation said a second person is needed", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const created = await create(workspace, owner);
    expect(created.status).toBe(201);
    const approvals = created.body.data!.approvals as { kind: string; secondPersonNeeded: boolean; text: string };
    expect(approvals).toMatchObject({ kind: "standard", secondPersonNeeded: true });
    expect(approvals.text).toContain("start a practice project instead");
    const p = new A4Project(workspace, created.body.data!.projectId as string, owner);
    p.head = created.body.data!.seq as number;
    await p.proposeAspire(HIGH);
    expect(await soloRefusal(p, owner)).toEqual([409, "A4_NOT_READY"]);
    // Alone, an acknowledgement would only lead to a second refusal: the words name the way out instead.
    const words = (await p.post(owner, "/stages/aspire/gates/direction/request")).body.error as string;
    expect(words).toContain("Nobody else on this project can approve it");
    expect(words).not.toContain("acknowledges this once");
  });

  test("a practice project: the one user approves, recorded and shown as self-approved, and the project says it is practice", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const created = await create(workspace, owner, { practice: true });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ practice: true, approvals: { kind: "practice", secondPersonNeeded: false } });
    expect((created.body.data!.approvals as { text: string }).text).toContain("recorded and shown as self-approved");
    const p = new A4Project(workspace, created.body.data!.projectId as string, owner);
    p.head = created.body.data!.seq as number;
    await p.proposeAspire(HIGH);
    const gate = await p.openGate(owner);
    expect((await p.decide(owner, gate)).status).toBe(201);
    const [decision] = (await p.gate(owner, gate.gateId)).decisions as Array<{ selfApproved: boolean; claimKind: string }>;
    expect(decision).toMatchObject({ selfApproved: true, claimKind: "self_reported" });
    expect((await p.get(owner)).body.data).toMatchObject({ practice: true, selfApprovalAllowed: true });
  });

  test("a second person ends it: the high tier governs again, and nobody approves their own work", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const created = await create(workspace, owner, { practice: true });
    const p = new A4Project(workspace, created.body.data!.projectId as string, owner);
    p.head = created.body.data!.seq as number;
    await p.proposeAspire(HIGH);
    addUser({ workspace, username: "second", roles: ["APPROVER"], password: "practice-second-password" });
    expect(await soloRefusal(p, owner)).toEqual([409, "A4_NOT_READY"]);
    expect((await p.get(owner)).body.data).toMatchObject({ practice: true, practiceActive: false, regulated: true, selfApprovalAllowed: false });
  });

  test("a second person who joined and was turned off again, with no A4 write between, still ends practice", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const created = await create(workspace, owner, { practice: true });
    const p = new A4Project(workspace, created.body.data!.projectId as string, owner);
    p.head = created.body.data!.seq as number;
    await p.proposeAspire(HIGH);
    expect((await p.get(owner)).body.data).toMatchObject({ practice: true, practiceActive: true, regulated: false, selfApprovalAllowed: true });
    addUser({ workspace, username: "second", roles: ["APPROVER"], password: "practice-second-password" });
    // Read before any transition records the second person: regulated at once.
    expect((await p.get(owner)).body.data).toMatchObject({ practice: true, practiceActive: false, regulated: true, selfApprovalAllowed: false });
    revokeUser({ workspace, username: "second" });
    expect((await p.get(owner)).body.data).toMatchObject({ practiceActive: false, regulated: true, selfApprovalAllowed: false });
    expect(await soloRefusal(p, owner)).toEqual([409, "A4_NOT_READY"]);
  });

  test("a workspace with more than one person is refused a practice project, in words", async () => {
    const { workspace, owner } = a4Workspace();
    const refused = await create(workspace, owner, { practice: true });
    expect(refusal(refused)).toEqual([409, "A4_PRACTICE_NOT_AVAILABLE"]);
    expect(refused.body.error).toContain("3 people can sign in to this workspace");
    const options = await a4(workspace, owner, "GET", "/api/v1/a4/options");
    expect((options.body.data!.workspace as { start: Record<string, unknown> }).start).toMatchObject({ people: 3, practiceAvailable: false });
  });
});

describe("inviting the second approver", () => {
  test("an owner invites by name: the account, a first password shown once, and the project membership", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const p = await A4Project.create(workspace, owner);
    const body = { username: "riya", workspaceRoles: ["APPROVER", "AUDITOR"] };
    const invited = await p.post(owner, "/members/invite", body);
    expect(invited.status).toBe(201);
    const data = invited.body.data as { memberAdded: boolean; firstPassword: string; user: { userId: string; workspaceRoles: string[]; created: boolean }; notes: string[] };
    expect(data).toMatchObject({ memberAdded: true, user: { username: "riya", workspaceRoles: ["APPROVER", "AUDITOR"], created: true } });
    expect(data.firstPassword).toMatch(/^([a-z2-9]{4}-){4}[a-z2-9]{4}$/);
    expect(data.notes.join(" ")).toContain("it is not an independent review");
    // The password signs that person in, and the project lists them as an approver.
    expect(authenticateUser({ workspace, username: "riya", password: data.firstPassword }).ok).toBe(true);
    const members = (await p.get(owner, "/members")).body.data!.members as Array<{ principalKey: string; roles: string[] }>;
    expect(members.find((member) => member.principalKey === `LOCAL_USER:${data.user.userId}`)?.roles).toEqual(["approver"]);
  });

  test("an existing account is added as it is, with no password; someone who is not an owner is refused in words", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const p = await A4Project.create(workspace, owner);
    const maya = addUser({ workspace, username: "maya", roles: ["OPERATOR"], password: "practice-maya-password" });
    const invited = await p.post(owner, "/members/invite", { username: "Maya" });
    expect(invited.body.data).toMatchObject({ memberAdded: true, firstPassword: null, user: { userId: maya.userId, created: false } });
    expect((invited.body.data!.notes as string[]).join(" ")).toContain("cannot approve yet");
    const refused = await p.post({ userId: maya.userId }, "/members/invite", { username: "sam" });
    expect(refusal(refused)).toEqual([403, "PRINCIPAL_ROLE_INSUFFICIENT"]);
    expect(refused.body.error).toContain("Only a workspace owner");
  });

  test("the projects page's Add a person: one call makes the account and shows the first password once", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const added = await a4(workspace, owner, "POST", "/api/v1/a4/people", { clientRequestId: requestId(), username: "dev", workspaceRoles: ["APPROVER"] });
    expect(added.status).toBe(201);
    const data = added.body.data as { memberAdded: boolean; firstPassword: string; notes: string[] };
    expect(data.memberAdded).toBe(false);
    expect(authenticateUser({ workspace, username: "dev", password: data.firstPassword }).ok).toBe(true);
    expect(data.notes.join(" ")).toContain("Members card");
  });
});

describe("the start form says which kind of project needs a second person", () => {
  test("practice is offered when Studio offers it, and otherwise its reason is shown", async () => {
    const view = await import("../../src/console/assets/a4View.js");
    const offered = view.approverChoiceHtml({ practiceAvailable: true, practiceRefusal: null });
    expect(offered).toContain("Every Industry Pack is high risk or above");
    expect(offered).toMatch(/value="yes" \/>/);
    const refused = view.approverChoiceHtml({ practiceAvailable: false, practiceRefusal: "3 people can sign in to this workspace." });
    expect(refused).toMatch(/value="yes" disabled \/>/);
    expect(refused).toContain("3 people can sign in to this workspace.");
    expect(view.practiceBanner({ practice: true, practiceActive: false })).toContain("This was a practice project");
  });

  test("Home's start form keeps both explanations and the pack notice one click away, with the same inputs", async () => {
    const view = await import("../../src/console/assets/a4View.js");
    const packs = await import("../../src/console/assets/a4Pack.js");
    const folded = view.approverChoiceHtml({ practiceAvailable: true, practiceRefusal: null }, { fold: true });
    expect(folded).toMatch(/<details class="more-info"><summary>Which should I pick\?<\/summary>[\s\S]*Every Industry Pack is high risk or above[\s\S]*<\/details>/);
    expect(folded).toContain('name="practice" value="" checked />');
    expect(folded).toContain('name="practice" value="yes" />');
    const select = packs.packSelectHtml([{ packId: "digital-health-record", name: "Record", domain: "health" }], null, { fold: true });
    expect(select).toMatch(/<details class="notice-chip"><summary>[\s\S]*AI-drafted, not legal advice[\s\S]*not reviewed by a qualified expert; not legal advice\.<\/p><\/details>/);
    expect(select).toContain('aria-describedby="a4PackHint"');
  });
});

test("the separation-of-duties words keep the acknowledgement when someone else can approve", () => {
  const sod = { id: "sod.self_provisioned", reasonCodes: ["SOD_DEGRADED_SELF_PROVISIONED", "REVIEW_NOT_INDEPENDENT"] };
  expect(notReadyWords({ ...sod, reasonCodes: [...sod.reasonCodes, "NO_SECOND_APPROVER"] })).toContain("Invite someone new");
  expect(notReadyWords(sod)).toContain("acknowledges this once");
  expect(notReadyWords({ id: "hold.none", reasonCodes: ["NO_SECOND_APPROVER"] })).toContain("on hold");
});

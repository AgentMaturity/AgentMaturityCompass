/**
 * 2026-11-15 A4 walk (lane a4-walk): a person alone on a practice project was told they could not approve what Studio
 * let them approve; the guide offered Review while the build session was open and pointed at the wrong Native Tasks link;
 * "Use an example" lowered a pack project's risk level; Add a person for an existing account left nothing to do; amc a4
 * readiness printed bare PRODUCED_AT_* items; and nobody was told, before asking, that an approval needed more people.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import * as start from "../../src/console/assets/a4Start.js";
import * as view from "../../src/console/assets/a4View.js";
import { PACK_FIELDS, packAnswers } from "../../src/console/assets/a4Pack.js";
import { notReadyWords, SELF_APPROVE } from "../../src/a4/a4Words.js";
import { reviewRefusals } from "../../src/a4/assembleBuild.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { a4, A4Project, a4Workspace, aspireAnswers, requestId } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

type Ctx = Record<string, unknown>;
const project = (over: Ctx = {}) => ({ projectId: "a4p_1", agentId: "helper", stage: "aspire", step: "proposed", hold: false, members: [], ...over });
const ctx = (over: Ctx = {}, readiness: Ctx = {}) => ({ project: project(), stage: "aspire", gates: [], members: { candidates: [] },
  me: { userId: "u1", username: "owner", roles: ["OWNER"] }, questions: [], allowed: {},
  readiness: { status: "WAITING", items: [], gates: {}, allowed: {}, ...readiness }, ...over });
type Move = { now: string; why?: string; people?: boolean; act?: { label: string; press?: string; focus?: string; href?: string; copy?: boolean } };
const move = (c: Ctx) => start.nextMove(c as never) as Move;

describe("a person alone on a practice project approves their own step", () => {
  const pending = { gates: { direction: { gateId: "g1", status: "PENDING", approvals: 0, required: 1 } }, selfApprovalAllowed: true };
  const alone = ctx({ gates: [{ gateId: "g1", excludedKeys: ["LOCAL_USER:u1"], request: { rolesAllowed: ["APPROVER", "OWNER"] } }],
    allowed: { decide: { allowed: true, reasonCodes: [] } } }, pending);

  test("the panel says you approve this one yourself, recorded as self-approved, and leads to the reason field", () => {
    const m = move(alone);
    expect(m.now).toContain("you approve this one yourself");
    expect(m.now).toContain("recorded as self-approved");
    expect(m.now).not.toContain("Waiting for a second person");
    expect(m.act?.focus).toBe('.a4-approvals [name="reason"]');
    const html = start.renderStartHere(alone as never);
    expect(html).not.toContain("cannot approve this one");
    expect(html).toContain("Self-approval counts once");
  });

  test("the Approvals card says the same, and still names who is excluded when self-approval is not open", () => {
    const row = { excludedKeys: ["LOCAL_USER:u1"] };
    expect(view.exclusionLine({ readiness: { selfApprovalAllowed: true }, project: { members: [] } }, row)).toContain("recorded as self-approved");
    expect(view.exclusionLine({ readiness: { selfApprovalAllowed: false }, project: { members: [{ principalKey: "LOCAL_USER:u1", username: "owner" }] } }, row))
      .toContain("Cannot approve (separation of duties)");
  });

  test("amc a4 guide uses the same words", () => {
    expect(SELF_APPROVE).toContain("you approve this one yourself, and it is recorded as self-approved");
  });

  test("a practice project says how far one person gets, never all four stages", () => {
    expect(start.PRACTICE_IS).not.toMatch(/four stages|learn AMC alone/);
    expect(start.PRACTICE_IS).toContain("Alone you get as far as building");
  });
});

describe("an approval the project's people cannot reach is said before anyone asks", () => {
  test("before the request: how many, who does not count, the role, and the Add a person form set for every later step", () => {
    const c = ctx({ stage: "adapt", project: project({ stage: "adapt", step: "reviewed" }), allowed: { addMember: { allowed: true, reasonCodes: [] } } },
      { nextGate: { gate: "completion", required: 2, rolesAllowed: ["OWNER", "AUDITOR"], roleVote: "AUDITOR", eligible: 0 } });
    const m = move(c);
    expect(m.now).toContain("needs 2 different people other than whoever wrote, built or asked for this step");
    expect(m.now).toContain("one of them must hold the AUDITOR role");
    expect(m.now).toContain("Add 2 people below");
    expect(m.now).toContain("The same people can approve every later step too");
    expect(m.act?.label).toBe("Add a person");
    const html = start.renderStartHere(c as never);
    expect(html).toContain('name="inviteUsername"');
    expect(html).toMatch(/name="inviteAuditor" checked/);
    expect(html).toContain('data-a4-action="invite-member"');
    expect(html).not.toContain("Request completion approval");
  });

  test("alone with self-approval, adding anyone ends it, so the gate needs its full number of new people", () => {
    const m = move(ctx({ stage: "assemble", project: project({ stage: "assemble", step: "reviewed" }) },
      { selfApprovalAllowed: true, nextGate: { gate: "completion", required: 2, rolesAllowed: ["APPROVER", "OWNER"], roleVote: null, eligible: 1 } }));
    expect(m.now).toContain("Add 2 people below");
    expect(m.why).toContain("ends self-approval");
  });

  test("an open request the people cannot reach says the same, and that adding a person cancels it", () => {
    const readiness = { gates: { completion: { gateId: "g4", status: "PENDING", approvals: 0, required: 2 } },
      items: [{ id: "sod", status: "WAITING", reasonCodes: ["QUORUM_UNREACHABLE", "ELIGIBLE:1", "REQUIRED:2"], mandatory: true, acknowledged: null, nextAction: null }] };
    const m = move(ctx({ stage: "assemble", project: project({ stage: "assemble", step: "reviewed" }), gates: [{ gateId: "g4", request: { rolesAllowed: ["APPROVER"] } }] }, readiness));
    expect(m.now).toContain("Only 1 can approve it now. Add 1 person below.");
    expect(m.why).toContain("cancels this request");
  });

  test("someone who is not an owner is told to ask one, with no form", () => {
    const c = ctx({ me: { userId: "u2", roles: ["APPROVER"] } }, { nextGate: { gate: "direction", required: 1, rolesAllowed: ["APPROVER"], roleVote: null, eligible: 0 } });
    expect(move(c).now).toContain("Ask a workspace owner to add them");
    expect(start.renderStartHere(c as never)).not.toContain("inviteUsername");
  });

  test("after a person is added: their first password once and how they approve, with the link", () => {
    const text = start.invitedText({ memberAdded: true, firstPassword: "abcd-efgh", user: { username: "riya" } });
    expect(text).toContain("riya is now an approver on this project");
    expect(text).toContain("abcd-efgh");
    expect(start.invitedText({ memberAdded: true, firstPassword: null, user: { username: "maya" } })).toContain("amc user password maya");
    const how = start.approverHowTo("http://127.0.0.1/console/a4Project?project=a4p_1&stage=aspire");
    expect(how).toContain("private window on this one");
    expect(how).toContain("http://127.0.0.1/console/a4Project?project=a4p_1&stage=aspire");
  });

  test("Studio's readiness carries the next gate's quorum before it is requested", async () => {
    const { workspace, owner } = a4Workspace({ solo: true });
    const solo = await A4Project.create(workspace, owner);
    await solo.proposeAspire(aspireAnswers({ riskTier: "high", governance: "regulated" }));
    expect((await solo.get(owner, "/readiness?stage=aspire")).body.data!.nextGate).toEqual({ gate: "direction", required: 1, rolesAllowed: ["APPROVER", "OWNER"], roleVote: null, eligible: 0 });
    const created = await a4(workspace, owner, "POST", "/api/v1/a4/projects", { clientRequestId: requestId(), name: "Practice", expertise: "novice", practice: true });
    const practice = new A4Project(workspace, created.body.data!.projectId as string, owner);
    practice.head = created.body.data!.seq as number;
    await practice.proposeAspire(aspireAnswers({ riskTier: "high", governance: "regulated" }));
    expect((await practice.get(owner, "/readiness?stage=aspire")).body.data!.nextGate).toMatchObject({ gate: "direction", required: 1, eligible: 1 });
  });
});

describe("Assemble: from Build to closing the build session to Review", () => {
  const planned = { planTaskId: "p1", taskId: "t1", ownerKey: "LOCAL_USER:u1", ownerUsername: "owner",
    start: { clientRequestId: "c1", agentId: "helper", provider: "stub", model: null, tools: "none", toolsDigest: null, validation: null, maxSteps: 8, maxTokens: 1024 } };
  const state = { project: { stage: "assemble", step: "built", agent_id: "helper" },
    revisions: [{ stage: "assemble", revision_no: 3, spec_json: JSON.stringify({ build: { sessions: [planned] } }) }] };
  const native = (taskState: string) => ({ principalId: "session:u1", demo: false, service: { poll: () => ({ task: { clientRequestId: "c1", agentId: "helper", provider: "stub",
    model: null, tools: "none", toolsDigest: null, validationSelection: null, maxSteps: 8, maxTokens: 1024, state: taskState, sessionId: "s1", canResume: false } }) } });
  const owner = { key: "LOCAL_USER:u1" };

  test("Studio holds Review while the session is open, and lets it run once it is closed", () => {
    expect(reviewRefusals(native("idle") as never, state as never, owner as never)).toEqual(["BUILD_SESSION_OPEN"]);
    expect(reviewRefusals(native("running") as never, state as never, owner as never)).toEqual(["BUILD_RUNNING"]);
    expect(reviewRefusals(native("closed") as never, state as never, owner as never)).toEqual([]);
    expect(reviewRefusals(native("closed") as never, state as never, { key: "LOCAL_USER:u2" } as never)).toEqual(["SESSION_OWNER_REQUIRED"]);
    expect(reviewRefusals(native("idle") as never, { ...state, project: { ...state.project, step: "reviewed" } } as never, owner as never)).toEqual([]);
  });

  test("the panel names the step, Close the build session, and opens that session's own page", () => {
    const c = ctx({ stage: "assemble", project: project({ stage: "assemble", step: "built" }), stageRevision: { spec: { build: { sessions: [planned] } } },
      allowed: { review: { allowed: false, reasonCodes: ["BUILD_SESSION_OPEN"] } } });
    const m = move(c);
    expect(m.act?.label).toBe("Close the build session");
    expect(m.act?.href).toBe("./native-tasks?agent=helper&task=t1&project=a4p_1");
    expect(m.now).toContain("Back to the agent project");
    expect(move({ ...c, allowed: { review: { allowed: true, reasonCodes: [] } } }).act?.press).toBe("review");
  });
});

test("Use an example never fills what an Industry Pack suggests, the risk level least of all", () => {
  const example = start.exampleFor("aspire", PACK_FIELDS);
  expect(example).not.toHaveProperty("riskTier");
  expect(Object.keys(packAnswers({ riskTier: "critical", stationId: "health", regulatoryBasis: [], id: "x" })).sort()).toEqual([...PACK_FIELDS].sort());
  expect(start.exampleFor("aspire")).toHaveProperty("riskTier", "low");
});

test("Add a person for an existing account says what to do about a forgotten first password", () => {
  const html = start.addedPersonHtml({ firstPassword: null, user: { username: "maya" }, notes: ["maya already had an account, so ..."] });
  expect(html).toContain("AMC cannot show the old one");
  expect(html).toContain("amc user password maya");
  expect(html).not.toContain("so ...");
});

test("amc a4 readiness gives a record a later step makes plain words", () => {
  expect(notReadyWords({ id: "preset_signed", reasonCodes: ["PRODUCED_AT_BUILD"] })).toBe("Not made yet: AMC records it when you run Build at this stage.");
  expect(notReadyWords({ id: "release_proposed", reasonCodes: ["NOT_PROPOSED"] })).toBe("Not made yet: AMC records it when you run Propose at this stage.");
  expect(notReadyWords({ id: "plan_compiled", reasonCodes: ["PRODUCED_AT_UNDERSTAND"], nextAction: { label: "Run Understand to compile the plan" } }))
    .toBe("Run Understand to compile the plan");
});

test("Home leads an approver straight to the approval that waits for them", () => {
  const row = { projectId: "a4p_9", name: "Invoice helper", stage: "assemble", step: "reviewed" };
  const html = start.homeCardHtml({ projects: [row], waiting: { project: row, kind: "completion" } } as never);
  expect(html).toContain("An approval waits for you");
  expect(html).toContain('href="./a4Project?project=a4p_9&stage=assemble">Open the approval</a>');
  expect(start.homeCardHtml({ projects: [row] } as never)).toContain("Continue Invoice helper");
});

test("agent files that changed underneath are said in words, with the way on, not as an item id", () => {
  const drifted = { id: "resources.current", status: "BLOCKED", mandatory: true, reasonCodes: ["RESOURCE_DRIFTED", "context.promptPackSha256"], acknowledged: null, nextAction: null };
  const later = move(ctx({ project: project({ step: "proposed" }) }, { items: [drifted] }));
  expect(later.now).toContain("change any answer under Ask and press Save answers");
  expect(later.now).not.toContain("resources.current");
  const asking = move(ctx({ project: project({ step: "asked" }) }, { items: [drifted] }));
  expect(asking.now).not.toContain("Something blocks this stage");
});

test("the second request that applies what was built: an approver is asked for it, the owner who built waits with the link", () => {
  const readiness = { gates: { completion: { gateId: "g7", status: "QUORUM_MET" } },
    items: [{ id: "effect_gate", status: "WAITING", mandatory: false, reasonCodes: ["APPROVAL_REQUEST:r1:d1", "APPROVAL_STATUS:PENDING"], acknowledged: null, nextAction: null }] };
  const base = { stage: "assemble", project: project({ stage: "assemble", step: "reviewed" }), gates: [{ gateId: "g7", excludedKeys: ["LOCAL_USER:u1"] }] };
  const approver = move(ctx({ ...base, me: { userId: "u2", roles: ["APPROVER"] }, allowed: { requestChanges: { allowed: true, reasonCodes: [] } } }, readiness));
  expect(approver.now).toContain("Your approval is needed on a second request");
  expect(approver.act?.focus).toBe('[data-card="effect"] [name="engine-reason"]');
  const owner = move(ctx({ ...base, allowed: { requestChanges: { allowed: true, reasonCodes: [] } } }, readiness));
  expect(owner.now).toContain("Waiting for the project's approvers");
  expect(owner.act?.copy).toBe(true);
  const row = { projectId: "a4p_9", name: "Helper", stage: "assemble", step: "reviewed" };
  expect(start.homeCardHtml({ projects: [row], waiting: { project: row, kind: "effect" } } as never)).toContain("second request, which applies what was built");
});

test("Adapt's context probe comes before the completion request, so it never cancels approvals already given", () => {
  const probe = { id: "context_reaches_runtime_frame", status: "WAITING", mandatory: true, reasonCodes: [], acknowledged: null, nextAction: { label: "Run the context probe" } };
  const m = move(ctx({ stage: "adapt", project: project({ stage: "adapt", step: "reviewed" }), allowed: { progress: { reasonCodes: ["GATE_PENDING", "context_reaches_runtime_frame"] } } },
    { items: [probe] }));
  expect(m.act?.press).toBe("probe");
  expect(m.why).toContain("cancel the approvals");
});

test("a one-approval step says that later steps need two such people", () => {
  const m = move(ctx({}, { nextGate: { gate: "direction", required: 1, rolesAllowed: ["APPROVER", "OWNER"], roleVote: null, eligible: 0 } }));
  expect(m.now).toContain("Add 1 person below. Later steps need two such people, so you can add both now.");
});

test("a regulated plan with unknown facts sends the person to the first fact to answer, in words", () => {
  const items = [{ id: "plan_unresolved", status: "WAITING", mandatory: true, reasonCodes: ["PLAN_MISSING_FACTS", "REGULATED_READY_PLAN_ONLY"], acknowledged: null, nextAction: { label: "A regulated project activates only a ready plan: answer the missing facts" } },
    { id: "plan_no_missing_facts", status: "WAITING", mandatory: false, reasonCodes: ["PLAN_MISSING_FACTS", "ANSWER_NEEDED:jurisdictions", "ANSWER_NEEDED:useCases"], acknowledged: null, nextAction: null }];
  const m = move(ctx({ stage: "adapt", project: project({ stage: "adapt", step: "proposed" }) }, { items }));
  expect(m.now).toContain('"Where does it operate, legally?"');
  expect(m.act).toEqual({ label: "Answer the missing facts", focus: 'form[data-a4-answers] [name="jurisdictions"]' });
});

test("a regulated Adapt: the plan review is opened, then its approvers are asked on the Plan activation card", () => {
  const base = { stage: "adapt", project: project({ stage: "adapt", step: "reviewed" }), gates: [{ gateId: "g8", excludedKeys: ["LOCAL_USER:u1"] }] };
  const met = { completion: { gateId: "g8", status: "QUORUM_MET" } };
  const opening = move(ctx({ ...base, allowed: { progress: { reasonCodes: ["plan_activated"] } } },
    { gates: met, items: [{ id: "plan_review_opened", status: "WAITING", mandatory: false, reasonCodes: ["EFFECT_GATE_NOT_OPEN"], acknowledged: null, nextAction: null }] }));
  expect(opening.act).toEqual({ label: "Open the plan review", press: "open-effect" });
  const opened = { gates: met, items: [{ id: "plan_review_opened", status: "READY", mandatory: false, reasonCodes: ["EFFECT_GATE_OPENED", "APPROVAL_STATUS:PENDING"], acknowledged: null, nextAction: null },
    { id: "plan_activated", status: "READY", mandatory: true, reasonCodes: ["ACTIVATED_AT_COMPLETION"], acknowledged: null, nextAction: null }] };
  const approver = move(ctx({ ...base, me: { userId: "u2", roles: ["APPROVER", "AUDITOR"] }, allowed: { requestChanges: { allowed: true, reasonCodes: [] } } }, opened));
  expect(approver.now).toContain("which activates the plan");
  expect(approver.act?.focus).toBe('[data-card="activation"] [name="engine-reason"]');
  // A non-regulated Adapt completes without the plan review.
  expect(move(ctx(base, { gates: met, items: [{ id: "plan_review_opened", status: "WAITING", mandatory: false, reasonCodes: ["EFFECT_GATE_NOT_OPEN"], acknowledged: null, nextAction: null }] })).act?.press)
    .toBe("complete");
});

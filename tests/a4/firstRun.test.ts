/**
 * First-run walk of A4 in Studio (2026-11-14): a newcomer could not tell what a project is or what to do next, lost
 * "Yes, that's it" after any reload, asked for approvals no one could give, met error codes instead of sentences, and the
 * guide sent them to Review while the build session was still open. These pin the plain-language guidance and the fixes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as start from "../../src/console/assets/a4Start.js";
import * as view from "../../src/console/assets/a4View.js";
import type { A4ReadinessItem } from "../../src/a4/a4Readiness.js";
import { readinessHeadline } from "../../src/a4/a4Readiness.js";
import { ASSEMBLE_REVIEW } from "../../src/a4/a4StepLabels.js";
import { answersDigestOf } from "../../src/a4/spec/aspire.js";
import { GUIDE_START, PREVIEW_OFF, verifyFlagHint } from "../../src/cli-a4-commands.js";

type Ctx = Record<string, unknown>;
const project = (over: Ctx = {}) => ({ projectId: "a4p_1", stage: "aspire", step: "asked", hold: false, members: [], ...over });
const item = (id: string, over: Ctx = {}) => ({ id, status: "WAITING", reasonCodes: [], mandatory: true, acknowledged: null, nextAction: null, ...over });
const ctx = (over: Ctx = {}, readiness: Ctx = {}) => ({ project: project(), stage: "aspire", gates: [], members: { candidates: [] }, me: { userId: "u1", username: "owner" },
  questions: [{ id: "agent", prompt: "Agent?" }, { id: "problem", prompt: "Problem?" }], allowed: {},
  readiness: { status: "WAITING", items: [], gates: {}, allowed: {}, ...readiness }, ...over });
const move = (c: Ctx) => start.nextMove(c as never) as { now: string; act?: { label: string; press?: string; focus?: string; href?: string } };

describe("What to do now: one next step per screen", () => {
  test("a new project asks for the first missing answer", () => {
    const m = move(ctx({}, { items: [item("ask_complete", { reasonCodes: ["ANSWER_MISSING:agent", "ANSWER_MISSING:problem"] })] }));
    expect(m.now).toContain("Answer the questions marked (required)");
    expect(m.act?.focus).toBe('form[data-a4-answers] [name="agent"]');
  });
  test("answers carried from an earlier stage: Understand comes first", () => {
    const m = move(ctx({ stage: "assemble", project: project({ stage: "assemble" }) }, { items: [item("ask_complete", { reasonCodes: ["CARRIED_MISSING:riskTier", "ANSWER_MISSING:capabilities"] })] }));
    expect(m.act?.press).toBe("understand");
  });
  test("an understanding of the current answers is confirmed, even after a reload", () => {
    expect(move(ctx({ understandingCurrent: true })).act?.press).toBe("confirm");
    expect(move(ctx()).act?.press).toBe("understand");
  });
  test("each later step names its own button", () => {
    expect(move(ctx({ project: project({ step: "understood" }) })).act?.press).toBe("explain");
    expect(move(ctx({ project: project({ step: "explained" }) })).act?.press).toBe("propose");
    expect(move(ctx({ project: project({ step: "direction_approved" }) })).act?.press).toBe("build");
  });
  test("an unacknowledged item is acknowledged before approval is asked for", () => {
    const waiting = item("plan_unresolved", { nextAction: { label: "Answer the missing facts" } });
    const m = move(ctx({ project: project({ step: "proposed" }) }, { items: [waiting], allowed: { requestGate: { allowed: false, reasonCodes: ["plan_unresolved"] } } }));
    expect(m.now).toContain("acknowledges plan_unresolved");
    expect(m.act?.focus).toContain("reason");
  });
  test("with no second person, it says so before a gate is requested, with the exact command when nobody else exists", () => {
    const lone = { items: [item("members.candidates", { mandatory: false, reasonCodes: ["NO_SECOND_APPROVER"] })] };
    expect(move(ctx({ project: project({ step: "proposed" }) }, lone)).now).toContain("amc user add --username <name> --role APPROVER");
    const withCandidate = move(ctx({ project: project({ step: "proposed" }), members: { candidates: [{ principalKey: "LOCAL_USER:u2", username: "alice" }] } }, lone));
    expect(withCandidate.act?.focus).toBe("li[data-principal] select");
    expect(move(ctx({ project: project({ step: "proposed" }) })).act?.press).toBe("request-direction");
  });
  test("an author waits on others and is told why; a met direction continues to Build", () => {
    const gates = { direction: { gateId: "g1", status: "PENDING", approvals: 0, required: 1 } };
    const author = move(ctx({ project: project({ step: "proposed" }), gates: [{ gateId: "g1", excludedKeys: ["LOCAL_USER:u1"] }] }, { gates }));
    expect(author.now).toContain("separation of duties");
    expect(author.act).toEqual({ label: "Copy link to this page", copy: true }); // the waiting author sends the approver this page
    expect(move(ctx({ project: project({ step: "proposed" }) }, { gates: { direction: { gateId: "g1", status: "QUORUM_MET" } } })).act?.press).toBe("complete");
  });
  test("a step the viewer's roles cannot take is not their primary action", () => {
    const met = { gates: { direction: { gateId: "g1", status: "QUORUM_MET" } } };
    const m = move(ctx({ project: project({ step: "proposed" }), allowed: { progress: { reasonCodes: ["PRINCIPAL_ROLE_INSUFFICIENT"] } } }, met));
    expect(m.act).toBeUndefined();
    expect(m.now).toContain("nothing is needed from you now");
  });
  test("a gate that cannot reach its quorum says how many can approve and how to add a person", () => {
    const readiness = { gates: { completion: { gateId: "g4", status: "PENDING", approvals: 0, required: 2 } },
      items: [item("sod", { reasonCodes: ["QUORUM_UNREACHABLE", "ELIGIBLE:1", "REQUIRED:2"] })] };
    const m = move(ctx({ stage: "assemble", project: project({ stage: "assemble", step: "reviewed" }), gates: [{ gateId: "g4", request: { rolesAllowed: ["APPROVER", "OWNER"] } }] }, readiness));
    expect(m.now).toContain("needs 2 different people other than whoever wrote, built or asked for this step");
    expect(m.now).toContain("Only 1 can approve it now");
  });
  test("a requirement that holds the step comes first, with its own button when a card has one", () => {
    const readiness = { gates: { completion: { gateId: "g5", status: "QUORUM_MET" } },
      items: [item("context_reaches_runtime_frame", { nextAction: { label: "Run the context probe: one in-process turn" } })] };
    const m = move(ctx({ stage: "adapt", project: project({ stage: "adapt", step: "reviewed" }), allowed: { progress: { reasonCodes: ["context_reaches_runtime_frame"] } } }, readiness));
    expect(m.now).toMatch(/^First: Run the context probe/);
    expect(m.act?.press).toBe("probe");
  });
  test("an approver whose role the gate does not take is told which role and the command", () => {
    const gates = { completion: { gateId: "g2", status: "PENDING", approvals: 1, required: 2 } };
    const m = move(ctx({ stage: "adapt", project: project({ stage: "adapt", step: "reviewed" }), me: { userId: "u3", username: "alice" },
      gates: [{ gateId: "g2", excludedKeys: [], request: { rolesAllowed: ["OWNER", "AUDITOR"] } }], allowed: { decide: { reasonCodes: ["GATE_ROLE_NOT_ALLOWED"] } } }, { gates }));
    expect(m.now).toContain("OWNER or AUDITOR");
    expect(m.now).toContain("amc user role set alice");
  });
  test("Assemble: close the build session before Review; open the effect gate after the completion quorum", () => {
    expect(move(ctx({ stage: "assemble", project: project({ stage: "assemble", step: "built" }), allowed: { review: { allowed: false, reasonCodes: ["BUILD_SESSION_OPEN"] } } })).now)
      .toContain("Close and verify");
    const met = { gates: { completion: { gateId: "g3", status: "QUORUM_MET" } }, items: [item("effect_gate", { mandatory: false, reasonCodes: ["EFFECT_GATE_NOT_OPEN"] })] };
    expect(move(ctx({ stage: "assemble", project: project({ stage: "assemble", step: "reviewed" }) }, met)).act?.press).toBe("open-effect");
  });
  test("Activate on a Studio that is not the deployment host says the preview stops here", () => {
    const blocked = item("deployment.same_host", { status: "BLOCKED", nextAction: { label: "This is where the A4 preview stops today on this Studio." } });
    const m = move(ctx({ stage: "activate", project: project({ stage: "activate", step: "proposed" }) }, { items: [blocked] }));
    expect(m.now).toContain("preview stops today");
    expect(m.act).toBeUndefined();
  });
  test("another stage's view links to the project's stage", () => {
    expect(move(ctx({ stage: "aspire", project: project({ stage: "adapt" }) })).act?.href).toBe("./a4Project?project=a4p_1&stage=adapt");
  });
  test("the panel shows the stages, the step count, one primary action, and keeps the truth lines", () => {
    const html = start.renderStartHere(ctx({ project: project({ step: "understood" }) }) as never);
    expect(html).toContain("An agent project takes one agent from a brief to a recorded deployment");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("part 2 of 8, Check how AMC understood you");
    expect(html.match(/a4-primary/g)).toHaveLength(1);
    expect(html).toContain("not that it is true");
    expect(html).toContain("nothing here says the agent is safe, correct or lawful");
  });
});

describe("who must approve", () => {
  test("names the count, roles, who cannot approve and why, how to add a person, and that it is not an independent review", () => {
    const html = start.renderWhoApproves(ctx({ project: project({ members: [{ principalKey: "LOCAL_USER:u1", username: "owner" }] }) }) as never,
      { gateId: "g", status: "PENDING", required: 2, excludedKeys: ["LOCAL_USER:u1"], decisions: [{ decision: "APPROVE_EXECUTE", username: "bob" }],
        request: { rolesAllowed: ["APPROVER", "OWNER"] } });
    expect(html).toContain("2 different people");
    expect(html).toContain("<code>APPROVER</code> or <code>OWNER</code>");
    expect(html).toContain("owner cannot approve this one");
    expect(html).toContain("separation of duties");
    expect(html).toContain("Approved so far: bob");
    expect(html).toContain("amc user add --username &lt;name&gt; --role APPROVER");
    expect(html).toContain("not an independent review");
  });
});

describe("errors read as sentences with the code in small print", () => {
  test("a known code", () => {
    const html = start.errorHtml(Object.assign(new Error("SOD_VIOLATION: approver excluded"), { code: "SOD_VIOLATION" }));
    expect(html).toContain("You cannot approve your own work");
    expect(html).toMatch(/<small class="muted">.*<code>SOD_VIOLATION<\/code><\/small>/);
  });
  test("a server sentence is kept, with a next step", () => {
    const explained = start.explainError(Object.assign(new Error("Not ready yet: plan_unresolved."), { code: "A4_NOT_READY" }));
    expect(explained).toMatchObject({ sentence: "Not ready yet: plan_unresolved.", next: "See Missing requirements on this page.", code: "A4_NOT_READY" });
  });
});

test("preview off and the demo say what A4 is and the way forward, keeping the preview notice", () => {
  expect(start.previewOffHtml()).toContain("Agent projects are turned off in this workspace");
  expect(start.previewOffHtml()).toContain(view.previewNoticeHtml());
  expect(start.demoHtml()).toContain("view-only demo");
  expect(start.demoHtml()).toContain("<code>amc up</code>");
  const page = readFileSync("src/console/assets/a4.js", "utf8");
  expect(page).toContain("start.previewOffHtml()");
  expect(page.indexOf('me.userId === "local-demo"')).toBeLessThan(page.lastIndexOf("await previewOptions()"));
});

test("examples: free text is marked (sample); placeholders never are", () => {
  for (const id of ["agent", "problem", "audience", "goals", "forbiddenActions"]) expect(start.EXAMPLES.aspire[id as "agent"]).toContain("(sample)");
  for (const line of start.EXAMPLES.aspire.audience.split("\n")) expect(line.startsWith("(sample) ")).toBe(true);
  expect(start.SAMPLE_PROJECT.name).toContain("(sample)");
  expect(start.placeholderOf("aspire", "agent")).toMatch(/^For example: Invoice helper/);
  expect(start.placeholderOf("aspire", "agent")).not.toContain("(sample)");
  expect(start.FILLABLE.has("activate")).toBe(false);
});

describe("Confirm after a reload (bug: 'Yes, that's it' stayed disabled until Understand ran again)", () => {
  const answers = [{ questionId: "problem", value: "x" }, { questionId: "audience", value: ["a", "b"] }, { questionId: "agent", value: { n: 1, a: [2] } }];
  test("the page's digest of the answers equals Understand's", async () => {
    expect(await start.answersDigest(answers)).toBe(answersDigestOf(answers as never));
  });
  test("a current understanding is current; a changed answer is not", async () => {
    const spec = { answers, understanding: { answersDigest: answersDigestOf(answers as never) } };
    expect(await start.understandingIsCurrent(spec)).toBe(true);
    expect(await start.understandingIsCurrent({ ...spec, answers: [...answers, { questionId: "goals", value: "y" }] })).toBe(false);
    expect(await start.understandingIsCurrent({ answers })).toBe(false);
  });
  test("the Conversation card offers Confirm from Studio's recorded understanding", () => {
    const base = { ...ctx(), allowed: { ask: { allowed: true }, understand: { allowed: true }, explain: { allowed: false } }, answers: [], reflection: null };
    const on = view.renderConversation({ ...base, understandingCurrent: true } as never);
    expect(on).toContain('<button type="button" data-a4-action="confirm" >Yes, that&#39;s it</button>');
    expect(on).toContain(view.RECORDED_CURRENT);
    expect(view.renderConversation(base as never)).toMatch(/data-a4-action="confirm"\s+disabled/);
  });
});

describe("readiness and the command line name the way on", () => {
  const readinessItem = (id: string, status: string) => ({ id, status, kind: null, reasonCodes: [], section: "governance", evidence: [], claim: null, report: null,
    acknowledged: null, nextAction: null, mandatory: true, bound: false }) as unknown as A4ReadinessItem;
  test("Assemble's built step says to close the build session before Review", () => {
    const headline = readinessHeadline({ project: { stage: "assemble", step: "built", hold: 0 } } as never, { stage: "assemble", live: { integrity: { valid: true } } } as never,
      [readinessItem("members.present", "READY")], { direction: null, completion: null });
    expect(headline.nextAction?.label).toBe(ASSEMBLE_REVIEW);
    expect(ASSEMBLE_REVIEW).toContain("Close and verify");
  });
  test("the guide starts with the next step, explains the stages and how to add a second person", () => {
    expect(GUIDE_START.startsWith("Next: ")).toBe(true);
    for (const words of ["Aspire", "Activate", "separation of duties", "amc user add --username <name> --role APPROVER", "not an independent review"]) {
      expect(GUIDE_START).toContain(words);
    }
    expect(PREVIEW_OFF).toContain("AMC_A4_PREVIEW=1 amc up");
  });
  test("verify names the missing allow flag instead of a bare FAILED", () => {
    const report = { trusted: false, integrity: { status: "pass", errors: [] }, anchoring: { status: "unanchored" }, overrides: ["allow-unpinned"],
      issuerAdmission: { signatures: [{ status: "unpinned-allowed" }] } };
    expect(verifyFlagHint(report as never)).toContain("--allow-unanchored");
    expect(verifyFlagHint(report as never)).not.toContain("--allow-unpinned (");
    expect(verifyFlagHint({ ...report, integrity: { status: "fail", errors: ["x"] } } as never)).toBeNull();
    expect(verifyFlagHint({ ...report, overrides: ["allow-unpinned", "allow-unanchored"] } as never)).toBeNull();
  });
});

describe("routes: plain refusals", async () => {
  const { afterEach, vi } = await import("vitest");
  const { cleanupGovernanceFixtures } = await import("../governor/governanceFixture.js");
  const { A4Project, a4Workspace, refusal } = await import("./a4Harness.js");
  vi.setConfig({ testTimeout: 120_000 });
  afterEach(() => cleanupGovernanceFixtures());
  test("a body that leaves out a required field names it in a sentence", async () => {
    const ws = a4Workspace();
    const p = await A4Project.create(ws.workspace, ws.owner);
    const reply = await p.post(ws.owner, "/stages/assemble/effects/a4.assemble.apply/open", {});
    expect(refusal(reply)).toEqual([400, "INPUT_INVALID"]);
    expect(reply.body.error).toContain('The body is missing the required field "gateId": send it in the JSON body and try again.');
  });
});

describe("starting an agent project from an Industry Pack (2026-11-14)", () => {
  const pack = { id: "digital-health-record", name: "Digital <Health> Record", stationId: "health", riskTier: "very-high",
    regulatoryBasis: ["HIPAA Security Rule"], keyRisks: ["PHI breach <script>"], questions: [{}, {}] };

  test("a pack suggests the sector, a risk appetite, the governance that tier takes and one constraint per instrument, and nothing else", async () => {
    const packs = await import("../../src/console/assets/a4Pack.js");
    expect(packs.packAnswers(pack)).toEqual({ stations: "health", riskTier: "high", governance: "regulated",
      constraints: "Check whether it applies, and meet it where it does: HIPAA Security Rule (Industry Pack digital-health-record)" });
    expect(packs.packAnswers({ ...pack, riskTier: "elevated" })).toMatchObject({ riskTier: "med", governance: "standard" });
    expect(packs.packAnswers({ id: "x" })).toEqual({ stations: "", riskTier: "", governance: "", constraints: "" });
    // Every suggested tier and station is a value Aspire accepts.
    const aspire = readFileSync("src/a4/spec/aspire.ts", "utf8");
    expect(aspire).toContain('riskTier: ["low", "med", "high", "critical"]');
    expect(aspire).toContain('governance: ["regulated", "standard"]');
  });

  test("the pack id from the URL is a plain slug or nothing; pack text is escaped; the panel overstates nothing", async () => {
    const packs = await import("../../src/console/assets/a4Pack.js");
    expect(packs.packIdOf("digital-health-record")).toBe("digital-health-record");
    for (const bad of ["../x", "a b", "<script>", "", null, "A"]) expect(packs.packIdOf(bad)).toBeNull();
    const select = packs.packSelectHtml([{ packId: "digital-health-record", name: "Digital <Health> Record", domain: "health" }, { packId: "../bad", name: "x", domain: "health" }], "digital-health-record");
    expect(select).toContain('<optgroup label="Health">');
    expect(select).toContain('value="digital-health-record" selected');
    expect(select).not.toContain("../bad");
    expect(select).not.toContain("<Health>");
    expect(packs.packSelectHtml([], null)).toBe("");
    const panel = packs.packPanelHtml(pack, 4);
    expect(panel).toContain("nothing is saved yet");
    expect(panel).toContain("./industrypacks?pack=digital-health-record");
    expect(panel).toContain("does not show the agent meets any rule");
    expect(panel).not.toContain("<script>");
    expect(panel).not.toMatch(/certif|compliant|guarantee/i);
    expect(packs.packPanelHtml(pack, 0)).toContain("already filled or saved");
  });

  test("the pack links both ways, and the project page keeps one section open at a time", () => {
    expect(readFileSync("src/console/assets/industryPackView.js", "utf8")).toContain('href="./a4?new=1&amp;pack=${encodeURIComponent(pack.id)}"');
    const page = readFileSync("src/console/assets/a4.js", "utf8");
    expect(page).toContain("void startFromPack();");
    expect(page).toContain('more.dataset.a4Open = "more";');
    // Acknowledging needs the reason field and the item's button, so that step names the second section to keep open.
    const m = move(ctx({ project: project({ step: "proposed" }) }, { items: [item("sod.self_provisioned")], allowed: { requestGate: { reasonCodes: ["sod.self_provisioned"] } } })) as { now: string; also?: string };
    expect(m.now).toContain("cannot show that two approvers are two different people");
    expect(m.also).toBe("#a4Missing");
    expect(start.renderStartHere(ctx({ project: project({ step: "proposed" }) }, { items: [item("sod.self_provisioned")], allowed: { requestGate: { reasonCodes: ["sod.self_provisioned"] } } }) as never)).toContain('data-a4-also="#a4Missing"');
  });

  test("alone on a regulated project the guide names inviting a second person, not an acknowledgement that cannot help", () => {
    const alone = item("sod.self_provisioned", { reasonCodes: ["SOD_DEGRADED_SELF_PROVISIONED", "REVIEW_NOT_INDEPENDENT", "NO_SECOND_APPROVER"] });
    const m = move(ctx({ project: project({ step: "proposed" }) }, { items: [alone], allowed: { requestGate: { reasonCodes: ["sod.self_provisioned"] } } })) as { now: string; act?: { focus?: string } };
    expect(m.now).toContain("Nobody else on this project can approve it");
    expect(m.now).not.toContain("acknowledges");
    expect(m.act?.focus).toBe(".a4-invite input");
  });
});

/**
 * Slice a4 of the studio-ui redesign: the agent project drawn as a route (a4Journey.js), the people an approval waits for,
 * the panel's one step, the Build page's start form asked one question at a time, and Home's "Next:" on a practice project.
 * Drawings only: every state comes from the project, readiness and the gate records the page already reads.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { approvalPeople, moveState, stageRoute, stepRoute } from "../../src/console/assets/a4Journey.js";
import * as start from "../../src/console/assets/a4Start.js";
import * as view from "../../src/console/assets/a4View.js";
import * as packs from "../../src/console/assets/a4Pack.js";

const states = (html: string) => [...html.matchAll(/route-step is-(\w+)/g)].map((match) => match[1]);
const project = { projectId: "a4p_1", name: "Helper", stage: "assemble", step: "proposed", hold: false, members: [] };

describe("the stage and step routes", () => {
  test("earlier stages are done, the project's stage carries the person's state, later ones are not started; each opens its stage", () => {
    const html = stageRoute(project, "assemble", "wait");
    expect(states(html)).toEqual(["done", "wait", "todo", "todo"]);
    expect(html).toContain('href="./a4Project?project=a4p_1&amp;stage=adapt"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  test("steps: earlier done, the current one never ticked, later not started", () => {
    expect(states(stepRoute(project, "assemble", "now"))).toEqual(["done", "done", "done", "now", "todo", "todo", "todo", "todo"]);
    expect(states(stepRoute(project, "assemble", "stop"))[3]).toBe("stop");
  });

  test("a stage the project passed is all done; one it has not reached is all not started", () => {
    expect(new Set(states(stepRoute(project, "aspire")))).toEqual(new Set(["done"]));
    expect(new Set(states(stepRoute(project, "adapt")))).toEqual(new Set(["todo"]));
  });

  test("a retired project is never drawn as finished", () => {
    const retired = { ...project, stage: "retired", step: "completion_approved" };
    expect(new Set(states(stageRoute(retired, "aspire")))).toEqual(new Set(["todo"]));
    expect(new Set(states(stepRoute(retired, "aspire")))).toEqual(new Set(["todo"]));
    expect(view.renderProjectList([{ ...retired, agentId: "a", revisionNo: 3 }] as never)).not.toContain("is-done");
  });

  test("the waypoint's state follows the panel's own move: hold and refusals stop, someone else's turn waits", () => {
    expect(moveState({ hold: true }, { now: "x", act: { label: "a" } })).toBe("stop");
    expect(moveState({}, { now: "x" }, true)).toBe("stop");
    // No button only means nobody else can act yet: that waits, it is not a refusal.
    expect(moveState({}, { now: "Add a second person before asking for approval.", stop: true })).toBe("wait");
    expect(moveState({}, { now: "Waiting for a second person", act: { label: "Copy link", copy: true } })).toBe("wait");
    expect(moveState({}, { now: "Approved. A project owner or builder takes this step; nothing is needed from you now." })).toBe("wait");
    expect(moveState({}, { now: "Build", act: { label: "Build", press: "build" } })).toBe("now");
  });
});

describe("an approval drawn as people", () => {
  const names = new Map([["LOCAL_USER:u1", "owner"]]);
  test("who decided and how, the places still open, and who may not approve", () => {
    const gate = { status: "PENDING", required: 2, approvals: 1, excludedKeys: ["LOCAL_USER:u1"],
      decisions: [{ decisionId: "d1", username: "riya", decision: "APPROVE_EXECUTE" }] };
    const html = approvalPeople(gate, { staleApprovals: [] }, names);
    expect(html).toContain('<li class="a4-person is-done"><span class="a4-avatar" aria-hidden="true">R</span>');
    expect(html).toContain("<strong>riya</strong><small>approved</small>");
    expect(html.match(/<strong>An approver<\/strong>/g)).toHaveLength(1);
    expect(html).toContain("<strong>owner</strong><small>cannot approve this one</small>");
    expect(html).toContain("1 of 2 approvals");
  });

  test("a decision that no longer counts is not drawn as approved; a self-approval says so", () => {
    const stale = approvalPeople({ status: "PENDING", required: 1, approvals: 0, decisions: [{ decisionId: "d1", username: "riya", decision: "APPROVE_EXECUTE" }] },
      { staleApprovals: [{ decisionId: "d1", reasonCodes: ["GATE_STALE"] }] });
    expect(stale).toContain("no longer counts");
    expect(stale).not.toContain("is-done");
    const self = approvalPeople({ status: "QUORUM_MET", required: 1, approvals: 1, decisions: [{ decisionId: "d2", username: "owner", decision: "APPROVE_EXECUTE", selfApproved: true }] },
      { staleApprovals: [], selfApprovalAllowed: true });
    expect(self).toContain("self-approved");
  });

  test("alone on a practice project the one person fills the place and is never called excluded", () => {
    const html = approvalPeople({ status: "PENDING", required: 1, approvals: 0, excludedKeys: ["LOCAL_USER:u1"], decisions: [] },
      { staleApprovals: [], selfApprovalAllowed: true }, names, "owner" as never);
    expect(html).toContain("you approve alone, self-approved");
    expect(html).not.toContain("cannot approve");
    expect(html).not.toContain("An approver");
  });

  test("names and initials from outside AMC are escaped", () => {
    const html = approvalPeople({ status: "PENDING", required: 1, approvals: 0, decisions: [{ decisionId: "d", username: "<b>x", decision: "DENY" }] }, {});
    expect(html).not.toContain("<b>x");
    expect(html).toContain("turned down");
  });
});

describe("the project panel", () => {
  test("one step panel: the route, what it needs, one primary action, the rest one click away", () => {
    const ctx = { project: { ...project, stage: "aspire", step: "understood" }, stage: "aspire", me: { userId: "u1" }, gates: [], members: { candidates: [] },
      questions: [], allowed: {}, readiness: { status: "WAITING", items: [], allowed: {}, gates: {} } };
    const html = start.renderStartHere(ctx as never);
    expect(html).toContain('<h2 class="a4-project-name">Helper</h2>');
    expect(html).toContain('class="route a4-stages"');
    expect(html).toContain('class="route a4-steps-route"');
    expect(html.match(/a4-primary/g)).toHaveLength(1);
    expect(html).toMatch(/<details class="more-info" data-a4-open="start:what"><summary>What is a project\?<\/summary>[\s\S]*part 2 of 8/);
    expect(html).toContain("nothing here says the agent is safe, correct or lawful");
  });
});

describe("folds never hide what a person must see", () => {
  test("a sample answer filled into a closed fold opens that fold; the Members card stays when the panel sends a person there", () => {
    const source = readFileSync("src/console/assets/a4.js", "utf8");
    const fill = source.slice(source.indexOf("function fillEmptyAnswers"), source.indexOf("async function startFromPack"));
    expect(fill).toMatch(/field\.closest\("details"\)[\s\S]*fold\.open = true/);
    expect(source).toMatch(/\/Members card\/\.test\([\s\S]*"\.a4-members"/);
  });
});

describe("the Build page's start form", () => {
  test("three questions, the approver choice as picture cards around the same radios, one submit", () => {
    const industry = packs.packSelectHtml([{ packId: "digital-health-record", name: "Record", domain: "health" }], null, { fold: true, cards: true });
    const html = view.renderCreateForm(true, industry, { start: { practiceAvailable: false, practiceRefusal: "3 people can sign in." } as never });
    expect(html.match(/data-a4-q="/g)).toHaveLength(3);
    expect(html).toContain('<label class="picture-card a4-approver-card is-disabled"><input type="radio" name="practice" value="yes" disabled />');
    expect(html).toContain("3 people can sign in.");
    expect(html).toContain('name="a4Station" value="health"');
    expect(html.match(/type="submit"/g)).toHaveLength(1);
  });
});

describe("Home's Next line", () => {
  const row = (extra: Record<string, unknown>) => start.homeCardHtml({ projects: [{ projectId: "a4p_1", name: "P", updatedTs: "2026-11-18T00:00:00Z", ...extra }] as never });
  test("alone on a practice project the person approves the plan themselves; otherwise a second person does", () => {
    expect(row({ stage: "aspire", step: "proposed", practiceActive: true })).toContain("Next: you approve the plan yourself; it is recorded as self-approved.");
    expect(row({ stage: "aspire", step: "reviewed", practiceActive: true })).toContain("Next: you give the final approval yourself");
    expect(row({ stage: "aspire", step: "proposed" })).toContain("Next: a second person approves the plan");
    // Assemble's final approval needs two other people even on a practice project.
    expect(row({ stage: "assemble", step: "reviewed", practiceActive: true })).toContain("a second person gives the final approval");
  });
});

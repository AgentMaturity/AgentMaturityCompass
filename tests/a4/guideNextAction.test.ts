/**
 * The A4 next action (verify track A-3, A-4, A-5). `amc a4 guide` and readiness pointed at steps the routes refuse
 * (Propose at understood, Understand before the required answers), said "nothing is waiting" at proposed, QUORUM_MET,
 * direction_approved and built, read WAITING with no action while a BLOCKED integrity item refused the gate, and never
 * said that approvers must be project members or that a gate's quorum could not be reached.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { A4GateStatus, A4ReadinessItem } from "../../src/a4/a4Readiness.js";
import { deploymentPlan } from "../../src/a4/a4Deploy.js";
import { proposeNextAction, readinessHeadline } from "../../src/a4/a4Readiness.js";
import { defaultApprovalPolicy, initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { addUser } from "../../src/auth/authApi.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, aspireAnswers, type Who } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

type Readiness = { status: string; nextAction: { label: string; command?: string } | null; items: A4ReadinessItem[] };
const readiness = async (p: A4Project, who: Who): Promise<Readiness> => (await p.get(who, "/readiness")).body.data as unknown as Readiness;
const next = async (p: A4Project, who: Who): Promise<string | null> => (await readiness(p, who)).nextAction?.label ?? null;
const itemOf = (r: Readiness, id: string) => r.items.find((entry) => entry.id === id)!;

describe("A-3: each Aspire step names the step the routes take next", () => {
  test("from a new project to an approved direction", async () => {
    const ws = a4Workspace();
    const p = await A4Project.create(ws.workspace, ws.alice);
    await p.addMember(ws.alice, ws.bob);
    expect(await next(p, ws.alice)).toBe("Answer or confirm the listed questions");
    await p.ok(ws.alice, "/stages/aspire/answers", { answers: aspireAnswers() });
    expect(await next(p, ws.alice)).toBe("Run Understand, then confirm it");
    await p.ok(ws.alice, "/stages/aspire/understand");
    await p.ok(ws.alice, "/stages/aspire/confirm-understanding", { confirmed: true });
    expect(await next(p, ws.alice)).toBe("Run Explain");
    expect((await p.post(ws.alice, "/stages/aspire/propose", { spec: {} })).status).toBe(409);
    await p.ok(ws.alice, "/stages/aspire/explain", { level: "practitioner" });
    expect(await next(p, ws.alice)).toBe("Propose the brief");
    await p.ok(ws.alice, "/stages/aspire/propose", { spec: {} });
    expect(await next(p, ws.alice)).toBe("Request the direction gate");
    const gate = await p.openGate(ws.alice);
    expect(await next(p, ws.alice)).toBe("Approvers decide on the direction gate (0 of 1 approvals)");
    expect((await p.decide(ws.bob, gate)).status).toBe(201);
    expect(await next(p, ws.alice)).toBe("Complete the direction gate");
    await p.ok(ws.alice, "/stages/aspire/complete", { gateId: gate.gateId });
    expect(await next(p, ws.alice)).toBe("Run Build");
  });
});

describe("A-3: readinessHeadline", () => {
  const item = (id: string, status: A4ReadinessItem["status"], over: Partial<A4ReadinessItem> = {}): A4ReadinessItem => ({
    id, status, kind: null, reasonCodes: [], section: "governance", evidence: [], claim: null, report: null, acknowledged: null,
    nextAction: null, mandatory: true, bound: false, ...over } as A4ReadinessItem);
  const state = (step: string, stage = "assemble") => ({ project: { stage, step, hold: 0 } }) as Parameters<typeof readinessHeadline>[0];
  const query = { stage: "assemble", live: { integrity: { valid: true } } } as Parameters<typeof readinessHeadline>[1];
  const noGates = { direction: null, completion: null };

  test("a mandatory BLOCKED integrity item blocks the stage and is named; a WAITING one does not hold it", () => {
    const blocked = readinessHeadline(state("reviewed"), query, [item("members.present", "READY"),
      item("build_sessions_integrity", "BLOCKED", { section: "integrity", reasonCodes: ["RUN_INTEGRITY_FAILED"] })], noGates);
    expect(blocked).toEqual({ status: "BLOCKED", nextAction: { label: "Blocked by build_sessions_integrity: see each item's reason codes" } });
    const waiting = readinessHeadline(state("reviewed"), query, [item("members.present", "READY"),
      item("adapt.control_results_signature", "NOT_EVALUATED", { section: "integrity" })], noGates);
    expect(waiting).toEqual({ status: "READY", nextAction: { label: "Request the completion gate" } });
  });

  test("an item's own action leads; a past stage and a complete stage get no step action", () => {
    const named = item("ask_complete", "WAITING", { nextAction: { label: "Answer or confirm the listed questions" } });
    expect(readinessHeadline(state("asked"), query, [named], noGates).nextAction).toEqual({ label: "Answer or confirm the listed questions" });
    expect(readinessHeadline(state("asked", "adapt"), query, [item("members.present", "READY")], noGates).nextAction).toBeNull();
    const consumed = { status: "CONSUMED" } as A4GateStatus;
    expect(readinessHeadline(state("completion_approved"), query, [item("members.present", "READY")], { direction: consumed, completion: consumed }))
      .toEqual({ status: "COMPLETE", nextAction: null });
  });

  test("a held project says who resumes it; a denied gate says a new revision is needed", () => {
    const held = { project: { stage: "assemble", step: "built", hold: 1 } } as Parameters<typeof readinessHeadline>[0];
    expect(readinessHeadline(held, query, [], noGates).nextAction).toEqual({ label: "On hold: an owner resumes the project" });
    const denied = { status: "DENIED", approvals: 0, required: 2 } as unknown as A4GateStatus;
    expect(readinessHeadline(state("proposed"), query, [], { direction: denied, completion: null }).nextAction!.label)
      .toBe("The direction gate was denied on this revision. Answer again (a new revision returns this stage to Ask), then understand, confirm, explain and propose");
  });

  test("Propose items name Propose only at explained", () => {
    const at = (step: string) => proposeNextAction(state(step, "aspire") as never, "aspire", "Propose the brief");
    expect(at("asked")).toBeNull();
    expect(at("understood")).toBeNull();
    expect(at("explained")).toEqual({ label: "Propose the brief" });
    expect(at("proposed")!.label).toMatch(/^Answer again .*then understand, confirm, explain and propose$/);
    expect(proposeNextAction(state("explained", "adapt") as never, "aspire", "Propose the brief")).toBeNull();
  });

  test("Assemble's moved-baseline action starts the way back at Ask, not at a Propose the step refuses", () => {
    const assemble = readFileSync("src/a4/spec/assemble.ts", "utf8");
    expect(assemble).toContain(", then answer again, then understand, confirm, explain and propose`");
    expect(assemble).not.toContain('"Review the agent\'s Enforce resources"}, then propose again');
  });
});

describe("A-4: approvers are project members", () => {
  test("a project whose only approver is its creator says how to add one, and reads READY once one is added", async () => {
    const ws = a4Workspace();
    const p = await A4Project.create(ws.workspace, ws.alice);
    const before = itemOf(await readiness(p, ws.alice), "members.candidates");
    expect(before).toMatchObject({ status: "WAITING", mandatory: false, reasonCodes: ["NO_SECOND_APPROVER"] });
    expect(before.nextAction!.command).toBe(`amc a4 members ${p.projectId} --member LOCAL_USER:<userId> --project-role approver`);
    expect(before.nextAction!.label).toContain("adding a member supersedes open gates");
    await p.addMember(ws.alice, ws.bob);
    expect(itemOf(await readiness(p, ws.alice), "members.candidates")).toMatchObject({ status: "READY", nextAction: null });
  });
});

describe("A-5: a gate whose quorum cannot be reached says so", () => {
  function twoApprovalsForWriteLow(workspace: string): void {
    const policy = defaultApprovalPolicy();
    const writeLow = policy.approvalPolicy.actionClasses.WRITE_LOW!;
    policy.approvalPolicy.actionClasses.WRITE_LOW = { ...writeLow, requiredApprovals: 2, requireDistinctUsers: true };
    initApprovalPolicy(workspace, policy);
  }

  test("two members, a quorum of two: the requester cannot approve, so sod warns (WAITING, not BLOCKED) and names the fix", async () => {
    const ws = a4Workspace();
    twoApprovalsForWriteLow(ws.workspace);
    const p = await A4Project.create(ws.workspace, ws.alice);
    await p.addMember(ws.alice, ws.bob);
    await p.proposeAspire();
    await p.openGate(ws.alice);
    const r = await readiness(p, ws.alice);
    expect(itemOf(r, "sod")).toMatchObject({ status: "WAITING", reasonCodes: ["QUORUM_UNREACHABLE", "ELIGIBLE:1", "REQUIRED:2"] });
    expect(r.status).toBe("WAITING");
    expect(r.nextAction!.command).toBe(`amc a4 members ${p.projectId} --member LOCAL_USER:<userId> --project-role approver`);
  });

  test("a single-user workspace self-approves, so its gate gets no quorum warning", async () => {
    const ws = a4Workspace({ solo: true });
    const p = await A4Project.create(ws.workspace, ws.owner);
    await p.proposeAspire();
    await p.openGate(ws.owner);
    expect(itemOf(await readiness(p, ws.owner), "sod").reasonCodes).not.toContain("QUORUM_UNREACHABLE");
  });

  test("three members: the quorum can be reached and sod reads READY", async () => {
    const ws = a4Workspace();
    twoApprovalsForWriteLow(ws.workspace);
    const carol = addUser({ workspace: ws.workspace, username: "carol", roles: ["APPROVER"], password: "a5-carol-password" });
    const p = await A4Project.create(ws.workspace, ws.alice);
    await p.addMember(ws.alice, ws.bob);
    await p.addMember(ws.alice, { userId: carol.userId });
    await p.proposeAspire();
    await p.openGate(ws.alice);
    expect(itemOf(await readiness(p, ws.alice), "sod")).toMatchObject({ status: "READY" });
  });
});

// A-9: the receipt form showed helmRevision as a string, and the record route refuses anything but an integer.
describe("A-9: the deploy receipt form's helmRevision is an integer placeholder", () => {
  const plan = (target: "compose" | "helm") => {
    const files = deploymentPlan({ releaseId: "rel_0123456789abcdef", projectId: "a4p_test", agentId: "default", target,
      destinationRef: "8.8.8.8:443", hostHint: null, rollbackReleaseId: null }).files;
    return JSON.parse(files.find((file) => file.kind === "deploy-plan")!.bytes.toString("utf8")) as {
      receiptForm: { body: { helmRevision: unknown } }; steps: Array<{ command: string | null; note: string }> };
  };

  test("helm: a number to replace, named as an integer from helm history; compose: null", () => {
    const helm = plan("helm");
    expect(helm.receiptForm.body.helmRevision).toBe(0);
    expect(helm.steps.find((step) => step.command?.endsWith("history amc"))!.note).toContain("an integer from helm history");
    expect(plan("compose").receiptForm.body.helmRevision).toBeNull();
  });
});

/**
 * The A4 next action (verify track A-3, A-4, A-5). `amc a4 guide` and readiness pointed at steps the routes refuse
 * (Propose at understood, Understand before the required answers), said "nothing is waiting" at proposed, QUORUM_MET,
 * direction_approved and built, read WAITING with no action while a BLOCKED integrity item refused the gate, and never
 * said that approvers must be project members or that a gate's quorum could not be reached.
 * Skeptic round: the quorum warning refused completing a met quorum and left out workspace OWNERs (implicit project
 * owners), the members hint did too and also fired where self-approval counts, the printed `amc a4 members` command
 * lacked its required flags, and a denied gate read the generic "Blocked by" label.
 */
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { A4GateStatus, A4ReadinessItem } from "../../src/a4/a4Readiness.js";
import { deploymentPlan } from "../../src/a4/a4Deploy.js";
import { proposeNextAction, readinessHeadline } from "../../src/a4/a4Readiness.js";
import { defaultApprovalPolicy, initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { registerNativeApprovalLoginCommands } from "../../src/approvals/nativeApprovalLoginCli.js";
import { addUser, revokeUser } from "../../src/auth/authApi.js";
import { registerA4Commands } from "../../src/cli-a4-commands.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, aspireAnswers, refusal, routerSession, type Who } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

type Readiness = { status: string; nextAction: { label: string; command?: string } | null; items: A4ReadinessItem[];
  allowed: Record<string, { allowed: boolean; reasonCodes: string[] }> };
const readiness = async (p: A4Project, who: Who): Promise<Readiness> => (await p.get(who, "/readiness")).body.data as unknown as Readiness;
const next = async (p: A4Project, who: Who): Promise<string | null> => (await readiness(p, who)).nextAction?.label ?? null;
const itemOf = (r: Readiness, id: string) => r.items.find((entry) => entry.id === id)!;
const REDO = "Answer again (a new revision returns this stage to Ask), then understand, confirm, explain and propose";

/** A workspace whose one OWNER is the bootstrap user, plus carol: a workspace APPROVER, no OWNER, not yet a project member. */
function oneOwner() {
  const ws = a4Workspace({ solo: true });
  return { ...ws, carol: { userId: addUser({ workspace: ws.workspace, username: "carol", roles: ["APPROVER"], password: "a5-carol-password" }).userId } };
}

/** The long flags a command requires (commander's requiredOption), read from its definition. */
function requiredFlags(register: (program: Command) => void, path: string[]): string[] {
  const program = new Command();
  register(program);
  const command = path.reduce((parent, name) => parent.commands.find((child) => child.name() === name)!, program);
  return command.options.filter((option) => option.mandatory).map((option) => option.long!);
}

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

  test("a held project says who resumes it; a denied gate says a new revision is needed unless another item blocks", () => {
    const held = { project: { stage: "assemble", step: "built", hold: 1 } } as Parameters<typeof readinessHeadline>[0];
    expect(readinessHeadline(held, query, [], noGates).nextAction).toEqual({ label: "On hold: an owner resumes the project" });
    // As evaluateA4Readiness builds it: a DENIED gate's own item is BLOCKED, so the stage reads BLOCKED.
    const denied = { status: "DENIED", approvals: 0, required: 2 } as unknown as A4GateStatus;
    const deniedItem = item("gate.direction", "BLOCKED", { kind: "review_pending", reasonCodes: ["GATE_DENIED"] });
    expect(readinessHeadline(state("proposed"), query, [deniedItem], { direction: denied, completion: null }))
      .toEqual({ status: "BLOCKED", nextAction: { label: `The direction gate was denied on this revision. ${REDO}` } });
    const drifted = item("resources.current", "BLOCKED", { reasonCodes: ["RESOURCE_DRIFTED"] });
    expect(readinessHeadline(state("proposed"), query, [deniedItem, drifted], { direction: denied, completion: null }).nextAction)
      .toEqual({ label: "Blocked by gate.direction, resources.current: see each item's reason codes" });
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

describe("A-3: a denied gate, through the routes", () => {
  test("names the way back, and answering again starts the new revision at Understand", async () => {
    const ws = a4Workspace();
    const p = await A4Project.create(ws.workspace, ws.alice);
    await p.addMember(ws.alice, ws.bob);
    await p.proposeAspire();
    const gate = await p.openGate(ws.alice);
    expect((await p.decide(ws.bob, gate, "deny")).status).toBe(201);
    const r = await readiness(p, ws.alice);
    expect(itemOf(r, "gate.direction")).toMatchObject({ status: "BLOCKED", reasonCodes: ["GATE_DENIED"] });
    expect(r.status).toBe("BLOCKED");
    expect(r.nextAction).toEqual({ label: `The direction gate was denied on this revision. ${REDO}` });
    await p.ok(ws.alice, "/stages/aspire/answers", { answers: aspireAnswers() });
    expect(await next(p, ws.alice)).toBe("Run Understand, then confirm it");
  });
});

describe("A-4: who may decide; the members hint", () => {
  test("only the creator may decide: the hint names the full members command, and reads READY once an APPROVER is a member", async () => {
    const ws = oneOwner();
    const p = await A4Project.create(ws.workspace, ws.owner);
    const before = itemOf(await readiness(p, ws.owner), "members.candidates");
    expect(before).toMatchObject({ status: "WAITING", mandatory: false, reasonCodes: ["NO_SECOND_APPROVER"] });
    expect(before.nextAction!.command).toBe(`amc a4 members ${p.projectId} --member LOCAL_USER:<userId> --project-role approver`
      + " --session-token-file <file> --expect-head-seq <n>");
    expect(before.nextAction!.label).toContain("adding a member supersedes open gates");
    await p.addMember(ws.owner, ws.carol);
    expect(itemOf(await readiness(p, ws.owner), "members.candidates")).toMatchObject({ status: "READY", nextAction: null });
  });

  test("other workspace OWNERs are implicit project owners, so the hint reads READY without adding them", async () => {
    const ws = a4Workspace();
    const p = await A4Project.create(ws.workspace, ws.alice);
    expect(itemOf(await readiness(p, ws.alice), "members.candidates")).toMatchObject({ status: "READY", reasonCodes: [], nextAction: null });
  });

  test("a single-user workspace self-approves, so the hint reads READY", async () => {
    const ws = a4Workspace({ solo: true });
    const p = await A4Project.create(ws.workspace, ws.owner);
    expect(itemOf(await readiness(p, ws.owner), "members.candidates")).toMatchObject({ status: "READY", nextAction: null });
  });

  test("the printed commands carry every option their commands require (README, A4_FORGE, readiness)", async () => {
    const members = requiredFlags(registerA4Commands, ["a4", "members"]);
    expect(members).toEqual(expect.arrayContaining(["--member", "--session-token-file", "--expect-head-seq"]));
    const login = requiredFlags((program) => registerNativeApprovalLoginCommands(program.command("approvals")), ["approvals", "login"]);
    expect(login).toEqual(expect.arrayContaining(["--username", "--token-file"]));
    const ws = oneOwner();
    const p = await A4Project.create(ws.workspace, ws.owner);
    const docLines = (needle: string) => ["README.md", "docs/A4_FORGE.md"]
      .flatMap((file) => readFileSync(file, "utf8").split("\n").filter((line) => line.includes(needle)));
    const memberLines = [itemOf(await readiness(p, ws.owner), "members.candidates").nextAction!.command!, ...docLines("amc a4 members ")];
    const loginLines = docLines("amc approvals login --");
    expect(memberLines.length).toBeGreaterThanOrEqual(3);
    expect(loginLines.length).toBeGreaterThanOrEqual(2);
    for (const line of memberLines) for (const flag of members) expect(line).toContain(flag);
    for (const line of loginLines) for (const flag of login) expect(line).toContain(flag);
  });
});

describe("A-5: a gate whose quorum cannot be reached says so, and never refuses", () => {
  function twoApprovalsForWriteLow(workspace: string): void {
    const policy = defaultApprovalPolicy();
    const writeLow = policy.approvalPolicy.actionClasses.WRITE_LOW!;
    policy.approvalPolicy.actionClasses.WRITE_LOW = { ...writeLow, requiredApprovals: 2, requireDistinctUsers: true };
    initApprovalPolicy(workspace, policy);
  }

  test("a non-member workspace OWNER decides as an implicit owner: no warning, and the met quorum completes", async () => {
    const ws = a4Workspace();
    const p = await A4Project.create(ws.workspace, ws.alice);
    await p.proposeAspire();
    const gate = await p.openGate(ws.alice);
    expect(itemOf(await readiness(p, ws.alice), "sod")).toMatchObject({ status: "READY" });
    expect((await p.decide(ws.bob, gate)).status).toBe(201);
    const r = await readiness(p, ws.alice);
    expect(itemOf(r, "sod")).toMatchObject({ status: "READY" });
    expect(r.allowed.progress).toEqual({ allowed: true, reasonCodes: [] });
    expect((await p.post(ws.alice, "/stages/aspire/complete", { gateId: gate.gateId })).status).toBe(200);
  });

  test("a quorum of two that a member and the bootstrap OWNER reach: no warning, and complete succeeds", async () => {
    const ws = a4Workspace();
    twoApprovalsForWriteLow(ws.workspace);
    const p = await A4Project.create(ws.workspace, ws.alice);
    await p.addMember(ws.alice, ws.bob);
    await p.proposeAspire();
    const gate = await p.openGate(ws.alice);
    expect(itemOf(await readiness(p, ws.alice), "sod")).toMatchObject({ status: "READY" });
    expect((await p.decide(ws.bob, gate)).status).toBe(201);
    expect((await p.decide(ws.owner, gate)).status).toBe(201);
    expect((await p.post(ws.alice, "/stages/aspire/complete", { gateId: gate.gateId })).status).toBe(200);
  });

  test("only the requester could decide: sod warns and names the fix, progress lists no sod, and a member APPROVER clears it", async () => {
    const ws = oneOwner();
    const p = await A4Project.create(ws.workspace, ws.owner);
    await p.proposeAspire();
    const gate = await p.openGate(ws.owner);
    const r = await readiness(p, ws.owner);
    expect(itemOf(r, "sod")).toMatchObject({ status: "WAITING", reasonCodes: ["QUORUM_UNREACHABLE", "ELIGIBLE:0", "REQUIRED:1"] });
    expect(r.allowed.progress.reasonCodes).toEqual(["GATE_PENDING"]);
    expect(r.nextAction!.label).toMatch(/^This gate can reach 0 of the 1 approvals it needs/);
    expect(r.nextAction!.command).toBe(`amc a4 members ${p.projectId} --member LOCAL_USER:<userId> --project-role approver`
      + " --session-token-file <file> --expect-head-seq <n>");
    // carol, a workspace APPROVER, decides only as a project member.
    expect(refusal(await p.decide(ws.carol, gate))).toEqual([403, "A4_NOT_A_MEMBER"]);
    await p.addMember(ws.owner, ws.carol);
    const again = await p.openGate(ws.owner);
    expect(itemOf(await readiness(p, ws.owner), "sod")).toMatchObject({ status: "READY" });
    expect((await p.decide(ws.carol, again)).status).toBe(201);
  });

  test("a met quorum shows no warning, even once its one approver is revoked", async () => {
    const ws = oneOwner();
    const dave = { userId: addUser({ workspace: ws.workspace, username: "dave", roles: ["OWNER"], password: "a5-dave-password" }).userId };
    const p = await A4Project.create(ws.workspace, ws.owner);
    await p.proposeAspire();
    const gate = await p.openGate(ws.owner);
    expect((await p.decide(dave, gate)).status).toBe(201);
    revokeUser({ workspace: ws.workspace, username: "dave" });
    expect((await p.gate(ws.owner, gate.gateId)).status).toBe("QUORUM_MET");
    expect(itemOf(await readiness(p, ws.owner), "sod")).toMatchObject({ status: "READY" });
    expect((await p.post(ws.owner, "/stages/aspire/complete", { gateId: gate.gateId })).status).toBe(200);
  });

  test("a live host session may be a host OWNER readiness cannot see the roles of, so no warning is given", async () => {
    const ws = oneOwner();
    const dave = routerSession(ws.workspace, "router-dave", "dave", ["OWNER"]);
    const p = await A4Project.create(ws.workspace, ws.owner);
    await p.proposeAspire();
    const gate = await p.openGate(ws.owner);
    expect(itemOf(await readiness(p, ws.owner), "sod")).toMatchObject({ status: "READY" });
    expect((await p.decide(dave, gate)).status).toBe(201);
  });

  test("a single-user workspace self-approves once: a gate needing one approval gets no warning", async () => {
    const ws = a4Workspace({ solo: true });
    const p = await A4Project.create(ws.workspace, ws.owner);
    await p.proposeAspire();
    await p.openGate(ws.owner);
    expect(itemOf(await readiness(p, ws.owner), "sod").reasonCodes).not.toContain("QUORUM_UNREACHABLE");
  });

  test("a single-user workspace self-approves once: a gate needing two approvals warns", async () => {
    const ws = a4Workspace({ solo: true });
    twoApprovalsForWriteLow(ws.workspace);
    const p = await A4Project.create(ws.workspace, ws.owner);
    await p.proposeAspire();
    await p.openGate(ws.owner);
    expect(itemOf(await readiness(p, ws.owner), "sod")).toMatchObject({ status: "WAITING", reasonCodes: ["QUORUM_UNREACHABLE", "ELIGIBLE:1", "REQUIRED:2"] });
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

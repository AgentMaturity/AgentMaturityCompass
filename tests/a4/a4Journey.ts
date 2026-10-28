/**
 * P2-35 journey: one A4 project driven through the HTTP routes from Aspire to an Activate release, as a team of real
 * signed users does it. alice (OWNER) authors and builds; bob (OWNER) and a4-owner approve; audrey (AUDITOR) casts the
 * role vote Adapt's completion needs. Assemble takes the `other` path (no native build session; its path and unsupported
 * items are acknowledged out of scope). Adapt runs on the thin catalog (tests/a4/thinCatalog.ts, mocked by the caller),
 * and Activate targets helm on a Studio that reads as hosted in Kubernetes (KUBERNETES_SERVICE_HOST), the v1 same-host
 * restart. Effect gates are opened by alice and approved through the engine by bob and a4-owner.
 */
import { vi } from "vitest";
import { resolveA4Principal } from "../../src/a4/a4Identity.js";
import type { A4Call } from "../../src/a4/a4Gates.js";
import { probeDestination, verifyDeployment } from "../../src/a4/a4DeployVerify.js";
import { openA4Store } from "../../src/a4/a4Store.js";
import { addUser } from "../../src/auth/authApi.js";
import { A4Project, a4, a4Workspace, aspireAnswers, requestId, settled, type Reply, type Who } from "./a4Harness.js";

export interface Team { workspace: string; sessionId: string; alice: { userId: string }; bob: { userId: string }; owner: { userId: string }; audrey: { userId: string } }
export type Gate = { gateId: string; gateSeq: number; bindingDigest: string };
type Answers = Record<string, unknown>;

export const ASSEMBLE_ANSWERS: Answers = { capabilities: ["draft refund replies"], autonomy: "advise", providers: "stub", path: "other" };
export const ADAPT_ANSWERS: Answers = { audiences: ["support staff"], languages: ["en"] };
/** A public IPv4 literal: the egress check needs no DNS, and every probe of it in these tests replaces the HTTP fetch. */
const DESTINATION = "8.8.8.8:443";
type Fetch = NonNullable<Parameters<typeof probeDestination>[3]>;
const json = (status: number, body: unknown) => ({ status, body: Buffer.from(JSON.stringify(body)) });
/** A destination answering READY and a healthy /healthz; nothing leaves the process. */
const REACHABLE: Fetch = async (_host, _port, _address, path) => path === "/readyz" ? json(200, { status: "READY", reasons: [], checks: {}, ts: 1 })
  : json(200, { status: "ok", version: "1.2.0", uptime: 5, dbStatus: "ok" });
export const ACTIVATE_ANSWERS: Answers = { target: "helm", destinationRef: DESTINATION, leaseScopes: ["gateway:llm"], stagingRoutes: ["/v1/chat"],
  productionRoutes: ["/v1/chat"], modelAllowlist: ["stub"], budgetRequestsPerMinute: "60", budgetTokensPerMinute: "10000" };
/** Readiness items each stage's fixture records out of scope (re-acknowledged on every revision, as an acknowledgement binds one). */
const ACKS: Record<string, string[]> = { aspire: [], assemble: ["path_supported", "unsupported_acknowledged"], adapt: ["plan_unresolved"], activate: [] };
/** The effect each effect gate runs (src/a4/spec/*). */
const EFFECTS: Record<string, string> = { "assemble.completion": "a4.assemble.apply", "adapt.completion": "a4.adapt.activate_plan",
  "activate.direction": "a4.activate.release", "activate.completion": "a4.activate.production_lease" };

function team(): Team {
  const ws = a4Workspace();
  const audrey = addUser({ workspace: ws.workspace, username: "audrey", roles: ["AUDITOR"], password: "p235-audrey-password" });
  vi.stubEnv("KUBERNETES_SERVICE_HOST", "10.96.0.1");
  return { ...ws, audrey: { userId: audrey.userId } };
}

const answersOf = (values: Answers) => Object.entries(values).map(([questionId, value]) => ({ questionId, value }));
const must = (reply: Reply, what: string): Reply => {
  if (reply.status >= 300) throw new Error(`${what}: ${reply.status} ${JSON.stringify(reply.body)}`);
  return reply;
};

export class Journey {
  constructor(readonly t: Team, readonly p: A4Project) {}

  /** `agentId` names an existing agent (the fixture's `default`) instead of a new one minted from the name. */
  static async start(t: Team = team(), agentId?: string): Promise<Journey> {
    const p = await A4Project.create(t.workspace, t.alice, "P2-35 scenario", agentId);
    for (const member of [t.bob, t.owner, t.audrey]) await p.addMember(t.alice, member, ["approver", "reviewer"]);
    return new Journey(t, p);
  }

  async acknowledge(stage: string, itemId: string): Promise<Reply> {
    return must(await this.p.post(this.t.alice, "/acknowledge", { itemId, stage, reason: "out of scope for the P2-35 fixture" }), `acknowledge ${itemId}`);
  }

  /** Ask to propose: answers, Understand (which carries earlier answers), the answers again on top, Understand, confirm, explain, propose. */
  async propose(stage: string, answers: Answers, spec: Record<string, unknown> = {}): Promise<void> {
    const { alice } = this.t;
    if (stage === "aspire") return this.p.proposeAspire(answersOf(answers) as ReturnType<typeof aspireAnswers>);
    await this.p.ok(alice, `/stages/${stage}/answers`, { answers: answersOf(answers) });
    await this.p.ok(alice, `/stages/${stage}/understand`);
    await this.p.ok(alice, `/stages/${stage}/answers`, { answers: answersOf(answers) });
    await this.p.ok(alice, `/stages/${stage}/understand`);
    await this.p.ok(alice, `/stages/${stage}/confirm-understanding`, { confirmed: true });
    await this.p.ok(alice, `/stages/${stage}/explain`, { level: "practitioner" });
    await this.p.ok(alice, `/stages/${stage}/propose`, { spec });
    for (const itemId of ACKS[stage] ?? []) await this.acknowledge(stage, itemId);
  }

  /** Opens a documentary gate and records approvals until its quorum is met (bob, then audrey where her role may vote, then a4-owner). */
  async approve(stage: string, kind: "direction" | "completion"): Promise<Gate> {
    const gate = await this.p.openGate(this.t.alice, stage, kind);
    for (const who of [this.t.bob, this.t.audrey, this.t.owner]) {
      if ((await this.p.gate(this.t.alice, gate.gateId)).status !== "PENDING") break;
      const reply = await this.p.decide(who, gate);
      if (reply.status === 403 && JSON.stringify(reply.body).includes("GATE_ROLE_NOT_ALLOWED")) continue;
      must(reply, `decide ${stage}.${kind}`);
    }
    return gate;
  }

  /** Opens the effect gate on `gate` and approves its engine request by `approvers`; returns the engine request id. */
  async openEffect(stage: string, kind: string, gate: Gate, approvers: Who[] = [this.t.bob, this.t.owner]): Promise<string> {
    const effect = EFFECTS[`${stage}.${kind}`]!;
    must(await this.p.post(this.t.alice, `/stages/${stage}/effects/${effect}/open`, { gateId: gate.gateId }), `open ${effect}`);
    const opened = (await this.transitions()).filter((link) => link.kind === "EFFECT_GATE_OPENED").at(-1)!;
    for (const who of approvers) must(await this.engineDecide(who, opened.body), `engine approve ${effect}`);
    return String(opened.body.approvalRequestId);
  }

  async engineDecide(who: Who, opened: Record<string, unknown>, verb: "approve" | "deny" = "approve"): Promise<Reply> {
    return a4(this.t.workspace, who, "POST", `${this.p.path}/approvals/${String(opened.approvalRequestId)}/${verb}`,
      { reason: "P2-35 fixture engine decision", expectedRequestDigestSha256: opened.requestDigestSha256 });
  }

  /** complete (or, for Activate's direction gate, POST …/releases), then waits for any effect that runs after the response. */
  async complete(stage: string, gate: Gate, who: Who = this.t.alice): Promise<Reply> {
    const reply = stage === "activate" && gate === this.releaseGate
      ? await this.p.post(who, "/releases", { gateId: gate.gateId }) : await this.p.post(who, `/stages/${stage}/complete`, { gateId: gate.gateId });
    await settled();
    await this.p.sync();
    return reply;
  }
  private releaseGate: Gate | null = null;

  async build(stage: string): Promise<void> {
    await this.p.ok(this.t.alice, `/stages/${stage}/build`);
    if (stage === "adapt") await this.p.ok(this.t.alice, "/stages/adapt/probe");
    await this.p.ok(this.t.alice, `/stages/${stage}/review`);
    for (const itemId of ACKS[stage] ?? []) await this.acknowledge(stage, itemId);
  }

  /** One documentary stage end to end; an effect gate on the completion gate is opened and approved before complete. */
  async stage(stage: string, answers: Answers): Promise<void> {
    await this.propose(stage, answers);
    must(await this.complete(stage, await this.approve(stage, "direction")), `${stage} direction complete`);
    await this.build(stage);
    const completion = await this.approve(stage, "completion");
    if (EFFECTS[`${stage}.completion`] !== undefined && stage !== "adapt") await this.openEffect(stage, "completion", completion);
    must(await this.complete(stage, completion), `${stage} completion complete`);
  }

  async throughAspire(): Promise<void> {
    await this.p.proposeAspire();
    must(await this.complete("aspire", await this.approve("aspire", "direction")), "aspire direction complete");
    await this.build("aspire");
    must(await this.complete("aspire", await this.approve("aspire", "completion")), "aspire completion complete");
  }

  /** Aspire, Assemble and Adapt; the head ends at Activate, asked. */
  async toActivate(): Promise<void> {
    await this.throughAspire();
    await this.stage("assemble", ASSEMBLE_ANSWERS);
    await this.stage("adapt", ADAPT_ANSWERS);
  }

  /** Activate's release: the proposal, the release approval, its effect gate and POST …/releases. Returns the release reply. */
  async release(answers: Answers = ACTIVATE_ANSWERS): Promise<{ gate: Gate; reply: Reply; releaseId: string; packageDigest: string;
    staging: { leaseId: string; token: string } }> {
    await this.propose("activate", answers);
    const gate = await this.approve("activate", "direction");
    await this.openEffect("activate", "direction", gate);
    this.releaseGate = gate;
    const reply = must(await this.complete("activate", gate), "release");
    const release = reply.body.data!.release as { releaseId: string; packageDigest: string };
    const staging = reply.body.data!.staging as { leaseId: string; token: string };
    return { gate, reply, releaseId: release.releaseId, packageDigest: release.packageDigest, staging };
  }

  /** The whole chain, read through the store (the transitions route pages). */
  /** The gate functions' call for `who`, as the router builds it (src/a4/a4Router.ts callOf), for effects driven directly. */
  call(who: { userId: string }, clientRequestId?: string): A4Call {
    const resolved = resolveA4Principal({ workspace: this.t.workspace, pathname: `${this.p.path}/stages/activate/complete`, method: "POST",
      nativeTasks: { principalId: `session:LOCAL_USER:${who.userId}`, demo: false, executionAllowed: () => true } as never });
    if (!resolved.ok || resolved.principal === null) throw new Error(`no principal for ${who.userId}`);
    const principal = resolved.principal;
    return { principal, hostedRouter: false, hostMode: false, fullIntegrity: false,
      ...(clientRequestId ? { request: { principalKey: principal.key, clientRequestId, bodyHash: "c".repeat(64) } } : {}) };
  }

  /** AMC's check (`verify`) of the newest `environment` receipt, run as the route runs it but with `fetch` in place of HTTP. */
  async verify(releaseId: string, fetch: Fetch = REACHABLE, environment: "staging" | "production" = "staging") {
    await this.p.sync();
    const store = openA4Store(this.t.workspace);
    try {
      return await verifyDeployment(store, this.p.projectId, releaseId, { ...this.call(this.t.alice, requestId()),
        body: { environment, expectedHeadSeq: this.p.head, clientRequestId: requestId() } }, (workspace, ref, egress) => probeDestination(workspace, ref, egress, fetch));
    } finally {
      store.close();
      await this.p.sync();
    }
  }

  /** The operator's receipt for `releaseId` (POST …/releases/:rid/deployments). */
  async deploy(releaseId: string, release: { packageDigest: string; leaseIds: string[] }, over: Record<string, unknown> = {}): Promise<Reply> {
    return this.p.post(this.t.alice, `/releases/${releaseId}/deployments`, { kind: "deploy", environment: "staging", target: "helm",
      packageDigest: release.packageDigest, imageDigest: null, overlayDigest: "a".repeat(64), restartedAt: new Date().toISOString(), helmRevision: 1,
      leaseIds: release.leaseIds, destinationRef: DESTINATION, operatorStated: { status: "succeeded" }, ...over });
  }

  /**
   * The release through production: a succeeded staging receipt, AMC's check (`verify`, the caller's probe), Review, the
   * acknowledged WAITING check, the deployment approval (its effect mints the production lease) and a succeeded production
   * receipt, which moves `deployed_release_id`.
   */
  async production(destinationRef = DESTINATION): Promise<{ releaseId: string; packageDigest: string;
    staging: { leaseId: string; token: string }; production: { leaseId: string; token: string }; approval: Gate }> {
    const rel = await this.release({ ...ACTIVATE_ANSWERS, destinationRef });
    const receipt = { packageDigest: rel.packageDigest, leaseIds: [rel.staging.leaseId] };
    must(await this.deploy(rel.releaseId, receipt, { destinationRef }), "staging receipt");
    await this.verify(rel.releaseId);
    await this.p.sync();
    await this.reviewActivate();
    const approval = await this.approve("activate", "completion");
    const done = must(await this.complete("activate", approval), "deployment approval");
    const production = done.body.data!.production as { leaseId: string; token: string };
    must(await this.deploy(rel.releaseId, { packageDigest: rel.packageDigest, leaseIds: [production.leaseId] }, { destinationRef, environment: "production" }),
      "production receipt");
    return { releaseId: rel.releaseId, packageDigest: rel.packageDigest, staging: rel.staging, production, approval };
  }

  /** Activate's Review (it records the monitor and value rows after its step), then the owner acknowledges the WAITING AMC check. */
  async reviewActivate(acknowledgeCheck = true): Promise<void> {
    await this.p.ok(this.t.alice, "/stages/activate/review");
    await this.p.sync();
    if (acknowledgeCheck) await this.acknowledge("activate", "deployment.amc_check");
  }

  async transitions(): Promise<Array<{ seq: number; kind: string; body: Record<string, unknown> }>> {
    const store = openA4Store(this.t.workspace);
    try {
      return store.readChain(this.p.projectId).map((link) => ({ seq: link.seq, kind: link.kind, body: link.body }));
    } finally {
      store.close();
    }
  }
  async items(stage?: string): Promise<Array<{ id: string; status: string; reasonCodes: string[]; mandatory: boolean }>> {
    return (await this.p.get(this.t.alice, `/readiness${stage ? `?stage=${stage}` : ""}`)).body.data!.items as Array<{ id: string; status: string; reasonCodes: string[]; mandatory: boolean }>;
  }
  async item(id: string, stage?: string) {
    return (await this.items(stage)).find((entry) => entry.id === id);
  }
}

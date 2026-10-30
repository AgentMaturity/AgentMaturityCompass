/** P2-22 /api/v1/operator: role classes through the real Studio delegation, and the router's own refusals. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { handleOperatorRoute } from "../../src/api/operatorRouter.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { approvalRequestBindingDigest, loadApprovalRequestRecord } from "../../src/approvals/approvalChainStore.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { activeControlPlan } from "../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../src/catalog/compiler/compile.js";
import { signPlan } from "../../src/catalog/compiler/sign.js";
import type { PlanSource } from "../../src/operator/planDiffView.js";
import { handleStudioApiDelegation, type StudioApiAuthContext } from "../../src/studio/apiDelegation.js";
import { unlockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import { catalog } from "../catalog/l0/harness.js";

vi.setConfig({ testTimeout: 120_000 });
const HUMAN = ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"];
const limiter = () => ({ allowed: true, limit: 60, remaining: 59, resetTs: Date.now() + 60_000, retryAfterSeconds: 0 });

interface Reply { status: number; body: string; roles?: string[] }
function fakeRes(reply: Reply): ServerResponse {
  return { headersSent: false, setHeader: () => undefined, writeHead(status: number) { reply.status = status; return this; },
    end(body?: string | Buffer) { reply.body = String(body ?? ""); } } as unknown as ServerResponse;
}
function fakeReq(url: string, body?: unknown): IncomingMessage {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { url, headers: { "content-type": "application/json" } });
  return req;
}

/** Runs one request through Studio's delegation with `auth`; `grant` decides whether requireRoles admits it. */
async function delegate(path: string, method: string, auth: StudioApiAuthContext | null, grant = true, workspace = process.cwd()): Promise<Reply> {
  const reply: Reply = { status: 0, body: "" };
  const res = fakeRes(reply);
  await handleStudioApiDelegation({ pathname: path, method, clientIp: "127.0.0.1", workspace, token: "admin-token", req: fakeReq(path), res,
    authenticate: () => auth,
    requireRoles: (params) => {
      reply.roles = params.roles;
      if (!grant || !params.roles.some((role) => params.auth.roles.has(role))) { reply.status = 403; return false; }
      return true;
    },
    json: (_res, status, payload) => { reply.status = status; reply.body = JSON.stringify(payload); },
    apiLimiter: limiter, privilegedApiLimiter: limiter, setRateLimitHeaders: () => undefined });
  return reply;
}
const user = (role: string, extra: Partial<StudioApiAuthContext> = {}): StudioApiAuthContext =>
  ({ isAdmin: false, agentId: null, username: role.toLowerCase(), userId: `u-${role.toLowerCase()}`, roles: new Set([role]), ...extra });

describe("operator role classes", () => {
  test("reads take every human role; activation is OWNER-only; packets are AUDITOR or OWNER", async () => {
    expect((await delegate("/api/v1/operator/plans/diff", "GET", user("VIEWER"), false)).roles).toEqual(HUMAN);
    expect((await delegate("/api/v1/operator/inbox", "GET", user("VIEWER"), false)).roles).toEqual(HUMAN);
    expect((await delegate("/api/v1/operator/plans/activate", "POST", user("VIEWER"), false)).roles).toEqual(["OWNER"]);
    expect((await delegate("/api/v1/operator/review-packets", "POST", user("VIEWER"), false)).roles).toEqual(["AUDITOR", "OWNER"]);
    expect((await delegate("/api/v1/operator/review-packets/rp_000000000000000000000000/download", "GET", user("VIEWER"), false)).roles).toEqual(["AUDITOR", "OWNER"]);
    expect((await delegate("/api/v1/operator/review-timing/export", "GET", user("VIEWER"), false)).roles).toEqual(["OWNER"]);
    // An OPERATOR or APPROVER reaching activate is refused by role, before the router runs.
    expect((await delegate("/api/v1/operator/plans/activate", "POST", user("APPROVER"))).status).toBe(403);
  });

  test("a VIEWER reads the inbox through the real router", async () => {
    const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-viewer-")));
    try {
      initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
      const reply = await delegate("/api/v1/operator/inbox", "GET", user("VIEWER"), true, workspace);
      expect(reply.status).toBe(200);
      expect(JSON.parse(reply.body).data.items.length).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("lease and agent credentials are refused; an unauthenticated caller (another workspace's user) is refused", async () => {
    const lease = await delegate("/api/v1/operator/inbox", "GET", { ...user("VIEWER"), username: "agent-lease", agentId: "default", roles: new Set(["AGENT"]) });
    expect(lease.status).toBe(403);
    expect(lease.body).toContain("agent or lease auth");
    expect((await delegate("/api/v1/operator/inbox", "GET", null)).status).toBe(401);
  });
});

describe("operator activation route", () => {
  let workspace: string;
  let checkpoints: string;
  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-router-")));
    checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-router-ckpt-")));
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initApprovalPolicy(workspace);
    unlockVault(workspace);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(checkpoints, { recursive: true, force: true });
  });

  test("only decisions bound to the review request's digest count; bound ones activate", async () => {
    const profile = parseDeploymentProfile((catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")!.envelope!.setup as { profile: unknown }).profile);
    const plan = compilePlan({ profile, catalog, asOf: new Date().toISOString() });
    const { signed } = signPlan({ workspace, plan, previous: null, reviewAgentId: "default" });
    const approvalId = signed.review.approvalRequestId!;
    const planSources: Record<string, PlanSource> = { fixture: () => [{ plan, signed, previousPlanDigest: null,
      source: { kind: "a4", projectId: "a4p_00000000000000000000000000000001", revisionNo: 1, agentId: "default" } }] };
    const decide = (userId: string, bound: boolean) => decideApprovalForIntent({ workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE",
      reason: "P2-22 fixture plan review", userId, username: userId, userRoles: ["OWNER"],
      ...(bound ? { expectedRequestDigestSha256: approvalRequestBindingDigest(loadApprovalRequestRecord({ workspace, agentId: "default", approvalRequestId: approvalId })) } : {}) });
    const activate = async (body: unknown) => {
      const reply: Reply = { status: 0, body: "" };
      await handleOperatorRoute("/api/v1/operator/plans/activate", "POST", fakeReq("/api/v1/operator/plans/activate", body), fakeRes(reply),
        { workspace, principal: "owner" }, { planSources });
      return { status: reply.status, body: JSON.parse(reply.body) };
    };

    expect(await activate({ planDigest: plan.digest })).toMatchObject({ status: 403, body: { code: "APPROVAL_REQUIRED" } });
    decide("approver-1", false);
    decide("approver-2", false);
    expect(await activate({ planDigest: plan.digest, approvalId })).toMatchObject({ status: 403, body: { code: "APPROVAL_NOT_BOUND" } });
    expect(activeControlPlan(workspace)).toBeNull();
  });

  test("a locked vault refuses activation and packets; a packet id that is not one is never read", async () => {
    const { lockVault } = await import("../../src/vault/vault.js");
    lockVault(workspace);
    for (const [path, body] of [["/api/v1/operator/plans/activate", { planDigest: `sha256:${"0".repeat(64)}`, approvalId: "x" }],
      ["/api/v1/operator/review-packets", { planDigest: `sha256:${"0".repeat(64)}`, window: { fromTs: 0, toTs: 1 }, formats: ["json"] }]] as const) {
      const reply: Reply = { status: 0, body: "" };
      await handleOperatorRoute(path, "POST", fakeReq(path, body), fakeRes(reply), { workspace, principal: "owner" }, { planSources: {} });
      expect(reply.status, path).toBe(423);
    }
    for (const id of ["..%2F..%2Fevidence.sqlite", "rp_zz", "rp_000000000000000000000000"]) {
      const reply: Reply = { status: 0, body: "" };
      const path = `/api/v1/operator/review-packets/${id}/download`;
      await handleOperatorRoute(path, "GET", fakeReq(path), fakeRes(reply), { workspace, principal: "owner" });
      expect(reply.status, id).toBe(404);
    }
  });

  test("bound approvals by two other people activate the plan", async () => {
    const profile = parseDeploymentProfile((catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")!.envelope!.setup as { profile: unknown }).profile);
    const plan = compilePlan({ profile, catalog, asOf: new Date().toISOString() });
    const { signed } = signPlan({ workspace, plan, previous: null, reviewAgentId: "default" });
    const approvalId = signed.review.approvalRequestId!;
    const binding = approvalRequestBindingDigest(loadApprovalRequestRecord({ workspace, agentId: "default", approvalRequestId: approvalId }));
    for (const userId of ["approver-1", "approver-2"]) {
      decideApprovalForIntent({ workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "P2-22 fixture plan review",
        userId, username: userId, userRoles: ["OWNER"], expectedRequestDigestSha256: binding });
    }
    const reply: Reply = { status: 0, body: "" };
    await handleOperatorRoute("/api/v1/operator/plans/activate", "POST", fakeReq("/api/v1/operator/plans/activate", { planDigest: plan.digest, approvalId }),
      fakeRes(reply), { workspace, principal: "owner" }, { planSources: { fixture: () => [{ plan, signed, previousPlanDigest: null,
        source: { kind: "a4", projectId: "a4p_00000000000000000000000000000001", revisionNo: 1, agentId: "default" } }] } });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body).data).toMatchObject({ revision: 1, approvers: ["approver-1", "approver-2"] });
    expect(activeControlPlan(workspace)?.digest).toBe(plan.digest);
  });
});

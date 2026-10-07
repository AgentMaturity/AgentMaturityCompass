import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { initBudgets } from "../src/budgets/budgets.js";
import {
  actionPolicyPath, actionPolicySigPath, defaultActionPolicy, initActionPolicy, signActionPolicy
} from "../src/governor/actionPolicyEngine.js";
import type { ActionPolicy } from "../src/governor/actionPolicySchema.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { getApprovalInboxItem } from "../src/approvals/approvalInbox.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { initUsersConfig, createSession } from "../src/auth/authApi.js";
import { buildAgentConfig, initFleet, scaffoldAgent } from "../src/fleet/registry.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { ensureLeaseRevocationStore } from "../src/leases/leaseCli.js";
import type { LeaseScope } from "../src/leases/leaseSchema.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import {
  agentTokenGrantFromActionPolicy, agentTokenGrantFromLease, ensureAgentToken, issueAgentToken, readAgentToken,
  studioAgentTokenMetaPath, studioAgentTokenPath
} from "../src/studio/studioState.js";
import type { ToolIntentResponse } from "../src/toolhub/toolhubServer.js";
import type { DiagnosticReport } from "../src/types.js";
import type { ActionClass } from "../src/types.js";

// IMPL-2: agent bearer tokens carry only what the signed action policy (or an
// issuing lease) grants, and the execute grant is per action class. Loopback
// HTTP against the real Studio server; ToolHub, approvals and fs.write are the
// real temporary-workspace implementations. The diagnostic control input is a
// synthetic fixture, never a maturity measurement.
const A = "default";
// The legacy default agent lives at .amc/ itself and is not listed by /agents.
const C = "token-scope-child";
const ADMIN = "token-scope-fixture-admin";
const READ_SCOPES = ["toolhub:intent", "governor:check", "receipt:verify"];
const roots: string[] = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const server of servers.splice(0).reverse()) {
    try { await server.close(); } catch (error) { errors.push(error); }
  }
  for (const root of roots.splice(0)) {
    try { lockVault(root); rmSync(root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  }
  vi.unstubAllEnvs();
  if (errors.length > 0) throw new AggregateError(errors, "token-scope fixture cleanup failed");
});

function policyAllowingExecuteFor(classes: ActionClass[]): ActionPolicy {
  const policy = defaultActionPolicy();
  policy.riskTierDefaults.medium.requireSandboxForExecute = false;
  policy.actions = policy.actions.map(rule => rule.actionClass === "READ_ONLY" || rule.actionClass === "WRITE_LOW"
    ? { ...rule, minEffectiveQuestionLevels: {}, requireAssurancePacks: {}, requireTrustTierAtLeast: "SELF_REPORTED",
        allowExecute: classes.includes(rule.actionClass), requireExecTicket: false }
    : { ...rule, allowExecute: classes.includes(rule.actionClass) });
  return policy;
}

function workspaceFixture(policy: ActionPolicy) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "token-scope-fixture-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-agent-token-scopes-")));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: A, trustBoundaryMode: "isolated" });
  initFleet(workspace, { orgName: "Token scope fixture" });
  for (const agentId of [A, C]) {
    scaffoldAgent(workspace, buildAgentConfig({
      agentId, agentName: `Token scope fixture ${agentId}`, role: "fixture", domain: "credential scopes",
      primaryTasks: ["local governed file operations"], stakeholders: ["fixture-owner"], riskTier: "med",
      templateId: "openai", baseUrl: "http://127.0.0.1:1", routePrefix: "/fixture", auth: { type: "none" }
    }));
  }
  initBudgets(workspace, A);
  initToolsConfig(workspace); initApprovalPolicy(workspace);
  initActionPolicy(workspace, policy);
  expect(ensureLeaseRevocationStore(workspace).signatureValid).toBe(true);
  return workspace;
}

async function serverFixture(policy: ActionPolicy) {
  const workspace = workspaceFixture(policy);
  const owner = initUsersConfig({ workspace, username: "fixture-owner", password: "fixture-owner-password" }).owner;
  const human = createSession({ workspace, user: owner });
  mkdirSync(join(workspace, "workspace", "output"), { recursive: true });
  const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: ADMIN });
  servers.push(server);
  return { workspace, server, owner, cookie: `amc_session=${human.token}` };
}
type Fixture = Awaited<ReturnType<typeof serverFixture>>;

function lease(workspace: string, scopes: LeaseScope[]) {
  return issueLeaseToken({ workspace, workspaceId: workspaceIdFromDirectory(workspace), agentId: A, ttlMs: 60_000,
    scopes, routeAllowlist: ["/"], modelAllowlist: ["*"], maxRequestsPerMinute: 1000, maxTokensPerMinute: 1_000_000,
    maxCostUsdPerDay: null });
}
interface Response { status: number; body: string }
function request(f: Fixture, path: string, method: "GET" | "POST", headers: Record<string, string>, body?: unknown): Promise<Response> {
  const target = new URL(path, f.server.url), payload = body === undefined ? "" : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpRequest(target, { method, headers: { "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)), Connection: "close", ...headers } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error("token-scope request timed out")));
    req.on("error", reject); req.end(payload);
  });
}
function syntheticGovernorControlInput(workspace: string): void {
  // A synthetic CONTROL INPUT so the governor evaluates EXECUTE instead of
  // simulating an unmeasured workspace. Not a diagnostic result.
  const now = Date.now();
  const report: Partial<DiagnosticReport> & { fixtureKind: string } = {
    fixtureKind: "SYNTHETIC_TOKEN_SCOPE_CONTROL_INPUT_NOT_A_MEASUREMENT", agentId: A, runId: "synthetic-token-scope-control",
    ts: now, windowStartTs: now - 1000, windowEndTs: now, integrityIndex: 1, trustLabel: "HIGH TRUST", correlationRatio: 0,
    questionScores: [], evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 1 }
  };
  const runsDir = getAgentPaths(workspace, A).runsDir;
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, "synthetic-token-scope-control.json"), JSON.stringify(report), "utf8");
}
async function approvedWriteLow(f: Fixture, leaseToken: string) {
  syntheticGovernorControlInput(f.workspace);
  const relativePath = "workspace/output/token-scope-sentinel.txt", content = "actual authorized WRITE_LOW fs.write";
  const sentinel = join(f.workspace, relativePath);
  const response = await request(f, "/toolhub/intent", "POST", { "x-amc-lease": leaseToken }, {
    agentId: A, toolName: "fs.write", args: { path: relativePath, content }, requestedMode: "EXECUTE"
  });
  expect(response.status, response.body).toBe(200);
  const intent = JSON.parse(response.body) as ToolIntentResponse;
  expect(intent).toMatchObject({ allowed: true, effectiveMode: "EXECUTE", approvalRequired: true });
  const approvalId = intent.approvalRequestId!;
  decideApprovalForIntent({ workspace: f.workspace, agentId: A, approvalId, decision: "APPROVED", mode: "EXECUTE",
    reason: "Approve the private token-scope fixture output", userId: f.owner.userId, username: f.owner.username,
    userRoles: f.owner.roles });
  expect(existsSync(sentinel)).toBe(false);
  return { sentinel, content, approvalId, body: { intentId: intent.intentId, approvalRequestId: approvalId } };
}
function approvalStatus(f: Fixture, approvalId: string) {
  return getApprovalInboxItem({ workspace: f.workspace, agentId: A, approvalRequestId: approvalId }).status;
}
const ALL_LEASE: LeaseScope[] = ["toolhub:intent", "toolhub:execute", "governor:check", "receipt:verify"];

describe("agent token scopes come from the signed action policy, not a constant", () => {
  it("omits toolhub:execute when no signed rule allows execute and records the granting policy", () => {
    const workspace = workspaceFixture(policyAllowingExecuteFor([]));
    const issued = ensureAgentToken(workspace, A);
    expect(issued.scopes).toEqual(READ_SCOPES);
    expect(issued.executeActionClasses).toEqual([]);
    const meta = JSON.parse(readFileSync(studioAgentTokenMetaPath(workspace, A), "utf8")) as Record<string, unknown>;
    expect(meta).toMatchObject({ v: 2, agentId: A, scopes: READ_SCOPES, executeActionClasses: [],
      grantedBy: { kind: "action-policy", path: actionPolicyPath(workspace), sigPath: actionPolicySigPath(workspace) } });
  });

  it("grants execute only for the action classes the signed policy allows", () => {
    const workspace = workspaceFixture(policyAllowingExecuteFor(["READ_ONLY", "WRITE_LOW"]));
    const issued = ensureAgentToken(workspace, A);
    expect(issued.scopes).toEqual([...READ_SCOPES, "toolhub:execute"]);
    expect(issued.executeActionClasses).toEqual(["READ_ONLY", "WRITE_LOW"]);
    expect(readAgentToken(workspace, A)).toMatchObject({ token: issued.token, executeActionClasses: ["READ_ONLY", "WRITE_LOW"] });
  });

  it("refuses to mint a token under an unsigned policy and names the file that refused", () => {
    const workspace = workspaceFixture(policyAllowingExecuteFor(["WRITE_LOW"]));
    rmSync(actionPolicySigPath(workspace));
    expect(() => ensureAgentToken(workspace, A)).toThrow(actionPolicyPath(workspace));
    expect(() => ensureAgentToken(workspace, A)).toThrow(/signature missing/);
    expect(existsSync(studioAgentTokenPath(workspace, A))).toBe(false);
    expect(existsSync(studioAgentTokenMetaPath(workspace, A))).toBe(false);
  });

  it("never widens an already issued token when the live policy later widens", () => {
    const workspace = workspaceFixture(policyAllowingExecuteFor([]));
    const narrow = ensureAgentToken(workspace, A);
    initActionPolicy(workspace, policyAllowingExecuteFor(["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"]));
    signActionPolicy(workspace);
    expect(agentTokenGrantFromActionPolicy(workspace).executeActionClasses).toEqual(["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"]);
    const again = ensureAgentToken(workspace, A);
    expect(again.token).toBe(narrow.token);
    expect(again.scopes).toEqual(READ_SCOPES);
    expect(again.executeActionClasses).toEqual([]);
    const rotated = issueAgentToken(workspace, A, { scopes: [...READ_SCOPES, "toolhub:execute"], executeActionClasses: ["WRITE_LOW"],
      grantedBy: { kind: "operator", reason: "fixture re-issue" } });
    expect(rotated.token).not.toBe(narrow.token);
    expect(readAgentToken(workspace, A)).toMatchObject({ token: rotated.token, executeActionClasses: ["WRITE_LOW"] });
  });

  it("derives a lease-backed grant from the lease's own scopes and names why classes fall back to the policy", () => {
    const workspace = workspaceFixture(policyAllowingExecuteFor(["WRITE_LOW"]));
    const readOnly = lease(workspace, ["toolhub:intent", "receipt:verify"]);
    const narrow = agentTokenGrantFromLease(workspace, readOnly.payload);
    expect(narrow.scopes).toEqual(["toolhub:intent", "receipt:verify"]);
    expect(narrow.executeActionClasses).toEqual([]);
    expect(narrow.grantedBy).toMatchObject({ kind: "lease", leaseId: readOnly.payload.leaseId });
    const full = agentTokenGrantFromLease(workspace, lease(workspace, ALL_LEASE).payload);
    expect(full.executeActionClasses).toEqual(["WRITE_LOW"]);
    expect(full.grantedBy).toMatchObject({ kind: "lease", executeClassesFrom: "action-policy" });
    expect(String((full.grantedBy as { reason?: string }).reason)).toContain("the lease names no execute classes");
  });

  it("reads a legacy scopes-only meta as granting no execute action class", () => {
    const workspace = workspaceFixture(policyAllowingExecuteFor(["WRITE_LOW"]));
    const issued = ensureAgentToken(workspace, A);
    writeFileSync(studioAgentTokenMetaPath(workspace, A), JSON.stringify({ agentId: A, scopes: [...READ_SCOPES, "toolhub:execute"] }), "utf8");
    const legacy = readAgentToken(workspace, A);
    expect(legacy.token).toBe(issued.token);
    expect(legacy.scopes).toEqual([...READ_SCOPES, "toolhub:execute"]);
    expect(legacy.executeActionClasses).toEqual([]);
    expect(legacy.grantedBy).toMatchObject({ kind: "legacy-unconditional" });
  });
});

describe("Studio enforces the token's execute action classes at /toolhub/execute", () => {
  it("refuses a WRITE_LOW execute from a token whose grant stops at READ_ONLY, naming the grant and how to widen it", async () => {
    // Live policy allows WRITE_LOW execute, so the governor alone would allow this
    // write. Only the token's narrower grant refuses it.
    const f = await serverFixture(policyAllowingExecuteFor(["READ_ONLY", "WRITE_LOW"]));
    const token = issueAgentToken(f.workspace, A, { scopes: [...READ_SCOPES, "toolhub:execute"], executeActionClasses: ["READ_ONLY"],
      grantedBy: { kind: "operator", reason: "read-only child" } });
    const grant = lease(f.workspace, ALL_LEASE);
    const prepared = await approvedWriteLow(f, grant.token);
    const refused = await request(f, "/toolhub/execute", "POST", { "x-amc-agent-token": token.token, "x-amc-lease": grant.token }, prepared.body);
    expect(refused.status, refused.body).toBe(403);
    const body = JSON.parse(refused.body) as { error: string; refusedBy: Record<string, unknown>; widen: string };
    expect(body.error).toContain("toolhub:execute does not cover action class WRITE_LOW");
    expect(body.refusedBy).toMatchObject({ kind: "agent-token", metaPath: studioAgentTokenMetaPath(f.workspace, A),
      executeActionClasses: ["READ_ONLY"], grantedBy: { kind: "operator" } });
    expect(body.widen).toContain(actionPolicyPath(f.workspace));
    expect(body.widen).toContain(studioAgentTokenPath(f.workspace, A));
    expect(existsSync(prepared.sentinel)).toBe(false);
    expect(approvalStatus(f, prepared.approvalId)).toBe("QUORUM_MET");

    const widened = issueAgentToken(f.workspace, A, { scopes: [...READ_SCOPES, "toolhub:execute"], executeActionClasses: ["READ_ONLY", "WRITE_LOW"],
      grantedBy: { kind: "operator", reason: "widened child" } });
    const accepted = await request(f, "/toolhub/execute", "POST", { "x-amc-agent-token": widened.token, "x-amc-lease": grant.token }, prepared.body);
    expect(accepted.status, accepted.body).toBe(200);
    expect(readFileSync(prepared.sentinel, "utf8")).toBe(prepared.content);
    expect(approvalStatus(f, prepared.approvalId)).toBe("CONSUMED");
  }, 45_000);

  it("names the signed action policy when a policy-derived token lacks toolhub:execute", async () => {
    const f = await serverFixture(policyAllowingExecuteFor([]));
    const token = ensureAgentToken(f.workspace, A);
    expect(token.scopes).not.toContain("toolhub:execute");
    const refused = await request(f, "/toolhub/execute", "POST", { "x-amc-agent-token": token.token }, { intentId: "missing" });
    expect(refused.status, refused.body).toBe(403);
    const body = JSON.parse(refused.body) as { error: string; refusedBy: Record<string, unknown>; widen: string };
    expect(body.error).toBe("missing scope toolhub:execute");
    expect(body.refusedBy).toMatchObject({ kind: "agent-token", scopes: READ_SCOPES,
      grantedBy: { kind: "action-policy", path: actionPolicyPath(f.workspace) } });
    expect(body.widen).toContain("allowExecute");
    expect(body.widen).toContain(actionPolicyPath(f.workspace));
  }, 45_000);

  it("keeps a lease-only execute governed by the live signed policy and says so", async () => {
    // Boundary, not a guard: this lease names no executeActionClasses, so a
    // lease-only WRITE_LOW execute is decided by the governor's
    // action-policy-execute condition alone.
    const f = await serverFixture(policyAllowingExecuteFor(["READ_ONLY", "WRITE_LOW"]));
    const grant = lease(f.workspace, ALL_LEASE);
    const prepared = await approvedWriteLow(f, grant.token);
    const accepted = await request(f, "/toolhub/execute", "POST", { "x-amc-lease": grant.token }, prepared.body);
    expect(accepted.status, accepted.body).toBe(200);
    expect(readFileSync(prepared.sentinel, "utf8")).toBe(prepared.content);
  }, 45_000);

  it("lists agents without minting a token when the action policy is unsigned", async () => {
    const f = await serverFixture(policyAllowingExecuteFor(["WRITE_LOW"]));
    rmSync(actionPolicySigPath(f.workspace));
    const listed = await request(f, "/agents", "GET", { cookie: f.cookie });
    expect(listed.status, listed.body).toBe(200);
    const agents = (JSON.parse(listed.body) as { agents: Array<Record<string, unknown>> }).agents;
    expect(agents.map(agent => agent.id), listed.body).toContain(C);
    const row = agents.find(agent => agent.id === C)!;
    expect(row.agentTokenScopes).toEqual([]);
    expect(String(row.agentTokenRefusal)).toContain(actionPolicyPath(f.workspace));
    expect(existsSync(studioAgentTokenPath(f.workspace, C))).toBe(false);
  }, 45_000);
});

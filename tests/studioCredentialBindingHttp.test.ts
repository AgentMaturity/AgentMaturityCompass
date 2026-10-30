import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { defaultActionPolicy, initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { getApprovalInboxItem } from "../src/approvals/approvalInbox.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { initUsersConfig } from "../src/auth/authApi.js";
import { buildAgentConfig, initFleet, scaffoldAgent } from "../src/fleet/registry.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { ensureLeaseRevocationStore } from "../src/leases/leaseCli.js";
import type { LeaseScope } from "../src/leases/leaseSchema.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { ensureAgentToken } from "../src/studio/studioState.js";
import type { ToolExecutionResponse, ToolIntentResponse } from "../src/toolhub/toolhubServer.js";
import type { DiagnosticReport } from "../src/types.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";

// P0-30 HTTP regressions for AMC-1546 against a real Studio on 127.0.0.1:0 with a
// temporary workspace. Leases, approvals, ToolHub and fs.write are real; the one
// governor control input below is explicitly synthetic fixture data.
const A = "default", B = "credential-http-agent-b";
const ALL_SCOPES: LeaseScope[] = ["toolhub:intent", "toolhub:execute", "governor:check", "receipt:verify"];
const roots: string[] = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const server of servers.splice(0)) {
    try { await server.close(); } catch (error) { errors.push(error); }
  }
  for (const root of roots.splice(0)) {
    try { lockVault(root); rmSync(root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  }
  vi.unstubAllEnvs();
  if (errors.length > 0) throw new AggregateError(errors, "credential-binding-http cleanup failed");
});

async function fixture() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "credential-binding-http-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-credential-binding-http-")));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: A, trustBoundaryMode: "isolated" });
  writeRuntimeFirewallPolicy({ workspace: workspace, mode: "observe" }); // AXR-01: ToolHub and hook control apply the runtime firewall as the native pipeline does; unsigned, it blocks every call.
  initFleet(workspace, { orgName: "Credential binding HTTP fixture" });
  for (const agentId of [A, B]) {
    scaffoldAgent(workspace, buildAgentConfig({
      agentId, agentName: `Credential binding HTTP ${agentId}`, role: "fixture",
      domain: "credential authorization", primaryTasks: ["local governed file operations"],
      stakeholders: ["fixture-owner"], riskTier: "med", templateId: "openai",
      baseUrl: "http://127.0.0.1:1", routePrefix: "/fixture", auth: { type: "none" }
    }));
  }
  initBudgets(workspace, A); initToolsConfig(workspace); initApprovalPolicy(workspace);
  // Isolate credential authorization from maturity gates; WRITE_LOW approval stays.
  const policy = defaultActionPolicy();
  policy.riskTierDefaults.medium.requireSandboxForExecute = false;
  policy.actions = policy.actions.map(rule => rule.actionClass === "READ_ONLY" || rule.actionClass === "WRITE_LOW"
    ? { ...rule, minEffectiveQuestionLevels: {}, requireAssurancePacks: {}, requireTrustTierAtLeast: "SELF_REPORTED",
        allowExecute: true, requireExecTicket: false }
    : rule);
  initActionPolicy(workspace, policy);
  expect(ensureLeaseRevocationStore(workspace).signatureValid).toBe(true);
  const owner = initUsersConfig({ workspace, username: "fixture-owner", password: "fixture-owner-password" }).owner;
  const tokens = { [A]: ensureAgentToken(workspace, A).token, [B]: ensureAgentToken(workspace, B).token };
  mkdirSync(join(workspace, "workspace", "output"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "reference.txt"), "credential fixture input", "utf8");
  const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "credential-http-admin" });
  servers.push(server);
  return { workspace, server, tokens, owner };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function lease(f: Fixture, agentId: string, scopes: LeaseScope[] = ALL_SCOPES) {
  return issueLeaseToken({ workspace: f.workspace, workspaceId: workspaceIdFromDirectory(f.workspace), agentId,
    ttlMs: 60_000, scopes, routeAllowlist: ["/"], modelAllowlist: ["*"],
    maxRequestsPerMinute: 1000, maxTokensPerMinute: 1_000_000, maxCostUsdPerDay: null });
}

function request(f: Fixture, path: string, method: "GET" | "POST", headers: Record<string, string>, body?: unknown) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(new URL(path, f.server.url), { method, headers: { ...headers, connection: "close",
      "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error("credential-binding-http request timed out")));
    req.on("error", reject); req.end(payload);
  });
}

async function approvedWrite(f: Fixture, agentId: string) {
  // SYNTHETIC CONTROL INPUT, not a measurement: without any run on disk ToolHub
  // downgrades EXECUTE to SIMULATE and the write path would never be reachable.
  const now = Date.now(), runsDir = getAgentPaths(f.workspace, agentId).runsDir;
  const report: Partial<DiagnosticReport> & { fixtureKind: string } = {
    fixtureKind: "SYNTHETIC_CREDENTIAL_AUTHORIZATION_CONTROL_INPUT_NOT_A_MEASUREMENT",
    agentId, runId: "synthetic-credential-binding-http-control", ts: now, windowStartTs: now - 1000, windowEndTs: now,
    integrityIndex: 1, trustLabel: "HIGH TRUST", correlationRatio: 0, questionScores: [],
    evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 1 }
  };
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, "synthetic-credential-binding-http-control.json"), JSON.stringify(report), "utf8");
  const grant = lease(f, agentId), relativePath = `workspace/output/${agentId}-sentinel.txt`;
  const content = `authorized fs.write for ${agentId}`;
  const response = await request(f, "/toolhub/intent", "POST", { "x-amc-lease": grant.token },
    { agentId, toolName: "fs.write", args: { path: relativePath, content }, requestedMode: "EXECUTE" });
  expect(response.status, response.body).toBe(200);
  const intent = JSON.parse(response.body) as ToolIntentResponse;
  expect(intent).toMatchObject({ allowed: true, effectiveMode: "EXECUTE", approvalRequired: true });
  const approvalId = intent.approvalRequestId!;
  decideApprovalForIntent({ workspace: f.workspace, agentId, approvalId, decision: "APPROVED", mode: "EXECUTE",
    reason: "Approve the private credential-binding HTTP fixture output", userId: f.owner.userId,
    username: f.owner.username, userRoles: f.owner.roles });
  const sentinel = join(f.workspace, relativePath);
  expect(existsSync(sentinel)).toBe(false);
  return { grant, sentinel, content, approvalId, body: { intentId: intent.intentId, approvalRequestId: approvalId } };
}

describe("Studio credential binding over loopback HTTP (P0-30)", () => {
  it("refuses A's static token plus B's lease before B's approved fs.write writes anything", async () => {
    const f = await fixture(), prepared = await approvedWrite(f, B);
    const refused = await request(f, "/toolhub/execute", "POST",
      { "x-amc-agent-token": f.tokens[A]!, "x-amc-lease": prepared.grant.token }, prepared.body);
    // Exactly 401: identity binding must refuse at authentication. A 403 here would
    // come from the route's later intent-agent check, i.e. the binding did not run.
    expect(refused.status, refused.body).toBe(401);
    expect(existsSync(prepared.sentinel)).toBe(false);
    expect(getApprovalInboxItem({ workspace: f.workspace, agentId: B, approvalRequestId: prepared.approvalId }).status)
      .toBe("QUORUM_MET");
    // The same request with B's own credentials writes, so the absence above is not vacuous.
    const accepted = await request(f, "/toolhub/execute", "POST",
      { "x-amc-agent-token": f.tokens[B]!, "x-amc-lease": prepared.grant.token }, prepared.body);
    expect(accepted.status, accepted.body).toBe(200);
    expect(JSON.parse(accepted.body) as ToolExecutionResponse).toMatchObject({ allowed: true, effectiveMode: "EXECUTE", agentId: B });
    expect(readFileSync(prepared.sentinel, "utf8")).toBe(prepared.content);
  }, 45_000);

  it("narrows A's static token to a receipt:verify-only lease: only the narrower scope works", async () => {
    const f = await fixture(), full = lease(f, A);
    const intentRes = await request(f, "/toolhub/intent", "POST", { "x-amc-lease": full.token },
      { agentId: A, toolName: "fs.read", args: { path: "workspace/reference.txt" }, requestedMode: "SIMULATE" });
    expect(intentRes.status, intentRes.body).toBe(200);
    const executed = await request(f, "/toolhub/execute", "POST", { "x-amc-lease": full.token },
      { intentId: (JSON.parse(intentRes.body) as ToolIntentResponse).intentId });
    expect(executed.status, executed.body).toBe(200);
    const receipt = (JSON.parse(executed.body) as ToolExecutionResponse).resultReceipt;
    expect(receipt).toEqual(expect.any(String));

    const staticOnly = { "x-amc-agent-token": f.tokens[A]! };
    expect((await request(f, "/toolhub/tools", "GET", staticOnly)).status).toBe(200);
    const narrowed = { ...staticOnly, "x-amc-lease": lease(f, A, ["receipt:verify"]).token };
    const tools = await request(f, "/toolhub/tools", "GET", narrowed);
    expect(tools.status, tools.body).toBe(403);
    const verified = await request(f, "/verify/receipt", "POST", narrowed, { receipt });
    expect(verified.status, verified.body).toBe(200);
  }, 45_000);
});

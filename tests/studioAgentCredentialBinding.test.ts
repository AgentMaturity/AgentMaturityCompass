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
import { initUsersConfig, createSession } from "../src/auth/authApi.js";
import { scaffoldAgent, loadAgentConfig } from "../src/fleet/registry.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { revokeLease } from "../src/leases/leaseStore.js";
import { ensureLeaseRevocationStore } from "../src/leases/leaseCli.js";
import type { LeaseScope } from "../src/leases/leaseSchema.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { ensureAgentToken } from "../src/studio/studioState.js";
import type { ToolExecutionResponse, ToolIntentResponse } from "../src/toolhub/toolhubServer.js";
import type { DiagnosticReport } from "../src/types.js";

// Author-only HTTP regressions for AMC-1546. No execution result is claimed here.
// Authentication, leases, signatures, ToolHub, approvals, receipts and fs.write are
// real temporary-workspace implementations. The explicitly marked diagnostic
// control input below is synthetic fixture data, never measured agent maturity.
const A = "default", B = "credential-agent-b";
const ADMIN = "credential-binding-fixture-admin";
const ALL_SCOPES: LeaseScope[] = ["toolhub:intent", "toolhub:execute", "governor:check", "receipt:verify"];
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
  if (errors.length > 0) throw new AggregateError(errors, "credential-binding fixture cleanup failed");
});

async function fixture() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "credential-binding-fixture-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-agent-credential-binding-")));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: A, trustBoundaryMode: "isolated" });
  scaffoldAgent(workspace, { ...loadAgentConfig(workspace, A), id: B, agentName: "Credential binding fixture B" });
  // The signed default budget also covers B through budgetForAgent's fallback.
  initBudgets(workspace, A);
  initToolsConfig(workspace); initApprovalPolicy(workspace);
  const policy = defaultActionPolicy();
  // This signed fixture policy isolates credential authorization from maturity
  // requirements. Default filesystem bounds and WRITE_LOW approval stay intact.
  policy.riskTierDefaults.medium.requireSandboxForExecute = false;
  policy.actions = policy.actions.map(rule => rule.actionClass === "READ_ONLY" || rule.actionClass === "WRITE_LOW"
    ? { ...rule, minEffectiveQuestionLevels: {}, requireAssurancePacks: {}, requireTrustTierAtLeast: "SELF_REPORTED",
        allowExecute: true, requireExecTicket: false }
    : rule);
  initActionPolicy(workspace, policy);
  expect(ensureLeaseRevocationStore(workspace).signatureValid).toBe(true);
  const owner = initUsersConfig({ workspace, username: "fixture-owner", password: "fixture-owner-password" }).owner;
  const human = createSession({ workspace, user: owner });
  const tokens = { [A]: ensureAgentToken(workspace, A).token, [B]: ensureAgentToken(workspace, B).token };
  mkdirSync(join(workspace, "workspace", "output"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "reference.txt"), "credential fixture input", "utf8");
  const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: ADMIN });
  servers.push(server);
  return { workspace, server, tokens, owner, cookie: `amc_session=${human.token}` };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function lease(f: Fixture, agentId: string, scopes: LeaseScope[] = ALL_SCOPES) {
  return issueLeaseToken({ workspace: f.workspace, workspaceId: workspaceIdFromDirectory(f.workspace), agentId,
    ttlMs: 60_000, scopes, routeAllowlist: ["/"], modelAllowlist: ["*"],
    maxRequestsPerMinute: 1000, maxTokensPerMinute: 1_000_000, maxCostUsdPerDay: null });
}
function credentials(f: Fixture, agentId: string, token: string): Record<string, string> {
  return { "x-amc-agent-token": f.tokens[agentId]!, "x-amc-lease": token };
}
interface Response { status: number; body: string }
function request(f: Fixture, path: string, method: "GET" | "POST", headers: Record<string, string> = {}, body?: unknown,
  rawExtraHeaders: Array<[string, string]> = []): Promise<Response> {
  const target = new URL(path, f.server.url), payload = body === undefined ? "" : JSON.stringify(body);
  // Raw header pairs retain duplicate Authorization lines instead of letting the
  // client normalize them away. The server must inspect IncomingMessage.rawHeaders.
  const rawHeaders = [
    ["Host", target.host], ["Connection", "close"], ["Content-Type", "application/json"],
    ["Content-Length", String(Buffer.byteLength(payload))], ...Object.entries(headers), ...rawExtraHeaders
  ].flat();
  return new Promise((resolve, reject) => {
    const req = httpRequest(target, { method, headers: rawHeaders }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error("credential-binding request timed out")));
    req.on("error", reject); req.end(payload);
  });
}
function executionRows(f: Fixture) {
  const ledger = openLedger(f.workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(row => row.event_type === "tool_action" || row.event_type === "tool_result"); }
  finally { ledger.close(); }
}
function approvalState(f: Fixture, agentId: string, approvalId: string) {
  return getApprovalInboxItem({ workspace: f.workspace, agentId, approvalRequestId: approvalId });
}
function syntheticGovernorControlInput(f: Fixture, agentId: string): void {
  // A synthetic CONTROL INPUT, not the result of a diagnostic, model, study, or
  // maturity measurement. ToolHub otherwise always simulates a workspace with
  // no diagnostic input, hiding whether the HTTP authorization guard ran early.
  // No production control or executor is mocked, and the fixture stays private.
  const now = Date.now();
  const report: Partial<DiagnosticReport> & { fixtureKind: string } = {
    fixtureKind: "SYNTHETIC_CREDENTIAL_AUTHORIZATION_CONTROL_INPUT_NOT_A_MEASUREMENT",
    agentId, runId: "synthetic-credential-binding-control", ts: now,
    windowStartTs: now - 1000, windowEndTs: now, integrityIndex: 1, trustLabel: "HIGH TRUST",
    correlationRatio: 0, questionScores: [], evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 1 }
  };
  const runsDir = getAgentPaths(f.workspace, agentId).runsDir;
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, "synthetic-credential-binding-control.json"), JSON.stringify(report), "utf8");
}
async function approvedWrite(f: Fixture, agentId = B) {
  syntheticGovernorControlInput(f, agentId);
  const grant = lease(f, agentId), relativePath = `workspace/output/${agentId}-sentinel.txt`;
  const sentinel = join(f.workspace, relativePath), content = `actual authorized fs.write for ${agentId}`;
  const response = await request(f, "/toolhub/intent", "POST", { "x-amc-lease": grant.token }, {
    agentId, toolName: "fs.write", args: { path: relativePath, content }, requestedMode: "EXECUTE"
  });
  expect(response.status, response.body).toBe(200);
  const intent = JSON.parse(response.body) as ToolIntentResponse;
  expect(intent).toMatchObject({ allowed: true, effectiveMode: "EXECUTE", approvalRequired: true });
  expect(intent.approvalRequestId).toEqual(expect.any(String));
  const approvalId = intent.approvalRequestId!;
  decideApprovalForIntent({ workspace: f.workspace, agentId, approvalId, decision: "APPROVED", mode: "EXECUTE",
    reason: "Approve the private credential-binding fixture output", userId: f.owner.userId,
    username: f.owner.username, userRoles: f.owner.roles });
  expect(approvalState(f, agentId, approvalId)).toMatchObject({ status: "QUORUM_MET", executionReady: true,
    requestIntegrity: { valid: true }, chainIntegrity: { valid: true }, contextIntegrity: { valid: true } });
  expect(existsSync(sentinel)).toBe(false);
  return { agentId, grant, sentinel, content, intent, approvalId, body: { intentId: intent.intentId, approvalRequestId: approvalId } };
}
async function assertRealExecution(f: Fixture, prepared: Awaited<ReturnType<typeof approvedWrite>>, headers: Record<string, string>) {
  const response = await request(f, "/toolhub/execute", "POST", headers, prepared.body);
  expect(response.status, response.body).toBe(200);
  const execution = JSON.parse(response.body) as ToolExecutionResponse;
  expect(execution).toMatchObject({ allowed: true, effectiveMode: "EXECUTE", agentId: prepared.agentId });
  expect(readFileSync(prepared.sentinel, "utf8")).toBe(prepared.content);
  expect(approvalState(f, prepared.agentId, prepared.approvalId).status).toBe("CONSUMED");
  const matching = executionRows(f).filter(row => JSON.parse(row.meta_json).agentId === prepared.agentId);
  expect(matching.map(row => row.event_type)).toEqual(["tool_action", "tool_result"]);
  expect(typeof execution.resultReceipt).toBe("string");
  return execution;
}
async function seedRead(f: Fixture, agentId = A) {
  const grant = lease(f, agentId);
  const requested = await request(f, "/toolhub/intent", "POST", { "x-amc-lease": grant.token }, {
    agentId, toolName: "fs.read", args: { path: "workspace/reference.txt" }, requestedMode: "SIMULATE"
  });
  expect(requested.status, requested.body).toBe(200);
  const intent = JSON.parse(requested.body) as ToolIntentResponse;
  expect(intent).toMatchObject({ allowed: true, effectiveMode: "SIMULATE" });
  const response = await request(f, "/toolhub/execute", "POST", { "x-amc-lease": grant.token }, { intentId: intent.intentId });
  expect(response.status, response.body).toBe(200);
  const execution = JSON.parse(response.body) as ToolExecutionResponse;
  expect(execution).toMatchObject({ agentId, allowed: true, effectiveMode: "SIMULATE" });
  expect(execution.resultReceipt).toEqual(expect.any(String));
  return execution;
}
function readSurfaces(execution: ToolExecutionResponse) {
  return [
    { path: "/toolhub/tools", method: "GET" as const, body: undefined },
    { path: "/governor/check", method: "POST" as const, body: { agentId: A, actionClass: "READ_ONLY", mode: "SIMULATE" } },
    { path: "/verify/receipt", method: "POST" as const, body: { receipt: execution.resultReceipt } },
    { path: `/toolhub/executions/${execution.executionId}`, method: "GET" as const, body: undefined }
  ];
}

// Endpoint behavior is exercised over actual loopback HTTP, never an injected
// authenticate() or mocked ToolHub. These are tests, not installed/browser proof.
describe("Studio binds agent identity before ToolHub execution", () => {
  it("refuses A's static token with B's lease before fs.write, receipt creation or approval consumption", async () => {
    const f = await fixture(), prepared = await approvedWrite(f);
    const before = executionRows(f), beforeApproval = approvalState(f, B, prepared.approvalId);
    const refused = await request(f, "/toolhub/execute", "POST", credentials(f, A, prepared.grant.token), prepared.body);
    expect(refused.status, refused.body).toBe(401);
    expect(existsSync(prepared.sentinel), "403 after execution would be too late").toBe(false);
    expect(executionRows(f)).toEqual(before);
    expect(approvalState(f, B, prepared.approvalId)).toEqual(beforeApproval);
    // The exact intent and one-time approval remain usable by the correct agent.
    await assertRealExecution(f, prepared, credentials(f, B, prepared.grant.token));
  }, 45_000);

  it("accepts matching Authorization bearer and lease with a real one-time approved write", async () => {
    const f = await fixture(), prepared = await approvedWrite(f, A);
    await assertRealExecution(f, prepared, { authorization: `Bearer ${f.tokens[A]}`, "x-amc-lease": prepared.grant.token });
    const repeated = await request(f, "/toolhub/execute", "POST", credentials(f, A, prepared.grant.token), prepared.body);
    expect(repeated.status).toBe(200);
    expect(JSON.parse(repeated.body)).toMatchObject({ allowed: false, result: { auditType: "APPROVAL_REPLAY_ATTEMPTED" } });
    expect(readFileSync(prepared.sentinel, "utf8")).toBe(prepared.content);
  }, 45_000);

  it("retains lease-only execution and rejects a mismatched lease before any tool effect", async () => {
    const f = await fixture(), prepared = await approvedWrite(f), other = lease(f, A);
    const before = executionRows(f);
    const refused = await request(f, "/toolhub/execute", "POST", { "x-amc-lease": other.token }, prepared.body);
    expect(refused.status, refused.body).toBe(403);
    expect(existsSync(prepared.sentinel)).toBe(false); expect(executionRows(f)).toEqual(before);
    expect(approvalState(f, B, prepared.approvalId).status).toBe("QUORUM_MET");
    await assertRealExecution(f, prepared, { "x-amc-lease": prepared.grant.token });
  }, 45_000);

  it("does not let a static token replace the existing required execution lease", async () => {
    const f = await fixture(), prepared = await approvedWrite(f, A), before = executionRows(f);
    const missing = await request(f, "/toolhub/execute", "POST", { "x-amc-agent-token": f.tokens[A]! }, prepared.body);
    expect(missing.status).toBe(401); expect(missing.body).toContain("missing lease token");
    const narrow = lease(f, A, ["toolhub:intent"]);
    const refused = await request(f, "/toolhub/execute", "POST", credentials(f, A, narrow.token), prepared.body);
    expect(refused.status).toBe(403);
    expect(executionRows(f)).toEqual(before); expect(existsSync(prepared.sentinel)).toBe(false);
    expect(approvalState(f, A, prepared.approvalId).status).toBe("QUORUM_MET");
    await assertRealExecution(f, prepared, credentials(f, A, prepared.grant.token));
  }, 45_000);
});

describe("all supplied credential scopes and validity constraints bind", () => {
  it("intersects the static token and narrower lease on every scope-only endpoint", async () => {
    const f = await fixture(), execution = await seedRead(f), narrow = lease(f, A, ["gateway:llm"]);
    for (const route of readSurfaces(execution)) {
      const baseline = await request(f, route.path, route.method, { "x-amc-agent-token": f.tokens[A]! }, route.body);
      expect(baseline.status, `${route.path}: ${baseline.body}`).toBe(200);
      const refused = await request(f, route.path, route.method, credentials(f, A, narrow.token), route.body);
      expect(refused.status, `${route.path}: ${refused.body}`).toBe(403);
      expect(refused.body).toContain("scope");
    }
    const receiptOnly = lease(f, A, ["receipt:verify"]);
    expect((await request(f, "/verify/receipt", "POST", credentials(f, A, receiptOnly.token), { receipt: execution.resultReceipt })).status).toBe(200);
    expect((await request(f, "/toolhub/tools", "GET", credentials(f, A, receiptOnly.token))).status).toBe(403);
  }, 45_000);

  it.each(["x-amc-lease", "x-api-key", "x-goog-api-key", "api-key", "authorization"] as const)(
    "does not ignore a narrower lease in %s beside a static identity", async carrier => {
      const f = await fixture(), narrow = lease(f, A, ["receipt:verify"]);
      const headers = { "x-amc-agent-token": f.tokens[A]!, [carrier]: carrier === "authorization" ? `Bearer ${narrow.token}` : narrow.token };
      const refused = await request(f, "/toolhub/tools", "GET", headers);
      expect(refused.status, refused.body).toBe(403);
      const full = lease(f, A);
      const accepted = await request(f, "/toolhub/tools", "GET", {
        "x-amc-agent-token": f.tokens[A]!, [carrier]: carrier === "authorization" ? `Bearer ${full.token}` : full.token
      });
      expect(accepted.status, accepted.body).toBe(200);
    }, 45_000);

  it("intersects multiple valid lease carriers rather than accepting the first carrier's wider scope", async () => {
    const f = await fixture(), full = lease(f, A), narrow = lease(f, A, ["receipt:verify"]);
    const pairs: Record<string, string>[] = [
      { "x-amc-lease": full.token, "x-api-key": narrow.token },
      { "x-amc-lease": narrow.token, "x-api-key": full.token },
      { "x-amc-lease": full.token, authorization: `Bearer ${narrow.token}` }
    ];
    for (const headerPair of pairs) {
      const response = await request(f, "/toolhub/tools", "GET", { "x-amc-agent-token": f.tokens[A]!, ...headerPair });
      expect(response.status, response.body).toBe(403);
    }
  }, 45_000);

  it("rejects revoked supplied leases on all scope-only routes while preserving static-only compatibility", async () => {
    const f = await fixture(), execution = await seedRead(f), revoked = lease(f, A);
    revokeLease(f.workspace, revoked.payload.leaseId, "credential binding fixture revocation");
    for (const route of readSurfaces(execution)) {
      const refused = await request(f, route.path, route.method, credentials(f, A, revoked.token), route.body);
      expect(refused.status, `${route.path}: ${refused.body}`).toBe(401);
      const legacy = await request(f, route.path, route.method, { authorization: `Bearer ${f.tokens[A]}` }, route.body);
      expect(legacy.status, `${route.path}: ${legacy.body}`).toBe(200);
    }
  }, 45_000);

  it("does not let another valid lease hide a revoked or invalid lower-priority carrier", async () => {
    const f = await fixture(), full = lease(f, A), revoked = lease(f, A), other = lease(f, B);
    revokeLease(f.workspace, revoked.payload.leaseId, "revoked secondary carrier");
    const [body, signature] = full.token.split(".");
    const badSignature = `${body}.${signature![0] === "A" ? "B" : "A"}${signature!.slice(1)}`;
    for (const secondary of [revoked.token, badSignature, "not-a-lease", other.token]) {
      const response = await request(f, "/toolhub/tools", "GET", {
        "x-amc-agent-token": f.tokens[A]!, "x-amc-lease": full.token, "x-api-key": secondary
      });
      expect(response.status, response.body).toBe(401);
    }
  }, 45_000);

  it("rejects malformed, empty and conflicting credentials without static-token fallback", async () => {
    const f = await fixture(), full = lease(f, A);
    const invalid: Record<string, string>[] = [
      { "x-amc-agent-token": f.tokens[A]!, "x-amc-lease": "" },
      { "x-amc-agent-token": f.tokens[A]!, "x-amc-lease": "malformed" },
      { "x-amc-agent-token": f.tokens[A]!, authorization: "Basic fixture" },
      { "x-amc-agent-token": f.tokens[A]!, authorization: "Bearer unknown-token" },
      { "x-amc-agent-token": f.tokens[A]!, authorization: `Bearer ${f.tokens[B]}` },
      { "x-amc-agent-token": "unknown-token", "x-amc-lease": full.token },
      { "x-amc-agent-token": "", "x-amc-lease": full.token }
    ];
    for (const headers of invalid) {
      const response = await request(f, "/toolhub/tools", "GET", headers);
      expect(response.status, response.body).toBe(401);
    }
  }, 45_000);

  it("refuses a disabled query carrier even when a valid static token is present", async () => {
    const f = await fixture(), narrow = lease(f, A, ["receipt:verify"]);
    const response = await request(f, `/toolhub/tools?amc_lease=${encodeURIComponent(narrow.token)}`, "GET", { "x-amc-agent-token": f.tokens[A]! });
    expect(response.status, response.body).toBe(401);
  }, 45_000);
});

describe("raw duplicate carrier lines cannot disappear during HTTP normalization", () => {
  it("rejects duplicate Authorization before a valid static token hides a revoked lease", async () => {
    const f = await fixture(), revoked = lease(f, A);
    revokeLease(f.workspace, revoked.payload.leaseId, "duplicate authorization fixture");
    for (const pair of [
      [["Authorization", `Bearer ${f.tokens[A]}`], ["authorization", `Bearer ${revoked.token}`]],
      [["authorization", `Bearer ${revoked.token}`], ["Authorization", `Bearer ${f.tokens[A]}`]]
    ] as Array<Array<[string, string]>>) {
      const response = await request(f, "/toolhub/tools", "GET", {}, undefined, pair);
      expect(response.status, response.body).toBe(401);
    }
  }, 45_000);

  it("rejects duplicate Authorization before a narrower lease can be dropped and a real write dispatched", async () => {
    const f = await fixture(), prepared = await approvedWrite(f, A), narrow = lease(f, A, ["receipt:verify"]);
    const before = executionRows(f), beforeApproval = approvalState(f, A, prepared.approvalId);
    const response = await request(f, "/toolhub/execute", "POST", { "x-amc-lease": prepared.grant.token }, prepared.body, [
      ["Authorization", `Bearer ${f.tokens[A]}`], ["authorization", `Bearer ${narrow.token}`]
    ]);
    expect(response.status, response.body).toBe(401);
    expect(existsSync(prepared.sentinel)).toBe(false); expect(executionRows(f)).toEqual(before);
    expect(approvalState(f, A, prepared.approvalId)).toEqual(beforeApproval);
    await assertRealExecution(f, prepared, credentials(f, A, prepared.grant.token));
  }, 45_000);

  it("rejects duplicated static-token and lease headers instead of trusting a merged or first value", async () => {
    const f = await fixture(), full = lease(f, A);
    for (const raw of [
      [["x-amc-agent-token", f.tokens[A]!], ["X-AMC-Agent-Token", f.tokens[A]!]],
      [["x-amc-lease", full.token], ["X-AMC-Lease", full.token]],
      [["x-api-key", full.token], ["X-Api-Key", full.token]]
    ] as Array<Array<[string, string]>>) {
      const response = await request(f, "/toolhub/tools", "GET", {}, undefined, raw);
      expect(response.status, response.body).toBe(401);
    }
  }, 45_000);
});

describe("human and legacy credential compatibility is explicit", () => {
  it("retains human session and bootstrap admin precedence over irrelevant invalid agent credentials", async () => {
    const f = await fixture();
    const humanCredentials: Record<string, string>[] = [{ "x-amc-admin-token": ADMIN }, { cookie: f.cookie }];
    for (const human of humanCredentials) {
      const response = await request(f, "/toolhub/tools", "GET", { ...human,
        "x-amc-agent-token": "invalid-ignored-for-human", "x-amc-lease": "malformed-ignored-for-human"
      }, undefined, [["Authorization", "Basic ignored"], ["authorization", "Bearer ignored"]]);
      expect(response.status, response.body).toBe(200);
    }
  }, 45_000);

  it("preserves lease-only checks/read routes and refuses identity substitution on execution reads", async () => {
    const f = await fixture(), execution = await seedRead(f), grant = lease(f, A), other = lease(f, B);
    for (const route of readSurfaces(execution)) {
      const response = await request(f, route.path, route.method, { authorization: `Bearer ${grant.token}` }, route.body);
      expect(response.status, `${route.path}: ${response.body}`).toBe(200);
    }
    const denied = await request(f, `/toolhub/executions/${execution.executionId}`, "GET", { "x-amc-lease": other.token });
    expect(denied.status, denied.body).toBe(403);
    expect((await request(f, "/toolhub/tools", "GET")).status).toBe(401);
  }, 45_000);
});

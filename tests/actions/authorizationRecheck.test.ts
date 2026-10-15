import { randomUUID } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { authorizationIntentFor, bindAuthorization, checkLease, recheckAuthorization, type AuthorizationContext } from "../../src/actions/authorize.js";
import { authorizationRecordDigest, intentHashFor } from "../../src/actions/authorizationRecord.js";
import {
  cancelApprovalRequestForIntent, createApprovalForIntent, decideApprovalForIntent, verifyApprovalForExecution
} from "../../src/approvals/approvalEngine.js";
import { listApprovalDecisions, loadApprovalConsumed } from "../../src/approvals/approvalChainStore.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { getPublicKeyPem, verifyHexDigest } from "../../src/crypto/keys.js";
import { createFreezeIncident, verifyIncidentSignature } from "../../src/drift/freezeEngine.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { issueLeaseToken } from "../../src/leases/leaseSigner.js";
import { revokeLease, signLeaseRevocations } from "../../src/leases/leaseStore.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { type ToolDefinition as SignedToolDefinition, type ToolsConfig } from "../../src/toolhub/toolsSchema.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { toolEvidenceFor, type ToolEvidenceRecord } from "../../src/tools/toolEvidence.js";
import { ToolPipeline, type ToolCallInput } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import type { ToolExecution, ToolOutcome } from "../../src/tools/toolTypes.js";
import type { ActionClass } from "../../src/types.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P1-02's fourteen acceptance groups use actual signed policies, approval
 * requests, decisions and ledger rows. The tool's only effect is an owned file;
 * no payment, provider or external service is invoked. These are local audit
 * signatures, not proof of an authenticated person or independent authority.
 *
 * The Code Mode case exercises public pipeline sub-call admission. It does not
 * execute a run_code worker or assert that the host is confined. The separate
 * approvalConsumeRace suite supplies the genuine two-process consume witness.
 */
const AGENT = "default";
const TRANSFER = "payments.transfer";
const REFUND = "payments.refund";
const PASS = "p102-owned-authorization-fixture";
const ARGS: Record<string, unknown> = {
  amount: "100.00", currency: "USD", recipient: "acme-001",
  destination: "https://payments.example.invalid/send", resourceId: "invoice-001", resourceVersion: "v1"
};
const BINDING_FIELDS: NonNullable<SignedToolDefinition["bindingFields"]> = {
  amount: "amount", currency: "currency", recipient: "recipient", destination: "destination",
  resourceId: "resourceId", resourceVersion: "resourceVersion"
};

interface RecordedCall {
  execution: ToolExecution;
  outcome: ToolOutcome;
  rows: ToolEvidenceRecord[];
}

interface Fixture {
  root: string;
  workspace: string;
  effectPath: string;
  sessionId: string;
  monitorPem: string;
  auditorPem: string;
  ledger: Ledger;
  tools: ToolsConfig;
  registry: ToolRegistry;
  pipeline: ToolPipeline;
  context: Omit<AuthorizationContext, "authority">;
  bodies: ToolExecution[];
  recorded: RecordedCall[];
  recordingErrors: unknown[];
  finish(): void;
}

const fixtures: Fixture[] = [];
const ownedRoots: string[] = [];

function signedArtifact(path: string, pinnedAuditor: string): void {
  const bytes = readFileSync(path);
  const signature = JSON.parse(readFileSync(`${path}.sig`, "utf8")) as {
    digestSha256: string; signature: string; signer: string
  };
  expect(signature.signer).toBe("auditor");
  expect(signature.digestSha256).toBe(sha256Hex(bytes));
  expect(verifyHexDigest(signature.digestSha256, signature.signature, pinnedAuditor)).toBe(true);
}

function fixture(options: { bindingFields?: boolean; mode?: "native" | "code" } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "amc-p102-recheck-"));
  ownedRoots.push(root);
  const home = join(root, "operator-home");
  mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_NO_SIGN", "0");
  const workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: AGENT, trustBoundaryMode: "isolated" });
  // Freeze public keys before producing this fixture's policies, approvals or
  // tool records; subsequent verification never adopts a replacement key.
  const monitorPem = getPublicKeyPem(workspace, "monitor");
  const auditorPem = getPublicKeyPem(workspace, "auditor");
  initActionPolicy(workspace);
  initBudgets(workspace, AGENT);
  initApprovalPolicy(workspace);
  const tools: ToolsConfig = { tools: { version: 1, denyByDefault: true, allowedTools: [TRANSFER, REFUND].map(name => ({
    name, actionClass: "FINANCIAL" as const,
    ...(options.bindingFields === false ? {} : { bindingFields: { ...BINDING_FIELDS } })
  })) } };
  initToolsConfig(workspace, tools);
  for (const name of ["action-policy.yaml", "budgets.yaml", "approval-policy.yaml", "tools.yaml"]) {
    signedArtifact(join(workspace, ".amc", name), auditorPem);
  }

  const ledger = openLedger(workspace);
  const sessionId = `p102-${randomUUID()}`;
  ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "p102-owned-tool-fixture", binarySha256: sha256Hex("p102-owned-tool-fixture") });
  const effectPath = join(root, "effects.jsonl");
  const registry = new ToolRegistry();
  const bodies: ToolExecution[] = [];
  const recorded: RecordedCall[] = [];
  const recordingErrors: unknown[] = [];
  for (const name of [TRANSFER, REFUND]) registry.define(defineTool({
    name, description: "Writes only the qualification fixture's owned effect file", actionClass: "FINANCIAL",
    body: execution => {
      bodies.push(execution);
      appendFileSync(effectPath, `${JSON.stringify({ callId: execution.callId, arguments: execution.arguments,
        authorizationId: execution.authorization?.authorizationId, digest: execution.authorization?.digest })}\n`, { mode: 0o600 });
      return { output: "owned effect recorded", effect: "applied" };
    }
  }));
  let result: Fixture;
  const pipeline = new ToolPipeline({
    registry, workspace, mode: options.mode ?? "native", boundApprovalRequiredFor: new Set(["FINANCIAL"]),
    authorizationContext: () => ({ sessionId, ...result.context }),
    record: (execution, outcome) => {
      const rows = toolEvidenceFor(execution, outcome);
      recorded.push({ execution, outcome, rows });
      try {
        for (const row of rows) ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: row.eventType,
          inline: true, payload: row.payload, payloadExt: "json", meta: row.meta });
      } catch (error) {
        // Pipeline recorder failures are deliberately contained. Keep them
        // observable, so a green tool result cannot hide missing test evidence.
        recordingErrors.push(error);
      }
    }
  });
  let finished = false;
  result = { root, workspace, effectPath, sessionId, monitorPem, auditorPem, ledger, tools, registry, pipeline,
    context: {}, bodies, recorded, recordingErrors,
    finish() { if (!finished) { ledger.sealSession(sessionId); finished = true; } } };
  fixtures.push(result);
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
  const errors: unknown[] = [];
  try {
    for (const f of fixtures.splice(0).reverse()) {
      try { f.finish(); }
      catch (error) { errors.push(error); }
      try { f.ledger.close(); }
      catch (error) { errors.push(error); }
    }
    for (const root of ownedRoots.splice(0).reverse()) {
      const workspace = join(root, "workspace");
      try {
        // A Ledger.close releases a pool lease; close the actual owned
        // connection before deleting files, including failed fixture setup.
        closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`);
        lockVault(workspace);
      } catch (error) { errors.push(error); }
      try { rmSync(root, { recursive: true, force: true }); }
      catch (error) { errors.push(error); }
    }
  } finally { vi.unstubAllEnvs(); }
  if (errors.length > 0) throw new AggregateError(errors, "Owned authorization fixture cleanup failed");
});

function call(overrides: Partial<ToolCallInput> = {}): ToolCallInput {
  return { name: TRANSFER, agentId: AGENT, arguments: { ...ARGS }, requestedMode: "EXECUTE", ...overrides };
}

function approve(f: Fixture, options: { name?: string; arguments?: Record<string, unknown>; actionClass?: ActionClass; pending?: boolean } = {}) {
  const name = options.name ?? TRANSFER;
  const intent = authorizationIntentFor({ workspace: f.workspace, name, actionClass: "FINANCIAL", effectiveMode: "EXECUTE",
    arguments: options.arguments ?? { ...ARGS } });
  if (!intent.ok) throw new Error(`Fixture authorization intent refused: ${intent.reason}`);
  const actionClass = options.actionClass ?? "FINANCIAL";
  const created = createApprovalForIntent({ workspace: f.workspace, agentId: AGENT, intentId: `p102-intent-${randomUUID()}`,
    toolName: name, actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: intent.payload });
  signedArtifact(created.filePath, f.auditorPem);
  if (!options.pending) {
    const reviewers = [{ id: "owned-owner", role: "OWNER" as const }, { id: "owned-auditor", role: "AUDITOR" as const }];
    expect(created.request.requiredApprovals).toBeGreaterThan(0);
    expect(created.request.requiredApprovals).toBeLessThanOrEqual(reviewers.length);
    for (const reviewer of reviewers.slice(0, created.request.requiredApprovals)) decideApprovalForIntent({
      workspace: f.workspace, agentId: AGENT, approvalId: created.request.approvalRequestId, decision: "APPROVED", mode: "EXECUTE",
      reason: "Reviewed the exact owned financial fixture", userId: reviewer.id, username: reviewer.id, userRoles: [reviewer.role]
    });
    const decisions = listApprovalDecisions({ workspace: f.workspace, agentId: AGENT, approvalRequestId: created.request.approvalRequestId });
    expect(new Set(decisions.map(decision => decision.userId)).size).toBe(created.request.requiredApprovals);
    for (const decision of decisions) signedArtifact(join(getAgentPaths(f.workspace, AGENT).rootDir, "approvals", "decisions",
      `${decision.approvalDecisionId}.json`), f.auditorPem);
    signedArtifact(created.filePath, f.auditorPem);
    expect(verifyApprovalForExecution({ workspace: f.workspace, approvalId: created.request.approvalRequestId, expectedAgentId: AGENT,
      expectedToolName: name, expectedActionClass: actionClass, expectedIntentHash: created.request.boundHashes.intentHash }).ok).toBe(true);
  }
  return { id: created.request.approvalRequestId, request: created.request,
    authority: { approvalRequestIds: [created.request.approvalRequestId] } };
}

async function execute(f: Fixture, overrides: Partial<ToolCallInput> = {}): Promise<ToolOutcome> {
  const outcome = await f.pipeline.execute(call(overrides));
  expect(f.recordingErrors, "real tool evidence must not be lost in the recorder's containment").toEqual([]);
  return outcome;
}

function refused(f: Fixture, outcome: ToolOutcome, code: string): void {
  expect(f.bodies, "a denied authorization must never reach the owned effect body").toHaveLength(0);
  expect(existsSync(f.effectPath), "a denied authorization must leave no owned effect file").toBe(false);
  expect(outcome.ok).toBe(false);
  expect(outcome.denied?.stage).toBe("authorization");
  expect(outcome.denied?.reason).toContain(code);
}

function transition(f: Fixture, change: () => void): void {
  f.registry.guard("owned authority transition after bind, before recheck", () => { change(); return undefined; });
}

describe("P1-02 authorization recheck: fourteen specification groups", () => {
  test("01: a genuine grant for 100.00 USD to acme-001 executes once and binds real signed evidence", async () => {
    const f = fixture();
    const grant = approve(f);
    const outcome = await execute(f, { authority: grant.authority });
    expect(outcome.ok).toBe(true);
    expect(outcome.denied).toBeNull();
    expect(f.bodies).toHaveLength(1);
    expect(readFileSync(f.effectPath, "utf8").trim().split("\n")).toHaveLength(1);
    const authorization = f.bodies[0].authorization!;
    expect(authorization.record.bindings.amount).toEqual({ value: "100", currency: "USD" });
    expect(authorization.record.bindings.recipient).toBe("acme-001");
    expect(authorization.record.authority.approvals[0].approverIds).toEqual(["owned-auditor", "owned-owner"]);
    expect(authorization.digest).toBe(authorizationRecordDigest(authorization.record));
    const stored = f.ledger.getAllEvents().filter(row => row.session_id === f.sessionId);
    expect(stored.length).toBeGreaterThan(2);
    for (const row of stored) {
      expect(JSON.parse(row.meta_json)).toMatchObject({ authorizationId: authorization.authorizationId, authorizationDigest: authorization.digest });
      expect(verifyHexDigest(row.event_hash, row.writer_sig, f.monitorPem)).toBe(true);
    }
    const full = stored.filter(row => JSON.parse(row.meta_json).auditType === "AUTHORIZATION_RECORD");
    expect(full).toHaveLength(1);
    expect(JSON.parse(full[0].payload_inline!).record).toEqual(authorization.record);
    f.finish();
    expect(getPublicKeyPem(f.workspace, "monitor")).toBe(f.monitorPem);
    expect(getPublicKeyPem(f.workspace, "auditor")).toBe(f.auditorPem);
    const verification = verifyLedgerIntegrity(f.workspace, { expectedMonitorFingerprint: sha256Hex(f.monitorPem) });
    expect(verification.chain).toEqual({ ok: true, errors: [] });
    expect(verification.trustRoot.anchored).toBe(true);
  });

  test("02: a grant for 100.00 cannot authorize 1000.00", async () => {
    const f = fixture();
    const grant = approve(f);
    refused(f, await execute(f, { authority: grant.authority, arguments: { ...ARGS, amount: "1000.00" } }), "binding_changed:amount");
  });

  test.each([
    ["recipient", "other-recipient", "binding_changed:recipient"],
    ["destination", "https://other.example.invalid/send", "binding_changed:destination"],
    ["resourceId", "invoice-002", "binding_changed:resource"],
    ["resourceVersion", "v2", "binding_changed:resource"]
  ])("03: changed %s refuses the protected fact", async (field, value, code) => {
    const f = fixture();
    const grant = approve(f);
    refused(f, await execute(f, { authority: grant.authority, arguments: { ...ARGS, [field]: value } }), code);
  });

  test("04: an authentic refund approval cannot authorize transfer", async () => {
    const f = fixture();
    const grant = approve(f, { name: REFUND });
    refused(f, await execute(f, { authority: grant.authority }), "tool_changed");
  });

  test("05: a re-signed tools revision after approval names both policy and deployment changes", async () => {
    const f = fixture();
    const grant = approve(f);
    f.tools.tools.allowedTools[0].maxBytes = 4096;
    initToolsConfig(f.workspace, f.tools);
    signedArtifact(join(f.workspace, ".amc", "tools.yaml"), f.auditorPem);
    const outcome = await execute(f, { authority: grant.authority });
    refused(f, outcome, "policy_revision_changed");
    expect(outcome.denied?.reason).toContain("deployment_changed");
  });

  test("06a: approval expiry between bind and recheck refuses without an effect", async () => {
    const f = fixture();
    const grant = approve(f);
    transition(f, () => { vi.spyOn(Date, "now").mockReturnValue(grant.request.expiresTs + 1); });
    refused(f, await execute(f, { authority: grant.authority }), "approval_expired");
  });

  test("06b: cancelling an already granted approval through the public API must revoke its authority", async () => {
    const f = fixture();
    const grant = approve(f);
    let cancellationError: string | null = null;
    transition(f, () => {
      try { cancelApprovalRequestForIntent({ workspace: f.workspace, agentId: AGENT, approvalId: grant.id }); }
      catch (error) { cancellationError = error instanceof Error ? error.message : String(error); }
    });
    const outcome = await execute(f, { authority: grant.authority });
    // Preserve the real API response AND the subsequent execution. Pending-only
    // cancellation would not prove that a reviewed grant can be withdrawn.
    expect({ cancellationError, allowed: outcome.ok, effects: f.bodies.length }).toEqual({ cancellationError: null, allowed: false, effects: 0 });
    refused(f, outcome, "approval_not_granted");
  });

  test("06c: the public pending-cancellation control refuses and is distinct from post-grant withdrawal", async () => {
    const f = fixture();
    const pending = approve(f, { pending: true });
    const cancelled = cancelApprovalRequestForIntent({ workspace: f.workspace, agentId: AGENT, approvalId: pending.id });
    expect(cancelled.status).toBe("CANCELLED");
    refused(f, await execute(f, { authority: pending.authority }), "approval_not_granted");
  });

  test("06d: a genuinely signed lease revoked after bind refuses before the effect", async () => {
    const f = fixture();
    signLeaseRevocations(f.workspace);
    const lease = issueLeaseToken({ workspace: f.workspace, agentId: AGENT, ttlMs: 600_000, scopes: ["toolhub:execute"],
      executeActionClasses: ["FINANCIAL"], routeAllowlist: ["/toolhub/execute"], modelAllowlist: ["p102-owned-model"], maxTokensPerMinute: 100,
      maxRequestsPerMinute: 10, maxCostUsdPerDay: null });
    expect("payload" in checkLease({ workspace: f.workspace, agentId: AGENT, actionClass: "FINANCIAL" }, lease.token)).toBe(true);
    f.context = { leaseToken: lease.token };
    const grant = approve(f);
    transition(f, () => { revokeLease(f.workspace, lease.payload.leaseId, "owned authorization regression"); });
    refused(f, await execute(f, { authority: grant.authority }), "lease_revoked");
  });

  test("07: consent text and a real foreign approval id in arguments grant no authority", async () => {
    const f = fixture();
    const otherGrant = approve(f);
    refused(f, await execute(f, { arguments: { ...ARGS, consent: "patient consented", approved: true, approvalId: otherGrant.id,
      _amcAuthority: { approvalRequestIds: [otherGrant.id] } } }), "approval_missing");
  });

  test("08: an authentic WRITE_LOW grant cannot authorize the signed FINANCIAL class", async () => {
    const f = fixture();
    const grant = approve(f, { actionClass: "WRITE_LOW" });
    refused(f, await execute(f, { authority: grant.authority }), "approval_action_class_mismatch");
  });

  test("09: copying actual approval files to another workspace does not transfer authority", async () => {
    const a = fixture();
    const grant = approve(a);
    const b = fixture();
    expect(b.auditorPem).not.toBe(a.auditorPem);
    cpSync(join(getAgentPaths(a.workspace, AGENT).rootDir, "approvals"), join(getAgentPaths(b.workspace, AGENT).rootDir, "approvals"), { recursive: true });
    const outcome = await execute(b, { authority: grant.authority });
    expect(b.bodies).toHaveLength(0);
    expect(existsSync(b.effectPath)).toBe(false);
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.stage).toBe("authorization");
    // These are the specification's two allowed cross-workspace diagnoses.
    expect(outcome.denied?.reason).toMatch(/approval_intent_mismatch|approval_not_granted/);
  });

  test("10a: replay of one real approval executes exactly one owned effect", async () => {
    const f = fixture();
    const grant = approve(f);
    expect((await execute(f, { authority: grant.authority })).ok).toBe(true);
    const second = await execute(f, { authority: grant.authority });
    expect(second.ok).toBe(false);
    expect(second.denied?.reason).toContain("approval_consumed");
    expect(f.bodies).toHaveLength(1);
    expect(readFileSync(f.effectPath, "utf8").trim().split("\n")).toHaveLength(1);
  });

  test("10b: two concurrent pipeline calls spend a genuine grant only once (same-process control)", async () => {
    const f = fixture();
    const grant = approve(f);
    const outcomes = await Promise.all([execute(f, { authority: grant.authority }), execute(f, { authority: grant.authority })]);
    expect(outcomes.filter(outcome => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter(outcome => !outcome.ok)).toHaveLength(1);
    expect(outcomes.find(outcome => !outcome.ok)?.denied?.reason).toContain("approval_consumed");
    expect(f.bodies).toHaveLength(1);
    expect(readFileSync(f.effectPath, "utf8").trim().split("\n")).toHaveLength(1);
  });

  test("11: a READ_ONLY child cannot widen into FINANCIAL", async () => {
    const f = fixture();
    f.context = { delegation: { depth: 1, parentExecutionId: "owned-parent-execution", allowedActionClasses: ["READ_ONLY"] } };
    const grant = approve(f);
    refused(f, await execute(f, { authority: grant.authority, parentToken: "owned-parent-token" }), "scope_widened");
  });

  test("12a: a real signed active FINANCIAL freeze refuses before the effect", async () => {
    const f = fixture();
    const grant = approve(f);
    transition(f, () => {
      const incident = createFreezeIncident({ workspace: f.workspace, agentId: AGENT, ruleId: "p102-freeze", previousRunId: "owned-before",
        currentRunId: "owned-after", deltas: { overallDrop: 1, integrityDrop: 1, correlationDrop: 0, maxLayerDrop: 0 },
        actionClasses: ["FINANCIAL"], reason: "Owned authorization fixture" });
      expect(verifyIncidentSignature(f.workspace, incident)).toBe(true);
    });
    refused(f, await execute(f, { authority: grant.authority }), "action_class_frozen");
  });

  test("12b: a malformed retained freeze is diagnosed as authority_store_unavailable", async () => {
    const f = fixture();
    const grant = approve(f);
    transition(f, () => {
      const incident = createFreezeIncident({ workspace: f.workspace, agentId: AGENT, ruleId: "p102-damaged-freeze", previousRunId: "owned-before",
        currentRunId: "owned-after", deltas: { overallDrop: 1, integrityDrop: 1, correlationDrop: 0, maxLayerDrop: 0 },
        actionClasses: ["FINANCIAL"], reason: "Genuine freeze before malformed-file fault" });
      expect(verifyIncidentSignature(f.workspace, incident)).toBe(true);
      writeFileSync(join(getAgentPaths(f.workspace, AGENT).rootDir, "incidents", `${incident.incidentId}.json`), "{invalid-json\n");
    });
    refused(f, await execute(f, { authority: grant.authority }), "authority_store_unavailable");
  });

  test("13: Code Mode sub-call admission requires bound approval (not worker or confinement qualification)", async () => {
    const f = fixture({ mode: "code" });
    refused(f, await execute(f, { parentToken: "owned-run-code-parent", rootCallId: "owned-run-code-root" }), "approval_missing");
    expect(f.recorded[0].execution.parentToken).toBe("owned-run-code-parent");
  });

  test("14a: FINANCIAL without signed binding declarations refuses", async () => {
    const f = fixture({ bindingFields: false });
    refused(f, await execute(f), "binding_fields_missing");
  });

  test("14b: a JSON numeric amount is refused, not interpreted as a decimal approval", async () => {
    const f = fixture();
    refused(f, await execute(f, { arguments: { ...ARGS, amount: 100 } }), "binding_fields_missing");
  });


  // Independent public-API controls: no ToolPipeline body is dispatched here.
  test("guard A: changing the call after binding refuses without spending its still-matching grant", () => {
    const f = fixture();
    const grant = approve(f);
    expect(grant.request).toMatchObject({ requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER", "AUDITOR"] });
    const callId = `p102-after-bind-${randomUUID()}`;
    const original: ToolExecution = { ...call(), token: `p102-after-bind-token-${randomUUID()}`, callId, rootCallId: callId,
      parentToken: null, workspace: f.workspace, actionClass: "FINANCIAL", effectiveMode: "EXECUTE" };
    const context: AuthorizationContext = { sessionId: f.sessionId, ...f.context, authority: grant.authority };
    const bound = bindAuthorization(original, context);
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error(`Owned after-bind control refused: ${bound.reason}`);
    expect(bound.record.bindings.amount).toEqual({ value: "100", currency: "USD" });
    expect(intentHashFor(bound.record)).toBe(grant.request.boundHashes.intentHash);
    expect(verifyApprovalForExecution({ workspace: f.workspace, approvalId: grant.id, expectedAgentId: AGENT,
      expectedIntentId: grant.request.intentId, expectedToolName: TRANSFER, expectedActionClass: "FINANCIAL",
      expectedIntentHash: intentHashFor(bound.record) })).toMatchObject({ ok: true, status: "QUORUM_MET", quorum: { required: 2, received: 2 } });
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: AGENT, approvalRequestId: grant.id })).toBeNull();
    const changed: ToolExecution = { ...original, arguments: { ...original.arguments, amount: "1000.00" } };
    const denied = recheckAuthorization(bound.record, changed, context);
    const afterDenial = loadApprovalConsumed({ workspace: f.workspace, agentId: AGENT, approvalRequestId: grant.id });
    expect({ ok: denied.ok, failures: denied.failures, consumed: afterDenial })
      .toEqual({ ok: false, failures: ["binding_changed:amount"], consumed: null });
    // The original call remains authorized after the changed call is refused.
    expect(recheckAuthorization(bound.record, original, context)).toMatchObject({ ok: true, failures: [] });
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: AGENT, approvalRequestId: grant.id }))
      .toMatchObject({ approvalRequestId: grant.id, agentId: AGENT, executionId: bound.record.executionId });
    signedArtifact(join(getAgentPaths(f.workspace, AGENT).rootDir, "approvals", "consumed", `${grant.id}.json`), f.auditorPem);
    expect(f.bodies).toHaveLength(0);
    expect(existsSync(f.effectPath)).toBe(false);
  });

  test("guard B: the engine refuses a changed intent hash despite the matching intent id and tool", () => {
    const f = fixture();
    const grant = approve(f);
    expect(grant.request).toMatchObject({ requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER", "AUDITOR"] });
    const matching = { workspace: f.workspace, approvalId: grant.id, expectedAgentId: AGENT,
      expectedIntentId: grant.request.intentId, expectedToolName: TRANSFER, expectedActionClass: "FINANCIAL" as const,
      expectedIntentHash: grant.request.boundHashes.intentHash };
    expect(verifyApprovalForExecution(matching)).toMatchObject({ ok: true, status: "QUORUM_MET", quorum: { required: 2, received: 2 } });
    const original = call();
    const changed = authorizationIntentFor({ workspace: f.workspace, name: original.name, actionClass: "FINANCIAL",
      effectiveMode: "EXECUTE", arguments: { ...original.arguments, amount: "1000.00" } });
    expect(changed.ok).toBe(true);
    if (!changed.ok) throw new Error(`Owned changed-call intent refused: ${changed.reason}`);
    const changedHash = sha256Hex(canonicalize(changed.payload));
    expect(changedHash).not.toBe(matching.expectedIntentHash);
    const rejected = verifyApprovalForExecution({ ...matching, expectedIntentHash: changedHash });
    const afterRejection = loadApprovalConsumed({ workspace: f.workspace, agentId: AGENT, approvalRequestId: grant.id });
    expect({ ok: rejected.ok, status: rejected.status, error: rejected.error ?? null, consumed: afterRejection })
      .toEqual({ ok: false, status: null, error: "approval intent hash mismatch", consumed: null });
    expect(verifyApprovalForExecution(matching)).toMatchObject({ ok: true, status: "QUORUM_MET" });
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: AGENT, approvalRequestId: grant.id })).toBeNull();
    expect(f.bodies).toHaveLength(0);
    expect(existsSync(f.effectPath)).toBe(false);
  });
});

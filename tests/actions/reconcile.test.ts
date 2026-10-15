import { randomUUID, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { bindAuthorization } from "../../src/actions/authorize.js";
import type { BindingFacts } from "../../src/actions/authorizationRecord.js";
import { reconcile, requestManualResolution, resolveManually, RESOLVE_TOOL,
  type ManualResolutionInput, type ReconcileAdapter, type ReconcileQuery, type SystemOfRecordObservation } from "../../src/actions/reconcile.js";
import { receiptDigest, type ReceiptState } from "../../src/actions/receiptStates.js";
import { approvalRequestBindingDigest, listApprovalDecisions, loadApprovalConsumed, loadApprovalRequestRecord } from "../../src/approvals/approvalChainStore.js";
import { consumeApprovedExecution, decideApprovalForIntent, verifyApprovalForExecution } from "../../src/approvals/approvalEngine.js";
import { initApprovalPolicy, loadApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { computeIncidentHash, createIncidentStore } from "../../src/incidents/incidentStore.js";
import { loadToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { DELETION_TOOL, FAULT_ARGUMENTS, PAYMENT_ADAPTER, PAYMENT_TOOL, type FaultTool } from "../helpers/actionFaults.js";
import { checkedChain, createP104Fixture, oracleCounts, signedArtifact, type P104Fixture, type P104Options } from "../helpers/p104Qualification.js";

// Real local signed workspaces and default P1-02 binding. Public journal state
// controls are labelled separately from actual body/oracle effects. No model,
// authenticated human, native 30-second timeout or session integration claim.
const fixtures: P104Fixture[] = [];
function fixture(options: P104Options = {}): P104Fixture {
  const f = createP104Fixture({ ...options, faults: { loseReply: true, ...options.faults } });
  fixtures.push(f); return f;
}
afterEach(({ task }) => {
  const errors: unknown[] = [];
  try {
    // Nested workspaces own different passphrases: restore the inner environment first.
    for (const f of fixtures.splice(0).reverse()) {
      try { f.finish(task.result?.state === "pass"); } catch (error) { errors.push(error); }
    }
  } finally { vi.restoreAllMocks(); }
  if (errors.length) throw new AggregateError(errors, "Owned P104 reconciler cleanup failed");
});

function snapshot(f: P104Fixture) {
  return { effects: [...f.sor.effects], bodies: f.beforeEffects.length, recordings: f.recordings.length };
}
function noDispatch(f: P104Fixture, before: ReturnType<typeof snapshot>): void {
  expect(f.sor.effects).toEqual(before.effects);
  expect(f.beforeEffects).toHaveLength(before.bodies);
  expect(f.recordings).toHaveLength(before.recordings);
  expect(oracleCounts(f)).toMatchObject({ duplicateEffects: 0, effectsWithoutIntent: 0 });
}
async function ambiguous(f: P104Fixture, tool: FaultTool = PAYMENT_TOOL): Promise<string> {
  const outcome = await f.run(tool);
  expect(outcome.action?.state, JSON.stringify(outcome)).toBe("outcome_unknown");
  const id = outcome.action!.executionId;
  expect(checkedChain(f, id).map(row => row.state)).toEqual(["requested", "authorized", "started", "outcome_unknown"]);
  expect(f.recordings.at(-1)!.execution.authorization?.record.idempotencyKey).toBe(f.journal.get(id)!.intent!.idempotencyKey);
  return id;
}
const adapters = (adapter: ReconcileAdapter): ReadonlyMap<string, ReconcileAdapter> => new Map([[PAYMENT_ADAPTER, adapter]]);
function controlledAdapter(answer: SystemOfRecordObservation): ReconcileAdapter {
  return { adapterId: PAYMENT_ADAPTER, lookup: async () => answer };
}
function matching(f: P104Fixture, id: string): SystemOfRecordObservation {
  return { kind: "applied", externalRef: f.sor.effects[0]!.ref, observedAt: new Date().toISOString(),
    observed: f.journal.get(id)!.intent!.bindings };
}
function runReconcile(f: P104Fixture, id: string, adapter: ReconcileAdapter = f.sor.adapter(), signal?: AbortSignal) {
  return reconcile(id, { workspace: f.workspace, adapters: adapters(adapter), ...(signal ? { signal } : {}) });
}

/** Synthetic public journal control: binds a real P1-02 record but does not dispatch a tool or claim an external effect. */
function stateControl(f: P104Fixture, state: ReceiptState, tool: string = PAYMENT_TOOL) {
  const rule = loadToolsConfig(f.workspace).tools.allowedTools.find(row => row.name === tool)!;
  const callId = `p104-state-${randomUUID()}`;
  const execution: ToolExecution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null,
    workspace: f.workspace, name: tool, agentId: "default", actionClass: rule.actionClass,
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { ...(FAULT_ARGUMENTS[tool as FaultTool] ?? {}) } };
  const bound = bindAuthorization(execution, { sessionId: f.sessionId });
  if (!bound.ok) throw new Error(`Owned state-control P1-02 binding failed: ${bound.reason}`);
  const id = bound.record.executionId;
  f.journal.request({ executionId: id, agentId: "default", toolName: tool, actionClass: rule.actionClass,
    sessionId: f.sessionId, callId, parentExecutionId: null, idempotencyKey: bound.record.idempotencyKey });
  if (state === "requested") return id;
  if (state === "denied") { f.journal.deny(id, "owned_state_control_denied"); return id; }
  if (state === "cancelled") { f.journal.cancel(id, "owned_state_control_cancelled"); return id; }
  f.journal.authorize(id, bound.digest);
  if (state === "authorized") return id;
  f.journal.start(id, bound.record);
  if (state === "outcome_unknown") f.journal.markUnknown(id, "owned_state_control_unknown");
  if (state === "completed") f.journal.complete(id, { effect: "not_applied", outcomeDigest: sha256Hex("owned control: no external effect"),
    externalRef: null, reasonCode: "owned_state_control_no_effect" });
  return id;
}

describe("read-only system-of-record reconciliation", () => {
  test("lost payment reply settles the real committed intent without another body or effect", async () => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f);
    expect(f.sor.effects).toHaveLength(1);
    expect(f.sor.effects[0]).toMatchObject({ kind: "payment", executionId: id,
      facts: { amount: { value: "100.00", currency: "USD" }, recipient: "acme-001" } });
    const real = f.sor.adapter(), queries: ReconcileQuery[] = [];
    const result = await runReconcile(f, id, { ...real, lookup: async (query, signal) => { queries.push(query); return real.lookup(query, signal); } });
    const intent = f.journal.get(id)!.intent!;
    expect(queries).toEqual([{ executionId: id, idempotencyKey: intent.idempotencyKey, toolName: PAYMENT_TOOL,
      argumentsDigest: intent.argumentsDigest, bindings: intent.bindings, startedAt: intent.startedAt }]);
    expect(result).toMatchObject({ before: "outcome_unknown", after: "completed", effect: "applied", mismatches: [], incidentIds: [], nextAttemptAt: null,
      receipt: { resolution: "adapter", evidenceComplete: true, externalRef: before.effects[0]!.ref, reasonCode: "reconciled:applied" } });
    expect(f.sor.lookups).toBe(1); expect(checkedChain(f, id)).toHaveLength(5);
    expect(f.journal.blockingExecutions({ workspaceId: f.journal.workspaceId, agentId: "default" })).toEqual([]);
    noDispatch(f, before);
  });

  test("a pre-effect ambiguous body is found not_applied without creating its payment", async () => {
    const f = fixture({ faults: { beforeEffect: () => { throw new Error("owned connection failed before the effect"); } } });
    const id = await ambiguous(f), before = snapshot(f);
    expect(before.effects).toEqual([]);
    const result = await runReconcile(f, id);
    expect(result).toMatchObject({ before: "outcome_unknown", after: "completed", effect: "not_applied", mismatches: [],
      receipt: { resolution: "adapter", evidenceComplete: true, externalRef: null, reasonCode: "reconciled:not_applied" } });
    expect(f.sor.lookups).toBe(1); checkedChain(f, id); noDispatch(f, before);
  });

  test("a completed payment with failed recorder evidence is restored without repeating the effect", async () => {
    const f = fixture({ faults: { loseReply: false }, recorderFails: true });
    const outcome = await f.run(), id = outcome.action!.executionId;
    expect(outcome.action).toMatchObject({ state: "completed", evidenceComplete: false });
    const before = snapshot(f), result = await runReconcile(f, id);
    expect(result).toMatchObject({ before: "completed", after: "completed", effect: "applied", mismatches: [],
      receipt: { resolution: "adapter", evidenceComplete: true } });
    checkedChain(f, id); noDispatch(f, before);
  });

  test.each(["requested", "authorized", "started", "denied", "cancelled", "completed"] as const)(
    "synthetic public journal %s with complete evidence is ineligible and never asks an adapter", async state => {
      const f = fixture(), id = stateControl(f, state), before = snapshot(f), chain = checkedChain(f, id);
      const lookup = vi.fn<ReconcileAdapter["lookup"]>(async () => ({ kind: "unknown", reason: "must not run" }));
      const result = await runReconcile(f, id, { adapterId: PAYMENT_ADAPTER, lookup });
      expect(result).toMatchObject({ before: state, after: state, receipt: null, nextAttemptAt: null, incidentIds: [], mismatches: [] });
      expect(lookup).not.toHaveBeenCalled(); expect(checkedChain(f, id)).toEqual(chain); noDispatch(f, before);
    });

  test.each([
    { label: "amount", tool: PAYMENT_TOOL, patch: { amount: { value: "101", currency: "USD" } } },
    { label: "recipient", tool: PAYMENT_TOOL, patch: { recipient: "different-recipient" } },
    { label: "destination", tool: DELETION_TOOL, patch: { destination: "https://different.example" } },
    { label: "resource", tool: DELETION_TOOL, patch: { resourceId: "different-resource" } }
  ] satisfies Array<{ label: string; tool: FaultTool; patch: Partial<BindingFacts> }>) (
    "a contradictory $label is signed, incidented and continues to block subsequent dispatch", async ({ label, tool, patch }) => {
      const f = fixture({ configureTools: config => {
        const deletion = config.tools.allowedTools.find(row => row.name === DELETION_TOOL)!;
        deletion.effects = { ...deletion.effects!, reconcile: { adapterId: PAYMENT_ADAPTER } };
      } });
      const id = await ambiguous(f, tool), before = snapshot(f), observation = matching(f, id);
      if (observation.kind !== "applied") throw new Error("Owned applied fixture was not built");
      const result = await runReconcile(f, id, controlledAdapter({ ...observation, observed: { ...observation.observed, ...patch } }));
      expect(result).toMatchObject({ after: "completed", effect: "applied", mismatches: [label],
        receipt: { resolution: "adapter", evidenceComplete: false, reasonCode: `reconciled:contradicted:${label}` } });
      expect(result.incidentIds).toHaveLength(1);
      const incident = createIncidentStore(f.ledger.db).getIncident(result.incidentIds[0]!)!;
      expect(incident).toMatchObject({ agentId: "default", state: "OPEN", severity: "WARN", triggerId: id });
      expect(incident.title).toContain(label);
      const { incident_hash, signature, ...partial } = incident;
      expect(computeIncidentHash(partial)).toBe(incident_hash);
      expect(verify(null, Buffer.from(incident_hash, "hex"), f.monitor, Buffer.from(signature, "base64"))).toBe(true);
      expect(f.journal.blockingExecutions({ workspaceId: f.journal.workspaceId, agentId: "default" })).toContain(id);
      checkedChain(f, id); noDispatch(f, before);
      const next = await f.run(tool, { ...FAULT_ARGUMENTS[tool], resourceId: "another-owned-resource", payee: "another-owned-payee" });
      expect(next.denied?.reason).toContain(`blocked_by_unreconciled:${id}`);
      expect(f.beforeEffects).toHaveLength(before.bodies); expect(f.sor.effects).toEqual(before.effects);
    });

  test("a claimed not_applied cannot replace a completed applied effect with incomplete evidence", async () => {
    const f = fixture({ faults: { loseReply: false }, recorderFails: true }), out = await f.run(), id = out.action!.executionId;
    const head = checkedChain(f, id).at(-1)!, before = snapshot(f);
    const result = await runReconcile(f, id, controlledAdapter({ kind: "not_applied", observedAt: new Date().toISOString() }));
    expect(result).toMatchObject({ before: "completed", after: "completed", effect: "applied", mismatches: ["effect"], receipt: null });
    expect(result.incidentIds).toHaveLength(1); expect(result.nextAttemptAt).not.toBeNull();
    expect(checkedChain(f, id).at(-1)).toEqual(head);
    expect(f.journal.blockingExecutions({ workspaceId: f.journal.workspaceId, agentId: "default" })).toContain(id); noDispatch(f, before);
  });

  test("unknown backs off at 1,2,4,8,16,32,60,60 minutes and a successful resolution clears that process-local schedule", async () => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f); let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    let lookups = 0;
    const adapter: ReconcileAdapter = { adapterId: PAYMENT_ADAPTER, lookup: async () => { lookups += 1; return { kind: "unknown", reason: "owned SOR uncertain" }; } };
    for (const delay of [60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000, 3_600_000]) {
      const result = await runReconcile(f, id, adapter), count = lookups;
      expect(result).toMatchObject({ before: "outcome_unknown", after: "outcome_unknown", receipt: null,
        observation: { kind: "unknown", reason: "owned SOR uncertain" }, nextAttemptAt: new Date(clock + delay).toISOString() });
      const waiting = await runReconcile(f, id, adapter);
      expect(waiting.observation).toEqual({ kind: "unknown", reason: "backing_off" });
      expect(waiting.nextAttemptAt).toBe(result.nextAttemptAt); expect(lookups).toBe(count);
      clock += delay;
    }
    expect(lookups).toBe(8);
    expect((await runReconcile(f, id, controlledAdapter(matching(f, id)))).receipt?.evidenceComplete).toBe(true);
    // Public recorder-loss state control starts a fresh unresolved evidence episode on the same completed execution.
    f.journal.markEvidenceIncomplete(id, "owned post-resolution recorder-loss control");
    const again = await runReconcile(f, id, adapter);
    expect(again).toMatchObject({ before: "completed", after: "completed", receipt: null, nextAttemptAt: new Date(clock + 60_000).toISOString() });
    checkedChain(f, id); noDispatch(f, before);
  });

  test.each([
    { label: "null", answer: null }, { label: "missing kind", answer: {} },
    { label: "unknown kind", answer: { kind: "guess", reason: "wrong" } },
    { label: "empty unknown reason", answer: { kind: "unknown", reason: "" } },
    { label: "invalid timestamp", answer: { kind: "not_applied", observedAt: "not-an-ISO-time" } },
    { label: "invalid applied facts", answer: { kind: "applied", externalRef: "external-owned", observedAt: "2026-10-16T00:00:00.000Z", observed: {} } }
  ])("malformed adapter answer: $label remains unknown without appending a receipt", async ({ answer }) => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f), head = checkedChain(f, id).at(-1);
    // This cast is the deliberately malformed external boundary, never an authorization/grant fixture.
    const adapter: ReconcileAdapter = { adapterId: PAYMENT_ADAPTER, lookup: async () => answer as unknown as SystemOfRecordObservation };
    const result = await runReconcile(f, id, adapter);
    expect(result).toMatchObject({ after: "outcome_unknown", receipt: null, observation: { kind: "unknown" } });
    expect(result.observation.kind === "unknown" && result.observation.reason).toMatch(/^adapter_invalid_observation:/);
    expect(result.nextAttemptAt).not.toBeNull(); expect(checkedChain(f, id).at(-1)).toEqual(head); noDispatch(f, before);
  });

  test("an adapter exception is unknown and is not a not_applied guess", async () => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f);
    const result = await runReconcile(f, id, { adapterId: PAYMENT_ADAPTER, lookup: async () => { throw new Error("owned lookup unavailable"); } });
    expect(result).toMatchObject({ after: "outcome_unknown", receipt: null,
      observation: { kind: "unknown", reason: "adapter_failed: owned lookup unavailable" } });
    expect(result.nextAttemptAt).not.toBeNull(); noDispatch(f, before);
  });

  test.each(["missing", "wrong adapter id"] as const)("an unavailable adapter (%s) cannot settle an intent", async kind => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f);
    const lookup = vi.fn<ReconcileAdapter["lookup"]>(async () => ({ kind: "not_applied", observedAt: new Date().toISOString() }));
    const map = kind === "missing" ? new Map<string, ReconcileAdapter>() : new Map([[PAYMENT_ADAPTER, { adapterId: "different-adapter", lookup }]]);
    const result = await reconcile(id, { workspace: f.workspace, adapters: map });
    expect(result).toMatchObject({ after: "outcome_unknown", receipt: null, nextAttemptAt: null,
      observation: { kind: "unknown", reason: `adapter_unavailable:${PAYMENT_ADAPTER}` } });
    expect(lookup).not.toHaveBeenCalled(); noDispatch(f, before);
  });

  test("a deletion without a declared adapter remains blocked for operator resolution", async () => {
    const f = fixture(), id = await ambiguous(f, DELETION_TOOL), before = snapshot(f);
    const result = await runReconcile(f, id);
    expect(result).toMatchObject({ after: "outcome_unknown", receipt: null, nextAttemptAt: null,
      observation: { kind: "unknown", reason: `no_adapter: ${DELETION_TOOL} declares no reconcile adapter; an operator resolves it` } });
    expect(f.sor.lookups).toBe(0); noDispatch(f, before);
  });

  test("an owned invalid tools signature cannot supply a reconcile adapter", async () => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f), file = join(f.workspace, ".amc", "tools.yaml");
    writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("\n# deliberately unsigned owned test amendment\n")]));
    const lookup = vi.fn<ReconcileAdapter["lookup"]>(async () => matching(f, id));
    const result = await runReconcile(f, id, { adapterId: PAYMENT_ADAPTER, lookup });
    expect(result).toMatchObject({ after: "outcome_unknown", receipt: null, observation: { kind: "unknown" } });
    expect(result.observation.kind === "unknown" && result.observation.reason).toMatch(/^no_adapter:/);
    expect(lookup).not.toHaveBeenCalled(); noDispatch(f, before);
  });

  test("an execution from another workspace is not found and cannot be reconciled here", async () => {
    const source = fixture(), id = stateControl(source, "outcome_unknown");
    checkedChain(source, id); source.observations.push({ kind: "foreign reconcile source", id });
    const target = fixture(), before = snapshot(target);
    await expect(reconcile(id, { workspace: target.workspace, adapters: adapters(target.sor.adapter()) }))
      .rejects.toThrow(/no journaled execution .* in this workspace/);
    noDispatch(target, before);
  });

  test.each([{ age: 1000, expires: false }, { age: 1001, expires: true }])(
    "not_applied retention age=$age ms with a 1000 ms declaration", async ({ age, expires }) => {
      const f = fixture({ faults: { beforeEffect: () => { throw new Error("owned pre-effect uncertainty"); } } });
      const id = await ambiguous(f), before = snapshot(f), started = Date.parse(f.journal.get(id)!.intent!.startedAt);
      vi.spyOn(Date, "now").mockReturnValue(started + age);
      const real = f.sor.adapter(), result = await runReconcile(f, id, { ...real, retentionMs: 1000 });
      if (expires) {
        expect(result).toMatchObject({ after: "outcome_unknown", receipt: null, observation: { kind: "unknown" } });
        expect(result.observation.kind === "unknown" && result.observation.reason).toBe(`outside_retention_window: ${PAYMENT_ADAPTER} keeps keys 1000 ms`);
      } else expect(result).toMatchObject({ after: "completed", effect: "not_applied", receipt: { evidenceComplete: true } });
      expect(f.sor.lookups).toBe(1); checkedChain(f, id); noDispatch(f, before);
    });

  test("an already-aborted signal neither asks the adapter nor settles the state", async () => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f), head = checkedChain(f, id).at(-1)!;
    const controller = new AbortController(); controller.abort(new Error("owned pre-aborted lookup"));
    const lookup = vi.fn<ReconcileAdapter["lookup"]>(async () => matching(f, id));
    const result = await runReconcile(f, id, { adapterId: PAYMENT_ADAPTER, lookup }, controller.signal);
    const after = f.journal.get(id)!;
    // Record before any assertion: a baseline defect must not hide its settlement behind the first failure.
    f.observations.push({ kind: "already-aborted lookup", lookupCalls: lookup.mock.calls.length, result, headBefore: head, headAfter: after.receipts.at(-1) });
    expect.soft(lookup).not.toHaveBeenCalled();
    expect.soft(result).toMatchObject({ after: "outcome_unknown", receipt: null, observation: { kind: "unknown" } });
    expect.soft(after.receipts.at(-1)).toEqual(head); noDispatch(f, before);
  });

  test("a controlled in-flight abort returns unknown without a hanging lookup or a native-deadline claim", async () => {
    const f = fixture(), id = await ambiguous(f), before = snapshot(f), controller = new AbortController();
    let entered = false, rejectedOnAbort = false;
    const adapter: ReconcileAdapter = { adapterId: PAYMENT_ADAPTER, lookup: (_query, signal) => new Promise<SystemOfRecordObservation>((_, reject) => {
      entered = true;
      signal.addEventListener("abort", () => { rejectedOnAbort = true; reject(signal.reason); }, { once: true });
      controller.abort(new Error("owned controlled in-flight abort"));
    }) };
    const result = await runReconcile(f, id, adapter, controller.signal);
    expect(entered).toBe(true); expect(rejectedOnAbort).toBe(true);
    expect(result).toMatchObject({ after: "outcome_unknown", receipt: null,
      observation: { kind: "unknown", reason: "adapter_failed: owned controlled in-flight abort" } });
    noDispatch(f, before);
  });

  test("the independent oracle detects a deliberately effectful adapter even though the tool body was not dispatched", async () => {
    const payment = fixture(), paymentId = await ambiguous(payment), baseline = snapshot(payment);
    // A signed payment intent supplies the adapter route; this negative witness does not bless the adapter.
    const result = await runReconcile(payment, paymentId, { adapterId: PAYMENT_ADAPTER, lookup: async () => {
      payment.sor.deleteResource("owned forbidden adapter effect", paymentId);
      return { kind: "unknown", reason: "deliberately invalid effectful adapter" };
    } });
    expect(result.receipt).toBeNull();
    expect(payment.beforeEffects).toHaveLength(baseline.bodies); // no registered body replay
    expect(payment.sor.effects).toHaveLength(baseline.effects.length + 1);
    expect(() => expect(payment.sor.effects).toEqual(baseline.effects)).toThrow();
    payment.observations.push({ kind: "negative oracle witness: invalid adapter created an effect", before: baseline, after: payment.sor.effects });
  });
});

type ResolutionRequest = ReturnType<typeof resolutionRequest>;
function resolutionRequest(f: P104Fixture, id: string, overrides: Partial<Omit<ManualResolutionInput, "workspace">> = {}) {
  const statement: ManualResolutionInput = { workspace: f.workspace, effect: "applied", externalRef: f.sor.effects[0]?.ref ?? null,
    operatorId: "owned-resolution-operator", note: "Owned operator statement; identity and effect remain self-reported.", ...overrides };
  const created = requestManualResolution(id, statement);
  const request = loadApprovalRequestRecord({ workspace: f.workspace, agentId: "default", approvalRequestId: created.approvalRequestId });
  const view = f.journal.get(id)!, head = view.receipts.at(-1)!, intent = view.intent!;
  const payload = { schema: "amc.action-resolution/v1", workspaceId: head.workspaceId, executionId: id, agentId: head.agentId,
    toolName: intent.toolName, actionClass: intent.actionClass, headDigest: receiptDigest(head), effect: statement.effect,
    externalRef: statement.externalRef, operatorId: statement.operatorId.trim(), noteSha256: sha256Hex(statement.note.trim()) };
  expect(request.boundHashes.intentHash).toBe(sha256Hex(canonicalize(payload)));
  expect(request).toMatchObject({ toolName: RESOLVE_TOOL, actionClass: intent.actionClass, status: "PENDING" });
  signedArtifact(join(getAgentPaths(f.workspace, "default").rootDir, "approvals", "requests", `${created.approvalRequestId}.json`), f.auditor);
  return { f, id, statement, created, request, payload };
}
function decide(h: ResolutionRequest, role: "OWNER" | "AUDITOR" | "APPROVER", id = `owned-${role.toLowerCase()}`,
  decision: "APPROVED" | "DENIED" = "APPROVED", mode: "EXECUTE" | "SIMULATE" = "EXECUTE") {
  return decideApprovalForIntent({ workspace: h.f.workspace, agentId: "default", approvalId: h.created.approvalRequestId,
    decision, mode, reason: "Owned exact-head fixture review; no human authentication claim", userId: id, username: id,
    userRoles: [role], expectedRequestDigestSha256: approvalRequestBindingDigest(h.request) });
}
function grant(h: ResolutionRequest): void {
  expect(h.created.requiredApprovals).toBe(2);
  expect(decide(h, "OWNER").approval.status).toBe("PENDING");
  expect(decide(h, "AUDITOR").approval.status).toBe("QUORUM_MET");
  const decisions = listApprovalDecisions({ workspace: h.f.workspace, agentId: "default", approvalRequestId: h.created.approvalRequestId });
  expect(decisions).toHaveLength(2); expect(new Set(decisions.map(row => row.userId)).size).toBe(2);
  const base = join(getAgentPaths(h.f.workspace, "default").rootDir, "approvals");
  for (const row of decisions) signedArtifact(join(base, "decisions", `${row.approvalDecisionId}.json`), h.f.auditor);
  signedArtifact(join(base, "requests", `${h.created.approvalRequestId}.json`), h.f.auditor);
  expect(getPublicKeyPem(h.f.workspace, "auditor")).toBe(h.f.auditor);
  expect(verifyApprovalForExecution({ workspace: h.f.workspace, approvalId: h.created.approvalRequestId, expectedAgentId: "default",
    expectedToolName: RESOLVE_TOOL, expectedActionClass: h.request.actionClass, expectedIntentHash: h.request.boundHashes.intentHash })).toMatchObject({ ok: true, status: "QUORUM_MET" });
}
function resolve(h: ResolutionRequest, overrides: Partial<ManualResolutionInput> = {}) {
  return resolveManually(h.id, { ...h.statement, ...overrides, approvalRequestId: h.created.approvalRequestId });
}
function unspent(h: ResolutionRequest): void {
  expect(loadApprovalConsumed({ workspace: h.f.workspace, agentId: "default", approvalRequestId: h.created.approvalRequestId })).toBeNull();
}

describe("genuine signed operator resolution", () => {
  test.each([PAYMENT_TOOL, DELETION_TOOL] as const)("%s uses its actual FINANCIAL/DATA_EXPORT quorum and records only SELF_REPORTED operator claims", async tool => {
    const f = fixture(), id = await ambiguous(f, tool), before = snapshot(f), h = resolutionRequest(f, id);
    expect(h.request.actionClass).toBe(tool === PAYMENT_TOOL ? "FINANCIAL" : "DATA_EXPORT");
    expect(h.request).toMatchObject({ requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER", "AUDITOR"] });
    grant(h); const receipt = resolve(h);
    expect(receipt).toMatchObject({ state: "completed", effect: "applied", resolution: "operator", evidenceComplete: true,
      reasonCode: `operator_resolved:${h.created.approvalRequestId}` });
    const row = f.ledger.db.prepare(`SELECT e.meta_json FROM action_transitions t JOIN evidence_events e ON e.id=t.evidence_event_id
      WHERE t.execution_id=? ORDER BY t.seq DESC LIMIT 1`).get(id) as { meta_json: string };
    expect(JSON.parse(row.meta_json)).toMatchObject({ trustTier: "SELF_REPORTED", claimKind: "self_reported", resolution: "operator",
      resolutionDetail: { operatorId: h.statement.operatorId, approverIds: ["owned-auditor", "owned-owner"], approvalRequestId: h.created.approvalRequestId } });
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: "default", approvalRequestId: h.created.approvalRequestId })?.executionId).toBe(id);
    expect(consumeApprovedExecution({ workspace: f.workspace, approvalId: h.created.approvalRequestId, expectedAgentId: "default", executionId: id }))
      .toMatchObject({ consumed: false, replay: true, reason: "approval already consumed" });
    expect(() => resolve(h)).toThrow(/nothing to resolve/); checkedChain(f, id); noDispatch(f, before);
  });

  test.each(["pending", "denied", "one approver", "simulate only", "disallowed role"] as const)(
    "%s is never a granted manual resolution", async kind => {
      const f = fixture(), id = await ambiguous(f), before = snapshot(f), h = resolutionRequest(f, id), head = checkedChain(f, id).at(-1);
      if (kind === "denied") decide(h, "OWNER", "owned-owner", "DENIED");
      if (kind === "one approver") decide(h, "OWNER");
      if (kind === "simulate only") decide(h, "OWNER", "owned-owner", "APPROVED", "SIMULATE");
      if (kind === "disallowed role") expect(decide(h, "APPROVER").approval.receivedApprovals).toBe(0);
      expect(() => resolve(h)).toThrow(/resolution_not_approved:/);
      unspent(h); expect(checkedChain(f, id).at(-1)).toEqual(head); noDispatch(f, before);
    });

  test("the same identity cannot provide the second distinct approval", async () => {
    const f = fixture(), id = await ambiguous(f), h = resolutionRequest(f, id), before = snapshot(f);
    decide(h, "OWNER", "owned-one-person");
    expect(() => decide(h, "AUDITOR", "owned-one-person")).toThrow(/distinct approver required/);
    expect(() => resolve(h)).toThrow(/approval quorum not met/); unspent(h); noDispatch(f, before);
  });

  test.each([
    { label: "effect", change: { effect: "not_applied" as const } },
    { label: "externalRef", change: { externalRef: "different-owned-reference" } },
    { label: "operatorId", change: { operatorId: "different-owned-operator" } },
    { label: "note", change: { note: "A different statement was not reviewed." } }
  ])("a genuine grant cannot authorize a changed $label", async ({ change }) => {
    const f = fixture(), id = await ambiguous(f), h = resolutionRequest(f, id), before = snapshot(f), head = checkedChain(f, id).at(-1);
    grant(h); expect(() => resolve(h, change)).toThrow(/resolution_not_approved: approval intent hash mismatch/);
    unspent(h); expect(checkedChain(f, id).at(-1)).toEqual(head); noDispatch(f, before);
  });

  test("an exact-head grant goes stale when a real signed incomplete-evidence row is appended", async () => {
    const f = fixture(), id = await ambiguous(f), h = resolutionRequest(f, id), before = snapshot(f);
    grant(h); f.journal.markEvidenceIncomplete(id, "owned signed head-change control");
    const changed = checkedChain(f, id).at(-1)!;
    expect(receiptDigest(changed)).not.toBe(h.payload.headDigest);
    expect(() => resolve(h)).toThrow(/resolution_not_approved: approval intent hash mismatch/);
    unspent(h); expect(checkedChain(f, id).at(-1)).toEqual(changed); noDispatch(f, before);
  });

  test("the default WRITE_LOW rule permits its one signed operator approval when distinct users are not required", () => {
    const f = fixture({ configureTools: config => { config.tools.allowedTools.push({ name: "owned.write-low", actionClass: "WRITE_LOW", effects: { repeatable: false } }); } });
    const id = stateControl(f, "outcome_unknown", "owned.write-low"), before = snapshot(f), h = resolutionRequest(f, id, { effect: "not_applied", externalRef: null, operatorId: "owned-owner" });
    expect(h.request).toMatchObject({ actionClass: "WRITE_LOW", requiredApprovals: 1, requireDistinctUsers: false });
    expect(decide(h, "OWNER", "owned-owner").approval.status).toBe("QUORUM_MET");
    expect(resolve(h)).toMatchObject({ resolution: "operator", effect: "not_applied", evidenceComplete: true });
    checkedChain(f, id); noDispatch(f, before);
  });

  test("a signed stricter WRITE_LOW distinct-user rule rejects an operator's otherwise granted self-approval", () => {
    const f = fixture({ configureTools: config => { config.tools.allowedTools.push({ name: "owned.write-low", actionClass: "WRITE_LOW", effects: { repeatable: false } }); } });
    const policy = loadApprovalPolicy(f.workspace); policy.approvalPolicy.actionClasses.WRITE_LOW!.requireDistinctUsers = true;
    initApprovalPolicy(f.workspace, policy); signedArtifact(join(f.workspace, ".amc", "approval-policy.yaml"), f.auditor);
    const id = stateControl(f, "outcome_unknown", "owned.write-low"), before = snapshot(f), h = resolutionRequest(f, id, { effect: "not_applied", externalRef: null, operatorId: "owned-owner" });
    expect(h.request).toMatchObject({ requiredApprovals: 1, requireDistinctUsers: true });
    expect(decide(h, "OWNER", "owned-owner").approval.status).toBe("QUORUM_MET");
    expect(() => resolve(h)).toThrow(/^dual_control:/); unspent(h); noDispatch(f, before);
  });

  test("a grant for another execution cannot settle this execution", () => {
    const f = fixture(), first = stateControl(f, "started"), second = stateControl(f, "started");
    f.journal.markUnknown(first, "owned first ambiguous control"); f.journal.markUnknown(second, "owned second ambiguous control");
    const h = resolutionRequest(f, first, { effect: "not_applied", externalRef: null }), before = snapshot(f);
    grant(h);
    expect(() => resolveManually(second, { ...h.statement, approvalRequestId: h.created.approvalRequestId })).toThrow(/approval intent hash mismatch/);
    unspent(h); expect(f.journal.get(first)!.state).toBe("outcome_unknown"); expect(f.journal.get(second)!.state).toBe("outcome_unknown"); noDispatch(f, before);
  });

  test("a genuine grant from another workspace supplies no authority in this workspace", () => {
    const source = fixture(), sourceId = stateControl(source, "outcome_unknown"), h = resolutionRequest(source, sourceId, { effect: "not_applied", externalRef: null });
    grant(h); unspent(h); source.observations.push({ kind: "foreign grant source", request: h.request, sourceId });
    // No source signing/verification occurs after this second fixture changes HOME/passphrase.
    const target = fixture(), id = stateControl(target, "outcome_unknown"), before = snapshot(target), head = checkedChain(target, id).at(-1);
    expect(() => resolveManually(id, { ...h.statement, workspace: target.workspace, approvalRequestId: h.created.approvalRequestId }))
      .toThrow(/resolution_not_approved:.*approval request not found/);
    expect(checkedChain(target, id).at(-1)).toEqual(head); noDispatch(target, before);
  });
});

describe("signed receipt replay gives no chain pass", () => {
  test.each(["another execution", "another workspace"] as const)("replaying real signed bytes from %s is refused", kind => {
    const source = fixture(), sourceId = stateControl(source, "completed");
    checkedChain(source, sourceId);
    const row = source.ledger.db.prepare("SELECT receipt_json, receipt_digest, evidence_event_id FROM action_transitions WHERE execution_id=? ORDER BY seq DESC LIMIT 1")
      .get(sourceId) as { receipt_json: string; receipt_digest: string; evidence_event_id: string };
    // Capture the actual source bytes before changing nested fixture environment.
    const target = kind === "another workspace" ? fixture() : source;
    const targetId = stateControl(target, "completed"); checkedChain(target, targetId);
    const effects = [...target.sor.effects], bodies = target.beforeEffects.length;
    // Deliberate tamper of owned fixture storage only. No approval report or grant is fabricated.
    for (const table of ["action_transitions", "action_executions"]) {
      const triggers = target.ledger.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(table) as Array<{ name: string }>;
      for (const { name } of triggers) target.ledger.db.exec(`DROP TRIGGER "${name.replaceAll('"', '""')}"`);
    }
    target.ledger.db.prepare("UPDATE action_transitions SET receipt_json=?, receipt_digest=?, evidence_event_id=? WHERE execution_id=? AND seq=3")
      .run(row.receipt_json, row.receipt_digest, row.evidence_event_id, targetId);
    target.ledger.db.prepare("UPDATE action_executions SET last_receipt_digest=? WHERE execution_id=?").run(row.receipt_digest, targetId);
    const checked = target.journal.verifyReceiptChain(targetId);
    target.observations.push({ kind: `real signed replay from ${kind}`, sourceId, targetId, sourceRow: row, checked });
    expect(checked.ok).toBe(false);
    expect(checked.errors.join("; ")).toMatch(kind === "another workspace" ? /receipt names workspace/ : /receipt names another execution or position/);
    expect(target.sor.effects).toEqual(effects); expect(target.beforeEffects).toHaveLength(bodies);
  });
});

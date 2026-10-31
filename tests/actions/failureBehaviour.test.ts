import type { AuthorizationContext, AuthorizationIntentResult } from "../../src/actions/authorize.js";
import { authorizationRecordDigest } from "../../src/actions/authorizationRecord.js";
import { approvalRequestBindingDigest, listApprovalDecisions, loadApprovalConsumed } from "../../src/approvals/approvalChainStore.js";
import { createApprovalForIntent, decideApprovalForIntent, verifyApprovalForExecution } from "../../src/approvals/approvalEngine.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AgentDriver } from "../../src/agent/agentDriver.js";
import { credentialRef } from "../../src/credentials/credentialRef.js";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { computeIncidentHash, createIncidentStore } from "../../src/incidents/incidentStore.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import { bodyFromChunks, type HttpTransport } from "../../src/llm/adapter/transport.js";
import { ObservabilityOTELExporter, resetSharedObservabilityExporterForTests, type ObservabilityFlushResult } from "../../src/observability/otelExporter.js";
import { takeDroppedTelemetry } from "../../src/observability/telemetryDrops.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { SessionService } from "../../src/session/sessionService.js";
import { readTurnEndMeta } from "../../src/session/turnLifecycleMeta.js";
import type { EvidenceEvent } from "../../src/types.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, recordingRetryRuntime, scriptedAdapter, silentTransport, toolStep } from "../helpers/agentLoopHarness.js";
import { randomUUID, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openActionJournal, type ActionJournal } from "../../src/actions/actionJournal.js";
import { recoverActionJournal } from "../../src/actions/actionRecovery.js";
import { receiptDigest } from "../../src/actions/receiptStates.js";
import { pipelineToolSeam } from "../../src/agent/pipelineToolSeam.js";
import type { ToolCallRequest } from "../../src/agent/toolSeam.js";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { initToolsConfig, loadToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { ToolPipeline, type ToolPipelineInit } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import { DefiniteFailureError, type RecordedToolCall, type ToolBodyResult, type ToolExecution, type ToolOutcome } from "../../src/tools/toolTypes.js";
import type { ActionClass } from "../../src/types.js";
import { canonicalize } from "../../src/utils/json.js";
import { lockVault } from "../../src/vault/vault.js";
import {
  crashInChild, DELETION_TOOL, FAULT_ARGUMENTS, failingJournal, faultTools, journaledIntents,
  PAYMENT_TOOL, prepareFaultWorkspace, revoke
} from "../helpers/actionFaults.js";
import { FakeSystemOfRecord } from "../fixtures/actions/fakeSystemOfRecord.js";

/* Local journal-composition fixtures. They exercise real signed policies,
 * records, SQLite transactions and owned file effects. No human approval gate,
 * HTTP authentication, provider or power-loss durability is claimed. */
const CUSTOM = "fixture.effect";
const CUSTOM_ARGUMENTS = { amount: "100.00", currency: "USD", payee: "acme-001", target: "https://records.example", resourceId: "owned-42" };
interface Fixture {
  root: string;
  workspace: string;
  oracleFile: string;
  sessionId: string;
  monitor: string;
  journal: ActionJournal;
  ledger: Ledger;
  stores: Array<{ close(): void }>;
  sor: FakeSystemOfRecord;
  registry: ToolRegistry;
  pipeline: ToolPipeline;
  reads: number;
}
const fixtures: Fixture[] = [];

function fixture(options: {
  record?: ToolPipelineInit["record"];
  actionClass?: ActionClass;
  body?: (execution: ToolExecution, sor: FakeSystemOfRecord) => ToolBodyResult | Promise<ToolBodyResult>;
} = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "amc-p103-failure-"));
  const home = join(root, "home");
  mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", `p103-owned-${randomUUID()}`);
  vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_LEDGER_SQLITE_SYNCHRONOUS", "FULL");
  const workspace = prepareFaultWorkspace(join(root, "workspaces", `p103-${randomUUID()}`));
  // Initialization emits signed defaults; pin before this fixture's first journal request.
  const monitor = getPublicKeyPem(workspace, "monitor");
  if (options.body) {
    const tools = loadToolsConfig(workspace);
    tools.tools.allowedTools.push({ name: CUSTOM, actionClass: options.actionClass ?? "WRITE_HIGH",
      bindingFields: { amount: "amount", currency: "currency", recipient: "payee", destination: "target", resourceId: "resourceId" },
      effects: { repeatable: false } });
    initToolsConfig(workspace, tools);
  }
  const oracleFile = join(root, "system-of-record.json");
  const sor = new FakeSystemOfRecord(oracleFile);
  const journal = openActionJournal(workspace);
  const ledger = openLedger(workspace);
  const registry = new ToolRegistry();
  for (const definition of faultTools(sor)) registry.define(definition);
  if (options.body) registry.define(defineTool({ name: CUSTOM, description: "Owned local effect", actionClass: options.actionClass ?? "WRITE_HIGH",
    body: execution => options.body!(execution, sor) }));
  let f: Fixture;
  registry.define(defineTool({ name: "fs.read", actionClass: "READ_ONLY", description: "Read the owned effect log", body: () => {
    f.reads += 1;
    return { ok: true, output: readFileSync(oracleFile, "utf8") };
  } }));
  const sessionId = `p103-session-${randomUUID()}`;
  const pipeline = new ToolPipeline({ registry, workspace, journal: () => f.journal,
    authorizationContext: () => ({ sessionId }), ...(options.record ? { record: options.record } : {}) });
  f = { root, workspace, oracleFile, monitor, sessionId, journal, ledger, stores: [journal, ledger], sor, registry, pipeline, reads: 0 };
  fixtures.push(f);
  return f;
}

function closeStores(f: Fixture): void {
  for (const store of f.stores.splice(0)) store.close();
  closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc", "evidence.sqlite")}`);
}

afterEach(({ task }) => {
  const errors: unknown[] = [];
  try {
    for (const f of fixtures.splice(0).reverse()) {
      let closed = false;
      try { closeStores(f); lockVault(f.workspace); closed = true; } catch (error) { errors.push(error); }
      if (closed && task.result?.state !== "fail") {
        rmSync(f.workspace, { recursive: true, force: true });
        rmSync(f.root, { recursive: true, force: true });
      } else console.error("P103 failure fixture retained", JSON.stringify({ root: f.root, workspace: f.workspace }));
    }
  } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
  if (errors.length) throw new AggregateError(errors, "Owned P103 failure fixture cleanup failed");
});

function execute(f: Fixture, name = DELETION_TOOL, signal?: AbortSignal): Promise<ToolOutcome> {
  const args = name === CUSTOM ? CUSTOM_ARGUMENTS : name === "fs.read" ? {} : FAULT_ARGUMENTS[name as typeof DELETION_TOOL | typeof PAYMENT_TOOL];
  return f.pipeline.execute({ name, agentId: "default", requestedMode: "EXECUTE", arguments: { ...args },
    callId: `p103-call-${randomUUID()}`, ...(signal ? { signal } : {}) });
}

function counts(f: Fixture): { action_executions: number; action_transitions: number; evidence_events: number; sessions: number } {
  const count = (table: string): number => (f.ledger.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { action_executions: count("action_executions"), action_transitions: count("action_transitions"),
    evidence_events: count("evidence_events"), sessions: count("sessions") };
}

function chain(f: Fixture, id: string) {
  const checked = f.journal.verifyReceiptChain(id);
  expect(checked.ok, checked.errors.join("; ")).toBe(true);
  const rows = f.ledger.db.prepare(`SELECT t.receipt_json, t.receipt_digest, e.payload_inline, e.payload_sha256,
      e.event_hash, e.writer_sig, s.ended_ts FROM action_transitions t
      JOIN evidence_events e ON e.id = t.evidence_event_id JOIN sessions s ON s.session_id = e.session_id
      WHERE t.execution_id = ? ORDER BY t.seq`).all(id) as Array<{ receipt_json: string; receipt_digest: string;
        payload_inline: string; payload_sha256: string; event_hash: string; writer_sig: string; ended_ts: number | null }>;
  expect(rows).toHaveLength(checked.receipts.length);
  checked.receipts.forEach((receipt, index) => {
    const row = rows[index]!;
    expect(row.receipt_json).toBe(canonicalize(receipt));
    expect(row.payload_inline).toBe(row.receipt_json);
    expect(row.receipt_digest).toBe(receiptDigest(receipt));
    expect(row.payload_sha256).toBe(row.receipt_digest);
    expect(row.ended_ts).not.toBeNull();
    expect(verify(null, Buffer.from(row.event_hash, "hex"), f.monitor, Buffer.from(row.writer_sig, "base64"))).toBe(true);
  });
  expect(getPublicKeyPem(f.workspace, "monitor")).toBe(f.monitor);
  return checked.receipts;
}

describe("P1-03 failure row 1: admission must be durable before dispatch", () => {
  test.each(["request", "start"] as const)("a real journal %s refusal causes zero effects", async method => {
    const f = fixture();
    const real = f.journal;
    f.journal = failingJournal(real, new Set([method]));
    const result = await execute(f);
    expect(result.ok).toBe(false);
    expect(result.denied?.reason).toContain(`injected: ${method} is down`);
    expect(result.denied?.reason).toContain("journal_unavailable");
    expect(f.sor.effects).toHaveLength(0);
    if (method === "request") expect(result.action).toBeUndefined();
    else {
      expect(result.action?.state).toBe("denied");
      expect(chain(f, result.action!.executionId).map(row => row.state)).toEqual(["requested", "authorized", "denied"]);
    }
  });

  test.each(["requested", "started"] as const)("SQLite rejects %s atomically without orphan evidence/session rows", async state => {
    const f = fixture();
    f.ledger.db.exec(`CREATE TRIGGER fixture_refuse_transition BEFORE INSERT ON action_transitions
      WHEN json_extract(NEW.receipt_json, '$.state') = '${state}'
      BEGIN SELECT RAISE(ABORT, 'fixture transition insert refused'); END;`);
    const before = counts(f);
    const result = await execute(f);
    expect(result.denied?.reason).toContain("journal_unavailable");
    expect(result.denied?.reason).toContain("fixture transition insert refused");
    expect(f.sor.effects).toHaveLength(0);
    if (state === "requested") expect(counts(f)).toEqual(before);
    else {
      // requested, authorized and the later legitimate denial survive. The
      // failed started transaction contributes no evidence or sealed session.
      expect(counts(f)).toEqual({ action_executions: before.action_executions + 1,
        action_transitions: before.action_transitions + 3, evidence_events: before.evidence_events + 3, sessions: before.sessions + 3 });
      expect(chain(f, result.action!.executionId).map(row => row.state)).toEqual(["requested", "authorized", "denied"]);
    }
  });

  test("the owned effect sees its committed signed started intent", async () => {
    let f: Fixture;
    f = fixture({ body: execution => {
      const view = f.journal.get(execution.executionId!);
      expect(view?.state).toBe("started");
      expect(view?.intent).toMatchObject({ executionId: execution.executionId,
        authorizationDigest: execution.authorization?.digest, callId: execution.callId, owner: { pid: process.pid } });
      expect(chain(f, execution.executionId!).map(row => row.state)).toEqual(["requested", "authorized", "started"]);
      const effect = f.sor.deleteResource("durable-before-effect", execution.executionId!);
      return { ok: true, output: effect.ref, effect: "applied", externalRef: effect.ref };
    } });
    const result = await execute(f, CUSTOM);
    expect(result.ok).toBe(true);
    expect(f.sor.effects).toHaveLength(1);
    expect(f.sor.effectsWithoutIntent(journaledIntents(f.workspace))).toBe(0);
    expect(chain(f, result.action!.executionId).map(row => row.state)).toEqual(["requested", "authorized", "started", "completed"]);
  });
});

describe("P1-03 failure row 2: the effect stands when local evidence fails", () => {
  test("a throwing recorder marks completion incomplete and latches the pipeline: the next financial call and reads are refused (P1-78)", async () => {
    let recordings = 0;
    const f = fixture({ record: () => { recordings += 1; throw new Error("owned recorder unavailable"); } });
    const result = await execute(f);
    expect(result).toMatchObject({ ok: true, denied: null, action: { state: "completed", evidenceComplete: false } });
    expect(f.sor.effects).toHaveLength(1);
    const receipts = chain(f, result.action!.executionId);
    expect(receipts.map(row => row.state)).toEqual(["requested", "authorized", "started", "completed", "completed"]);
    expect(receipts.at(-1)).toMatchObject({ evidenceComplete: false, reasonCode: "evidence_incomplete:recorder_failed" });
    // The failed record latches the pipeline before any stage runs; the journal is never asked.
    const next = await execute(f, PAYMENT_TOOL);
    expect(next.denied?.stage).toBe("authorization");
    expect(next.denied?.reason).toContain("EVIDENCE_RECORDER_FAILED");
    expect(next.action).toBeUndefined();
    expect(f.sor.effects).toHaveLength(1);
    const read = await execute(f, "fs.read");
    expect(read).toMatchObject({ ok: false, denied: { stage: "authorization" } });
    expect(read.denied?.reason).toContain("EVIDENCE_RECORDER_FAILED");
    expect(read.action).toBeUndefined();
    expect(f.reads).toBe(0);
    expect(recordings).toBe(3);
  });

  test("a real completion-store failure retains started and blocks the agent in this process", async () => {
    const f = fixture();
    f.ledger.db.exec(`CREATE TRIGGER fixture_refuse_completion BEFORE INSERT ON action_transitions
      WHEN json_extract(NEW.receipt_json, '$.state') = 'completed'
      BEGIN SELECT RAISE(ABORT, 'fixture completion insert refused'); END;`);
    const before = counts(f);
    const result = await execute(f);
    expect(result).toMatchObject({ ok: true, denied: null, action: { state: "started", evidenceComplete: false } });
    expect(f.sor.effects).toHaveLength(1);
    expect(chain(f, result.action!.executionId).map(row => row.state)).toEqual(["requested", "authorized", "started"]);
    expect(counts(f)).toEqual({ action_executions: before.action_executions + 1,
      action_transitions: before.action_transitions + 3, evidence_events: before.evidence_events + 3, sessions: before.sessions + 3 });
    const later = await execute(f);
    expect(later.denied?.reason).toContain(`blocked_by_unreconciled:${result.action!.executionId}`);
    expect(f.sor.effects).toHaveLength(1);
    expect(chain(f, later.action!.executionId).map(row => row.state)).toEqual(["requested", "denied"]);
  });
});

describe("P1-03 failure row 3: a process dies without an acknowledgement", () => {
  test.each([
    ["crash_after_start_before_dispatch", 0], ["crash_after_dispatch_before_ack", 1]
  ] as const)("%s recovers unknown without replay", async (point, effects) => {
    const f = fixture();
    closeStores(f); // No parent SQLite descriptor is open while the child writes.
    const crash = await crashInChild(f.workspace, point, f.oracleFile, DELETION_TOOL);
    expect(crash).toMatchObject({ code: null, signal: "SIGKILL", spawnError: null, stdout: "", stderr: "" });
    expect(crash.pid).not.toBeNull();
    const cold = new Database(join(f.workspace, ".amc", "evidence.sqlite"), { readonly: true, fileMustExist: true });
    let id: string;
    try {
      const rows = cold.prepare("SELECT execution_id, state, intent_json FROM action_executions").all() as
        Array<{ execution_id: string; state: string; intent_json: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.state).toBe("started");
      expect(JSON.parse(rows[0]!.intent_json).owner.pid).toBe(crash.pid);
      id = rows[0]!.execution_id;
    } finally { cold.close(); }
    expect(f.sor.effects).toHaveLength(effects);
    const recovery = recoverActionJournal(f.workspace);
    expect(recovery).toEqual({ outcomeUnknown: [id], cancelled: [], integrityFailures: [] });
    f.journal = openActionJournal(f.workspace);
    f.ledger = openLedger(f.workspace);
    f.stores.push(f.journal, f.ledger);
    const receipts = chain(f, id);
    expect(receipts.map(row => row.state)).toEqual(["requested", "authorized", "started", "outcome_unknown"]);
    expect(receipts.at(-1)?.reasonCode).toBe("process_died");
    expect(recoverActionJournal(f.workspace)).toEqual({ outcomeUnknown: [], cancelled: [], integrityFailures: [] });
    expect(f.sor.effects).toHaveLength(effects);
    expect(f.sor.effectsWithoutIntent(journaledIntents(f.workspace))).toBe(0);
    const later = await execute(f);
    expect(later.denied?.reason).toContain(`blocked_by_unreconciled:${id}`);
    expect(f.sor.effects).toHaveLength(effects);
    expect(verifyLedgerIntegrity(f.workspace).chain.ok).toBe(true);
  });
});

describe("P1-03 failure row 4: authority changes before dispatch", () => {
  test("a real signed freeze at the guard seam ends in a signed recheck denial with no effect", async () => {
    const f = fixture();
    f.registry.guard("owned freeze after binding", () => { revoke(f.workspace, "DATA_EXPORT"); return undefined; });
    const result = await execute(f);
    expect(result.denied?.reason).toContain("action_class_frozen");
    expect(result.action?.state).toBe("denied");
    expect(f.sor.effects).toHaveLength(0);
    expect(chain(f, result.action!.executionId).at(-1)).toMatchObject({ state: "denied", reasonCode: "recheck_failed:action_class_frozen" });
  });
});

describe("P1-03 effect classification", () => {
  test.each([
    { label: "declared applied", kind: "applied", actionClass: "WRITE_HIGH", state: "completed", effect: "applied", effects: 1, reason: "effect_declared:applied" },
    { label: "declared not applied", kind: "not_applied", actionClass: "WRITE_HIGH", state: "completed", effect: "not_applied", effects: 0, reason: "effect_declared:not_applied" },
    { label: "declared unknown", kind: "unknown", actionClass: "WRITE_HIGH", state: "outcome_unknown", effect: null, effects: 1, reason: "effect_declared_unknown" },
    { label: "definite failure", kind: "definite", actionClass: "WRITE_HIGH", state: "completed", effect: "not_applied", effects: 0, reason: "definite_failure" },
    { label: "ambiguous throw after effect", kind: "ambiguous", actionClass: "WRITE_HIGH", state: "outcome_unknown", effect: null, effects: 1, reason: "body_threw_ambiguous" },
    { label: "undeclared financial", kind: "undeclared", actionClass: "FINANCIAL", state: "outcome_unknown", effect: null, effects: 1, reason: "effect_not_declared" },
    { label: "undeclared data export", kind: "undeclared", actionClass: "DATA_EXPORT", state: "outcome_unknown", effect: null, effects: 1, reason: "effect_not_declared" },
    { label: "undeclared identity", kind: "undeclared", actionClass: "IDENTITY", state: "outcome_unknown", effect: null, effects: 1, reason: "effect_not_declared" },
    { label: "ordinary undeclared effect", kind: "undeclared", actionClass: "WRITE_HIGH", state: "completed", effect: null, effects: 1, reason: "completed" }
  ] as const)("$label", async row => {
    const f = fixture({ actionClass: row.actionClass, body: (execution, sor) => {
      if (row.kind === "definite") throw new DefiniteFailureError("owned adapter proved no request left");
      if (row.kind === "not_applied") return { ok: true, output: "not sent", effect: "not_applied" };
      const effect = sor.deleteResource(String(execution.arguments.resourceId), execution.executionId!);
      if (row.kind === "ambiguous") throw new Error("owned adapter lost the acknowledgement");
      return { ok: true, output: effect.ref, ...(row.kind === "undeclared" ? {} : { effect: row.kind }), externalRef: effect.ref };
    } });
    const result = await execute(f, CUSTOM);
    expect(result.denied).toBeNull();
    expect(result.ok).toBe(row.kind !== "definite" && row.kind !== "ambiguous");
    expect(result.action).toMatchObject({ state: row.state, evidenceComplete: true });
    expect(existsSync(f.oracleFile)).toBe(true);
    expect(f.sor.effects).toHaveLength(row.effects);
    expect(chain(f, result.action!.executionId).at(-1)).toMatchObject({ state: row.state, effect: row.effect, reasonCode: row.reason });
  });
});

function seamRequest(f: Fixture, name: string, controller: AbortController): ToolCallRequest {
  return { callId: `p103-seam-${randomUUID()}`, toolName: name,
    rawArguments: JSON.stringify(name === CUSTOM ? CUSTOM_ARGUMENTS : FAULT_ARGUMENTS[DELETION_TOOL]),
    sessionId: f.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal: controller.signal };
}

describe("P1-03 the actual loop seam reports the receipt after cancellation", () => {
  test("an abort at the guard seam before start records cancelled and applies no effect", async () => {
    const controller = new AbortController();
    const f = fixture();
    f.registry.guard("owned pre-start abort", () => { controller.abort(); return undefined; });
    const seam = pipelineToolSeam({ registry: f.registry, pipeline: f.pipeline, agentId: "default" });
    const result = await seam.execute(seamRequest(f, DELETION_TOOL, controller));
    expect(result.outcome).toBe("CANCELLED");
    expect(f.sor.effects).toHaveLength(0);
    const rows = f.ledger.db.prepare("SELECT execution_id FROM action_executions").all() as Array<{ execution_id: string }>;
    expect(rows).toHaveLength(1);
    expect(chain(f, rows[0]!.execution_id).map(row => row.state)).toEqual(["requested", "cancelled"]);
  });

  test.each([false, true])("an abort after the effect never reports cancelled (ambiguous=%s)", async ambiguous => {
    const controller = new AbortController();
    const f = fixture({ body: (execution, sor) => {
      const effect = sor.deleteResource("owned-late-abort", execution.executionId!);
      controller.abort();
      if (ambiguous) throw new Error("acknowledgement lost after abort");
      return { ok: true, output: effect.ref, effect: "applied" };
    } });
    const seam = pipelineToolSeam({ registry: f.registry, pipeline: f.pipeline, agentId: "default" });
    const result = await seam.execute(seamRequest(f, CUSTOM, controller));
    expect(controller.signal.aborted).toBe(true);
    expect(result.outcome).toBe(ambiguous ? "TOOL_OUTCOME_UNKNOWN" : "OK");
    expect(f.sor.effects).toHaveLength(1);
    const rows = f.ledger.db.prepare("SELECT execution_id FROM action_executions").all() as Array<{ execution_id: string }>;
    expect(rows).toHaveLength(1);
    expect(chain(f, rows[0]!.execution_id).map(row => row.state)).toEqual([
      "requested", "authorized", "started", ambiguous ? "outcome_unknown" : "completed"
    ]);
  });
});


function gatedSubcall(f: Fixture): { pending: Promise<ToolOutcome>; callId: string } {
  const callId = `p103-subcall-${randomUUID()}`;
  return { callId, pending: f.pipeline.execute({ name: DELETION_TOOL, agentId: "default", requestedMode: "EXECUTE",
    arguments: { ...FAULT_ARGUMENTS[DELETION_TOOL] }, callId, rootCallId: `p103-root-${randomUUID()}`,
    parentToken: "p103-owned-parent" }) };
}

describe("P1-03 bound subcall gates must follow durable admission", () => {
  test("the deferred bound gate sees requested before it asks, with no authorization or effect", async () => {
    const f = fixture();
    let entered!: () => void;
    let release!: (answer: null) => void;
    const enteredGate = new Promise<void>(resolve => { entered = resolve; });
    const answer = new Promise<null>(resolve => { release = resolve; });
    f.pipeline.bindApprovalGate({ gates: name => name === DELETION_TOOL, ask: async () => { entered(); return answer; } });
    const { pending, callId } = gatedSubcall(f);
    let result: ToolOutcome;
    try {
      // An early refusal is reported, rather than waiting forever for an ask that cannot happen.
      expect(await Promise.race([enteredGate.then(() => "entered"), pending.then(() => "finished")])).toBe("entered");
      const rows = f.ledger.db.prepare("SELECT execution_id FROM action_executions WHERE call_id = ?").all(callId) as Array<{ execution_id: string }>;
      expect(rows, "requested must be committed before bound gate.ask").toHaveLength(1);
      expect(chain(f, rows[0]!.execution_id).map(row => row.state)).toEqual(["requested"]);
      expect(f.sor.effects).toHaveLength(0);
    } finally {
      release(null);
      result = await pending; // Never leave the human wait alive during fixture teardown.
    }
    expect(result.denied?.stage).toBe("approval");
    expect(result.action?.state).toBe("denied");
    expect(chain(f, result.action!.executionId).map(row => row.state)).toEqual(["requested", "denied"]);
    expect(f.sor.effects).toHaveLength(0);
  });

  test("an authentic prior unknown denies the gated subcall without asking", async () => {
    const f = fixture({ body: (execution, sor) => {
      sor.deleteResource("owned-prior-unknown", execution.executionId!);
      throw new Error("owned acknowledgement lost after effect");
    } });
    const prior = await execute(f, CUSTOM);
    expect(prior.action?.state).toBe("outcome_unknown");
    expect(chain(f, prior.action!.executionId).map(row => row.state)).toEqual(["requested", "authorized", "started", "outcome_unknown"]);
    expect(f.sor.effects).toHaveLength(1);
    let asks = 0;
    f.pipeline.bindApprovalGate({ gates: name => name === DELETION_TOOL, ask: async () => { asks += 1; return null; } });
    const { pending } = gatedSubcall(f);
    const result = await pending;
    expect(asks, "unreconciled admission must refuse before a bound ask").toBe(0);
    expect(result.denied?.reason).toContain(`blocked_by_unreconciled:${prior.action!.executionId}`);
    expect(chain(f, result.action!.executionId).map(row => row.state)).toEqual(["requested", "denied"]);
    expect(f.sor.effects).toHaveLength(1); // Only the deliberately staged prior effect.
  });

  test("an authority context that throws while the call enters is diagnosed as such, not journal_unavailable", async () => {
    const f = fixture(), code = "authority_store_unavailable", text = "the call's authority could not be decided";
    let contexts = 0;
    const pipeline = new ToolPipeline({ registry: f.registry, workspace: f.workspace, journal: () => f.journal,
      authorizationContext: () => {
        // The first read binds the journal request; the next, as the call enters, fails.
        if (++contexts > 1) throw new Error("owned authority context unavailable");
        return { sessionId: f.sessionId };
      } });
    pipeline.bindApprovalGate({ gates: name => name === DELETION_TOOL, ask: async () => ({ approvalRequestIds: [] }) });
    const result = await pipeline.execute({ name: DELETION_TOOL, agentId: "default", requestedMode: "EXECUTE",
      arguments: { ...FAULT_ARGUMENTS[DELETION_TOOL] }, callId: `p103-diagnosis-${randomUUID()}`, parentToken: "p103-owned-parent" });
    expect(result.denied?.stage).toBe("authorization");
    expect(result.denied?.reason).toContain(code); expect(result.denied?.reason).toContain(text);
    expect(result.denied?.reason).not.toContain("journal_unavailable");
    expect(chain(f, result.action!.executionId).map(row => row.state)).toEqual(["requested", "denied"]);
    expect(f.sor.effects).toHaveLength(0);
  });

  test("an unavailable request store refuses the gated subcall without asking", async () => {
    const f = fixture();
    f.journal = failingJournal(f.journal, new Set(["request"]));
    let asks = 0;
    f.pipeline.bindApprovalGate({ gates: name => name === DELETION_TOOL, ask: async () => { asks += 1; return null; } });
    const before = counts(f);
    const result = await gatedSubcall(f).pending;
    expect(asks, "request-store refusal must precede a bound ask").toBe(0);
    expect(result.denied?.reason).toContain("journal_unavailable");
    expect(result.denied?.reason).toContain("injected: request is down");
    expect(result.action).toBeUndefined();
    expect(counts(f)).toEqual(before);
    expect(f.sor.effects).toHaveLength(0);
  });
});


function evidence(f: Fixture): EvidenceEvent[] {
  return f.ledger.db.prepare("SELECT * FROM evidence_events ORDER BY rowid").all() as EvidenceEvent[];
}

function signedEvent(f: Fixture, event: EvidenceEvent): void {
  expect(verify(null, Buffer.from(event.event_hash, "hex"), f.monitor, Buffer.from(event.writer_sig, "base64"))).toBe(true);
  expect(getPublicKeyPem(f.workspace, "monitor")).toBe(f.monitor);
}

describe("P1-03 failure row 7: the real loop records its final provider failure", () => {
  test("a final HTTP401 after a journaled tool produces a signed incident and no later started", async () => {
    vi.stubEnv("AMC_SESSION_STORE", "sqlite");
    vi.stubEnv("AMC_OTEL_ENABLED", "false");
    resetSharedObservabilityExporterForTests();
    const f = fixture();
    const name = "p103.provider.effect";
    const args = { resourceId: "owned-provider-effect" };
    const tools = loadToolsConfig(f.workspace);
    tools.tools.allowedTools.push({ name, actionClass: "WRITE_HIGH", bindingFields: { resourceId: "resourceId" }, effects: { repeatable: false } });
    initToolsConfig(f.workspace, tools);
    f.registry.define(defineTool({ name, description: "Owned provider-failure witness", actionClass: "WRITE_HIGH",
      parameters: { type: "object", properties: { resourceId: { type: "string" } }, required: ["resourceId"], additionalProperties: false },
      body: execution => {
        const effect = f.sor.deleteResource(String(execution.arguments.resourceId), execution.executionId!);
        return { ok: true, output: effect.ref, effect: "applied", externalRef: effect.ref };
      } }));
    const store = openSessionEventStore(f.workspace, "sqlite");
    let storeClosed = false;
    f.stores.push({ close: () => { if (!storeClosed) { store.close(); storeClosed = true; } } });
    const session = new SessionService(f.workspace, store);
    session.open({ sessionId: f.sessionId, agentId: "default", harnessVersion: "3.2.0",
      compositionDigest: "p103-provider-composition", policyDigest: "p103-provider-policy" });
    const prompt = session.recordSystemPrompt("Use the owned tool, then report its result.");
    const registry = new AdapterRegistry();
    registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([toolStep("p103-tool-call", name, JSON.stringify(args))]),
      baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
    let dispatched = 0;
    const transport: HttpTransport = async request => {
      dispatched += 1;
      return dispatched === 1 ? silentTransport(request) : { status: 401, headers: { "content-type": "application/json" },
        body: bodyFromChunks(['{"error":{"message":"owned final provider rejection"}}']) };
    };
    const retry = recordingRetryRuntime();
    const llm = new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport });
    const driver = new AgentDriver({ session, llm, route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      systemPromptEventId: prompt.eventId, tools: pipelineToolSeam({ registry: f.registry, pipeline: f.pipeline, agentId: "default" }),
      retryRuntime: retry, config: { maxStepsPerTurn: 3 } });
    driver.followup("Apply the one owned effect.");
    await driver.whenIdle();
    session.close({ reason: "completed" });
    storeClosed = true;
    const all = evidence(f);
    const rows = all.filter(row => row.session_id === f.sessionId);
    expect(dispatched).toBe(2);
    expect(retry.waits).toEqual([]);
    expect(rows.filter(row => row.event_type === "request/header")).toHaveLength(2);
    const failures = rows.filter(row => row.event_type === "request/failure");
    expect(failures).toHaveLength(1);
    const retries = rows.filter(row => row.event_type === "loop/retry");
    expect(retries).toHaveLength(1);
    const decision = JSON.parse(retries[0]!.meta_json) as { decision: string; outcomeEventId: string; reason: string };
    expect(decision).toMatchObject({ decision: "give-up", outcomeEventId: failures[0]!.id });
    expect(rows.filter(row => row.event_type === "turn/end").map(row => readTurnEndMeta(row.meta_json)?.reason)).toEqual(["error"]);
    expect(rows.filter(row => row.event_type === "step/start")).toHaveLength(2);
    expect(rows.filter(row => row.event_type === "step/end")).toHaveLength(2);
    const executions = f.ledger.db.prepare("SELECT execution_id, session_id FROM action_executions").all() as Array<{ execution_id: string; session_id: string }>;
    expect(executions).toHaveLength(1);
    expect(executions[0]!.session_id).toBe(f.sessionId);
    expect(chain(f, executions[0]!.execution_id).map(row => row.state)).toEqual(["requested", "authorized", "started", "completed"]);
    expect(f.sor.effects).toHaveLength(1);
    expect(f.sor.effectsWithoutIntent(journaledIntents(f.workspace))).toBe(0);
    const afterFailure = all.slice(all.findIndex(row => row.id === failures[0]!.id) + 1);
    expect(afterFailure.filter(row => {
      const meta = JSON.parse(row.meta_json) as { auditType?: string; state?: string };
      return meta.auditType === "ACTION_STATE" && meta.state === "started";
    })).toHaveLength(0);
    const incidents = createIncidentStore(f.ledger.db).getIncidentsByAgent("default");
    expect(incidents).toHaveLength(1);
    const incident = incidents[0]!;
    expect(incident).toMatchObject({ severity: "WARN", state: "OPEN", triggerType: "ASSURANCE_FAILURE", triggerId: failures[0]!.id });
    expect(incident.title).toBe("Model provider outage during a session with journaled actions");
    expect(incident.description).toContain(decision.reason);
    const { signature, incident_hash, ...members } = incident;
    expect(computeIncidentHash(members)).toBe(incident_hash);
    expect(verify(null, Buffer.from(incident_hash, "hex"), f.monitor, Buffer.from(signature, "base64"))).toBe(true);
    for (const row of rows) signedEvent(f, row);
    expect(verifyLedgerIntegrity(f.workspace).chain.ok).toBe(true);
  });
});

describe("P1-03 failure row 8: actual exporter rejection preserves the journaled effect", () => {
  test("HTTP400 drops are signed and counted, and a second drop waits for the next minute", async () => {
    vi.stubEnv("AMC_OTEL_ENABLED", "false");
    resetSharedObservabilityExporterForTests();
    // An explicit isolation guard: do not silently discard another witness's pending loss.
    expect(takeDroppedTelemetry(), "this file must enter the exporter witness with no pending drops").toBe(0);
    const endpoint = "https://collector.p103.invalid/v1/traces";
    const fetchTarget = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("owned collector rejection", { status: 400 }));
    const exporter = new ObservabilityOTELExporter({ enabled: true, maxBufferSize: 8,
      targets: [{ kind: "otlp", endpoint: "https://collector.p103.invalid", enabledSignals: { traces: true, metrics: false, logs: false } }] });
    const flushes: ObservabilityFlushResult[] = [];
    let f: Fixture;
    f = fixture({ body: async execution => {
      const event = f.ledger.db.prepare(`SELECT e.* FROM action_transitions t JOIN evidence_events e ON e.id = t.evidence_event_id
        WHERE t.execution_id = ? AND json_extract(t.receipt_json, '$.state') = 'started'`).get(execution.executionId!) as EvidenceEvent | undefined;
      expect(event, "export a genuine committed started event").toBeDefined();
      signedEvent(f, event!);
      expect(f.journal.get(execution.executionId!)?.state).toBe("started");
      const effect = f.sor.deleteResource(`owned-exporter-${flushes.length}`, execution.executionId!);
      withWorkspaceScope(f.workspace, () => exporter.recordEvidenceEvent(event!));
      flushes.push(await exporter.flush());
      return { ok: true, output: effect.ref, effect: "applied", externalRef: effect.ref };
    } });
    let clock = Date.now();
    const firstTs = clock;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const droppedRows = () => evidence(f).filter(row => (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "TELEMETRY_DROPPED");
    const first = await execute(f, CUSTOM);
    expect(first).toMatchObject({ ok: true, denied: null, action: { state: "completed", evidenceComplete: true } });
    expect(chain(f, first.action!.executionId).map(row => row.state)).toEqual(["requested", "authorized", "started", "completed"]);
    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toMatchObject({ exported: { traces: 0, metrics: 0, logs: 0 },
      requests: [{ targetKind: "otlp", signal: "traces", endpoint, ok: false, status: 400, error: "HTTP 400" }] });
    expect(fetchTarget).toHaveBeenCalledTimes(1); // A residency refusal before fetch is not this witness.
    expect(droppedRows()).toHaveLength(1);
    expect(JSON.parse(droppedRows()[0]!.payload_inline!)).toMatchObject({ auditType: "TELEMETRY_DROPPED", dropped: 1, ts: firstTs });
    clock = firstTs + 1_000;
    const second = await execute(f, CUSTOM);
    expect(second).toMatchObject({ ok: true, denied: null, action: { state: "completed", evidenceComplete: true } });
    expect(chain(f, second.action!.executionId).at(-1)).toMatchObject({ state: "completed", evidenceComplete: true });
    expect(flushes).toHaveLength(2);
    expect(flushes[1]).toMatchObject({ exported: { traces: 0, metrics: 0, logs: 0 },
      requests: [{ targetKind: "otlp", signal: "traces", endpoint, ok: false, status: 400, error: "HTTP 400" }] });
    expect(fetchTarget).toHaveBeenCalledTimes(2);
    expect(droppedRows(), "the second actual loss is throttled, not emitted in the same minute").toHaveLength(1);
    expect(f.sor.effects).toHaveLength(2);
    clock = firstTs + 60_001;
    const trigger = await execute(f); // A normal journal transition drains the pending second loss; no manual note/drop call.
    expect(trigger).toMatchObject({ ok: true, denied: null, action: { state: "completed", evidenceComplete: true } });
    expect(chain(f, trigger.action!.executionId).at(-1)?.state).toBe("completed");
    const audits = droppedRows();
    expect(audits).toHaveLength(2);
    expect(audits.map(row => JSON.parse(row.payload_inline!))).toEqual([
      { auditType: "TELEMETRY_DROPPED", dropped: 1, sinceTs: null, ts: firstTs },
      { auditType: "TELEMETRY_DROPPED", dropped: 1, sinceTs: firstTs, ts: clock }
    ]);
    for (const row of audits) {
      signedEvent(f, row);
      const session = f.ledger.db.prepare("SELECT ended_ts FROM sessions WHERE session_id = ?").get(row.session_id) as { ended_ts: number | null };
      expect(session.ended_ts).not.toBeNull();
      // The exporter's own audit is excluded from its buffer: no loss feedback loop.
      withWorkspaceScope(f.workspace, () => exporter.recordEvidenceEvent(row));
    }
    expect(exporter.getBufferStats()).toEqual({ traces: 0, metrics: 0, logs: 0 });
    expect(takeDroppedTelemetry()).toBe(0);
    expect(f.sor.effects).toHaveLength(3);
    expect(fetchTarget.mock.calls.map(([url]) => String(url))).toEqual([endpoint, endpoint]);
    for (const [, init] of fetchTarget.mock.calls) expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(verifyLedgerIntegrity(f.workspace).chain.ok).toBe(true);
  });
});


function signedGateArtifact(f: Fixture, path: string, auditor: string): void {
  const bytes = readFileSync(path);
  const signature = JSON.parse(readFileSync(`${path}.sig`, "utf8")) as { signer: string; digestSha256: string; signature: string };
  expect(signature.signer).toBe("auditor");
  expect(signature.digestSha256).toBe(sha256Hex(bytes));
  expect(verify(null, Buffer.from(signature.digestSha256, "hex"), auditor, Buffer.from(signature.signature, "base64"))).toBe(true);
  expect(getPublicKeyPem(f.workspace, "auditor")).toBe(auditor);
}

function genuineGateGrant(f: Fixture, intent: AuthorizationIntentResult | null, auditor: string) {
  if (!intent?.ok) throw new Error(`The genuine bound gate has no valid intent: ${intent === null ? "missing" : intent.reason}`);
  const created = createApprovalForIntent({ workspace: f.workspace, agentId: "default", intentId: `p103-granted-${randomUUID()}`,
    toolName: PAYMENT_TOOL, actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high", intentPayload: intent.payload });
  signedGateArtifact(f, created.filePath, auditor);
  expect(created.request).toMatchObject({ requiredApprovals: 2, requireDistinctUsers: true });
  const reviewers = [{ id: "owned-owner", role: "OWNER" as const }, { id: "owned-auditor", role: "AUDITOR" as const }];
  for (const reviewer of reviewers) decideApprovalForIntent({ workspace: f.workspace, agentId: "default", approvalId: created.request.approvalRequestId,
    decision: "APPROVED", mode: "EXECUTE", reason: "Approve only the exact owned journaled payment",
    userId: reviewer.id, username: reviewer.id, userRoles: [reviewer.role], expectedRequestDigestSha256: approvalRequestBindingDigest(created.request) });
  const decisions = listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: created.request.approvalRequestId });
  expect(decisions).toHaveLength(2);
  expect(decisions.map(decision => decision.userId).sort()).toEqual(["owned-auditor", "owned-owner"]);
  for (const decision of decisions) signedGateArtifact(f, join(getAgentPaths(f.workspace, "default").rootDir,
    "approvals", "decisions", `${decision.approvalDecisionId}.json`), auditor);
  signedGateArtifact(f, created.filePath, auditor);
  expect(verifyApprovalForExecution({ workspace: f.workspace, approvalId: created.request.approvalRequestId, expectedAgentId: "default",
    expectedToolName: PAYMENT_TOOL, expectedActionClass: "FINANCIAL", expectedIntentHash: created.request.boundHashes.intentHash }))
    .toMatchObject({ ok: true, status: "QUORUM_MET" });
  return { id: created.request.approvalRequestId, request: created.request, authority: { approvalRequestIds: [created.request.approvalRequestId] } };
}

function grantedGateFixture() {
  vi.stubEnv("AMC_OTEL_ENABLED", "false");
  resetSharedObservabilityExporterForTests();
  const f = fixture();
  // These keys precede the new request, approval, decision and consumption artifacts below.
  const auditor = getPublicKeyPem(f.workspace, "auditor");
  for (const name of ["action-policy.yaml", "budgets.yaml", "approval-policy.yaml", "tools.yaml"]) {
    signedGateArtifact(f, join(f.workspace, ".amc", name), auditor);
  }
  const bodies: ToolExecution[] = [];
  const guards: ToolExecution[] = [];
  const recorded: Array<{ execution: RecordedToolCall; outcome: ToolOutcome }> = [];
  const registry = new ToolRegistry();
  for (const definition of faultTools(f.sor)) registry.define({ ...definition, body: execution => {
    bodies.push(execution);
    return definition.body(execution);
  } });
  registry.guard("capture the exact final bound execution", execution => { guards.push(execution); return undefined; });
  let context: AuthorizationContext = { sessionId: f.sessionId };
  f.registry = registry;
  f.pipeline = new ToolPipeline({ workspace: f.workspace, registry, journal: () => f.journal,
    authorizationContext: () => context, record: (execution, outcome) => { recorded.push({ execution, outcome }); } });
  let resume!: () => void;
  let entered!: (value: { execution: ToolExecution; intent: AuthorizationIntentResult | null }) => void;
  const resumed = new Promise<void>(resolve => { resume = resolve; });
  const entry = new Promise<{ execution: ToolExecution; intent: AuthorizationIntentResult | null }>(resolve => { entered = resolve; });
  const grants: Array<ReturnType<typeof genuineGateGrant>> = [];
  const errors: unknown[] = [];
  f.pipeline.bindApprovalGate({ gates: name => name === PAYMENT_TOOL, ask: async (execution, intent) => {
    entered({ execution, intent });
    await resumed;
    try {
      const grant = genuineGateGrant(f, intent, auditor); // Actual signed grant is minted only AFTER the controlled wait.
      grants.push(grant);
      return grant.authority;
    } catch (error) {
      errors.push(error); // The pipeline contains gate errors; preserve their real setup cause outside that containment.
      return null;
    }
  } });
  const callId = `p103-granted-call-${randomUUID()}`;
  const pending = f.pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", requestedMode: "EXECUTE", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] },
    callId, rootCallId: `p103-granted-root-${randomUUID()}`, parentToken: "p103-owned-granted-parent" });
  return { f, auditor, callId, pending, resume, bodies, guards, recorded, grants, errors,
    setContext(next: AuthorizationContext) { context = next; },
    entered: Promise.race([entry, pending.then(() => { throw new Error("The call finished before the genuine bound gate was entered"); })]) };
}

type GrantedFixture = ReturnType<typeof grantedGateFixture>;
function requestedAtGate(h: GrantedFixture) {
  const rows = h.f.ledger.db.prepare("SELECT execution_id FROM action_executions WHERE call_id = ?").all(h.callId) as Array<{ execution_id: string }>;
  expect(rows, "durable admission precedes the genuine granted gate").toHaveLength(1);
  const receipt = chain(h.f, rows[0]!.execution_id);
  expect(receipt.map(row => row.state)).toEqual(["requested"]);
  expect(receipt[0]!.idempotencyKey).toMatch(/^amc1_[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(h.bodies).toHaveLength(0);
  expect(h.recorded).toHaveLength(0);
  expect(h.f.sor.effects).toHaveLength(0);
  return { id: rows[0]!.execution_id, key: receipt[0]!.idempotencyKey!, receiptDigest: receiptDigest(receipt[0]!), at: receipt[0]!.at };
}

function assertGrantedIdentity(h: GrantedFixture, requested: ReturnType<typeof requestedAtGate>, outcome: ToolOutcome) {
  if (h.errors.length) throw new AggregateError(h.errors, "Genuine gate setup failed; this is not an ordering assertion");
  expect(h.grants).toHaveLength(1);
  expect(outcome).toMatchObject({ ok: true, denied: null, action: { state: "completed", evidenceComplete: true, executionId: requested.id } });
  expect(h.bodies).toHaveLength(1);
  expect(h.guards).toHaveLength(1);
  expect(h.recorded).toHaveLength(1);
  const body = h.bodies[0]!;
  expect(h.guards[0]).toBe(body);
  expect(h.recorded[0]!.execution).toBe(body);
  expect(h.recorded[0]!.outcome).toEqual(outcome);
  expect(body.authorization, "the actual granted body must carry its final authorization").toBeDefined();
  const authorization = body.authorization!;
  expect(authorization.digest).toBe(authorizationRecordDigest(authorization.record));
  expect(authorization.record).toMatchObject({ executionId: requested.id, idempotencyKey: requested.key,
    session: { sessionId: h.f.sessionId, callId: h.callId, parentToken: "p103-owned-granted-parent" }, delegation: { parentExecutionId: null } });
  expect(authorization.record.authority.approvals[0]!.approverIds).toEqual(["owned-auditor", "owned-owner"]);
  expect(body).toMatchObject({ executionId: requested.id, idempotencyKey: requested.key, idempotencyHeader: "Idempotency-Key" });
  const receipts = chain(h.f, requested.id);
  expect(receipts.map(row => row.state)).toEqual(["requested", "authorized", "started", "completed"]);
  expect(receiptDigest(receipts[0]!)).toBe(requested.receiptDigest);
  expect(receipts.map(row => row.idempotencyKey)).toEqual(Array(4).fill(requested.key));
  expect(receipts.slice(1).map(row => row.authorizationDigest)).toEqual(Array(3).fill(authorization.digest));
  const view = h.f.journal.get(requested.id)!;
  expect(view.intent).toMatchObject({ executionId: requested.id, idempotencyKey: requested.key,
    authorizationDigest: authorization.digest, sessionId: h.f.sessionId, callId: h.callId, parentExecutionId: null });
  expect(h.f.sor.effects).toHaveLength(1);
  expect(h.f.sor.effects[0]).toMatchObject({ kind: "payment", key: requested.key, executionId: requested.id });
  expect(h.f.sor.duplicateEffects()).toBe(0);
  expect(h.f.sor.effectsWithoutIntent(journaledIntents(h.f.workspace))).toBe(0);
  expect(loadApprovalConsumed({ workspace: h.f.workspace, agentId: "default", approvalRequestId: h.grants[0]!.id }))
    .toMatchObject({ approvalRequestId: h.grants[0]!.id, agentId: "default", executionId: requested.id });
  signedGateArtifact(h.f, join(getAgentPaths(h.f.workspace, "default").rootDir, "approvals", "consumed", `${h.grants[0]!.id}.json`), h.auditor);
  expect(verifyLedgerIntegrity(h.f.workspace).chain.ok).toBe(true);
  return authorization.record;
}

describe("P1-03 genuine granted bound-gate identity and fresh binding", () => {
  test.each([{ label: "ordinary wait", waitMs: 0 }, { label: "six-minute human wait", waitMs: 6 * 60_000 }])("$label", async ({ waitMs }) => {
    const h = grantedGateFixture();
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    let requested!: ReturnType<typeof requestedAtGate>;
    let outcome!: ToolOutcome;
    try {
      const entry = await h.entered;
      expect(entry.intent?.ok).toBe(true);
      requested = requestedAtGate(h);
      expect(h.grants).toHaveLength(0);
      clock = Math.max(clock, Date.parse(requested.at)) + waitMs;
    } finally {
      h.resume();
      outcome = await h.pending; // Natural callback settlement is always awaited before store cleanup.
      if (h.errors.length) throw new AggregateError(h.errors, "Genuine gate setup failed while settling; this is not a product ordering assertion");
    }
    const record = assertGrantedIdentity(h, requested, outcome);
    expect(h.grants[0]!.request.createdTs).toBe(clock);
    expect(Date.parse(record.issuedAt)).toBe(clock);
    expect(Date.parse(record.issuedAt) - Date.parse(requested.at)).toBeGreaterThanOrEqual(waitMs);
    expect(Date.parse(record.expiresAt)).toBe(clock + 5 * 60_000);
    expect(Date.parse(record.expiresAt)).toBeLessThan(h.grants[0]!.request.expiresTs);
  });

  test.each(["session", "parent"] as const)("%s context drift refuses before spending the genuine grant", async kind => {
    const h = grantedGateFixture();
    let requested!: ReturnType<typeof requestedAtGate>;
    let outcome!: ToolOutcome;
    try {
      await h.entered;
      requested = requestedAtGate(h);
      // These are trusted composition attribution changes, not forged authorization/approval artifacts.
      h.setContext(kind === "session" ? { sessionId: `p103-other-session-${randomUUID()}` }
        : { sessionId: h.f.sessionId, delegation: { depth: 1, parentExecutionId: `p103-other-parent-${randomUUID()}`, allowedActionClasses: ["FINANCIAL"] } });
    } finally {
      h.resume();
      outcome = await h.pending;
      if (h.errors.length) throw new AggregateError(h.errors, "Genuine gate setup failed while settling; this is not a product ordering assertion");
    }
    if (h.errors.length) throw new AggregateError(h.errors, "Genuine gate setup failed; this is not a context-drift assertion");
    expect(h.grants).toHaveLength(1);
    expect(outcome).toMatchObject({ ok: false, action: { state: "denied", executionId: requested.id } });
    // Attribution drift is an intent mismatch, not an unavailable authority store.
    expect(outcome.denied?.reason).toContain("approval_intent_mismatch");
    expect(outcome.denied?.reason).toContain("the authorization context no longer names the requested session and parent");
    expect(h.bodies).toHaveLength(0);
    expect(h.f.sor.effects).toHaveLength(0);
    const receipts = chain(h.f, requested.id);
    expect(receipts.map(row => row.state)).toEqual(["requested", "denied"]);
    expect(receipts.at(-1)?.reasonCode).toBe("authorization_denied:approval_intent_mismatch");
    expect(receipts.map(row => row.idempotencyKey)).toEqual([requested.key, requested.key]);
    expect(receiptDigest(receipts[0]!)).toBe(requested.receiptDigest);
    expect(h.f.journal.get(requested.id)?.intent).toBeNull();
    const attribution = h.f.ledger.db.prepare("SELECT session_id, parent_execution_id FROM action_executions WHERE execution_id = ?")
      .get(requested.id) as { session_id: string | null; parent_execution_id: string | null };
    expect(attribution).toEqual({ session_id: h.f.sessionId, parent_execution_id: null });
    expect(loadApprovalConsumed({ workspace: h.f.workspace, agentId: "default", approvalRequestId: h.grants[0]!.id })).toBeNull();
    expect(verifyApprovalForExecution({ workspace: h.f.workspace, approvalId: h.grants[0]!.id, expectedAgentId: "default",
      expectedToolName: PAYMENT_TOOL, expectedActionClass: "FINANCIAL", expectedIntentHash: h.grants[0]!.request.boundHashes.intentHash }))
      .toMatchObject({ ok: true, status: "QUORUM_MET" });
    expect(verifyLedgerIntegrity(h.f.workspace).chain.ok).toBe(true);
  });
});

// WP13 extends the actual signed journal/bound-gate fixture. Conditional admission owns no external resources yet.
test.each(["step end", "new step", "restriction", "guard restriction"] as const)(
  "WP13 %s revokes a journaled call across a genuine signed approval wait", async change => {
    const f = fixture();
    const auditor = getPublicKeyPem(f.workspace, "auditor");
    const registry = new ToolRegistry();
    const payment = faultTools(f.sor).find(definition => definition.name === PAYMENT_TOOL)!;
    const body = vi.fn(payment.body);
    registry.define({ ...payment, available: () => true, body });
    const dispose = await registry.prepareStep({ agentId: "default", turn: 1, step: 1, signal: new AbortController().signal });
    let next: (() => void) | undefined;
    const pipeline = new ToolPipeline({ workspace: f.workspace, registry, journal: () => f.journal,
      authorizationContext: () => ({ sessionId: f.sessionId }) });
    let entered!: () => void;
    let resume!: () => void;
    const entry = new Promise<void>(resolve => { entered = resolve; });
    const resumed = new Promise<void>(resolve => { resume = resolve; });
    const errors: unknown[] = [];
    let grant: ReturnType<typeof genuineGateGrant> | undefined;
    pipeline.bindApprovalGate({ gates: name => name === PAYMENT_TOOL, ask: async (_execution, intent) => {
      entered();
      await resumed;
      try { grant = genuineGateGrant(f, intent, auditor); return grant.authority; }
      catch (error) { errors.push(error); return null; }
    } });
    const callId = `wp13-journaled-${randomUUID()}`;
    const pending = pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] },
      requestedMode: "EXECUTE", callId, parentToken: "wp13-owned-granted-parent" });
    let outcome!: ToolOutcome;
    try {
      await Promise.race([entry, pending.then(() => { throw new Error("WP13 call finished before its bound approval gate"); })]);
      const rows = f.ledger.db.prepare("SELECT execution_id FROM action_executions WHERE call_id = ?").all(callId) as Array<{ execution_id: string }>;
      expect(rows).toHaveLength(1);
      expect(chain(f, rows[0]!.execution_id).map(receipt => receipt.state)).toEqual(["requested"]);
      if (change === "step end" || change === "new step") dispose();
      if (change === "new step") next = await registry.prepareStep({ agentId: "default", turn: 1, step: 2, signal: new AbortController().signal });
      if (change === "restriction") registry.restrict({ deny: new Set([PAYMENT_TOOL]) });
      if (change === "guard restriction") registry.guard("WP13 late scope narrowing", () => {
        registry.restrict({ deny: new Set([PAYMENT_TOOL]) }, "default"); return undefined;
      });
    } finally {
      resume();
      outcome = await pending;
      dispose(); next?.();
    }
    if (errors.length) throw new AggregateError(errors, "WP13 genuine signed gate fixture failed");
    expect(grant).toBeDefined();
    expect(outcome).toMatchObject({ ok: false, denied: { stage: "visibility" }, action: { state: "denied", evidenceComplete: true } });
    expect(body).not.toHaveBeenCalled();
    expect(f.sor.effects).toHaveLength(0);
    const receipts = chain(f, outcome.action!.executionId);
    expect(receipts.map(receipt => receipt.state)).not.toContain("started");
    expect(receipts.at(-1)).toMatchObject({ state: "denied", reasonCode: "tool_availability_revoked" });
    expect(loadApprovalConsumed({ workspace: f.workspace, agentId: "default", approvalRequestId: grant!.id })).toBeNull();
    expect(verifyLedgerIntegrity(f.workspace).chain.ok).toBe(true);
  }
);

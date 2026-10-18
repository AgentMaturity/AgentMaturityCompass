import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openActionJournal, type ActionJournal } from "../src/actions/actionJournal.js";
import { bindAuthorization } from "../src/actions/authorize.js";
import { openAgentSession } from "../src/agent/agentSession.js";
import { verifyAgentRun } from "../src/agent/runReport.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import {
  deriveExecutionStatus, EXECUTION_PHASES, EXECUTION_SURFACES, EXECUTION_VERBS, parseExecutionStatus, type ExecutionFacts
} from "../src/execution/executionContract.js";
import { executionStatusFor, sessionReceiptStates } from "../src/execution/executionStatus.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { closeSqlitePool } from "../src/storage/sqlitePool.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { FAULT_ARGUMENTS, PAYMENT_TOOL, prepareFaultWorkspace } from "./helpers/actionFaults.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";

/** P2-13: the phase derivation table, the wire parser, and the receipt states read from verified journal chains. */
const facts = (overrides: Partial<ExecutionFacts>): ExecutionFacts =>
  ({ sessionId: "s-1", admission: "admitted", turn: "complete", receiptStates: [], verified: null, ...overrides });
const phases = (overrides: Partial<ExecutionFacts>) => deriveExecutionStatus(facts(overrides)).phases;

describe("phase derivation (P2-13)", () => {
  it("before an answer every phase is pending", () => {
    expect(phases({ admission: null, turn: null })).toEqual({ admission: "pending", "model-completion": "pending",
      "side-effect-completion": "pending", "evidence-verification": "pending" });
  });

  it("a finished turn never implies verified evidence, and verified evidence never implies a finished turn", () => {
    expect(phases({})).toEqual({ admission: "succeeded", "model-completion": "succeeded", "side-effect-completion": "succeeded",
      "evidence-verification": "pending" });
    expect(phases({ turn: "running", verified: true })).toMatchObject({ "model-completion": "pending", "evidence-verification": "succeeded" });
    expect(phases({ verified: false })).toMatchObject({ "model-completion": "succeeded", "evidence-verification": "failed" });
  });

  it("model succeeded while a side effect is outcome_unknown, or its evidence incomplete, reads unknown", () => {
    expect(phases({ receiptStates: ["completed", "outcome_unknown"] })).toMatchObject({ "model-completion": "succeeded", "side-effect-completion": "unknown" });
    expect(phases({ receiptStates: ["evidence_incomplete"] })["side-effect-completion"]).toBe("unknown");
    expect(phases({ receiptStates: null })["side-effect-completion"]).toBe("unknown");
    expect(phases({ receiptStates: ["a_future_state"] })["side-effect-completion"]).toBe("unknown");
  });

  it("an open action is pending while its turn runs and unknown once the turn ended without settling it", () => {
    expect(phases({ turn: "running", receiptStates: ["started"] })["side-effect-completion"]).toBe("pending");
    expect(phases({ receiptStates: ["started"] })["side-effect-completion"]).toBe("unknown");
    expect(phases({ receiptStates: ["requested"] })["side-effect-completion"]).toBe("unknown");
  });

  it("settled actions succeed, denied and cancelled included; a broken chain fails above everything else", () => {
    expect(phases({ receiptStates: ["cancelled", "completed", "denied"] })["side-effect-completion"]).toBe("succeeded");
    expect(phases({ receiptStates: ["integrity_failed", "outcome_unknown"] })["side-effect-completion"]).toBe("failed");
  });

  it("only a complete turn is a finished model turn; a blocked one is refused", () => {
    expect(phases({ turn: "blocked" })["model-completion"]).toBe("refused");
    for (const turn of ["cancelled", "max_tokens", "max_steps", "error", "interrupted"] as const) expect(phases({ turn })["model-completion"]).toBe("failed");
    expect(phases({ turn: "renamed" as never })["model-completion"]).toBe("unknown");
    expect(phases({ admission: "refused", turn: null })).toMatchObject({ admission: "refused", "model-completion": "pending" });
  });
});

describe("the wire shape and the surface table (P2-13)", () => {
  it("parses only the exact shape, never repairs it", () => {
    const status = deriveExecutionStatus(facts({ receiptStates: ["completed"] }));
    expect(parseExecutionStatus(JSON.parse(JSON.stringify(status)))).toEqual(status);
    const wire = JSON.parse(JSON.stringify(status)) as Record<string, unknown>;
    for (const bad of [{ ...wire, extra: 1 }, { ...wire, phases: { ...status.phases, admission: "maybe" } },
      { ...wire, phases: { admission: "succeeded" } }, { ...wire, receiptStates: [1] }, { ...wire, sessionId: 7 }, null, []]) {
      expect(parseExecutionStatus(bad)).toBeNull();
    }
  });

  it("names every verb on every surface", () => {
    for (const surface of Object.values(EXECUTION_SURFACES)) expect(Object.keys(surface).sort()).toEqual([...EXECUTION_VERBS].sort());
    expect(EXECUTION_PHASES).toHaveLength(4);
  });
});

describe("receipt states from verified journal chains (P2-13 over P1-03)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      closeSqlitePool(`ledger:${resolve(root)}:${join(root, ".amc", "evidence.sqlite")}`);
      lockVault(root); rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });
  function workspace(): string {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p213-receipts-")));
    roots.push(root);
    const home = join(root, "home"); mkdirSync(home, { mode: 0o700 });
    vi.stubEnv("HOME", home); vi.stubEnv("AMC_HOME", home);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", `p213-${randomUUID()}`);
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
    vi.stubEnv("AMC_LEDGER_SQLITE_POOL_SIZE", "1");
    prepareFaultWorkspace(root);
    return root;
  }
  function journaled(root: string, journal: ActionJournal, sessionId: string, end: "completed" | "outcome_unknown"): string {
    const callId = `call-${randomUUID()}`;
    const execution: ToolExecution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null, workspace: root, name: PAYMENT_TOOL,
      agentId: "default", actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] } };
    const bound = bindAuthorization(execution, { sessionId });
    if (!bound.ok) throw new Error(bound.reason);
    const id = bound.record.executionId;
    journal.request({ executionId: id, agentId: "default", toolName: PAYMENT_TOOL, actionClass: "FINANCIAL", sessionId, callId,
      parentExecutionId: null, idempotencyKey: bound.record.idempotencyKey });
    journal.authorize(id, bound.digest);
    journal.start(id, bound.record);
    if (end === "completed") journal.complete(id, { effect: "applied", outcomeDigest: sha256Hex("p213"), externalRef: null, reasonCode: "p213_completed" });
    else journal.markUnknown(id, "p213_ambiguous");
    return id;
  }

  it("reports each verified head, outcome_unknown makes side effects unknown, and a broken or hidden chain is an integrity failure", () => {
    const root = workspace(), sessionId = `session-${randomUUID()}`;
    expect(sessionReceiptStates(root, sessionId)).toEqual([]);
    const journal = openActionJournal(root);
    let unknownId: string;
    try {
      journaled(root, journal, `other-${randomUUID()}`, "completed");
      journaled(root, journal, sessionId, "completed");
      // Last: an outcome_unknown execution blocks this agent's later journaled starts (P1-03).
      unknownId = journaled(root, journal, sessionId, "outcome_unknown");
    } finally { journal.close(); }
    const status = executionStatusFor(root, { sessionId, admission: "admitted", turn: "complete", verified: null });
    expect(status.receiptStates).toEqual(["completed", "outcome_unknown"]);
    expect(status.phases).toMatchObject({ "model-completion": "succeeded", "side-effect-completion": "unknown", "evidence-verification": "pending" });

    closeSqlitePool(`ledger:${resolve(root)}:${join(root, ".amc", "evidence.sqlite")}`);
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try { db.pragma("foreign_keys = OFF"); db.prepare("DELETE FROM action_executions WHERE execution_id = ?").run(unknownId); } finally { db.close(); }
    // The signed ACTION_STATE rows still name it; its chain no longer matches an index row, so it fails, never vanishes.
    expect(sessionReceiptStates(root, sessionId)).toEqual(["completed", "integrity_failed"]);
    expect(executionStatusFor(root, { sessionId, admission: "admitted", turn: "complete", verified: null }).phases["side-effect-completion"]).toBe("failed");
  });
});

describe("evidence verification is its own phase (P2-13)", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });

  it("a tampered log fails verification while the recorded model turn stays succeeded", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", `p213-${randomUUID()}`);
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p213-verify-")));
    roots.push(root);
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    const registry = new AdapterRegistry();
    registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("done")]), baseUrl: "https://api.anthropic.invalid",
      credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
    const session = openAgentSession({ workspace: root, agentId: "default", tools: "none",
      makeLlm: (s) => new LlmRuntime({ session: s, credentials: new FixedCredentials(), registry, transport: silentTransport }),
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} }, systemPrompt: "s", harnessVersion: "p213",
      compositionDigest: "composition", policyDigest: "policy" });
    const result = await session.prompt("hello");
    await session.close();
    expect(result.ok && result.turnEndReason).toBe("complete");
    const turn = result.ok ? result.turnEndReason ?? null : null;
    const verified = await verifyAgentRun(root, session.sessionId);
    expect(executionStatusFor(root, { sessionId: session.sessionId, admission: "admitted", turn, verified: verified.ok }).phases)
      .toEqual({ admission: "succeeded", "model-completion": "succeeded", "side-effect-completion": "succeeded", "evidence-verification": "succeeded" });

    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      db.prepare("UPDATE evidence_events SET payload_sha256 = ? WHERE id = (SELECT id FROM evidence_events WHERE session_id = ? ORDER BY rowid LIMIT 1 OFFSET 2)")
        .run("0".repeat(64), session.sessionId);
    } finally { db.close(); }
    const tampered = await verifyAgentRun(root, session.sessionId);
    expect(tampered.ok).toBe(false);
    expect(executionStatusFor(root, { sessionId: session.sessionId, admission: "admitted", turn, verified: tampered.ok }).phases)
      .toMatchObject({ "model-completion": "succeeded", "evidence-verification": "failed" });
  }, 60_000);
});

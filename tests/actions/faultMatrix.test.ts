import { verify } from "node:crypto";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, test } from "vitest";
import { recoverActionJournal } from "../../src/actions/actionRecovery.js";
import { reconcile } from "../../src/actions/reconcile.js";
import { type ActionReceiptV1 } from "../../src/actions/receiptStates.js";
import type { ToolOutcome } from "../../src/tools/toolTypes.js";
import { canonicalize } from "../../src/utils/json.js";
import { FAULT_POINTS, PAYMENT_TOOL, PAYMENT_ADAPTER, DELETION_TOOL, breakAuthorityStore,
  crashInChild, failingJournal, revoke, type FaultPoint, type FaultTool } from "../helpers/actionFaults.js";
import { checkedChain, createP104Fixture, oracleCounts, settleByOperator, type P104Fixture } from "../helpers/p104Qualification.js";

/* Sixteen nominal cells. The independent JSON log is the effect oracle, not the journal's claimed effect.
 * Actual default P1-02 authorization remains enabled. These local signed decisions do not authenticate a human.
 * Original P1-03 tests and helpers remain unchanged; their earlier runs are not P1-04 matrix results. */
interface MatrixRow {
  tool: FaultTool; fault: FaultPoint; status: "passed" | "failed";
  fixtureRoot: string; observations: unknown[]; error?: string;
  counts: ReturnType<typeof oracleCounts> | null; captureError?: string; cleanupError?: string;
  signedRows: unknown[]; publicKeys: { monitor: string; auditor: string };
}
const rows: MatrixRow[] = [];
const tools = [PAYMENT_TOOL, DELETION_TOOL] as const;
const actionClass = (tool: FaultTool) => tool === PAYMENT_TOOL ? "FINANCIAL" as const : "DATA_EXPORT" as const;

function id(outcome: ToolOutcome): string {
  expect(outcome.action?.executionId).toBeTruthy(); return outcome.action!.executionId;
}
function head(f: P104Fixture, executionId: string): ActionReceiptV1 { return checkedChain(f, executionId).at(-1)!; }
function exactEffects(f: P104Fixture, expected: number): void {
  const counts = oracleCounts(f);
  expect(counts.effects).toHaveLength(expected);
  expect(counts.duplicateEffects).toBe(0); expect(counts.effectsWithoutIntent).toBe(0);
}
async function blockedWithoutEffect(f: P104Fixture, tool: FaultTool, firstId: string, expected: number, run = f.run) {
  const before = canonicalize(f.sor.effects);
  const later = await run(tool);
  f.observations.push({ kind: "same-intent-later-call", outcome: later });
  expect(later.ok).toBe(false);
  expect(later.denied?.reason).toMatch(/blocked_by_unreconciled|possible_duplicate_of/);
  expect(later.denied?.reason).toContain(firstId);
  expect(canonicalize(f.sor.effects)).toBe(before); exactEffects(f, expected);
  expect(head(f, id(later)).state).toBe("denied");
}

async function settleWithoutDispatch(f: P104Fixture, tool: FaultTool, executionId: string, expected: number) {
  const before = canonicalize(f.sor.effects), beforeLookups = f.sor.lookups;
  const prior = head(f, executionId);
  const result = await reconcile(executionId, { workspace: f.workspace,
    adapters: new Map([[PAYMENT_ADAPTER, f.sor.adapter(PAYMENT_ADAPTER)]]) });
  f.observations.push({ kind: "reconcile", result });
  expect(canonicalize(f.sor.effects)).toBe(before); exactEffects(f, expected);
  if (tool === PAYMENT_TOOL) {
    expect(result).toMatchObject({ after: "completed", effect: expected === 0 ? "not_applied" : "applied", mismatches: [],
      receipt: { resolution: "adapter", evidenceComplete: true } });
    expect(f.sor.lookups).toBe(beforeLookups + 1);
  } else {
    expect(result).toMatchObject({ after: prior.state, receipt: null, observation: { kind: "unknown" } });
    expect(result.observation.kind === "unknown" && result.observation.reason).toContain("no_adapter:");
    expect(f.sor.lookups).toBe(beforeLookups);
    expect(head(f, executionId)).toMatchObject({ state: prior.state, evidenceComplete: prior.evidenceComplete });
    const receipt = settleByOperator(f, executionId, expected === 0 ? "not_applied" : "applied", f.sor.effects[0]?.ref ?? null);
    expect(receipt.resolution).toBe("operator");
    expect(canonicalize(f.sor.effects)).toBe(before); exactEffects(f, expected);
  }
  expect(head(f, executionId)).toMatchObject({ state: "completed", evidenceComplete: true,
    effect: expected === 0 ? "not_applied" : "applied" });
  const noOp = await reconcile(executionId, { workspace: f.workspace, adapters: new Map([[PAYMENT_ADAPTER, f.sor.adapter()]]) });
  f.observations.push({ kind: "reconcile-complete-noop", result: noOp });
  expect(noOp.receipt).toBeNull(); expect(canonicalize(f.sor.effects)).toBe(before); exactEffects(f, expected);
}

function retainPublicRows(f: P104Fixture): unknown[] {
  const records = f.ledger.db.prepare(`SELECT t.execution_id, t.seq, t.receipt_json, t.receipt_digest, e.*,
    s.started_ts, s.ended_ts, s.session_final_event_hash, s.session_seal_sig FROM action_transitions t
    JOIN evidence_events e ON e.id = t.evidence_event_id JOIN sessions s ON s.session_id = e.session_id
    ORDER BY t.execution_id, t.seq`).all() as Array<{ event_hash: string; writer_sig: string;
      session_final_event_hash: string; session_seal_sig: string; ended_ts: number | null }>;
  for (const row of records) {
    expect(row.ended_ts).not.toBeNull(); expect(row.session_final_event_hash).toBe(row.event_hash);
    expect(verify(null, Buffer.from(row.event_hash, "hex"), f.monitor, Buffer.from(row.writer_sig, "base64"))).toBe(true);
    expect(verify(null, Buffer.from(row.session_final_event_hash, "hex"), f.monitor, Buffer.from(row.session_seal_sig, "base64"))).toBe(true);
  }
  return records;
}

describe.each(tools)("P1-04 observed fault matrix: %s", tool => {
  test.each(FAULT_POINTS)("%s", async fault => {
    let f!: P104Fixture, passed = false, restoreAuthority: (() => void) | undefined;
    let failure: unknown;
    f = createP104Fixture({ recorderFails: fault === "recorder_down_after_effect",
      faults: { loseReply: fault === "provider_applied_receipt_lost",
        ...(fault === "revocation_during_dispatch" ? { afterEffect: () => revoke(f.workspace, actionClass(tool)) } : {}) } });
    const observed: unknown[] = [];
    try {
      if (fault === "journal_down_before_request") {
        f.journal = failingJournal(f.journal, new Set(["request"]));
        const outcome = await f.run(tool); observed.push({ outcome });
        expect(outcome.ok).toBe(false); expect(outcome.denied?.reason).toContain("journal_unavailable");
        expect(outcome.denied?.reason).toContain("injected: request is down"); expect(outcome.action).toBeUndefined();
        expect(f.beforeEffects).toHaveLength(0); exactEffects(f, 0);
      } else if (fault === "authority_store_down_at_recheck" || fault === "revocation_before_dispatch") {
        f.registry.guard("owned change after binding", () => {
          if (fault === "authority_store_down_at_recheck") restoreAuthority = breakAuthorityStore(f.workspace);
          else revoke(f.workspace, actionClass(tool));
          return undefined;
        });
        const outcome = await f.run(tool); observed.push({ outcome });
        if (restoreAuthority) { restoreAuthority(); restoreAuthority = undefined; }
        expect(outcome.ok).toBe(false);
        const reason = fault === "authority_store_down_at_recheck" ? "authority_store_unavailable" : "action_class_frozen";
        expect(outcome.denied?.reason).toContain(reason);
        expect(head(f, id(outcome))).toMatchObject({ state: "denied", reasonCode: `recheck_failed:${reason}` });
        expect(f.beforeEffects).toHaveLength(0); exactEffects(f, 0);
      } else if (fault === "crash_after_start_before_dispatch" || fault === "crash_after_dispatch_before_ack") {
        const expected = fault === "crash_after_start_before_dispatch" ? 0 : 1;
        f.closeStores(); // The parent retains no live or idle pooled ledger descriptor while the child writes.
        const crash = await crashInChild(f.workspace, fault, f.oracleFile, tool); observed.push({ crash });
        // Child exit0 means the crash seam was missed, not a passing crash witness.
        expect(crash).toMatchObject({ code: null, signal: "SIGKILL", spawnError: null, stdout: "", stderr: "" });
        expect(crash.pid).not.toBeNull();
        const cold = new Database(join(f.workspace, ".amc", "evidence.sqlite"), { readonly: true, fileMustExist: true });
        let executionId: string;
        try {
          const stored = cold.prepare("SELECT execution_id, state, intent_json, idempotency_key FROM action_executions").all() as
            Array<{ execution_id: string; state: string; intent_json: string; idempotency_key: string }>;
          observed.push({ beforeRecoveryRows: stored });
          expect(stored).toHaveLength(1); expect(stored[0]!.state).toBe("started");
          const intent = JSON.parse(stored[0]!.intent_json) as { owner: { pid: number }; idempotencyKey: string };
          expect(intent.owner.pid).toBe(crash.pid); expect(intent.idempotencyKey).toBe(stored[0]!.idempotency_key);
          expect(intent.idempotencyKey).toMatch(/^amc1_[0-9A-HJKMNP-TV-Z]{26}$/);
          executionId = stored[0]!.execution_id;
        } finally { cold.close(); }
        expect(f.sor.effects).toHaveLength(expected);
        const recovery = recoverActionJournal(f.workspace); observed.push({ recovery });
        expect(recovery).toEqual({ outcomeUnknown: [executionId!], cancelled: [], integrityFailures: [] });
        expect(checkedChain(f, executionId!).map(receipt => receipt.state)).toEqual(["requested", "authorized", "started", "outcome_unknown"]);
        exactEffects(f, expected);
        const before = canonicalize(f.sor.effects);
        expect(recoverActionJournal(f.workspace)).toEqual({ outcomeUnknown: [], cancelled: [], integrityFailures: [] });
        expect(canonicalize(f.sor.effects)).toBe(before);
        await blockedWithoutEffect(f, tool, executionId!, expected);
        await settleWithoutDispatch(f, tool, executionId!, expected);
      } else if (fault === "provider_applied_receipt_lost" || fault === "recorder_down_after_effect") {
        const outcome = await f.run(tool); observed.push({ outcome });
        expect(outcome.denied).toBeNull();
        const executionId = id(outcome);
        if (fault === "provider_applied_receipt_lost") {
          expect(outcome.ok).toBe(false); expect(outcome.output).toContain("connection reset after the request was sent");
          expect(head(f, executionId)).toMatchObject({ state: "outcome_unknown", reasonCode: "body_threw_ambiguous" });
        } else {
          expect(outcome.ok).toBe(true);
          expect(head(f, executionId)).toMatchObject({ state: "completed", effect: "applied", evidenceComplete: false,
            reasonCode: "evidence_incomplete:recorder_failed" });
        }
        expect(f.beforeEffects).toHaveLength(1); exactEffects(f, 1);
        if (fault === "recorder_down_after_effect") {
          // P1-78: the failed record latches this pipeline; a later call is refused before the journal is asked.
          const before = canonicalize(f.sor.effects), latched = await f.run(tool); observed.push({ latched });
          expect(latched.ok).toBe(false); expect(latched.denied?.reason).toContain("EVIDENCE_RECORDER_FAILED");
          expect(latched.action).toBeUndefined(); expect(canonicalize(f.sor.effects)).toBe(before); exactEffects(f, 1);
          expect(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM action_executions").get()).toEqual({ n: 1 });
          // The journal's own unreconciled block still holds for another pipeline over it whose recorder works.
          await blockedWithoutEffect(f, tool, executionId, 1, f.runWithWorkingRecorder);
        } else await blockedWithoutEffect(f, tool, executionId, 1);
        await settleWithoutDispatch(f, tool, executionId, 1);
      } else {
        expect(fault).toBe("revocation_during_dispatch");
        const first = await f.run(tool); observed.push({ first });
        expect(first).toMatchObject({ ok: true, denied: null, action: { state: "completed" } });
        expect(head(f, id(first))).toMatchObject({ state: "completed", effect: "applied" });
        expect(f.beforeEffects).toHaveLength(1); exactEffects(f, 1);
        const before = canonicalize(f.sor.effects), later = await f.run(tool); observed.push({ later });
        expect(later.ok).toBe(false); expect(later.denied?.reason).toContain("action_class_frozen");
        expect(head(f, id(later)).state).toBe("denied");
        expect(f.beforeEffects).toHaveLength(1); expect(canonicalize(f.sor.effects)).toBe(before); exactEffects(f, 1);
      }
      passed = true;
    } catch (error) { failure = error; throw error; }
    finally {
      const row: MatrixRow = { tool, fault, status: passed ? "passed" : "failed", fixtureRoot: f.root,
        observations: [...observed, ...f.observations], counts: null, signedRows: [], publicKeys: { monitor: f.monitor, auditor: f.auditor },
        ...(failure ? { error: failure instanceof Error ? failure.stack ?? failure.message : String(failure) } : {}) };
      let captureFailure: unknown;
      try {
        restoreAuthority?.();
        row.counts = oracleCounts(f); row.signedRows = retainPublicRows(f);
      } catch (error) { row.captureError = error instanceof Error ? error.stack ?? error.message : String(error);
        passed = false; row.status = "failed"; captureFailure = error; }
      finally {
        rows.push(row);
        try { f.finish(passed); }
        catch (error) {
          row.status = "failed";
          row.cleanupError = error instanceof Error ? error.stack ?? error.message : String(error);
          if (!failure && !captureFailure) throw error;
        }
      }
      if (!failure && captureFailure) throw captureFailure; // Preserve the earlier body/capture stack when cleanup also fails.
    }
  });
});

afterAll(() => {
  const root = mkdtempSync(join(tmpdir(), "amc-p104-fault-matrix-")); chmodSync(root, 0o700);
  const complete = rows.length === FAULT_POINTS.length * tools.length && rows.every(row => row.counts !== null && !row.captureError);
  const sum = (field: "duplicateEffects" | "effectsWithoutIntent") => complete ? rows.reduce((total, row) => total + row.counts![field], 0) : null;
  const artifact = { schema: "amc.p104.observed-fault-matrix/v1", nominalCells: 16, observedCells: rows.length,
    complete, allCellsPassed: complete && rows.every(row => row.status === "passed"),
    duplicateEffects: sum("duplicateEffects"), effectsWithoutIntent: sum("effectsWithoutIntent"), rows,
    limits: ["Local signed SOFTWARE trust and a single-writer JSON oracle, not authenticated people or a real provider",
      "This matrix does not replace actual HTTP key transport, cross-process concurrency, session reconcile integration, both-OS jobs or P104 source mutations",
      "Successful workspaces are cleaned; retained public rows are journal/signature evidence, not every fixture/config input for a full replay"] };
  const path = join(root, "fault-matrix.json"); writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.info("P104 observed fault-matrix artifact", path);
  expect(complete).toBe(true); expect(artifact.duplicateEffects).toBe(0); expect(artifact.effectsWithoutIntent).toBe(0);
});

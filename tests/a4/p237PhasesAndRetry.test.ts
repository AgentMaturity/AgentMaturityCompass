/**
 * P2-37: Assemble's Review reports P2-13's four execution phases, and a failed A4 effect's retry follows P2-12's resume
 * rule. Real signed workspaces and real action-journal chains (the P2-13 receipt fixture pattern); the journaled
 * executions are synthetic journal controls, not dispatched tools.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const reconcileCalls = vi.hoisted(() => [] as string[]);
vi.mock("../../src/actions/reconcile.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/actions/reconcile.js")>();
  return { ...real, reconcile: async (...args: Parameters<typeof real.reconcile>) => { reconcileCalls.push(args[0]); return real.reconcile(...args); } };
});

import { openActionJournal, type ActionJournal } from "../../src/actions/actionJournal.js";
import { bindAuthorization } from "../../src/actions/authorize.js";
import { receiptDigest } from "../../src/actions/receiptStates.js";
import { assertEffectResumable, effectResumeRule, reconcileBeforeRetry } from "../../src/a4/a4EffectResume.js";
import { executionPhaseRows } from "../../src/a4/assembleBuild.js";
import { EXECUTION_PHASES } from "../../src/execution/executionContract.js";
import { executionStatusFor } from "../../src/execution/executionStatus.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { FAULT_ARGUMENTS, PAYMENT_TOOL, prepareFaultWorkspace } from "../helpers/actionFaults.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    closeSqlitePool(`ledger:${resolve(root)}:${join(root, ".amc", "evidence.sqlite")}`);
    lockVault(root); rmSync(root, { recursive: true, force: true });
  }
  reconcileCalls.length = 0;
  vi.unstubAllEnvs();
});
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p237-")));
  roots.push(root);
  const home = join(root, "home"); mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home); vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", `p237-${randomUUID()}`);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_LEDGER_SQLITE_POOL_SIZE", "1");
  prepareFaultWorkspace(root);
  return root;
}
type End = "completed" | "outcome_unknown" | "denied";
function journaled(root: string, journal: ActionJournal, sessionId: string, end: End): string {
  const callId = `call-${randomUUID()}`;
  const execution: ToolExecution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null, workspace: root, name: PAYMENT_TOOL,
    agentId: "default", actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] } };
  const bound = bindAuthorization(execution, { sessionId });
  if (!bound.ok) throw new Error(bound.reason);
  const id = bound.record.executionId;
  journal.request({ executionId: id, agentId: "default", toolName: PAYMENT_TOOL, actionClass: "FINANCIAL", sessionId, callId,
    parentExecutionId: null, idempotencyKey: bound.record.idempotencyKey });
  journal.authorize(id, bound.digest);
  if (end === "denied") { journal.deny(id, "recheck_failed:purpose_violation"); return id; }
  journal.start(id, bound.record);
  if (end === "completed") journal.complete(id, { effect: "applied", outcomeDigest: sha256Hex("p237"), externalRef: null, reasonCode: "p237_completed" });
  else journal.markUnknown(id, "p237_cancelled_mid_call");
  return id;
}
function withJournal<T>(root: string, run: (journal: ActionJournal) => T): T {
  const journal = openActionJournal(root);
  try { return run(journal); } finally { journal.close(); }
}
/** The A4 effects as registered (src/a4/stages, a4Package, a4Rollback): every one but a read is reconcile-first under P2-12. */
const RELEASE = { actionClass: "DEPLOY", toolName: "a4.activate.create_release" } as const;
const APPLY = { actionClass: "WRITE_HIGH", toolName: "a4.assemble.apply_manifest" } as const;
const READ = { actionClass: "READ_ONLY", toolName: "a4.example.read" } as const;
const codeOf = (run: () => void): string | null => {
  try { run(); return null; } catch (error) { return (error as { code?: string }).code ?? String(error); }
};

describe("Review's execution phases come from P2-13's contract (P2-37)", () => {
  it("lists the four contract phases in order, and a call cancelled mid-flight reads side-effect-completion unknown (outcome_unknown)", () => {
    const root = workspace(), sessionId = `session-${randomUUID()}`;
    withJournal(root, (journal) => { journaled(root, journal, sessionId, "completed"); journaled(root, journal, sessionId, "outcome_unknown"); });
    const status = executionStatusFor(root, { sessionId, admission: "admitted", turn: "cancelled", verified: true });
    const rows = executionPhaseRows(status, "cancelled", "workspace-key-consistency");
    expect(rows.map((row) => row.phase)).toEqual([...EXECUTION_PHASES]);
    expect(rows).toEqual([
      expect.objectContaining({ phase: "admission", status: "succeeded" }),
      expect.objectContaining({ phase: "model-completion", status: "failed", detail: "cancelled" }),
      expect.objectContaining({ phase: "side-effect-completion", status: "unknown", detail: "completed, outcome_unknown" }),
      expect.objectContaining({ phase: "evidence-verification", status: "succeeded", detail: "workspace-key-consistency" })
    ]);
    const quiet = executionPhaseRows(executionStatusFor(root, { sessionId: `none-${randomUUID()}`, admission: "admitted", turn: "complete", verified: null }), "complete", null);
    expect(quiet.find((row) => row.phase === "side-effect-completion")).toMatchObject({ status: "succeeded", detail: "no journaled actions" });
    expect(quiet.find((row) => row.phase === "evidence-verification")).toMatchObject({ status: "pending" });
  });
});

describe("A4 effect retry follows P2-12's resume rule (P2-37)", () => {
  it("classifies effects with resumeRuleFor: a read may repeat, a workspace write or a deployment reconciles first", () => {
    expect(effectResumeRule(READ)).toBe("may-repeat");
    expect(effectResumeRule(APPLY)).toBe("reconcile-first");
    expect(effectResumeRule(RELEASE)).toBe("reconcile-first");
  });

  it("an effect execution the journal never recorded keeps its one owner retry, and reconcile is not asked", async () => {
    const root = workspace();
    withJournal(root, () => undefined); // the journal's tables exist
    const ledger = openLedger(root);
    try {
      await reconcileBeforeRetry(ledger, RELEASE, "a4-release-never-journaled");
      expect(reconcileCalls).toEqual([]);
      expect(codeOf(() => assertEffectResumable(ledger, RELEASE, "a4-release-never-journaled"))).toBeNull();
      expect(codeOf(() => assertEffectResumable(ledger, APPLY, "a4-apply-never-journaled"))).toBeNull();
    } finally { ledger.close(); }
  });

  it("a thrown external effect runs reconcile before the retry, and an unsettled one is refused", async () => {
    const root = workspace(), sessionId = `session-${randomUUID()}`;
    const id = withJournal(root, (journal) => journaled(root, journal, sessionId, "outcome_unknown"));
    const ledger = openLedger(root);
    try {
      await reconcileBeforeRetry(ledger, RELEASE, id);
      expect(reconcileCalls).toEqual([id]);
      expect(codeOf(() => assertEffectResumable(ledger, RELEASE, id))).toBe("EFFECT_RECONCILE_FIRST");
      // A read is never reconciled and never refused.
      await reconcileBeforeRetry(ledger, READ, id);
      expect(reconcileCalls).toEqual([id]);
      expect(codeOf(() => assertEffectResumable(ledger, READ, id))).toBeNull();
    } finally { ledger.close(); }
  });

  it("settled not_applied or refused before dispatch may retry; applied never runs again", () => {
    const root = workspace(), sessionId = `session-${randomUUID()}`;
    const { notApplied, applied, denied, completed } = withJournal(root, (journal) => {
      const settle = (effect: "applied" | "not_applied") => {
        const id = journaled(root, journal, sessionId, "outcome_unknown");
        const head = journal.get(id)!.receipts.at(-1)!;
        journal.settle(id, { headDigest: receiptDigest(head), resolution: "adapter", effect, externalRef: null, evidenceComplete: true,
          reasonCode: `reconciled:${effect}`, method: "adapter:p237", evidenceRefs: [], outcomeDigest: sha256Hex(effect), meta: { adapterId: "p237" } });
        return id;
      };
      return { notApplied: settle("not_applied"), applied: settle("applied"), denied: journaled(root, journal, sessionId, "denied"),
        completed: journaled(root, journal, sessionId, "completed") };
    });
    const ledger = openLedger(root);
    try {
      expect(codeOf(() => assertEffectResumable(ledger, RELEASE, notApplied))).toBeNull();
      expect(codeOf(() => assertEffectResumable(ledger, RELEASE, denied))).toBeNull();
      expect(codeOf(() => assertEffectResumable(ledger, RELEASE, applied))).toBe("EFFECT_ALREADY_APPLIED");
      expect(codeOf(() => assertEffectResumable(ledger, RELEASE, completed))).toBe("EFFECT_ALREADY_APPLIED");
    } finally { ledger.close(); }
  });

  it("deleting the execution's index and transition rows does not make it 'never journaled': the signed rows still name it", () => {
    const root = workspace(), sessionId = `session-${randomUUID()}`;
    const id = withJournal(root, (journal) => journaled(root, journal, sessionId, "outcome_unknown"));
    closeSqlitePool(`ledger:${resolve(root)}:${join(root, ".amc", "evidence.sqlite")}`);
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      db.pragma("foreign_keys = OFF");
      // A workspace writer can drop the append-only trigger; the ledger's signed rows are what it cannot rewrite unnoticed.
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'action_transitions'").all() as Array<{ name: string }>) {
        db.exec(`DROP TRIGGER "${name}"`);
      }
      db.prepare("DELETE FROM action_transitions WHERE execution_id = ?").run(id);
      db.prepare("DELETE FROM action_executions WHERE execution_id = ?").run(id);
    } finally { db.close(); }
    const ledger = openLedger(root);
    try {
      expect(codeOf(() => assertEffectResumable(ledger, RELEASE, id))).toBe("EFFECT_INTEGRITY_FAILED");
    } finally { ledger.close(); }
  });
});

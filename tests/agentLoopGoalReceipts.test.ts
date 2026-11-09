import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openActionJournal } from "../src/actions/actionJournal.js";
import { bindAuthorization } from "../src/actions/authorize.js";
import { goalRunReceiptStates, runExitCode, RUN_EXIT_CODES } from "../src/cli/agentLoopOutputOptions.js";
import { deriveExecutionStatus, INTEGRITY_FAILED } from "../src/execution/executionContract.js";
import { SessionService } from "../src/session/sessionService.js";
import { closeSqlitePool } from "../src/storage/sqlitePool.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { FAULT_ARGUMENTS, PAYMENT_TOOL, prepareFaultWorkspace } from "./helpers/actionFaults.js";

/**
 * SH-UI-01 (skeptic #2): goal rounds record no root turn, so a goal run's exit code reads the receipts of the root and
 * of every session its rounds ran in, transitively. A round's refused side effect keeps `done` from exiting 0.
 */
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    const ws = join(root, "ws");
    closeSqlitePool(`ledger:${resolve(ws)}:${join(ws, ".amc", "evidence.sqlite")}`);
    lockVault(ws); rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

/** A workspace with the fault fixture's journaled payment tool; home and control checkpoints live outside it. */
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-goal-receipts-")));
  roots.push(root);
  const home = join(root, "home"), ws = join(root, "ws");
  mkdirSync(home, { mode: 0o700 }); mkdirSync(ws);
  vi.stubEnv("HOME", home); vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", `goal-${randomUUID()}`);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_LEDGER_SQLITE_POOL_SIZE", "1");
  prepareFaultWorkspace(ws);
  return ws;
}

/** A session whose signed rows announce these delegated children, as spawnSubagent records them. */
function delegating(root: string, sessionId: string, children: readonly string[]): void {
  const writer = new SessionService(root);
  try {
    writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
    for (const child of children) writer.recordLoopEvent({ kind: "delegation-started", childRunAs: "goal-round", childSessionId: child, governedAs: "default", depth: 1, packetId: `packet-${randomUUID()}` });
  } finally { writer.disposeWithoutClosing(); }
}

/** One journaled payment in `sessionId`, settled `completed` or denied at the pre-dispatch recheck. */
function journaled(root: string, sessionId: string, end: "completed" | "denied"): void {
  const journal = openActionJournal(root);
  try {
    const callId = `call-${randomUUID()}`;
    const execution: ToolExecution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null, workspace: root, name: PAYMENT_TOOL,
      agentId: "default", actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] } };
    const bound = bindAuthorization(execution, { sessionId });
    if (!bound.ok) throw new Error(bound.reason);
    const id = bound.record.executionId;
    journal.request({ executionId: id, agentId: "default", toolName: PAYMENT_TOOL, actionClass: "FINANCIAL", sessionId, callId,
      parentExecutionId: null, idempotencyKey: bound.record.idempotencyKey });
    journal.authorize(id, bound.digest);
    if (end === "denied") { journal.deny(id, "recheck_failed:purpose_violation"); return; }
    journal.start(id, bound.record);
    journal.complete(id, { effect: "applied", outcomeDigest: sha256Hex("goal"), externalRef: null, reasonCode: "goal_completed" });
  } finally { journal.close(); }
}

/** The exit code reportRun computes for a goal run that stopped `done`. */
const doneExit = (rootId: string, goalReceiptStates: readonly string[]) => runExitCode({
  summary: { driverStatus: "idle", validation: { status: "not-requested" } } as never,
  execution: deriveExecutionStatus({ sessionId: rootId, admission: "admitted", turn: null, receiptStates: [], verified: null }),
  ending: undefined, validationRequested: false, goalStop: "done", goalReceiptStates });

describe("goalRunReceiptStates — the goal run's whole delegation tree", () => {
  it("reads each round and each round's own delegates, never another session, and a refused grandchild effect keeps done from 0", () => {
    const root = workspace();
    const rootId = `goal-${randomUUID()}`, round1 = `round-${randomUUID()}`, round2 = `round-${randomUUID()}`, grandchild = `child-${randomUUID()}`;
    delegating(root, rootId, [round1, round2]);
    delegating(root, round2, [grandchild]);
    journaled(root, round1, "completed");
    journaled(root, `unrelated-${randomUUID()}`, "denied");
    expect(goalRunReceiptStates(root, rootId)).toEqual(["completed"]);
    expect(doneExit(rootId, goalRunReceiptStates(root, rootId))).toBe(RUN_EXIT_CODES.ok);
    journaled(root, grandchild, "denied");
    expect(goalRunReceiptStates(root, rootId)).toEqual(["completed", "denied"]);
    expect(doneExit(rootId, goalRunReceiptStates(root, rootId))).toBe(RUN_EXIT_CODES.sideEffectsUnsettled);
  });

  it("reads a delegation row that names no child as an integrity failure, never as nothing", () => {
    const root = workspace();
    const rootId = `goal-${randomUUID()}`;
    delegating(root, rootId, [`round-${randomUUID()}`]);
    closeSqlitePool(`ledger:${resolve(root)}:${join(root, ".amc", "evidence.sqlite")}`);
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    // A workspace writer can drop the append-only triggers; the exit code must still fail closed on what it left.
    try {
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'evidence_events'").all() as { name: string }[]) db.exec(`DROP TRIGGER "${name}"`);
      db.prepare("UPDATE evidence_events SET meta_json = '{}' WHERE event_type = 'agent_delegation_started' AND session_id = ?").run(rootId);
    } finally { db.close(); }
    expect(goalRunReceiptStates(root, rootId)).toEqual([INTEGRITY_FAILED]);
    expect(doneExit(rootId, goalRunReceiptStates(root, rootId))).toBe(RUN_EXIT_CODES.failed);
  });
});

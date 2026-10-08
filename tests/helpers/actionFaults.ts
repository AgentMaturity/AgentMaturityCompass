/**
 * Fault injection at the action boundaries (P1-04), test code only: no fault hook exists in production. Faults go in
 * through the seams a composition already owns (the journal, the recorder, the reconcile adapter, the policy files the
 * recheck re-reads, a signed freeze) and, for the crash points, by killing a child process that runs the call.
 */
import { fork } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionJournal } from "../../src/actions/actionJournal.js";
import { JournalUnavailable } from "../../src/actions/receiptStates.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { createFreezeIncident } from "../../src/drift/freezeEngine.js";
import { initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { defaultToolsConfig } from "../../src/toolhub/toolsSchema.js";
import { defineTool } from "../../src/tools/toolRegistry.js";
import { DefiniteFailureError, type ToolDefinition } from "../../src/tools/toolTypes.js";
import type { ActionClass } from "../../src/types.js";
import { initWorkspace } from "../../src/workspace.js";
import type { FakeSystemOfRecord } from "../fixtures/actions/fakeSystemOfRecord.js";

export type FaultPoint =
  | "journal_down_before_request" | "authority_store_down_at_recheck"
  | "crash_after_start_before_dispatch" | "crash_after_dispatch_before_ack"
  | "provider_applied_receipt_lost" | "recorder_down_after_effect"
  | "revocation_before_dispatch" | "revocation_during_dispatch";

export const FAULT_POINTS: readonly FaultPoint[] = ["journal_down_before_request", "authority_store_down_at_recheck",
  "crash_after_start_before_dispatch", "crash_after_dispatch_before_ack", "provider_applied_receipt_lost",
  "recorder_down_after_effect", "revocation_before_dispatch", "revocation_during_dispatch"];

/** A FINANCIAL payment (header carrier and a reconcile adapter) and a DATA_EXPORT deletion (neither). */
export const PAYMENT_TOOL = "payments.send";
export const DELETION_TOOL = "records.delete";
export const PAYMENT_ADAPTER = "fake-payments";
export type FaultTool = typeof PAYMENT_TOOL | typeof DELETION_TOOL;

export const FAULT_ARGUMENTS: Readonly<Record<FaultTool, Record<string, unknown>>> = {
  [PAYMENT_TOOL]: { amount: "100.00", currency: "USD", payee: "acme-001" },
  [DELETION_TOOL]: { target: "https://records.example", resourceId: "customer-42" }
};

/** A temp workspace whose signed tools config declares both tools' bindings and effects. */
export function prepareFaultWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-action-faults-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initActionPolicy(workspace);
  initBudgets(workspace, "default");
  initApprovalPolicy(workspace);
  const config = defaultToolsConfig();
  config.tools.allowedTools.push(
    { name: PAYMENT_TOOL, actionClass: "FINANCIAL", bindingFields: { amount: "amount", currency: "currency", recipient: "payee" },
      effects: { repeatable: false, idempotency: { carrier: "http-header", name: "Idempotency-Key" }, reconcile: { adapterId: PAYMENT_ADAPTER } } },
    { name: DELETION_TOOL, actionClass: "DATA_EXPORT", bindingFields: { destination: "target", resourceId: "resourceId" },
      effects: { repeatable: false } });
  initToolsConfig(workspace, config);
  return workspace;
}

/** Where a fault fires inside a body: before the request leaves, after the system of record applied it, or instead of the reply. */
export interface BodyFaults {
  readonly beforeEffect?: () => void;
  readonly afterEffect?: () => void;
  /** The provider applied it and the reply was lost: the body throws after the effect. */
  readonly loseReply?: boolean;
}

/** The two tools as pipeline bodies against the system of record. */
export function faultTools(sor: FakeSystemOfRecord, faults: BodyFaults = {}): ToolDefinition[] {
  const dispatch = <T>(effect: () => T): T => {
    faults.beforeEffect?.();
    const result = effect();
    faults.afterEffect?.();
    if (faults.loseReply) throw new Error("connection reset after the request was sent");
    return result;
  };
  return [
    defineTool({ name: PAYMENT_TOOL, actionClass: "FINANCIAL", description: "Send a payment.", body: (execution) => {
      if (execution.idempotencyKey === undefined || execution.idempotencyHeader !== "Idempotency-Key") throw new DefiniteFailureError("no idempotency key");
      const args = execution.arguments as { amount: string; currency: string; payee: string };
      const reply = dispatch(() => sor.pay(execution.idempotencyKey!, { amount: args.amount, currency: args.currency, recipient: args.payee },
        execution.executionId ?? null));
      if (reply.status === 409) throw new DefiniteFailureError("idempotency key reused with another body");
      return { output: `paid ${reply.ref}`, effect: "applied", externalRef: reply.ref! };
    } }),
    defineTool({ name: DELETION_TOOL, actionClass: "DATA_EXPORT", description: "Delete a record.", body: (execution) => {
      const reply = dispatch(() => sor.deleteResource(String(execution.arguments.resourceId), execution.executionId ?? null));
      return { output: `deleted ${reply.ref}`, effect: "applied", externalRef: reply.ref };
    } })
  ];
}

/** A journal whose named methods fail as a store that is down would; the others pass through. */
export function failingJournal(journal: ActionJournal, failing: ReadonlySet<keyof ActionJournal>): ActionJournal {
  return new Proxy(journal, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || !failing.has(property as keyof ActionJournal)) return value;
      return () => { throw new JournalUnavailable(`injected: ${String(property)} is down`); };
    }
  });
}

/** Make the policy files the recheck re-reads unreadable (the authority store is down). Returns the repair. */
export function breakAuthorityStore(workspace: string): () => void {
  const file = join(workspace, ".amc", "action-policy.yaml");
  renameSync(file, `${file}.down`);
  mkdirSync(file);
  return () => {
    rmSync(file, { recursive: true });
    renameSync(`${file}.down`, file);
  };
}

/** Revoke the agent's authority for a class: a signed freeze, which the recheck re-reads before every dispatch. */
export function revoke(workspace: string, actionClass: ActionClass, agentId = "default"): void {
  createFreezeIncident({ workspace, agentId, ruleId: "p1-04-fault", previousRunId: "fault", currentRunId: "fault",
    deltas: { overallDrop: 0, integrityDrop: 0, correlationDrop: 0, maxLayerDrop: 0 }, actionClasses: [actionClass], reason: "revoked by the fault matrix" });
}

/** Run one call in a child process that kills itself at the crash point. Resolves once the child is gone. */
export function crashInChild(workspace: string, point: "crash_after_start_before_dispatch" | "crash_after_dispatch_before_ack",
  oracleFile: string, tool: FaultTool): Promise<{ readonly signal: NodeJS.Signals | null; readonly stderr: string }> {
  const child = fork(fileURLToPath(new URL("../fixtures/actions/crashingCall.ts", import.meta.url)), [workspace, point, oracleFile, tool], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"], env: { ...process.env }
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  return new Promise((resolve) => child.once("exit", (_code, signal) => resolve({ signal, stderr })));
}

/** Every journaled intent's key and execution id, for `effectsWithoutIntent`. */
export function journaledIntents(workspace: string): { readonly keys: Set<string>; readonly executionIds: Set<string> } {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const rows = ledger.db.prepare("SELECT execution_id, idempotency_key FROM action_executions WHERE intent_json IS NOT NULL")
      .all() as Array<{ execution_id: string; idempotency_key: string | null }>;
    return { keys: new Set(rows.flatMap((row) => (row.idempotency_key === null ? [] : [row.idempotency_key]))),
      executionIds: new Set(rows.map((row) => row.execution_id)) };
  } finally {
    ledger.close();
  }
}

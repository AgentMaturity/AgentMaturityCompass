/** ToolHub's consequential dispatch path (P1-54). Qualification is pending under the coding-only order. */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { openActionJournal, type ActionJournal } from "../actions/actionJournal.js";
import { authorizationIntentFor, bindAuthorization, recheckAuthorization } from "../actions/authorize.js";
import { authorizationRecordDigest } from "../actions/authorizationRecord.js";
import { ActionBlocked, type EffectState, type ReceiptState } from "../actions/receiptStates.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { DefiniteFailureError, type ToolExecution } from "../tools/toolTypes.js";
import type { ActionClass, ExecutionMode } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { hashToolBlastRadiusConsent, type ToolBlastRadiusConsent } from "./blastRadiusConsent.js";
import { appendToolEvidenceWithReceipt } from "./toolhubReceipts.js";
import type { ToolDefinition } from "./toolsSchema.js";

export const isJournaledToolhubExecution = (mode: ExecutionMode, actionClass: ActionClass): boolean =>
  mode === "EXECUTE" && actionClass !== "READ_ONLY" && actionClass !== "WRITE_LOW";

export function toolhubExecutionId(workspaceId: string, intentId: string): string {
  return `exec_${sha256Hex(`toolhub:${workspaceId}:${intentId}`).slice(0, 32)}`;
}

interface Call {
  workspace: string; intentId: string; agentId: string; toolName: string; actionClass: ActionClass;
  args: Record<string, unknown>; requestedMode: "SIMULATE" | "EXECUTE"; effectiveMode: "SIMULATE" | "EXECUTE";
}

const executionFor = (call: Call): ToolExecution => ({
  workspace: call.workspace, token: call.intentId, callId: call.intentId, rootCallId: call.intentId,
  parentToken: null, name: call.toolName, agentId: call.agentId, actionClass: call.actionClass,
  arguments: call.args, requestedMode: call.requestedMode, effectiveMode: call.effectiveMode
});

/** Protected facts for intent creation, or null when invalid; dispatch still binds and denies invalid authorization. */
export function toolhubApprovalIntent(call: Call): Record<string, unknown> | null {
  const intent = authorizationIntentFor(executionFor(call));
  return intent.ok ? intent.payload : null;
}

export interface ToolhubOutcome {
  state: "completed" | "outcome_unknown" | "denied";
  effect: EffectState | null;
  reasonCode: string;
  result: Record<string, unknown>;
  bodySucceeded: boolean;
}
export interface JournaledToolhubOutcome extends ToolhubOutcome {
  action: { executionId: string; state: ReceiptState; evidenceComplete: boolean };
  idempotencyKey: string | null;
}
interface Dispatch extends Call {
  tool: ToolDefinition;
  approvalId: string | null;
  argumentCarrierSupported: boolean;
  recheckTicket: () => boolean;
  recordAction: (metadata: Record<string, unknown>) => void;
  recordResult: (outcome: ToolhubOutcome) => void;
  closeEvidence: () => void;
  run: (args: Record<string, unknown>, key: { idempotencyKey: string; header: string | null }) => Promise<Record<string, unknown>>;
}

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function classifyToolhubOutcome(actionClass: ActionClass, result: Record<string, unknown>): ToolhubOutcome {
  if (typeof result.signal === "string" || (typeof result.errorCode === "string" && !["ENOENT", "EACCES"].includes(result.errorCode))) {
    return { state: "outcome_unknown", effect: null, reasonCode: "process_terminated",
      result: { ...result, outcomeUnknown: true, reasonCode: "process_terminated" }, bodySucceeded: false };
  }
  if (result.errorCode === "ENOENT" || result.errorCode === "EACCES") {
    return { state: "completed", effect: "not_applied", reasonCode: "definite_failure", result, bodySucceeded: false };
  }
  const effect = result.effect;
  const reasonCode = effect === "unknown" ? "effect_declared_unknown"
    : effect !== undefined && effect !== "applied" && effect !== "not_applied" ? "effect_declaration_invalid"
      : effect === undefined && ["FINANCIAL", "DATA_EXPORT", "IDENTITY"].includes(actionClass) ? "effect_not_declared" : "completed";
  const unknown = reasonCode !== "completed";
  return { state: unknown ? "outcome_unknown" : "completed", effect: effect === "applied" || effect === "not_applied" ? effect : null,
    reasonCode, result: unknown ? { ...result, outcomeUnknown: true, reasonCode } : result,
    bodySucceeded: typeof result.code !== "number" || result.code === 0 };
}

/** One journal per service, including its startup recovery. Failure to open never enables an unjournaled fallback. */
export class ToolhubJournal {
  private journal: ActionJournal | null = null;
  private unavailable: string | null = null;

  constructor(private readonly workspace: string) {
    try { this.journal = openActionJournal(workspace); }
    catch (error) { this.unavailable = errorText(error); }
  }

  close(): void {
    this.unavailable = "journal_closed";
    const journal = this.journal;
    this.journal = null;
    journal?.close();
  }

  async dispatch(input: Dispatch): Promise<JournaledToolhubOutcome> {
    const executionId = toolhubExecutionId(workspaceIdFromDirectory(this.workspace), input.intentId);
    const journal = this.journal;
    let head: ReceiptState = "requested";
    let requested = false;
    let key: string | null = null;
    const denied = (reasonCode: string, detail?: string): JournaledToolhubOutcome => {
      let evidenceComplete = requested;
      if (requested && journal) {
        try { journal.deny(executionId, reasonCode); head = "denied"; }
        catch { evidenceComplete = false; }
      }
      return { state: "denied", effect: null, reasonCode, result: { denied: true, reasonCode, ...(detail ? { detail } : {}) },
        bodySucceeded: false, idempotencyKey: key, action: { executionId, state: head, evidenceComplete } };
    };
    if (resolve(input.workspace) !== resolve(this.workspace)) return denied("workspace_mismatch");
    if (!journal) return denied("journal_unavailable", this.unavailable ?? undefined);
    const execution = executionFor(input);
    const context = { authority: { approvalRequestIds: input.approvalId ? [input.approvalId] : [] } };
    try {
      const previous = journal.get(executionId);
      if (previous) return { ...denied(`intent_already_dispatched:${executionId}`), action: {
        executionId, state: previous.state, evidenceComplete: previous.evidenceComplete } };
      const bound = bindAuthorization(execution, context);
      if (!bound.ok) return denied(`authorization_denied:${bound.failures.join(",")}`);
      // This record is built locally; neither execution id nor key comes from request arguments.
      const record = { ...bound.record, executionId };
      const digest = authorizationRecordDigest(record);
      key = record.idempotencyKey;
      if (key === null) return denied("authorization_denied:idempotency_key_missing");
      journal.request({ executionId, agentId: input.agentId, toolName: input.toolName, actionClass: input.actionClass,
        sessionId: null, callId: input.intentId, parentExecutionId: null, idempotencyKey: key });
      requested = true;
      const blockers = journal.blockingExecutions({ workspaceId: journal.workspaceId, agentId: input.agentId }).filter(id => id !== executionId);
      if (blockers[0]) return denied(`blocked_by_unreconciled:${blockers[0]}`);
      journal.authorize(executionId, digest);
      head = "authorized";
      const carrier = bound.effects?.idempotency;
      if (carrier?.carrier === "http-header" && input.toolName !== "http.fetch") return denied(`idempotency_http_header_carrier_unsupported:${input.toolName}`);
      if (carrier?.carrier === "argument" && !input.argumentCarrierSupported) return denied(`idempotency_argument_carrier_unsupported:${input.toolName}:${carrier.name}`);
      const args = carrier?.carrier === "argument" ? { ...input.args, [carrier.name]: key } : input.args;
      const overwrittenHeader = carrier?.carrier === "http-header" && input.args.headers && typeof input.args.headers === "object"
        ? Object.keys(input.args.headers).find(name => name.toLowerCase() === carrier.name.toLowerCase()) : undefined;
      input.recordAction({ executionId, idempotencyKey: key, authorizationRecordDigest: digest,
        ...((overwrittenHeader || (carrier?.carrier === "argument" && Object.hasOwn(input.args, carrier.name)))
          ? { agentSuppliedMetadata: { ...(overwrittenHeader ? { idempotencyHeaderOverwritten: overwrittenHeader } : {}),
              ...(carrier?.carrier === "argument" ? { idempotencyArgumentOverwritten: carrier.name } : {}) }, metadataTrustTier: "SELF_REPORTED" } : {}) });
      if (!input.recheckTicket()) return denied("recheck_failed:execution_ticket_invalid");
      const recheck = recheckAuthorization(record, execution, context);
      if (!recheck.ok) return denied(`recheck_failed:${recheck.failures.join(",")}`);
      // Atomic journal guards recheck unresolved executions and duplicate argument digests before dispatch.
      journal.start(executionId, record);
      head = "started";
      let heartbeatFailed = false;
      const heartbeat = setInterval(() => {
        try { journal.heartbeat(executionId); }
        catch { heartbeatFailed = true; journal.block(executionId, input.agentId); }
      }, 10_000);
      heartbeat.unref();
      let outcome: ToolhubOutcome;
      try {
        outcome = classifyToolhubOutcome(input.actionClass, await input.run(args, { idempotencyKey: key, header: carrier?.carrier === "http-header" ? carrier.name : null }));
      } catch (error) {
        const beforeHttp = input.toolName === "http.fetch" && ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(String((error as NodeJS.ErrnoException | null)?.code));
        const definite = error instanceof DefiniteFailureError || beforeHttp;
        const reasonCode = definite ? "definite_failure" : "body_threw_ambiguous";
        outcome = { state: definite ? "completed" : "outcome_unknown", effect: definite ? "not_applied" : null,
          reasonCode, result: { error: errorText(error), ...(definite ? {} : { outcomeUnknown: true, reasonCode }) }, bodySucceeded: false };
      } finally { clearInterval(heartbeat); }
      let evidenceComplete = !heartbeatFailed;
      try {
        if (outcome.state === "completed") journal.complete(executionId, { effect: outcome.effect,
          outcomeDigest: sha256Hex(canonicalize(outcome.result)), externalRef: typeof outcome.result.externalRef === "string" && outcome.result.externalRef.length > 0
            && outcome.result.externalRef.length <= 512 ? outcome.result.externalRef : null,
          reasonCode: outcome.reasonCode });
        else journal.markUnknown(executionId, outcome.reasonCode);
        head = outcome.state;
      } catch { evidenceComplete = false; journal.block(executionId, input.agentId); }
      if (heartbeatFailed) {
        try { journal.markEvidenceIncomplete(executionId, "heartbeat_failed"); } catch { journal.block(executionId, input.agentId); }
      }
      try { input.recordResult(outcome); input.closeEvidence(); }
      catch {
        evidenceComplete = false;
        try { journal.markEvidenceIncomplete(executionId, "recorder_failed"); } catch { journal.block(executionId, input.agentId); }
      }
      return { ...outcome, idempotencyKey: key, action: { executionId, state: head, evidenceComplete } };
    } catch (error) {
      if (error instanceof ActionBlocked) return denied(`${error.code}:${error.blockedBy}`);
      if (!requested) {
        try { if (journal.get(executionId)) return denied(`intent_already_dispatched:${executionId}`); } catch { /* unavailable */ }
      }
      return denied("journal_unavailable", errorText(error));
    } finally {
      try { input.closeEvidence(); } catch { /* a post-dispatch failure is already recorded above */ }
    }
  }
}

interface EvidenceInput {
  workspace: string; executionId: string; intentId: string; agentId: string; toolName: string; actionClass: ActionClass;
  requestedMode: ExecutionMode; effectiveMode: ExecutionMode; args: Record<string, unknown>; workOrderId: string | null;
  execTicketProvided: boolean; execTicketValid: boolean; approvalId: string | null; approvalDecisionReceiptId: string | null;
  blastRadiusConsent: ToolBlastRadiusConsent;
  signal: (input: { ledger: Ledger; sessionId: string; category: "Functional" | "Economic" | "Brand";
    metricId: string; value: boolean | number; unit?: string; meta: Record<string, unknown> }) => void;
}

/** Existing ToolHub evidence, shared by legacy and journaled dispatch. Every opened session is sealed on close. */
export function openToolhubExecutionEvidence(input: EvidenceInput, actionMetadata: Record<string, unknown> = {}) {
  const ledger = openLedger(input.workspace);
  const sessionId = `toolhub-exec-${randomUUID()}`;
  const eventIds: string[] = [];
  let resultReceipt: string | undefined;
  let closed = false;
  let sealed = false;
  const blastRadiusConsentHash = hashToolBlastRadiusConsent(input.blastRadiusConsent);
  const common = { executionId: input.executionId, intentId: input.intentId, requestedMode: input.requestedMode,
    effectiveMode: input.effectiveMode, actionClass: input.actionClass, approvalId: input.approvalId, blastRadiusConsentHash };
  try {
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-toolhub", binarySha256: "toolhub" });
    const action = appendToolEvidenceWithReceipt({ ledger, workspace: input.workspace, sessionId, agentId: input.agentId,
      toolName: input.toolName, eventType: "tool_action", extraMeta: { ...common, execTicketValid: input.execTicketValid,
        approvalDecisionReceiptId: input.approvalDecisionReceiptId, blastRadiusConsent: input.blastRadiusConsent, ...actionMetadata },
      payload: { ...common, args: input.args, workOrderId: input.workOrderId, execTicketProvided: input.execTicketProvided,
        execTicketValid: input.execTicketValid, approvalDecisionReceiptId: input.approvalDecisionReceiptId,
        blastRadiusConsent: input.blastRadiusConsent, ...actionMetadata } });
    eventIds.push(action.eventId);
    return {
      ledger, sessionId, eventIds, actionReceipt: action.receipt,
      get resultReceipt() { return resultReceipt; },
      recordResult(outcome: ToolhubOutcome) {
        const success = outcome.state === "outcome_unknown" ? null : outcome.bodySucceeded;
        const result = appendToolEvidenceWithReceipt({ ledger, workspace: input.workspace, sessionId, agentId: input.agentId,
          toolName: input.toolName, eventType: "tool_result", extraMeta: common,
          payload: { ...common, simulated: input.effectiveMode !== "EXECUTE", success, result: outcome.result, denied: false,
            state: outcome.state, effect: outcome.effect, reasonCode: outcome.reasonCode } });
        eventIds.push(result.eventId);
        resultReceipt = result.receipt;
        const signal = (category: "Functional" | "Economic" | "Brand", metricId: string, value: boolean | number, meta: Record<string, unknown>, unit?: string) =>
          input.signal({ ledger, sessionId, category, metricId, value, meta, ...(unit ? { unit } : {}) });
        if (success !== null) signal("Functional", "toolhub.execute_success", success, common);
        signal("Economic", "toolhub.exec_count", 1, { executionId: input.executionId, actionClass: input.actionClass }, input.actionClass);
        if (input.workOrderId && success) signal("Functional", "workorder.completed", true, { executionId: input.executionId });
        if (input.approvalId) {
          for (const auditType of ["APPROVAL_CONSUMED", "APPROVAL_QUORUM_MET"]) {
            const payload = { auditType, severity: "MEDIUM", approvalId: input.approvalId, approvalRequestId: input.approvalId,
              executionId: input.executionId, intentId: input.intentId, agentId: input.agentId };
            const text = JSON.stringify(payload), bodySha256 = sha256Hex(text);
            const row = ledger.appendEvidenceWithReceipt({ sessionId, runtime: "unknown", eventType: "audit", payload: text,
              payloadExt: "json", inline: true, meta: { ...payload, trustTier: "OBSERVED", bodySha256 },
              receipt: { kind: "guard_check", agentId: input.agentId, providerId: "toolhub", model: null, bodySha256 } });
            eventIds.push(row.id);
          }
          signal("Brand", "approval.consumed", true, { approvalRequestId: input.approvalId, executionId: input.executionId });
        }
        ledger.sealSession(sessionId);
        sealed = true;
      },
      close() {
        if (closed) return;
        closed = true;
        try { if (!sealed) ledger.sealSession(sessionId); } finally { ledger.close(); }
      }
    };
  } catch (error) {
    try { ledger.sealSession(sessionId); } finally { ledger.close(); }
    throw error;
  }
}

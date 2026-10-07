/**
 * Reconciliation (P1-04): settle an `outcome_unknown` execution, or restore a `completed` one's incomplete evidence,
 * by asking the system of record what happened under the execution's idempotency key. It never calls a tool body and
 * never dispatches. A tool without a reconcile adapter is settled only by an operator's resolution under dual control,
 * which is self-reported, never observed. AMC never promises exactly-once delivery. See docs/RECEIPTS.md.
 */
import { z } from "zod";
import { consumeApprovedExecution, createApprovalForIntent, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { listApprovalDecisions } from "../approvals/approvalChainStore.js";
import { authorizationRecordV1Schema } from "../contracts/v1/authorizationRecord.js";
import { assertOwnerMode } from "../mode/mode.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { openActionJournal, type ActionJournal } from "./actionJournal.js";
import { recordActionIncidents } from "./actionRecovery.js";
import type { BindingFacts } from "./authorizationRecord.js";
import { decimal } from "./normalizeArguments.js";
import {
  ReceiptChainBroken, receiptDigest, type ActionIntentV1, type ActionReceiptV1, type EffectState, type ReceiptState
} from "./receiptStates.js";

/** What an adapter is asked: the execution's key and the facts it was authorized with. */
export interface ReconcileQuery {
  readonly executionId: string;
  readonly idempotencyKey: string;
  readonly toolName: string;
  readonly argumentsDigest: string;
  readonly bindings: BindingFacts;
  readonly startedAt: string;
}

/** What the system of record says. `observedAt` is its own clock: a claim, recorded as given. */
export type SystemOfRecordObservation =
  | { readonly kind: "applied"; readonly externalRef: string; readonly observedAt: string; readonly observed: BindingFacts }
  | { readonly kind: "not_applied"; readonly observedAt: string }
  | { readonly kind: "unknown"; readonly reason: string };

/** Looks an execution up in its system of record. Read-only: a lookup never creates an effect. */
export interface ReconcileAdapter {
  readonly adapterId: string;
  /** How long the system of record keeps a key. Past it, `not_applied` proves nothing and is treated as `unknown`. */
  readonly retentionMs?: number;
  lookup(query: ReconcileQuery, signal: AbortSignal): Promise<SystemOfRecordObservation>;
}

export type ReconcileMismatch = "amount" | "recipient" | "destination" | "resource" | "effect";

export interface ReconcileResult {
  readonly executionId: string;
  readonly before: ReceiptState;
  readonly after: ReceiptState;
  readonly effect: EffectState | null;
  /** Bound facts the system of record contradicts. Any keeps the evidence incomplete and records an incident. */
  readonly mismatches: readonly ReconcileMismatch[];
  readonly observation: SystemOfRecordObservation;
  /** Null when nothing changed. */
  readonly receipt: ActionReceiptV1 | null;
  /** When this process asks the system of record again, after an answer that left the execution unsettled. */
  readonly nextAttemptAt: string | null;
  readonly incidentIds: readonly string[];
}

const LOOKUP_TIMEOUT_MS = 30_000;
const BACKOFF_FIRST_MS = 60_000;
const BACKOFF_MAX_MS = 3_600_000;
/** ponytail: in-process backoff per execution; persist it when a scheduled reconciler (P2-13) calls this repeatedly. */
const backoff = new Map<string, { readonly failures: number; readonly nextAt: number }>();

const MAX_REF = 512;
const observationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("applied"), externalRef: z.string().min(1).max(MAX_REF), observedAt: z.iso.datetime({ offset: true }),
    observed: authorizationRecordV1Schema.shape.bindings }),
  z.object({ kind: z.literal("not_applied"), observedAt: z.iso.datetime({ offset: true }) }),
  z.object({ kind: z.literal("unknown"), reason: z.string().min(1) })
]);

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const unresolved = (head: ActionReceiptV1): boolean => head.state === "outcome_unknown" || (head.state === "completed" && !head.evidenceComplete);

/** The verified head and intent of an execution. Read from its chain, never from the index row. */
function settleable(journal: ActionJournal, executionId: string): { readonly head: ActionReceiptV1; readonly intent: ActionIntentV1 | null } {
  const view = journal.get(executionId);
  if (view === null) throw new Error(`no journaled execution ${executionId} in this workspace`);
  const head = view.receipts.at(-1)!;
  // A dispatched execution always committed an intent; without one the chain cannot be what it claims.
  if (unresolved(head) && view.intent === null) throw new ReceiptChainBroken(executionId, ["a dispatched execution has no intent"]);
  return { head, intent: view.intent };
}

/** The adapter the signed tools config names for this tool, or why there is none. */
function adapterFor(workspace: string, toolName: string, adapters: ReadonlyMap<string, ReconcileAdapter>): ReconcileAdapter | string {
  try {
    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (snapshot.config === null) return `no_adapter: the signed tools config does not verify (${snapshot.reason ?? "unknown"})`;
    const adapterId = findToolDefinition(snapshot.config, toolName)?.effects?.reconcile?.adapterId;
    if (adapterId === undefined) return `no_adapter: ${toolName} declares no reconcile adapter; an operator resolves it`;
    const adapter = adapters.get(adapterId);
    return adapter?.adapterId === adapterId ? adapter : `adapter_unavailable:${adapterId}`;
  } catch (error) {
    return `no_adapter: the signed tools config could not be read: ${message(error)}`;
  }
}

/** One lookup with a deadline. An error, a timeout or a malformed answer is `unknown`, never a guess. */
async function lookup(adapter: ReconcileAdapter, query: ReconcileQuery, signal?: AbortSignal): Promise<SystemOfRecordObservation> {
  const deadline = AbortSignal.any([AbortSignal.timeout(LOOKUP_TIMEOUT_MS), ...(signal ? [signal] : [])]);
  try {
    const answer = await Promise.race([adapter.lookup(query, deadline), new Promise<never>((_, reject) => {
      if (deadline.aborted) reject(deadline.reason);
      deadline.addEventListener("abort", () => reject(deadline.reason), { once: true });
    })]);
    const parsed = observationSchema.safeParse(answer);
    return parsed.success ? parsed.data : { kind: "unknown", reason: `adapter_invalid_observation: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  } catch (error) {
    return { kind: "unknown", reason: `adapter_failed: ${message(error)}` };
  }
}

/** Facts the intent bound that the system of record does not show identically. Facts it did not bind are not compared. */
function mismatchesOf(bound: BindingFacts, observed: BindingFacts): ReconcileMismatch[] {
  const same = (a: unknown, b: unknown): boolean => canonicalize(a ?? null) === canonicalize(b ?? null);
  const found: ReconcileMismatch[] = [];
  // Amounts compare as AMC binds them: "100.50" and "100.5" are one amount.
  const amount = observed.amount === null ? null : { value: decimal(observed.amount.value), currency: observed.amount.currency };
  if (bound.amount !== null && !same(bound.amount, amount)) found.push("amount");
  if (bound.recipient !== null && !same(bound.recipient, observed.recipient)) found.push("recipient");
  if (bound.destination !== null && !same(bound.destination, observed.destination)) found.push("destination");
  if ((bound.resourceId !== null || bound.resourceVersion !== null)
    && !(same(bound.resourceId, observed.resourceId) && same(bound.resourceVersion, observed.resourceVersion))) found.push("resource");
  return found;
}

function nextAttempt(key: string): string {
  const failures = (backoff.get(key)?.failures ?? 0) + 1;
  const nextAt = Date.now() + Math.min(BACKOFF_FIRST_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
  backoff.set(key, { failures, nextAt });
  return new Date(nextAt).toISOString();
}

/**
 * Ask the execution's system of record what happened and record the answer as a reconciliation receipt. Only an
 * `outcome_unknown` execution, or a `completed` one with incomplete evidence, is eligible; anything else returns
 * `after === before`. `applied` with matching facts settles `completed`/`applied`; `applied` with other facts settles
 * `completed`/`applied` with the evidence still incomplete, records an incident and keeps the agent blocked;
 * `not_applied` settles `completed`/`not_applied`; `unknown`, an adapter error or a timeout changes nothing and backs
 * off from 1 minute, doubling to 1 hour. A tool without an adapter waits for `resolveManually`.
 */
export async function reconcile(executionId: string, opts: { readonly workspace: string;
  readonly adapters: ReadonlyMap<string, ReconcileAdapter>; readonly signal?: AbortSignal }): Promise<ReconcileResult> {
  assertOwnerMode(opts.workspace, "action reconcile");
  const journal = openActionJournal(opts.workspace);
  try {
    const { head, intent } = settleable(journal, executionId);
    const unchanged = (observation: SystemOfRecordObservation, extra: Partial<ReconcileResult> = {}): ReconcileResult => ({
      executionId, before: head.state, after: head.state, effect: head.effect, mismatches: [], observation, receipt: null,
      nextAttemptAt: null, incidentIds: [], ...extra });
    if (!unresolved(head) || intent === null) return unchanged({ kind: "unknown", reason: `nothing_to_reconcile: ${head.state} with complete evidence` });
    const adapter = adapterFor(opts.workspace, intent.toolName, opts.adapters);
    if (typeof adapter === "string") return unchanged({ kind: "unknown", reason: adapter });
    if (intent.idempotencyKey === null) return unchanged({ kind: "unknown", reason: "no_idempotency_key: the system of record cannot be asked" });
    const key = `${journal.workspaceId}\0${executionId}`;
    const waiting = backoff.get(key);
    if (waiting !== undefined && waiting.nextAt > Date.now()) {
      return unchanged({ kind: "unknown", reason: "backing_off" }, { nextAttemptAt: new Date(waiting.nextAt).toISOString() });
    }
    let observation = await lookup(adapter, { executionId, idempotencyKey: intent.idempotencyKey, toolName: intent.toolName,
      argumentsDigest: intent.argumentsDigest, bindings: intent.bindings, startedAt: intent.startedAt }, opts.signal);
    if (observation.kind === "not_applied" && adapter.retentionMs !== undefined && Date.now() - Date.parse(intent.startedAt) > adapter.retentionMs) {
      observation = { kind: "unknown", reason: `outside_retention_window: ${adapter.adapterId} keeps keys ${adapter.retentionMs} ms` };
    }
    if (observation.kind === "unknown") return unchanged(observation, { nextAttemptAt: nextAttempt(key) });
    const effect = observation.kind;
    const mismatches: ReconcileMismatch[] = [...(head.effect !== null && head.effect !== effect ? ["effect" as const] : []),
      ...(observation.kind === "applied" ? mismatchesOf(intent.bindings, observation.observed) : [])];
    // A contradiction is evidence of a problem: keep the evidence incomplete and raise it, never pick a side.
    const incidentIds = mismatches.length === 0 ? [] : recordActionIncidents(opts.workspace, [head.agentId], {
      title: `Reconciliation contradicts an authorized action (${mismatches.join(", ")})`,
      description: `The system of record (${adapter.adapterId}) reports ${effect} for ${executionId} (${intent.toolName}), which `
        + `contradicts the authorized ${mismatches.join(", ")}. The evidence stays incomplete and the agent's consequential calls `
        + "stay blocked until an operator resolves it. Nothing is replayed.",
      triggerId: executionId });
    if (mismatches.length > 0 && head.state === "completed") {
      return unchanged(observation, { mismatches, incidentIds, nextAttemptAt: nextAttempt(key) });
    }
    const externalRef = observation.kind === "applied" ? observation.externalRef : null;
    const receipt = journal.settle(executionId, { headDigest: receiptDigest(head), resolution: "adapter", effect, externalRef,
      evidenceComplete: mismatches.length === 0,
      reasonCode: mismatches.length === 0 ? `reconciled:${effect}` : `reconciled:contradicted:${mismatches.join(",")}`,
      method: `adapter:${adapter.adapterId}`, evidenceRefs: externalRef === null ? [] : [`external:${externalRef}`],
      outcomeDigest: sha256Hex(canonicalize(observation)),
      // The system of record's own time is its claim; the receipt's `at` is AMC's clock.
      meta: { adapterId: adapter.adapterId, claimedObservedAt: observation.observedAt, mismatches, incidentIds } });
    if (mismatches.length === 0) backoff.delete(key);
    return { executionId, before: head.state, after: receipt.state, effect: receipt.effect, mismatches, observation, receipt,
      nextAttemptAt: mismatches.length === 0 ? null : nextAttempt(key), incidentIds };
  } finally {
    journal.close();
  }
}

/** The approvals engine's tool name for an operator's resolution; its quorum is the execution's own action class. */
export const RESOLVE_TOOL = "amc.action.resolve";

/** What an operator states about an execution's effect. Self-reported: AMC did not observe it. */
export interface ManualResolutionInput {
  readonly workspace: string;
  readonly effect: EffectState;
  readonly externalRef: string | null;
  /** Who states it. Bound into the approval, and never the approver: dual control needs someone else to grant it. */
  readonly operatorId: string;
  readonly note: string;
}

const resolutionInputSchema = z.object({
  effect: z.enum(["applied", "not_applied"]),
  externalRef: z.string().min(1).max(MAX_REF).nullable(),
  operatorId: z.string().trim().min(1).max(128),
  note: z.string().trim().min(1).max(4000)
});
const APPROVAL_REQUEST_ID = /^apprreq_[a-f0-9]{32}$/;

/** The intent an approval of this resolution binds: the exact head it settles and everything the operator stated. */
function resolutionIntent(executionId: string, head: ActionReceiptV1, intent: ActionIntentV1 | null, input: ManualResolutionInput) {
  const stated = resolutionInputSchema.parse(input);
  if (!unresolved(head) || intent === null) throw new Error(`nothing to resolve: ${executionId} is ${head.state} with complete evidence`);
  // A resolution never contradicts an effect the tool body already declared.
  if (head.effect !== null && head.effect !== stated.effect) {
    throw new Error(`${executionId} already records effect ${head.effect}; a resolution cannot state ${stated.effect}`);
  }
  const payload = { schema: "amc.action-resolution/v1", workspaceId: head.workspaceId, executionId, agentId: head.agentId,
    toolName: intent.toolName, actionClass: intent.actionClass, headDigest: receiptDigest(head), effect: stated.effect,
    externalRef: stated.externalRef, operatorId: stated.operatorId, noteSha256: sha256Hex(stated.note) };
  return { stated, payload, intentHash: sha256Hex(canonicalize(payload)) };
}

/**
 * File the approval request an operator's resolution needs (dual control). A second person approves it with
 * `amc approvals approve`; then `resolveManually` records it. Refused in agent mode.
 */
export function requestManualResolution(executionId: string, input: ManualResolutionInput): {
  readonly approvalRequestId: string; readonly agentId: string; readonly actionClass: string; readonly requiredApprovals: number;
} {
  assertOwnerMode(input.workspace, "action resolve");
  const journal = openActionJournal(input.workspace);
  try {
    const { head, intent } = settleable(journal, executionId);
    const { payload } = resolutionIntent(executionId, head, intent, input);
    const created = createApprovalForIntent({ workspace: input.workspace, agentId: head.agentId, intentId: `resolve:${executionId}`,
      toolName: RESOLVE_TOOL, actionClass: payload.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high",
      intentPayload: payload });
    return { approvalRequestId: created.approval.approvalRequestId, agentId: head.agentId, actionClass: payload.actionClass,
      requiredApprovals: created.approval.requiredApprovals };
  } finally {
    journal.close();
  }
}

/**
 * Record an operator's resolution of an unsettled execution: a `completed` receipt with `resolution: "operator"`,
 * written in the verified chain at AMC's clock, on a `SELF_REPORTED` evidence row. Requires the granted approval filed
 * by `requestManualResolution` for exactly this head and statement, under the action class's quorum, with an approver
 * other than the operator; the approval is consumed. Refused in agent mode. Never dispatches anything.
 */
export function resolveManually(executionId: string, input: ManualResolutionInput & { readonly approvalRequestId: string }): ActionReceiptV1 {
  assertOwnerMode(input.workspace, "action resolve");
  if (!APPROVAL_REQUEST_ID.test(input.approvalRequestId)) throw new Error("approvalRequestId must look like apprreq_<32 hex>");
  const journal = openActionJournal(input.workspace);
  try {
    const { head, intent } = settleable(journal, executionId);
    const { stated, payload, intentHash } = resolutionIntent(executionId, head, intent, input);
    const approval = verifyApprovalForExecution({ workspace: input.workspace, approvalId: input.approvalRequestId, expectedAgentId: head.agentId,
      expectedToolName: RESOLVE_TOOL, expectedActionClass: payload.actionClass, expectedIntentHash: intentHash });
    if (!approval.ok) throw new Error(`resolution_not_approved: ${approval.error ?? approval.status ?? "unknown"}`);
    const approverIds = [...new Set(listApprovalDecisions({ workspace: input.workspace, agentId: head.agentId,
      approvalRequestId: input.approvalRequestId }).filter((decision) => decision.decision === "APPROVE_EXECUTE").map((decision) => decision.userId))].sort();
    if (!approverIds.some((id) => id !== stated.operatorId)) {
      throw new Error("dual_control: the resolution must be approved by someone other than the operator who states it");
    }
    const spent = consumeApprovedExecution({ workspace: input.workspace, approvalId: input.approvalRequestId,
      expectedAgentId: head.agentId, executionId });
    if (!spent.consumed) throw new Error(`resolution_not_approved: ${spent.reason}`);
    return journal.settle(executionId, { headDigest: payload.headDigest, resolution: "operator", effect: stated.effect,
      externalRef: stated.externalRef, evidenceComplete: true, reasonCode: `operator_resolved:${input.approvalRequestId}`,
      method: "operator", evidenceRefs: [`approval:${input.approvalRequestId}`, `operator:${stated.operatorId}`, `note-sha256:${payload.noteSha256}`],
      outcomeDigest: intentHash,
      meta: { operatorId: stated.operatorId, approverIds, approvalRequestId: input.approvalRequestId, note: stated.note } });
  } finally {
    journal.close();
  }
}

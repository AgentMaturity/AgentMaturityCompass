/**
 * Resume rules (P2-12): what may happen to a tool call a crash interrupted. Resume never runs a call again; the rule
 * decides which calls are reconciled with their system of record before the next turn, and the action journal's block
 * (P1-03) keeps the agent's dependent consequential calls waiting while a journaled outcome stays unknown.
 *
 *   may-repeat                        READ_ONLY, not MCP: nothing to reconcile
 *   repeat-with-same-idempotency-key  fs.write / fs.edit (WRITE_LOW, WRITE_HIGH) whose file still has its recorded
 *                                     beforeSha256 (P1-36)
 *   reconcile-first                   everything else: NETWORK_EXTERNAL, FINANCIAL, DEPLOY, DATA_EXPORT, IDENTITY, SECURITY,
 *                                     every MCP tool, any other write and an unknown class
 *
 * See docs/SESSION_RESUME.md.
 */
import { openActionJournal, type ActionJournal } from "../actions/actionJournal.js";
import { reconcile, type ReconcileAdapter } from "../actions/reconcile.js";
import { ReceiptChainBroken, type EffectState } from "../actions/receiptStates.js";
import { NATIVE_BUILTIN_CAPABILITIES } from "../agent/nativeToolCapabilities.js";
import type { ActionClass, EvidenceEvent } from "../types.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import type { SessionService } from "./sessionService.js";

export type ResumeRule = "may-repeat" | "repeat-with-same-idempotency-key" | "reconcile-first";
/** `completed`: settled (see `effect`); `denied`: refused or cancelled before dispatch; `not-found`: no journaled execution. */
type ReconciledResult = "completed" | "denied" | "not-found" | "unknown";

const WORKSPACE_FILE_TOOLS: ReadonlySet<string> = new Set(["fs.write", "fs.edit"]);
const SETTLED: ReadonlySet<unknown> = new Set(["completed", "denied", "not-found"]);
const MAX_FILE_BYTES = 64 * 1024 * 1024;

export function resumeRuleFor(call: {
  readonly actionClass: ActionClass | null;
  readonly toolName: string;
  readonly mcp: boolean;
  /** The call's recorded file change and the file's hash now (null hashes: no file); null when no change was recorded. */
  readonly file?: { readonly beforeSha256: string | null; readonly currentSha256: string | null } | null;
}): ResumeRule {
  if (call.mcp) return "reconcile-first";
  if (call.actionClass === "READ_ONLY") return "may-repeat";
  const file = call.file ?? null;
  if ((call.actionClass === "WRITE_LOW" || call.actionClass === "WRITE_HIGH") && WORKSPACE_FILE_TOOLS.has(call.toolName)
    && file !== null && file.currentSha256 === file.beforeSha256) return "repeat-with-same-idempotency-key";
  return "reconcile-first";
}

export interface InterruptedCallOutcome {
  readonly toolCallId: string;
  readonly toolName: string | null;
  readonly executionId: string | null;
  readonly rule: ResumeRule;
  readonly result: ReconciledResult;
  readonly effect: EffectState | null;
  readonly reason: string;
}

interface FileChange { readonly path: string; readonly beforeSha256: string | null }
interface Interrupted { readonly toolCallId: string; readonly toolName: string | null; readonly executionId: string | null; readonly fileChange: FileChange | null }

function metaOf(row: EvidenceEvent): Record<string, unknown> {
  try { return JSON.parse(row.meta_json) as Record<string, unknown>; } catch { return {}; }
}

/** Calls a recovery answered with an unknown outcome and no later pass settled, from the session's signed rows. */
function interruptedCalls(rows: readonly EvidenceEvent[]): Interrupted[] {
  const names = new Map<string, string | null>();
  const changes = new Map<string, FileChange>();
  const settled = new Set<unknown>();
  const unknown: Array<{ toolCallId: string; executionId: string | null }> = [];
  for (const row of rows) {
    const meta = metaOf(row);
    // P1-36: a file tool's audit row records the change before the call's result row; a crash can fall between them.
    const change = meta.fileChange as Partial<FileChange> | undefined;
    if (row.event_type === "audit" && typeof meta.callId === "string" && typeof change?.path === "string"
      && (change.beforeSha256 === null || typeof change.beforeSha256 === "string")) changes.set(meta.callId, { path: change.path, beforeSha256: change.beforeSha256 });
    if (typeof meta.toolCallId !== "string") continue;
    if (row.event_type === "tool/call") names.set(meta.toolCallId, typeof meta.toolName === "string" ? meta.toolName : null);
    if (row.event_type === "tool/reconciled" && SETTLED.has(meta.result)) settled.add(meta.toolCallId);
    if (row.event_type === "tool/result" && meta.outcome === "TOOL_OUTCOME_UNKNOWN" && typeof meta.recoveredBy === "string") {
      unknown.push({ toolCallId: meta.toolCallId, executionId: typeof meta.executionId === "string" ? meta.executionId : null });
    }
  }
  return unknown.filter((call) => !settled.has(call.toolCallId))
    .map((call) => ({ ...call, toolName: names.get(call.toolCallId) ?? null, fileChange: changes.get(call.toolCallId) ?? null }));
}

const builtinClass = (toolName: string | null): ActionClass | null =>
  NATIVE_BUILTIN_CAPABILITIES.find((capability) => capability.name === toolName)?.actionClass ?? null;
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A recorded file change against the file now. A file that cannot be read safely has no comparison, so it reconciles first. */
function fileNow(workspace: string, change: FileChange): { readonly file: { beforeSha256: string | null; currentSha256: string | null } | null; readonly note: string } {
  try {
    const bytes = readContainedOrNull(workspace, change.path, MAX_FILE_BYTES);
    return { file: { beforeSha256: change.beforeSha256, currentSha256: bytes === null ? null : sha256Hex(bytes) }, note: "" };
  } catch (error) {
    return { file: null, note: `; ${change.path} could not be read: ${message(error)}` };
  }
}

/**
 * After resume and before the next turn, each interrupted call follows its rule and gets one signed `tool/reconciled`
 * row. A `reconcile-first` call whose journaled execution is `outcome_unknown` is asked of its system of record through
 * P1-04's `reconcile()`; an answer it cannot give leaves the call unknown and the journal keeps blocking. Nothing is
 * dispatched. The execution and its class come from its verified receipt chain; a broken chain throws (an integrity
 * failure, never "unknown").
 */
export async function reconcileInterruptedCalls(input: { readonly workspace: string; readonly session: SessionService;
  readonly adapters: ReadonlyMap<string, ReconcileAdapter>; readonly signal?: AbortSignal }): Promise<InterruptedCallOutcome[]> {
  const pending = interruptedCalls(input.session.readEvents());
  if (pending.length === 0) return [];
  let journal: ActionJournal | null = null;
  const outcomes: InterruptedCallOutcome[] = [];
  try {
    for (const call of pending) {
      const outcome = await settleCall(call, () => (journal ??= openActionJournal(input.workspace)), input);
      input.session.recordResumeEvent("tool/reconciled", { ...outcome });
      outcomes.push(outcome);
    }
  } finally {
    (journal as ActionJournal | null)?.close();
  }
  return outcomes;
}

async function settleCall(call: Interrupted, journal: () => ActionJournal, input: { readonly workspace: string; readonly session: SessionService;
  readonly adapters: ReadonlyMap<string, ReconcileAdapter>; readonly signal?: AbortSignal }): Promise<InterruptedCallOutcome> {
  const mcp = call.toolName !== null && call.toolName.startsWith("mcp_") && builtinClass(call.toolName) === null;
  const view = call.executionId === null ? null : journal().get(call.executionId);
  if (view !== null && view.intent !== null && (view.intent.callId !== call.toolCallId || view.intent.sessionId !== input.session.sessionId)) {
    throw new ReceiptChainBroken(view.executionId, [`the execution's intent names another call than ${call.toolCallId}`]);
  }
  const current = call.fileChange === null ? { file: null, note: "" } : fileNow(input.workspace, call.fileChange);
  const rule = resumeRuleFor({ actionClass: view?.intent?.actionClass ?? builtinClass(call.toolName), toolName: call.toolName ?? "", mcp, file: current.file });
  const outcome = (result: ReconciledResult, effect: EffectState | null, reason: string): InterruptedCallOutcome =>
    ({ toolCallId: call.toolCallId, toolName: call.toolName, executionId: view?.executionId ?? null, rule, result, effect, reason: reason + current.note });
  if (view === null) return outcome("not-found", null, "no journaled execution: the call was not journaled or never committed its intent");
  if (view.state === "outcome_unknown" && rule === "reconcile-first") {
    try {
      const reconciled = await reconcile(view.executionId, { workspace: input.workspace, adapters: input.adapters,
        ...(input.signal === undefined ? {} : { signal: input.signal }) });
      if (reconciled.after === "completed") return outcome("completed", reconciled.effect, reconciled.receipt?.reasonCode ?? "reconciled");
      return outcome("unknown", null, reconciled.observation.kind === "unknown" ? reconciled.observation.reason : `reconciled ${reconciled.observation.kind}`);
    } catch (error) {
      if (error instanceof ReceiptChainBroken) throw error;
      return outcome("unknown", null, `reconcile_failed: ${message(error)}`);
    }
  }
  if (view.state === "completed") return outcome("completed", view.effect, "the journal records it completed");
  if (view.state === "denied" || view.state === "cancelled") return outcome("denied", null, `the journal records it ${view.state} before dispatch`);
  return outcome("unknown", null, `the journal records it ${view.state}; it blocks until reconciled or resolved (amc action resolve)`);
}

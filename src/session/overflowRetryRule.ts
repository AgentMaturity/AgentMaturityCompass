/**
 * Replay rule for HP-05: a model request that follows a context-window overflow in the same turn must have been earned.
 *
 * The running loop asks once more after an overflow only after it has written a signed `loop/compact` receipt whose
 * trigger cites that failure and a signed `CONTEXT_OVERFLOW_RECOVERY` row with decision `retry` for it. This checks
 * the same from the record alone, so a build that re-sent without them is caught by the verifier, not only by its
 * own code (review H1):
 * - an overflow receipt cites an earlier context-window failure of the same turn;
 * - a decision row cites such a failure, each failure at most once, its compaction ids are earlier receipts, and a
 *   `retry` decision has an overflow receipt for that failure; at most one `retry` per turn;
 * - the next model request in that turn after the failure needs both; a request-level retry (`loop/retry` decision
 *   `retry` naming the failure) is the existing retry policy and needs neither;
 * - a `COMPACTION_FILES_RESTORED` row names only earlier receipts.
 * A failure inside a compaction summary step is not the turn's own request and does not count.
 */
import type { EvidenceEvent } from "../types.js";
import { extractEnvelope } from "./sessionTypes.js";
import { compactionReceipt } from "./surfaceCompactionValidation.js";

export const FILES_RESTORED_AUDIT = "COMPACTION_FILES_RESTORED";
export const OVERFLOW_DECISION_AUDIT = "CONTEXT_OVERFLOW_RECOVERY";
const OVERFLOW_CODE = "CONTEXT_WINDOW_EXCEEDED";
const SUMMARY_STEP = "compaction-summary";

type Meta = Record<string, unknown>;

/** Problems with overflow retries in every session of `events`, in plain words; empty when the rule holds. */
export function overflowRetryProblems(events: readonly EvidenceEvent[]): string[] {
  const sessions = new Map<string, EvidenceEvent[]>();
  for (const row of events) if (extractEnvelope(row.meta_json) !== null) sessions.set(row.session_id, [...(sessions.get(row.session_id) ?? []), row]);
  return [...sessions.values()].flatMap(sessionProblems);
}

function sessionProblems(rows: readonly EvidenceEvent[]): string[] {
  const problems: string[] = [];
  const summarySteps = new Set<string>(), failures = new Map<string, number>(), receipts = new Set<string>(), compactions = new Set<string>();
  const decided = new Set<string>(), retried = new Set<string>(), retriesPerTurn = new Map<number, number>();
  let pending: { readonly id: string; readonly turn: number } | null = null;
  for (const row of rows) {
    let meta: Meta;
    try { meta = JSON.parse(row.meta_json) as Meta; } catch { continue; }
    const envelope = extractEnvelope(row.meta_json), turn = envelope?.turn ?? null, at = `${String(turn)}.${String(envelope?.step)}`;
    if (turn === null) continue;
    if (row.event_type === "step/start" && meta.kind === SUMMARY_STEP) summarySteps.add(at);
    else if (row.event_type === "request/failure" && (meta.failure as Meta | undefined)?.code === OVERFLOW_CODE && !summarySteps.has(at)) {
      failures.set(row.id, turn);
      pending = { id: row.id, turn };
    } else if (row.event_type === "loop/retry" && pending !== null && meta.decision === "retry" && meta.outcomeEventId === pending.id) pending = null;
    else if (row.event_type === "loop/compact") {
      compactions.add(row.id);
      let receipt;
      try { receipt = compactionReceipt(row); } catch { continue; }
      if (receipt.v !== 2 || receipt.trigger.kind !== "overflow") continue;
      if (failures.get(receipt.trigger.failureEventId) !== turn) problems.push(`overflow compaction ${row.id} does not cite an earlier context-window failure of turn ${turn}`);
      else receipts.add(receipt.trigger.failureEventId);
    } else if (row.event_type === "audit" && meta.auditType === OVERFLOW_DECISION_AUDIT) {
      const failure = typeof meta.failureEventId === "string" ? meta.failureEventId : null;
      const ids = Array.isArray(meta.compactionEventIds) ? meta.compactionEventIds : [];
      if (ids.some(id => !compactions.has(String(id)))) problems.push(`overflow decision ${row.id} names a compaction that is not an earlier receipt`);
      if (failure === null) { if (meta.decision === "retry") problems.push(`overflow decision ${row.id} retries without naming a failure`); continue; }
      if (failures.get(failure) !== turn) problems.push(`overflow decision ${row.id} does not cite an earlier context-window failure of turn ${turn}`);
      if (decided.has(failure)) problems.push(`overflow decision ${row.id} cites failure ${failure} a second time`);
      decided.add(failure);
      if (meta.decision !== "retry") continue;
      if (!receipts.has(failure)) problems.push(`overflow decision ${row.id} retries without an overflow compaction receipt for failure ${failure}`);
      const count = (retriesPerTurn.get(turn) ?? 0) + 1;
      retriesPerTurn.set(turn, count);
      if (count > 1) problems.push(`turn ${turn} retried after a context-window failure more than once`);
      retried.add(failure);
    } else if (row.event_type === "audit" && meta.auditType === FILES_RESTORED_AUDIT) {
      const ids = Array.isArray(meta.compactionEventIds) ? meta.compactionEventIds : [];
      if (ids.length === 0 || ids.some(id => !compactions.has(String(id)))) problems.push(`file restore ${row.id} does not name earlier compaction receipts`);
    } else if (row.event_type === "request/header" && pending !== null) {
      if (pending.turn === turn && !(retried.has(pending.id) && receipts.has(pending.id))) {
        problems.push(`a model request in turn ${turn} followed context-window failure ${pending.id} without a signed overflow compaction receipt and retry decision for it`);
      }
      pending = null;
    }
  }
  return problems;
}

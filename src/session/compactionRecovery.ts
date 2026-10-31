/**
 * PI-025: settle an automatic summary compaction that a crash or an evidence failure
 * interrupted, so a resumed session continues from its last consistent context.
 *
 * A summary compaction is several appends: a plan, the summary step (its prompt and
 * answer), the summary receipt, a drop for each earlier agent run the summary covers,
 * and a drop of the summary step's own rows. The summary receipt is the commit point:
 *   - not committed: the summary step's rows leave the context and nothing else changes,
 *     so every turn stays verbatim (roll back);
 *   - committed: the planned drops that did not happen are completed (roll forward), so
 *     the summary is applied once and no covered run is shown beside it.
 * Only appends are made, as signed receipts with a "recovery:" reason, plus one audit row
 * per settled compaction. Signed history is never changed.
 */
import { COMPACTION_SUMMARY_STEP } from "../agent/compaction/summaryPrompt.js";
import type { EvidenceEvent } from "../types.js";
import type { SessionService } from "./sessionService.js";
import { extractEnvelope } from "./sessionTypes.js";
import { compactionReceipt } from "./surfaceCompactionValidation.js";
import { foldSurfaceEntries } from "./surfaceProjection.js";

/** The audit row written just before a summary step: what the summary replaces and drops. */
export const COMPACTION_PLAN_AUDIT = "COMPACTION_SUMMARY_PLAN";

function meta(row: EvidenceEvent): Record<string, unknown> { return JSON.parse(row.meta_json) as Record<string, unknown>; }
const stepKey = (row: EvidenceEvent): string => { const envelope = extractEnvelope(row.meta_json); return `${envelope?.turn}.${envelope?.step}`; };
function ids(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === "string") ? value as string[] : null;
}
/** The earlier runs a plan drops once its summary is committed; null when the row is not a readable plan. */
function plannedDrops(row: EvidenceEvent | undefined): readonly (readonly string[])[] | null {
  if (row?.event_type !== "audit") return null;
  const raw = meta(row), earlier = Array.isArray(raw.earlier) ? raw.earlier.map(ids) : null;
  if (raw.auditType !== COMPACTION_PLAN_AUDIT || earlier === null || earlier.some(run => run === null)) return null;
  return earlier as (readonly string[])[];
}

/** Returns how many interrupted compactions were settled; 0 leaves the session untouched. */
export function settleInterruptedCompactions(service: SessionService): number {
  const rows = service.readEvents();
  const starts = rows.flatMap((row, index) => row.event_type === "step/start" && meta(row).kind === COMPACTION_SUMMARY_STEP ? [index] : []);
  let settled = 0;
  for (const index of starts) {
    const start = rows[index]!, key = stepKey(start), current = service.readEvents();
    const inStep = new Set(current.filter(row => stepKey(row) === key).map(row => row.id));
    const live = foldSurfaceEntries(current), liveIds = new Set(live.map(entry => entry.originEventId));
    const own = live.filter(entry => inStep.has(entry.originEventId)).map(entry => entry.originEventId);
    const summary = current.find(row => row.event_type === "loop/compact" && meta(row).compaction !== undefined && (() => {
      const receipt = compactionReceipt(row);
      return receipt.v === 2 && receipt.summarizer !== undefined && inStep.has(receipt.summarizer.requestHeaderEventId);
    })());
    const planned = plannedDrops(rows[index - 1]);
    const pending = summary === undefined || planned === null ? [] : planned.filter(run => run.length > 0 && run.every(id => liveIds.has(id)));
    if (own.length === 0 && pending.length === 0) continue;
    const reason = `recovery: interrupted automatic compaction (summary step ${start.id}); `;
    const compactionEventIds = [
      ...pending.map(run => service.dropSurfaceRange({ originEventIds: run,
        reason: `${reason}completes the planned drop of agent work covered by summary ${summary!.id}; rows retained` }).eventId),
      ...(own.length === 0 ? [] : [service.dropSurfaceRange({ originEventIds: own,
        reason: `${reason}removes the summary request and any answer from context; their signed rows remain` }).eventId])
    ];
    const audit = { auditType: "COMPACTION_RECOVERED", version: 1, summaryStepEventId: start.id,
      summaryEventId: summary?.id ?? null, outcome: summary === undefined ? "rolled-back" : "rolled-forward", compactionEventIds };
    service.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(audit), meta: audit });
    settled += 1;
  }
  return settled;
}

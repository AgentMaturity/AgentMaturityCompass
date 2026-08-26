import type { ParsedEvidenceEvent } from "../diagnostic/gates.js";
import type { LiveDriftSampleRow } from "./liveDriftTypes.js";

/**
 * The bridge between live evidence and the drift engine (P5.2b step 2).
 *
 * AMC had two disjoint drift systems and neither called the other:
 *
 *   src/drift/continuousMonitor.ts   reads the ledger, ticks, emits — but
 *                                    computes with a 241-line detector over
 *                                    diagnostic reports.
 *   src/watch/liveDriftAlerts.ts     11.6k lines of drift statistics across 74
 *                                    domains — and never reads the ledger.
 *
 * The plan called the second one a "pure report-builder", which is exactly
 * right: it takes caller-supplied rows. Verified: `liveDriftAlerts.ts` contains
 * no `openLedger`, and `src/drift/` contains no reference to it.
 *
 * WHY THE BRIDGE IS SMALL. `LiveDriftSampleRow` has 936 fields, but only SIX
 * are mandatory — `traceId`, `scenarioId`, `timestamp`, `score0to1`,
 * `behaviorSignature` and `evidenceRefs`. The other 930 are benchmark-specific
 * extensions. Measured against the real engine, rows carrying only those six
 * produce correct score and behaviour drift with working alerts, and every
 * domain metric degrades cleanly to 0.
 * Nothing was blocking liveness but a projection nobody had written.
 *
 * WHAT `score0to1` MEANS HERE, stated because the engine's field name says
 * "quality" and this is not that. It is a COMPLIANCE RATE: the fraction of
 * governed calls policy permitted. A drop means more guard denials. That is a
 * behavioural change worth alerting on, not a judgement that the agent got
 * worse — a rising denial rate can equally mean the guards started biting.
 * The alert text should be read as "tool behaviour changed".
 */

/** Bumped when the mapping changes what a fact means. */
export const SESSION_DRIFT_PROJECTION_VERSION = "2026.08.26-p52b";

/** The audit types a governed tool call produces (see tools/toolEvidence.ts). */
const TOOL_CALL_DECISIONS = new Set(["TOOL_CALL_ALLOWED", "TOOL_CALL_DENIED", "TOOL_CALL_FAILED"]);

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/**
 * How a call behaved, as one comparable token.
 *
 * The guard is in the signature deliberately: without it, a workspace whose
 * denials shifted from the allowlist to the budget guard would look completely
 * unchanged, which is the opposite of what a drift monitor is for.
 */
export function toolCallBehaviorSignature(input: {
  auditType: string;
  toolName: string;
  denialGuard: string | null;
}): string {
  return input.denialGuard
    ? `${input.auditType}:${input.toolName}:${input.denialGuard}`
    : `${input.auditType}:${input.toolName}`;
}

/**
 * Project governed tool-call evidence into drift rows.
 *
 * Only `audit` rows naming a TOOL_CALL_* decision project. A metric row, a
 * stdout row or an unrelated audit type is not a decision, and giving one an
 * invented score would put a fabricated sample into the baseline the engine
 * compares against.
 */
export function projectToolCallDriftRows(events: readonly ParsedEvidenceEvent[]): LiveDriftSampleRow[] {
  const rows: LiveDriftSampleRow[] = [];
  for (const event of events) {
    if (event.event_type !== "audit") {
      continue;
    }
    const auditType = str(event.meta.auditType);
    if (auditType === null || !TOOL_CALL_DECISIONS.has(auditType)) {
      continue;
    }
    const toolName = str(event.meta.toolName) ?? "unknown-tool";
    const signedRef = str(event.writer_sig) === null ? null : str(event.event_hash);
    rows.push({
      traceId: str(event.meta.toolToken) ?? event.id,
      scenarioId: toolName,
      timestamp: new Date(event.ts).toISOString(),
      score0to1: auditType === "TOOL_CALL_ALLOWED" ? 1 : 0,
      behaviorSignature: toolCallBehaviorSignature({
        auditType,
        toolName,
        denialGuard: str(event.meta.denialGuard)
      }),
      // The signed evidence row this sample came from. Not decoration: the
      // engine raises a HIGH alert when a receipt carries no evidence refs,
      // and it is right to — a drift claim nobody can trace to signed evidence
      // is an assertion. This makes every sample walk back to the ledger.
      evidenceRefs: [event.id],
      // And the hash-chain entry a verifier actually checks, when the row was
      // signed. Omitted rather than faked when it was not: a drift receipt
      // claiming signed provenance it does not have is worse than one that
      // admits the gap, and the engine's own alert exists to catch exactly that.
      ...(signedRef === null ? {} : { signedEvidenceRefs: [signedRef] })
    });
  }
  return rows;
}

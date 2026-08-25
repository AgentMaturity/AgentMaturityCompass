import type { ToolExecution, ToolOutcome } from "./toolTypes.js";

/**
 * What a governed tool call contributes to the evidence spine (P5.1/P5.2a).
 *
 * `ToolPipeline` has always taken a `record` callback and nothing supplied
 * one, so guard denials were returned to the caller and recorded nowhere. A
 * governance product whose enforcement leaves no trace is back to being
 * advisory at the only moment that matters.
 *
 * WHY THE SHAPE IS `audit` AND `metric` RATHER THAN A NEW EVENT TYPE. The
 * scoring gates filter on `requiredEvidenceTypes`, and those are
 * `stdout`/`review`/`audit`/`metric`/`artifact`/`test` — the harness's own
 * `tool_action` and `session/*` types are not among them. A governed run that
 * emitted only its native vocabulary would satisfy no gate at all. Rather than
 * widen the published scoring methodology to fit the harness, the run projects
 * ITS facts into the vocabulary the methodology already scores. That is what
 * the plan means by "as a projection".
 *
 * TRUST TIER. `OBSERVED`, because a machine watched it happen. That is not a
 * label this module gets to choose freely: level 5 gates accept OBSERVED only,
 * level 4 accepts OBSERVED or ATTESTED, and the whole live-versus-attested
 * distinction the published score has to make rests on it being accurate here.
 */

/** Audit types a governed tool call can produce. */
export type ToolAuditType =
  | "TOOL_CALL_ALLOWED"
  | "TOOL_CALL_DENIED"
  | "TOOL_CALL_FAILED";

export interface ToolEvidenceRecord {
  readonly eventType: "audit" | "metric";
  readonly payload: string;
  readonly meta: Record<string, unknown>;
}

/**
 * Project one tool outcome into evidence rows.
 *
 * Two rows, deliberately, because they answer different questions and the
 * gates count them separately: an `audit` row says what policy decided, and a
 * `metric` row says what it cost. A single row carrying both would be counted
 * once by a gate that wanted either.
 */
export function toolEvidenceFor(execution: ToolExecution, outcome: ToolOutcome): ToolEvidenceRecord[] {
  const auditType: ToolAuditType = outcome.denied !== null
    ? "TOOL_CALL_DENIED"
    : outcome.ok ? "TOOL_CALL_ALLOWED" : "TOOL_CALL_FAILED";

  const common = {
    trustTier: "OBSERVED" as const,
    agentId: execution.agentId,
    toolName: execution.name,
    actionClass: execution.actionClass,
    effectiveMode: execution.effectiveMode,
    // The correlation token, so a denial can be traced to the exact call and a
    // Code Mode sub-call to its parent.
    toolToken: execution.token,
    parentToken: execution.parentToken,
    callId: execution.callId
  };

  const audit: ToolEvidenceRecord = {
    eventType: "audit",
    payload: JSON.stringify({
      auditType,
      tool: execution.name,
      denied: outcome.denied,
      // NOT the arguments. They are frozen and available on the tool_action
      // row; repeating them here would put the same untrusted content in a
      // second place with a second retention story.
      outcome: outcome.ok ? "ok" : "not-ok"
    }),
    meta: {
      ...common,
      auditType,
      ...(outcome.denied
        ? { denialStage: outcome.denied.stage, denialGuard: outcome.denied.guardLabel, denialReason: outcome.denied.reason }
        : {})
    }
  };

  const metric: ToolEvidenceRecord = {
    eventType: "metric",
    payload: JSON.stringify({
      metricKey: "tool_call_outcome",
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      bytes: outcome.bytes
    }),
    meta: {
      ...common,
      metricKey: "tool_call_outcome",
      value: outcome.ok ? 1 : 0,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut
    }
  };

  return [audit, metric];
}

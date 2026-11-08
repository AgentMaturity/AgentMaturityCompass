import { digestField } from "../dataflow/tokenizer.js";
import { AUTHZ_DECISION_AUDIT_TYPE, decisionEvidence, decisionReasons, pipelineDecision, recordlessDecision } from "../governor/decisionLog.js";
import { sha256Hex } from "../utils/hash.js";
import {
  LIVE_PROJECTION_VERSION,
  projectMatchingRuleIds,
  projectQuestionIds
} from "../diagnostic/liveEvidenceProjection.js";
import type { FileChange, RecordedToolCall, ToolOutcome } from "./toolTypes.js";
import { nativeFilesystemTouch } from "../prompt/context/nativeFilesystemTouch.js";

/**
 * What a governed tool call contributes to the evidence spine (P5.1/P5.2a).
 *
 * `ToolPipeline` has always taken a `record` callback and nothing supplied
 * one, so guard denials were returned to the caller and recorded nowhere. A
 * governance product whose enforcement leaves no trace is back to being
 * advisory at the only moment that matters.
 *
 * WHY THE SHAPE IS `audit` AND `metric`. The scoring gates name evidence types
 * in `requiredEvidenceTypes`; measured across the 244-question bank, the
 * distribution is:
 *
 *   stdout 1114 · audit 732 · metric 731 · artifact 509 · review 307
 *   test 289 · llm_response 19 · llm_request 12 · tool_action 10
 *   tool_result 10 · gateway 2
 *
 * An earlier version of this comment claimed `tool_action` was "not among
 * them". That is false — `tool_action` and `tool_result` are named at L3 by
 * AMC-5.21, AMC-5.25, AMC-5.29 and AMC-5.30, four of the questions this
 * harness is best placed to evidence. `session/*` genuinely is absent.
 *
 * The conclusion survives the correction but rests on a different fact: EVERY
 * question's L1 gate requires `stdout` and nothing else, so a run emitting only
 * its native vocabulary clears no gate at any level. Projection into the
 * vocabulary the methodology already scores is what the plan means by "as a
 * projection" — and `stdout` is the type that actually unlocks L1.
 *
 * TRUST TIER. `OBSERVED`, because a machine watched it happen. That is not a
 * label this module gets to choose freely: level 5 gates accept OBSERVED only,
 * level 4 accepts OBSERVED or ATTESTED, and the whole live-versus-attested
 * distinction the published score has to make rests on it being accurate here.
 */

/**
 * P2-24: a call that ran under a break-glass record appends one BreakGlassActionV1 row; the signed record itself is
 * never edited. Its post-hoc review covers these rows (src/governor/breakGlass.ts reads them back).
 */
function breakGlassAction(authorization: NonNullable<RecordedToolCall["authorization"]>, outcome: ToolOutcome,
  call: Record<string, unknown>): ToolEvidenceRecord[] {
  const breakGlassId = authorization.record.authority.breakGlassId;
  if (breakGlassId === undefined || outcome.denied !== null) return [];
  const action = { breakGlassId, executionId: authorization.record.executionId, authorizationDigest: authorization.digest, at: new Date().toISOString() };
  return [{ eventType: "audit", payload: JSON.stringify({ auditType: "BREAK_GLASS_ACTION", action }),
    meta: { ...call, auditType: "BREAK_GLASS_ACTION", breakGlassId, executionId: action.executionId } }];
}

/**
 * P2-25: one AuthZEN decision-log entry for a call that reached the authorization stage: a call with a bound
 * authorization record (allowed, or denied at any stage after it bound), or a call refused at the authorization stage
 * before a record bound. Unbound calls the authorization stage never saw (reads, low-impact writes) make no decision.
 */
function authzDecision(execution: RecordedToolCall, outcome: ToolOutcome, call: Record<string, unknown>): ToolEvidenceRecord[] {
  const denial = outcome.denied?.reason ?? null;
  const entry = execution.authorization !== undefined
    ? pipelineDecision({ record: execution.authorization.record, allowed: outcome.denied === null, denial })
    : outcome.denied?.stage === "authorization" && execution.actionClass !== null
      ? recordlessDecision({ agentId: execution.agentId, toolName: execution.name, actionClass: execution.actionClass, args: execution.arguments,
        allowed: false, reasons: decisionReasons(denial).map((reason) => reason.text), policyDigest: null, resource: {} })
      : null;
  if (entry === null) return [];
  const row = decisionEvidence(entry);
  return [{ ...row, meta: { ...call, ...row.meta } }];
}

/** Audit types a governed tool call can produce. */
export type ToolAuditType =
  | "TOOL_CALL_ALLOWED"
  | "TOOL_CALL_DENIED"
  | "TOOL_CALL_FAILED"
  | "AUTHORIZATION_RECORD"
  | "BREAK_GLASS_ACTION"
  | typeof AUTHZ_DECISION_AUDIT_TYPE;

export interface ToolEvidenceRecord {
  readonly eventType: "audit" | "metric" | "stdout";
  readonly payload: string;
  readonly meta: Record<string, unknown>;
}

export type { FileChange } from "./toolTypes.js";

/**
 * The file changes an audit row carries (SH-TOOLS-06c), read back from its `meta`. `fileChanges` lists every file a
 * call wrote or deleted; `fileChange` is its first entry, which `resumeRules` reads. Rows written before the carrier
 * existed carry neither and yield an empty list.
 */
export function fileChangesOf(meta: Readonly<Record<string, unknown>>): readonly FileChange[] {
  const value = meta.fileChanges;
  const list = Array.isArray(value) ? value : meta.fileChange === undefined ? [] : [meta.fileChange];
  return list.filter((entry): entry is FileChange => entry !== null && typeof entry === "object"
    && typeof (entry as FileChange).path === "string"
    && ((entry as FileChange).beforeSha256 === null || typeof (entry as FileChange).beforeSha256 === "string")
    && ((entry as FileChange).afterSha256 === null || typeof (entry as FileChange).afterSha256 === "string"));
}

/**
 * Project one tool outcome into evidence rows.
 *
 * Two rows, deliberately, because they answer different questions and the
 * gates count them separately: an `audit` row says what policy decided, and a
 * `metric` row says what it cost. A single row carrying both would be counted
 * once by a gate that wanted either.
 */
export function toolEvidenceFor(execution: RecordedToolCall, outcome: ToolOutcome): ToolEvidenceRecord[] {
  const auditType: ToolAuditType = outcome.denied !== null
    ? "TOOL_CALL_DENIED"
    : outcome.ok ? "TOOL_CALL_ALLOWED" : "TOOL_CALL_FAILED";

  // WHAT THIS CALL EVIDENCES (P5.2a). Without it the row is untagged, and
  // since r224 untagged evidence counts toward NO question — measured, a
  // governed run writing 18 signed rows scored 0 of 244. The binding is a
  // methodology claim, so the row records WHICH map made it and which rules
  // fired, and a call that evidences nothing stays untagged rather than
  // borrowing a question it did not earn.
  const questionIds = projectQuestionIds(execution, outcome);
  const projectionRules = projectMatchingRuleIds(execution, outcome);
  // The body's own declaration, carried on the outcome (never a side channel): digests, sizes and workspace-relative
  // paths, so a resumed session can tell whether the file still holds its recorded bytes (resumeRules reads meta).
  const changes = outcome.fileChanges ?? [];
  const fileChange = changes.length === 0 ? {} : { fileChange: changes[0], fileChanges: changes };
  const filesystemTouch = nativeFilesystemTouch(execution, outcome);

  const call = {
    trustTier: "OBSERVED" as const,
    agentId: execution.agentId,
    toolName: execution.name,
    actionClass: execution.actionClass,
    effectiveMode: execution.effectiveMode,
    // The correlation token, so a denial can be traced to the exact call and a
    // Code Mode sub-call to its parent.
    toolToken: execution.token,
    parentToken: execution.parentToken,
    callId: execution.callId,
    ...(execution.ownerStep === undefined ? {} : { ownerStep: execution.ownerStep }),
    // The record this call ran (or was refused) under, on every row (P1-02).
    ...(execution.authorization === undefined ? {} : {
      authorizationId: execution.authorization.authorizationId,
      authorizationDigest: execution.authorization.digest
    })
  };
  const common = {
    ...call,
    ...(questionIds.length > 0
      ? { questionIds, projectionVersion: LIVE_PROJECTION_VERSION, projectionRules }
      : {})
  };

  // The full record, once, beside the decision it governed. Untagged: it evidences no question on its own.
  const authorization: ToolEvidenceRecord[] = execution.authorization === undefined ? [] : [{
    eventType: "audit",
    payload: JSON.stringify({ auditType: "AUTHORIZATION_RECORD", record: execution.authorization.record }),
    meta: { ...call, auditType: "AUTHORIZATION_RECORD", executionId: execution.authorization.record.executionId }
  }, ...breakGlassAction(execution.authorization, outcome, call)];
  const decision = authzDecision(execution, outcome, call);

  const audit: ToolEvidenceRecord = {
    eventType: "audit",
    payload: JSON.stringify({
      auditType,
      tool: execution.name,
      denied: outcome.denied,
      // Retain only the bounded directory needed for instruction context, never filenames or arbitrary argument content.
      outcome: outcome.ok ? "ok" : "not-ok",
      ...(filesystemTouch === undefined ? {} : { nativeFilesystemTouch: filesystemTouch }),
      ...fileChange
    }),
    meta: {
      ...common,
      auditType,
      ...(filesystemTouch === undefined ? {} : { nativeFilesystemTouch: filesystemTouch }),
      ...fileChange,
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

  // L1 REQUIRES `stdout` FOR ALL 244 QUESTIONS, measured across the bank — so
  // without this row nothing the harness emits clears any gate at any level.
  //
  // The payload is a DESCRIPTOR, not the output. Copying tool output into the
  // ledger would put file contents and command results in a second place with
  // a second retention and DSAR story — the same reason the audit row does not
  // copy the arguments. The hash keeps the claim verifiable against the output
  // the caller already has. Its form is the one the pipeline chose for this
  // call's receipt (P2-02): `outputSha256`, or a keyed `outputDigest` in a
  // workspace that opted in to protected-data redaction.
  const produced = outcome.bytes > 0 || outcome.output.length > 0;
  if (!produced) {
    return [audit, metric, ...authorization, ...decision];
  }
  const outputDigest = digestField("output", outcome.outputDigest ?? { kind: "sha256", value: sha256Hex(outcome.output) });

  const stdout: ToolEvidenceRecord = {
    eventType: "stdout",
    payload: JSON.stringify({
      streamKind: "tool_output",
      bytes: outcome.bytes,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      ...outputDigest
    }),
    meta: {
      ...common,
      streamKind: "tool_output",
      bytes: outcome.bytes,
      ...outputDigest
    }
  };

  return [audit, metric, stdout, ...authorization, ...decision];
}

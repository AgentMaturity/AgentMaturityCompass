import { digestField } from "../dataflow/tokenizer.js";
import { sha256Hex } from "../utils/hash.js";
import {
  LIVE_PROJECTION_VERSION,
  projectMatchingRuleIds,
  projectQuestionIds
} from "../diagnostic/liveEvidenceProjection.js";
import type { RecordedToolCall, ToolOutcome } from "./toolTypes.js";

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

/** Audit types a governed tool call can produce. */
export type ToolAuditType =
  | "TOOL_CALL_ALLOWED"
  | "TOOL_CALL_DENIED"
  | "TOOL_CALL_FAILED"
  | "AUTHORIZATION_RECORD"
  | "BREAK_GLASS_ACTION";

export interface ToolEvidenceRecord {
  readonly eventType: "audit" | "metric" | "stdout";
  readonly payload: string;
  readonly meta: Record<string, unknown>;
}

/**
 * What an fs.write or fs.edit call changed (P1-36): hashes and sizes of the bytes it read and wrote, and the digest of
 * the redacted diff it returned. Never the content. `beforeSha256` is null for a created file; `replacements` is null
 * for a write; `diffSha256` is null when no diff was shown.
 */
export interface FileChange {
  readonly path: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly replacements: number | null;
  readonly diffSha256: string | null;
  readonly diffTruncated: boolean;
}

const FILE_CHANGE_TOOLS: ReadonlySet<string> = new Set(["fs.write", "fs.edit"]);
const fileChanges = new Map<string, FileChange>();

/**
 * Hand a call's file change to its audit row, keyed by the call's token.
 *
 * ponytail: a side channel because `ToolPipeline.bodyOutcome` copies only the outcome fields it knows and that file is
 * not this change's to edit. Bounded so a composition with no recorder cannot grow it. Upgrade: carry `fileChange` on
 * `ToolBodyResult`/`ToolOutcome` through `bodyOutcome` and delete this map.
 */
export function noteFileChange(token: string, change: FileChange): void {
  fileChanges.set(token, change);
  if (fileChanges.size > 256) fileChanges.delete(fileChanges.keys().next().value!);
}

function takeFileChange(execution: RecordedToolCall): FileChange | undefined {
  if (!FILE_CHANGE_TOOLS.has(execution.name)) return undefined;
  const change = fileChanges.get(execution.token);
  fileChanges.delete(execution.token);
  return change;
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
  const fileChange = takeFileChange(execution);

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

  const audit: ToolEvidenceRecord = {
    eventType: "audit",
    payload: JSON.stringify({
      auditType,
      tool: execution.name,
      denied: outcome.denied,
      // NOT the arguments. They are frozen and available on the tool_action
      // row; repeating them here would put the same untrusted content in a
      // second place with a second retention story.
      outcome: outcome.ok ? "ok" : "not-ok",
      ...(fileChange === undefined ? {} : { fileChange })
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
    return [audit, metric, ...authorization];
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

  return [audit, metric, stdout, ...authorization];
}

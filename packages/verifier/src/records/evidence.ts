/**
 * Records a verifier reads as evidence or as a receipt: the state receipt payload (spec/schemas/v1/receipt), the action
 * receipt record it binds (src/actions/receiptStates.ts), the control result (control-result) and the exported ledger
 * row (evidence-event). Mirrors AMC's zod schemas.
 */
import { anyRecord, arr, bool, int, invalid, isoTime, isRecord, lit, nonEmpty, nullable, obj, oneOf, opt, sha256, text, union, type Check } from "../schema.js";

export const RECEIPT_STATES = ["requested", "authorized", "started", "completed", "denied", "cancelled", "outcome_unknown"] as const;
export const TERMINAL_STATES: ReadonlySet<string> = new Set(["completed", "denied", "cancelled"]);
export const CLAIM_KINDS = ["synthetic_example", "self_reported", "observed", "independently_reviewed"] as const;

const enforcement = union("level", {
  none: obj({ level: lit("none") }),
  advisory: obj({ level: lit("advisory") }),
  observed: obj({ level: lit("observed") }),
  enforced: obj({ level: lit("enforced"), boundary: nonEmpty })
});

const receiptFields = {
  v: lit(2, "UNSUPPORTED_VERSION"),
  kind: oneOf(["llm_request", "llm_response", "tool_action", "tool_result", "guard_check", "work_accepted", "action_state"] as const),
  receipt_id: nonEmpty,
  ts: int(),
  agentId: text,
  providerId: text,
  model: nullable(text),
  event_hash: nonEmpty,
  body_sha256: nonEmpty,
  session_id: text,
  executionId: nonEmpty,
  idempotencyKey: nullable(nonEmpty),
  authorizationRecordDigest: nullable(sha256),
  enforcement
};
const plain = obj({ ...receiptFields, state: oneOf(["requested", "authorized", "started", "outcome_unknown"] as const) });
const settled = obj({ ...receiptFields, state: oneOf(["completed", "cancelled"] as const),
  reconciliation: opt(obj({ fromReceiptId: nonEmpty, reconciledAt: isoTime, method: nonEmpty, evidenceRefs: arr(nonEmpty) })) });
const denied = obj({ ...receiptFields, state: lit("denied"), reason: nonEmpty });

/** The state receipt payload (receipt v2). Legacy v1 payloads are UNSUPPORTED_VERSION here. */
export const receiptPayload: Check<ReturnType<typeof plain> | ReturnType<typeof settled> | ReturnType<typeof denied>> = (value, path) => {
  if (!isRecord(value)) return invalid(path, "expected an object");
  receiptFields.v(value.v, path ? `${path}.v` : "v");
  return union("state", {
    requested: plain, authorized: plain, started: plain, outcome_unknown: plain, completed: settled, cancelled: settled, denied
  })(value, path);
};
export type ReceiptPayload = ReturnType<typeof receiptPayload>;

export const actionReceipt = obj({
  schema: lit("amc.action-receipt/v1", "UNSUPPORTED_VERSION"),
  executionId: nonEmpty,
  workspaceId: nonEmpty,
  agentId: nonEmpty,
  seq: int({ min: 0 }),
  state: oneOf(RECEIPT_STATES),
  previousState: nullable(oneOf(RECEIPT_STATES)),
  reasonCode: nonEmpty,
  effect: nullable(oneOf(["applied", "not_applied"] as const)),
  evidenceComplete: bool,
  authorizationDigest: nullable(sha256),
  intentDigest: nullable(sha256),
  idempotencyKey: nullable(nonEmpty),
  resolution: nullable(oneOf(["adapter", "operator"] as const)),
  outcomeDigest: nullable(sha256),
  externalRef: nullable(text),
  at: isoTime,
  prevReceiptDigest: nullable(sha256)
});
export type ActionReceipt = ReturnType<typeof actionReceipt>;

const applicability = union("state", {
  applicable: obj({ state: lit("applicable") }),
  not_applicable: obj({ state: lit("not_applicable"), rationale: text }),
  unresolved: obj({ state: lit("unresolved"), reason: text })
});
const dimensionEnforcement = union("state", {
  none: obj({ state: lit("none") }),
  advisory: obj({ state: lit("advisory") }),
  observed: obj({ state: lit("observed") }),
  enforced: obj({ state: lit("enforced"), boundary: text })
});
const review = oneOf(["pending", "approved", "rejected", "expired"] as const);
const passDimensions = obj({ result: lit("pass"), applicability: obj({ state: lit("applicable") }), evidence: lit("sufficient"),
  enforcement: dimensionEnforcement, review });
const otherDimensions = obj({ result: oneOf(["fail", "not_evaluated"] as const), applicability,
  evidence: oneOf(["sufficient", "incomplete", "stale", "contradictory", "untrusted"] as const), enforcement: dimensionEnforcement, review });

/** The five status dimensions of a control; `pass` needs applicable and sufficient evidence. */
export const controlDimensions = union("result", { pass: passDimensions, fail: otherDimensions, not_evaluated: otherDimensions });

export const controlResult = obj({
  type: lit("amc.control-result"),
  version: lit(1, "UNSUPPORTED_VERSION"),
  controlId: nonEmpty,
  controlVersion: nonEmpty,
  evaluatedAt: isoTime,
  dimensions: controlDimensions,
  claimKind: oneOf(CLAIM_KINDS),
  evidenceRefs: arr(nonEmpty),
  exceptions: arr(obj({ exceptionId: nonEmpty, issuer: nonEmpty, expiresAt: isoTime })),
  entitlement: opt(obj({ active: bool }))
});
export type ControlResult = ReturnType<typeof controlResult>;

export const EVIDENCE_EVENT_TYPES = [
  "stdin", "stdout", "stderr", "artifact", "metric", "test", "audit", "review", "llm_request", "llm_response",
  "output_validated", "gateway", "tool_action", "tool_result", "outcome", "agent_process_started", "agent_stdout",
  "agent_stderr", "agent_process_exited", "agent_handoff_sent", "agent_handoff_received", "agent_delegation_started",
  "agent_delegation_completed", "session/open", "session/close", "work/accepted", "turn/start", "turn/end", "turn/seal",
  "step/start", "step/end", "request/header", "request/tools", "request/response", "request/failure", "system/prompt",
  "user/message", "user/attachment", "assistant/block", "tool/call", "tool/result", "tool/spill-commitment",
  "approval/request", "approval/answer", "sandbox/mode", "session/recovery-claim", "session/resume", "session/release",
  "session/recovered", "loop/inbox", "loop/cancel", "loop/veto", "loop/retry", "loop/compact", "time/checkpoint"
] as const;

const prevHash: Check<string> = (value, path) => (value === "GENESIS" ? value : sha256(value, path));

/** One exported ledger row (`amc evidence export`). */
export const evidenceEvent = obj({
  eventId: nonEmpty,
  ts: int({ min: 0 }),
  isoTs: isoTime,
  sessionId: text,
  runtime: text,
  eventType: oneOf(EVIDENCE_EVENT_TYPES),
  actorId: text,
  claimKind: oneOf(CLAIM_KINDS),
  payloadSha256: sha256,
  prevEventHash: prevHash,
  eventHash: sha256,
  writerSignature: text,
  chainIndex: int({ min: -1 }),
  chainValid: bool,
  chainExpectedPrevHash: text,
  incidentIds: arr(text),
  correctionIds: arr(text),
  correctionStatuses: arr(text),
  corrected: bool,
  correctedTs: nullable(int()),
  rationale: nullable(text),
  rationaleChain: arr(text),
  meta: anyRecord
});
export type EvidenceEvent = ReturnType<typeof evidenceEvent>;

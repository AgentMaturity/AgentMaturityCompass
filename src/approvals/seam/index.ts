/**
 * The approval seam — public surface (plan P3.3).
 *
 * `ApprovalSeam` is the thing a composition mounts as `ctx.amcApproval`; the
 * rest is the vocabulary a host needs in order to write an answerer or read a
 * decision. Note what is NOT re-exported: nothing from `src/approvals/` itself.
 * The seam ADAPTS the approvals engine, it does not re-publish it, and a caller
 * that wants the chain store still imports the chain store.
 */
export { ApprovalSeam, type ApprovalSeamInit } from "./approvalSeam.js";
export { askAnswerer, normalizeAnswer, type ContainedAnswer } from "./answerNormalize.js";
export {
  approvalExceptionNoteSchema,
  createApprovalExceptionAnswerer,
  describeApprovalException,
  exceptionAnswererName,
  MAX_EXCEPTION_WINDOW_MS,
  parseApprovalExceptionNote,
  type ApprovalExceptionNote,
  type ApprovalExceptionOptions
} from "./devProfileException.js";
export {
  decideThroughApprovalsEngine,
  type EngineApprovalInput,
  type EngineVerdict
} from "./engineAnswerer.js";
export {
  APPROVAL_ANSWERS,
  DEFAULT_ANSWERER_TIMEOUT_MS,
  DEFAULT_POLL_SCHEDULE,
  realWaitRuntime,
  type AnsweredQuestion,
  type ApprovalAnswer,
  type ApprovalAnswerer,
  type ApprovalAsk,
  type ApprovalDecision,
  type ApprovalPollSchedule,
  type ApprovalRiskTier,
  type ApprovalWaitRuntime
} from "./approvalSeamTypes.js";

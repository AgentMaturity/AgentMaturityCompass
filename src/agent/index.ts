/**
 * The agent loop — public surface (plan P3.2).
 *
 * `AgentDriver` is the machine: it owns the turn/step brackets, the inbox that
 * turns claim from, and the cancellation path. Everything it produces is a
 * signed session event, because everything it produces goes through
 * `SessionService` and there is no second writer.
 *
 * The seams are exported beside it because a composition has to supply them:
 * `stubProvider` and `echoToolSeam` are beside them because an operator has to be
 * able to run a turn on a machine with no API key at all — see their headers for
 * why the stub is a real adapter over the real transport rather than a short
 * circuit, and why the demonstration tool has no side effects. `runReport` reads
 * a finished run back OUT of the signed log, which is the only honest way to say
 * what a run did.
 *
 * `AgentToolSeam` is what P4.1's tool pipeline will provide (and
 * `EMPTY_TOOL_SEAM` is what an unconfigured deployment gets — a real registry
 * with nothing in it, never an absent one), and `LoopHooks` is what a host binds
 * its waterfalls to without this module learning what a waterfall is.
 */
export { AgentDriver, type AgentDriverInit } from "./agentDriver.js";
export { LoopInbox, type InsertOptions } from "./inbox.js";
export { NATIVE_ORDERED_INPUT_FORMAT, snapshotNativeInputParts, type NativeInputPart } from "../attachments/nativeOrderedInput.js";
export { NATIVE_AUDIO_INPUT_FORMAT, snapshotNativeAudioParts, type NativeAudioInput, type NativeAudioPart, type NativeAudioMediaType } from "../attachments/nativeAudioInput.js";
export {
  DEFAULT_AGENT_LOOP_CONFIG,
  NO_HOOKS,
  toTurnEndParams,
  type AgentLoopConfig,
  type AgentStatus,
  type CancelOptions,
  type InboxMessage,
  type InboxOrigin,
  type InboxReceipt,
  type InboxSpliceOp,
  type InboxTarget,
  type LoopHooks,
  type LoopNotification,
  type LoopRetryRuntime,
  type PreStepDecision,
  type PreStepInput,
  type TurnEnding,
  type TurnStoppingInput
} from "./loopTypes.js";
export {
  DEFAULT_RETRY_RUNTIME,
  decideRetry,
  dispatchStepRequest,
  type RetryVerdict,
  type StepRequestInit
} from "./requestRetry.js";
export { runStep, type LoopLlm, type LoopRoute, type StepResult, type StepRunnerInit } from "./stepRunner.js";
export { echoToolSeam } from "./echoTool.js";
export {
  readAgentRunSummary,
  renderRunSummary,
  renderVerifyReport,
  verifyAgentRun,
  type AgentRunSummary,
  type AgentRunVerification,
  type RequestDerivationRow,
  type TurnEndingRow
} from "./runReport.js";
export {
  STUB_PROVIDER_ID,
  STUB_PROVIDER_MODEL,
  stubProviderRoute,
  stubProviderTransport,
  type StubProviderOptions
} from "./stubProvider.js";
export {
  runToolCalls,
  type ToolCallsInput,
  type ToolCallsResult
} from "./toolCalls.js";
export {
  EMPTY_TOOL_SEAM,
  type AgentToolSeam,
  type ToolCallOutcome,
  type ToolCallRequest
} from "./toolSeam.js";

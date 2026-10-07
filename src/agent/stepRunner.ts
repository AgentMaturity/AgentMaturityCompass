/**
 * One step: one model request, plus the tool calls it asked for.
 *
 * A step is the unit the conversation is made of, and the unit the crash-loss
 * bound is stated in (ADR-0009: a crash loses at most the in-flight step). This
 * module is deliberately thin — it decides nothing about turns, nothing about
 * the inbox, and nothing about cancellation policy. It asks P3.1 for a model
 * response, reads what came back, and reports which of the turn's endings that
 * implies.
 *
 * WHAT IT DOES NOT DISPATCH. The model request — and the request-boundary retry
 * around it — lives in ./requestRetry.ts, because a retried step holds two
 * requests and the rule that keeps the step number still is a rule about
 * evidence, not about tool calls. This module asks for a settlement and reads
 * it.
 *
 * WHAT IT DOES NOT WRITE. `request/tools`, `request/header`, `request/response`,
 * `request/failure`, `assistant/block` and `tool/call` are all written by the
 * P3.1 seam, because that seam is what actually holds the bytes: the request row
 * commits to the exact transmitted bytes before they can be obtained, and the
 * response rows are written at settle, before the loop is handed the assembly.
 * Duplicating any of them here would produce a second, unverifiable account of
 * the same event. What the loop adds is the `tool/result` rows and the step's
 * own boundary.
 *
 * USAGE IS COPIED, NOT INVENTED. A provider that reported no cache counts has
 * not reported zero, and a stream that was cancelled reported no usage at all.
 * Both survive into the signed `step/end` row as null — see
 * ../session/turnLifecycleMeta.ts for why a fabricated zero is worse than an
 * absent number. On a RETRIED step the boundary carries the usage of the attempt
 * that actually answered; what the abandoned attempts cost is on their own
 * `request/failure` rows, where the provider reported it, rather than summed
 * here into a number no single request corresponds to.
 */
import type { LlmCallSpec, PreparedCall } from "../llm/adapter/llmRuntime.js";
import type { StreamAssembly } from "../llm/blockAssembler.js";
import type { StreamTokenUsage, ToolUseContentBlock } from "../llm/streamChunk.js";
import type { SessionService } from "../session/sessionService.js";
import type { TokenUsage } from "../session/sessionTypes.js";
import type { AgentLoopConfig, LoopNotification, LoopRetryRuntime, TurnEnding } from "./loopTypes.js";
import { dispatchStepRequest } from "./requestRetry.js";
import { runToolCalls } from "./toolCalls.js";
import type { AgentToolSeam } from "./toolSeam.js";

/**
 * The one thing the loop needs from the model seam.
 *
 * Narrowed to `prepare` rather than typed as `LlmRuntime` for a concrete
 * reason: the composed `amcLlm` service DELEGATES to a runtime rather than
 * being one, and `LlmRuntime`'s private fields make it structurally
 * unassignable. A loop that could only be driven by the concrete class could
 * not be driven from the composed tree at all — which would leave the Cordis
 * service a facade nothing reaches.
 *
 * It is also the honest surface. The loop never streams directly, never asks
 * which providers exist, and never registers a route; it prepares a call and
 * dispatches it. Anything wider would be a permission the loop does not use.
 */
export interface LoopLlm {
  prepare(spec: LlmCallSpec): PreparedCall;
}

/** The provider route one loop instance sends on. */
export interface LoopRoute {
  readonly providerId: string;
  readonly model: string;
  /** Provider parameters (max_tokens, temperature, …), verbatim into the body. */
  readonly params: Record<string, unknown>;
}

export interface StepRunnerInit {
  readonly session: SessionService;
  readonly llm: LoopLlm;
  readonly tools: AgentToolSeam;
  readonly route: LoopRoute;
  /** The `system/prompt` row this run's requests cite. P3.3 replaces this with an assembly. */
  readonly systemPromptEventId: string;
  readonly config: AgentLoopConfig;
  /** How the request-boundary retry waits and jitters. Injected so a test can pin both. */
  readonly retryRuntime: LoopRetryRuntime;
  /** Where a tool's `additionalContext` goes — the driver's inbox. */
  readonly acceptContext: (text: string) => void;
  /** Live-only mirror of what the step is doing. Never load-bearing for the log. */
  readonly notify: (notification: LoopNotification) => void;
}

export interface StepResult {
  /**
   * The turn ending this step implies, or null to keep going.
   *
   * Null means the model asked for tools, they ran, and none of them concluded
   * the turn — so the model must be asked again with their results in view. That
   * is what makes a turn multi-step.
   */
  readonly ending: TurnEnding | null;
  readonly stopReason: string | null;
  readonly usage: TokenUsage | null;
}

/**
 * Copy stream usage into the session vocabulary.
 *
 * The cache counts stay nullable end to end. `StreamTokenUsage` makes them
 * optional to mean "the provider did not report it"; `TokenUsage` makes them
 * nullable to mean the same thing, so the fact survives into the signed row
 * instead of being flattened to a zero on the way.
 */
export function stepUsage(usage: StreamTokenUsage | null): TokenUsage | null {
  if (usage === null) return null;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheRead: usage.cacheReadTokens ?? null,
    cacheWrite: usage.cacheWriteTokens ?? null
  };
}

/**
 * The tool calls the model actually asked for.
 *
 * Dropped blocks are excluded, and that exclusion is load-bearing: the assembler
 * drops a tool call that was truncated, or that arrived in a `max_tokens`
 * response, precisely because a call cut off mid-arguments may mean something
 * other than what it appears to say. P3.1 wrote no `tool/call` row for those, so
 * there is nothing here to answer either — the two decisions agree by
 * construction rather than by both being remembered.
 */
function toolCallsOf(assembly: StreamAssembly): readonly ToolUseContentBlock[] {
  const calls: ToolUseContentBlock[] = [];
  for (const record of assembly.blocks) {
    if (record.outcome.status === "dropped") continue;
    const block = record.block;
    if (block !== null && block.kind === "tool_use") calls.push(block);
  }
  return calls;
}

export async function runStep(
  init: StepRunnerInit,
  turn: number,
  step: number,
  signal: AbortSignal
): Promise<StepResult> {
  signal.throwIfAborted();
  const settled = await dispatchStepRequest(
    {
      session: init.session,
      llm: init.llm,
      route: init.route,
      systemPromptEventId: init.systemPromptEventId,
      // Read per STEP, so a registry change between steps reaches the next
      // request and shows up in the log as a new `request/tools` row — and so a
      // retry within this step re-sends what this step was offering.
      tools: init.tools.schemas(),
      retry: init.retryRuntime,
      notify: init.notify
    },
    turn,
    step,
    signal
  );

  const assembly = settled.assembly;
  const usage = stepUsage(assembly.usage);
  const stopReason = assembly.finishReason?.kind ?? "aborted";

  if (assembly.finishReason?.kind === "max_tokens") {
    // The response was truncated. Every tool call in it was dropped by the
    // assembler, so there is nothing to dispatch and nothing to answer.
    return { ending: { reason: "max_tokens" }, stopReason, usage };
  }

  const calls = toolCallsOf(assembly);
  if (calls.length === 0) {
    return { ending: { reason: "complete" }, stopReason, usage };
  }

  const outcome = await runToolCalls({
    session: init.session,
    tools: init.tools,
    turn,
    step,
    signal,
    maxParallel: init.config.maxParallelToolCalls,
    abandonGraceMs: init.config.toolAbandonGraceMs,
    // Native dispatch: a code-mode sub-call (P4.5) is issued from inside a
    // running program and never decoded from a provider stream, so there is no
    // parent token to carry here and none is guessed.
    parentToken: null,
    acceptContext: init.acceptContext,
    calls
  });

  // A cancelled tool run leaves the step's ending to the turn machine: the abort
  // it observed is the same signal the turn is about to see.
  if (outcome.aborted) {
    signal.throwIfAborted();
  }
  return { ending: outcome.concluded ? { reason: "complete" } : null, stopReason, usage };
}

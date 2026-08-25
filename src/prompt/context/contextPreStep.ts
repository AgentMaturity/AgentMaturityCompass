/**
 * Where context meets the loop, and the only way it reaches a model.
 *
 * THE ROUTE, AND WHY THERE IS EXACTLY ONE. `prepareRequest` has no `messages`
 * parameter: a request is assembled from the session's COMMITTED rows and from
 * nothing else, so "the model saw something that was never logged" is not
 * expressible through that seam. This hook therefore does not build a request,
 * does not append to a buffer, and does not hand text to the LLM seam. It puts
 * the snapshot into the pre-step decision, and the driver commits every message
 * in that decision with `recordUserMessage` BEFORE it runs the step. The signed
 * `user/message` row is a strict predecessor of the `request/header` that cites
 * it — not by convention, but because the header is derived from rows that were
 * already durable when it was written.
 *
 * That is the whole reason this file is small. Three unsigned side-channels have
 * shipped in this project (a spill, dropped blocks, dropped tool calls) and each
 * one began as a place where model-visible content took a shortcut past the
 * spine. There is no shortcut here to take.
 *
 * TWO REFUSALS, BOTH DELIBERATE.
 *
 *   A VETOED STEP GETS NO CONTEXT. When a pre-step listener rejects, the turn
 *   ends `blocked` with no model call. Appending a snapshot to a rejected
 *   decision would write a `user/message` row for text no request ever carried —
 *   a log that says the model was shown something it was not.
 *
 *   CONTEXT NEVER MANUFACTURES A TURN. A first step that claimed nothing is a
 *   turn with nothing to say; the driver ends it `complete` without spending a
 *   model call. If context contributed there, a clock reading alone would become
 *   a standalone request — the agent would wake up, tell the model what time it
 *   is, and bill someone for the answer. dsh's agent-instructions plugin makes
 *   the same exception for the same reason.
 *
 * THE SNAPSHOT GOES LAST. It is appended after the claimed batch, so the user's
 * own words precede the runtime facts. A snapshot placed first would read as the
 * premise of the user's message rather than as the state it is being answered
 * in.
 *
 * KNOWN AND UNCLOSED: the committed row is a plain `user/message`, whose meta
 * carries no source discriminator, so an auditor cannot tell a plugin snapshot
 * from a human's own words by the row's METADATA. What attributes it is the
 * PAYLOAD — the supersession preamble and the per-plugin headings are inside the
 * signed bytes. Closing it properly means giving `user/message` a source field
 * in the spine, which is a change to the session model and not to this seam.
 */
import { randomUUID } from "node:crypto";
import type { InboxMessage, PreStepDecision, PreStepInput } from "../../agent/loopTypes.js";
import { renderContextSnapshot } from "../assembly/interpolate.js";
import type { PromptAssemblyRegistry } from "../assembly/promptRegistry.js";
import type { ContextPluginHost } from "./contextHost.js";

export interface ContextPreStepInit {
  /** The registry the host's contexts are registered on, and assembled from. */
  readonly registry: PromptAssemblyRegistry;
  readonly host: ContextPluginHost;
  /** The session id handed to plugins and to assembly. */
  readonly sessionId?: string;
  /** Identity for the synthesized message. Injected so a test can pin it. */
  readonly newMessageId?: () => string;
}

/** A registered seam: the hook the loop runs, and the registration it owns. */
export interface ContextPreStepSeam {
  /** Bind as `LoopHooks.preStep`. */
  readonly preStep: (
    input: PreStepInput,
    next: () => Promise<PreStepDecision>
  ) => Promise<PreStepDecision>;
  /** Remove the contexts this seam registered. Idempotent via the registry. */
  dispose(): void;
}

/**
 * Register the host's plugins and return the pre-step hook that delivers them.
 *
 * Registration happens HERE rather than being left to the caller, because a host
 * whose plugins were never registered would produce an empty snapshot forever
 * and look exactly like a workspace with nothing to say.
 *
 * @param init - the registry, the plugin host, and the session identity.
 * @returns the hook and a disposer for its registrations.
 * @throws PromptAssemblyError when a plugin name is already registered.
 */
export function createContextPreStep(init: ContextPreStepInit): ContextPreStepSeam {
  const dispose = init.host.register(init.registry);
  const newMessageId = init.newMessageId ?? ((): string => randomUUID());

  const preStep = async (
    input: PreStepInput,
    next: () => Promise<PreStepDecision>
  ): Promise<PreStepDecision> => {
    const decision = await next();
    if (decision.kind === "reject") return decision;
    // A no-step turn stays a no-step turn. See the module header.
    if (input.step === 1 && decision.messages.length === 0) return decision;
    input.signal.throwIfAborted();

    await init.host.refresh({
      ...(init.sessionId === undefined ? {} : { sessionId: init.sessionId }),
      turn: input.turn,
      step: input.step,
      signal: input.signal
    });
    const snapshot = renderContextSnapshot(
      init.registry.assemble({
        ...(init.sessionId === undefined ? {} : { sessionId: init.sessionId }),
        signal: input.signal
      })
    );
    input.signal.throwIfAborted();
    if (snapshot.length === 0) return decision;

    const message: InboxMessage = {
      messageId: newMessageId(),
      text: snapshot,
      // The honest label for text queued at a step boundary that never woke the
      // driver. It is not a steer (nobody is steering) and not a tool's output.
      origin: "inject"
    };
    return { kind: "enter", messages: [...decision.messages, message] };
  };

  return { preStep, dispose };
}

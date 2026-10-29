/**
 * The one composition every native surface builds an agent through (GAP-WP39).
 *
 * WHY. Three builders used to assemble session + prompt + driver on their own:
 * the kernel's `runComposedTurn` (agent-loop), `composeAgentSession` (ACP stdio,
 * Studio native tasks, which run ACP, and the SDK) and `createDriverRunner`
 * (delegated children). Only the kernel installed the context pre-step, so
 * workspace instruction files, the time context and the governance section
 * reached the model on `amc agent-loop` alone (DXA-06, D51). And every builder
 * sealed a session whose composition threw as `completed` (DXA-13).
 *
 * WHAT IS SHARED HERE. {@link composeNativePrompt} is the prompt half — profile
 * registry, context-plugin host and the pre-step hook that delivers them — and
 * the kernel's `PromptSeamService` is built on it too, so all four surfaces
 * assemble the same sections from the same profile. {@link composeNativeAgent}
 * is the session half the kernel-free builders share: open, tools, prompt row,
 * admission, route check and driver, in that order, settling the session as
 * {@link COMPOSITION_FAILED} when any of it throws. The kernel keeps its Cordis
 * fibers (the loop fiber owns cancellation on dispose) and uses the prompt half
 * and the same failure reason.
 *
 * KERNEL-FREE, like everything else under src/agent/: no `@amc/*` import.
 */
import type { LoopHooks, PreStepDecision, PreStepInput } from "./loopTypes.js";
import { NO_HOOKS } from "./loopTypes.js";
import { AgentDriver, type AgentDriverInit } from "./agentDriver.js";
import type { LoopLlm, LoopRoute } from "./stepRunner.js";
import type { AgentToolSeam } from "./toolSeam.js";
import type { SessionService } from "../session/sessionService.js";
import type { SessionOpenParams } from "../session/sessionApiTypes.js";
import { buildAgentPromptRegistry, type AgentPromptProfile } from "../prompt/agentPromptProfile.js";
import type { PromptAssemblyRegistry } from "../prompt/assembly/promptRegistry.js";
import { renderPrompt } from "../prompt/assembly/interpolate.js";
import { ContextPluginHost } from "../prompt/context/contextHost.js";
import { createContextPreStep } from "../prompt/context/contextPreStep.js";

/** The `session/close` reason of a session whose composition threw: it never became ready, so it did not complete. */
export const COMPOSITION_FAILED = "composition_failed";

export interface NativePrompt {
  readonly registry: PromptAssemblyRegistry;
  readonly host: ContextPluginHost;
  /** Bind as `LoopHooks.preStep`: refreshes the context plugins and commits their snapshot before each step. */
  readonly preStep: (input: PreStepInput, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>;
  /** Removes the context registrations. */
  dispose(): void;
}

/** A profile's registry, plugin host and context pre-step, wired to each other. */
export function composeNativePrompt(profile: AgentPromptProfile, options: { readonly sessionId?: string; readonly newMessageId?: () => string } = {}): NativePrompt {
  const registry = buildAgentPromptRegistry(profile);
  const host = new ContextPluginHost(profile.contextPlugins);
  const seam = createContextPreStep({ registry, host,
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    ...(options.newMessageId === undefined ? {} : { newMessageId: options.newMessageId }) });
  return { registry, host, preStep: seam.preStep, dispose: seam.dispose };
}

/** Composed from a profile (a root agent), or inherited as already-rendered text and control (a delegated child). */
type NativeAgentPrompt =
  | { readonly profile: AgentPromptProfile }
  | { readonly text: string; readonly hooks: LoopHooks };

export interface NativeAgentInit {
  /** Constructed by the caller (redaction wrapper, resume or fresh); opened here when `open` is given. */
  readonly session: SessionService;
  /** Absent: the session is already open (resumed). */
  readonly open?: SessionOpenParams;
  readonly prompt: NativeAgentPrompt;
  readonly makeLlm: (session: SessionService) => LoopLlm;
  readonly route: LoopRoute;
  /** Composes the tool surface after the session opens; resources it creates are the caller's to close. */
  readonly tools: (session: SessionService) => AgentToolSeam;
  /** Owned resources must drain while the session writer is still open. */
  readonly cleanup?: () => Promise<boolean>;
  readonly hasOwnedWork?: () => boolean;
  /** Runs after the prompt row and before the driver: admission checks and control rows. A throw fails composition. */
  readonly admit?: (composed: { readonly systemPrompt: string; readonly tools: AgentToolSeam }) => void;
  readonly driver?: Pick<AgentDriverInit, "validation" | "config">;
}

export interface NativeAgent {
  readonly driver: AgentDriver;
  readonly session: SessionService;
  readonly systemPromptEventId: string;
  /** The section names of the system prompt as assembled (not as registered). */
  readonly promptSections: readonly string[];
  /** Close admission and await bounded driver/resource cleanup before sealing. */
  shutdown(): Promise<boolean>;
  /** Releases the composition's own registrations. Session lifetime stays with the surface. */
  dispose(): void;
}

/**
 * Compose one native agent.
 *
 * @throws whatever failed. The session is settled first: a session this call
 * opened is closed {@link COMPOSITION_FAILED}, a resumed one is released for a
 * later resume, and one that never opened is disposed. The caller must not
 * close it again.
 */
export function composeNativeAgent(init: NativeAgentInit): NativeAgent {
  const session = init.session;
  let opened = false;
  let prompt: NativePrompt | undefined;
  try {
    if (init.open !== undefined) { session.open(init.open); opened = true; }
    const tools = init.tools(session);
    let systemPrompt: string;
    let hooks: LoopHooks;
    let promptSections: readonly string[];
    if ("profile" in init.prompt) {
      prompt = composeNativePrompt(init.prompt.profile, { sessionId: session.sessionId });
      const assembly = prompt.registry.assemble({ sessionId: session.sessionId });
      // Rendered before any row: an unknown `{{variable}}` throws with nothing sent.
      systemPrompt = renderPrompt(assembly);
      promptSections = assembly.sections.map(section => section.name);
      hooks = { ...NO_HOOKS, preStep: prompt.preStep };
    } else {
      systemPrompt = init.prompt.text;
      hooks = init.prompt.hooks;
      promptSections = [];
    }
    const llm = init.makeLlm(session);
    // An unknown route is a composition failure, not a turn that errors at its first request.
    llm.pin?.({ providerId: init.route.providerId, model: init.route.model });
    const systemPromptEventId = session.recordSystemPrompt(systemPrompt).eventId;
    init.admit?.({ systemPrompt, tools });
    const driver = new AgentDriver({ session, llm, route: init.route, systemPromptEventId, tools, hooks,
      ...(init.driver?.validation === undefined ? {} : { validation: init.driver.validation }),
      ...(init.driver?.config === undefined ? {} : { config: init.driver.config }) });
    const composedPrompt = prompt;
    let shutdown: Promise<boolean> | undefined;
    return { driver, session, systemPromptEventId, promptSections,
      shutdown: () => {
        if (!shutdown) {
          const idle = driver.dispose();
          let cleanup: Promise<boolean>;
          try { cleanup = init.cleanup?.() ?? Promise.resolve(true); } catch { cleanup = Promise.resolve(false); }
          shutdown = Promise.all([idle, cleanup]).then(results => results.every(Boolean), () => false);
        }
        return shutdown;
      },
      dispose: () => { void driver.dispose(); composedPrompt?.dispose(); } };
  } catch (error) {
    prompt?.dispose();
    const how = opened ? "close" : init.open === undefined ? "release" : "dispose";
    if (init.hasOwnedWork?.()) {
      // A failed composition can still have resources created by a tool mount. Never seal ahead of their cleanup.
      void Promise.resolve().then(() => init.cleanup?.()).then(
        confirmed => settleFailedComposition(session, confirmed === true ? how : "dispose"),
        () => settleFailedComposition(session, "dispose"));
    } else settleFailedComposition(session, how);
    throw error;
  }
}

/** Settle a session whose composition threw. Never `completed`; a refused settle leaves it visibly unsealed. */
export function settleFailedComposition(session: SessionService, how: "close" | "release" | "dispose"): void {
  try {
    if (how === "close") session.close({ reason: COMPOSITION_FAILED });
    else if (how === "release") session.releaseWithoutClosing();
    else session.disposeWithoutClosing();
  } catch {
    // Retain the composition error; the evidence stays unsealed rather than claiming a seal.
    try { session.disposeWithoutClosing(); } catch { /* already disposed */ }
  }
}

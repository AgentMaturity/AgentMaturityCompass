/**
 * One agent turn, run through the COMPOSED tree (plan P3.2 stage 4).
 *
 * WHY THIS MODULE EXISTS. `amc agent-loop run` has to reach `ctx.amcAgentLoop`,
 * and a CLI module may not import the vendored Cordis packages — the
 * architecture gate forbids it, because those packages are not in the published
 * npm tarball and a CLI that imported one would throw `ERR_MODULE_NOT_FOUND` on
 * a normal install. So the composition lives here, under `src/kernel/`, and the
 * CLI reaches it by a RELATIVE dynamic import it is allowed to make and is
 * prepared to find missing.
 *
 * It also settles a question stage 4 would otherwise have dodged: if the CLI
 * built an `AgentDriver` directly, the Cordis services would have no caller but
 * their own tests — the exact shape P2.4 shipped and this phase was told not to
 * repeat. There is therefore ONE path from an operator to a turn, and it runs
 * through every seam: `amcCredentials` → `amcLlm` → `amcAgentLoop`.
 *
 * THE COMPOSITION IS SEQUENTIAL ON PURPOSE. Each fiber is awaited before the
 * next is registered, so a service that failed to boot fails here, named, rather
 * than leaving its consumer PENDING and the run silently doing nothing. The
 * fibers are disposed in reverse, and the agent-loop fiber's disposer is what
 * cancels any still-running turn as `{kind:"disposed"}` and waits for its
 * `turn/end` — see agentLoopServices.ts for why the wait is not optional.
 *
 * THE SESSION IS OPENED AND CLOSED HERE, and closing happens in a `finally`. An
 * unsealed session with no close is reported by the verifier as INTERRUPTED,
 * which is the right verdict for a process that died and the wrong one for a
 * command that finished.
 */
import { Context } from "@amc/cordis";
import { createHash } from "node:crypto";
import type { AgentLoopConfig, AgentStatus, LoopNotification } from "../agent/loopTypes.js";
import type { LoopRoute } from "../agent/stepRunner.js";
import type { AgentToolSeam } from "../agent/toolSeam.js";
import type { LlmRouteConfig } from "../llm/adapter/adapterRegistry.js";
import type { HttpTransport } from "../llm/adapter/transport.js";
import { SessionService } from "../session/sessionService.js";
import type { TurnCancelCause } from "../session/sessionTypes.js";
import { amcVersion } from "../version.js";
import { credentialsServices, CREDENTIALS_SEAM } from "./services/credentialsServices.js";
import type { CredentialsSeamService, CredentialsServiceConfig } from "./services/credentialsServices.js";
import { llmServices, LLM_SEAM } from "./services/llmServices.js";
import type { LlmSeamService } from "./services/llmServices.js";
import { agentLoopServices, AGENT_LOOP_SEAM } from "./services/agentLoopServices.js";
import type { AgentLoopSeamService } from "./services/agentLoopServices.js";

/** What a caller may do to a turn while it runs. */
export interface ComposedTurnHandle {
  readonly sessionId: string;
  /** Stop the turn. The cause rides inside the signed `turn/end`. */
  cancel(cause: TurnCancelCause): void;
}

export interface ComposedTurnOptions {
  readonly workspace: string;
  readonly agentId: string;
  /** Recorded as the `system/prompt` row every request in this run cites. */
  readonly systemPrompt: string;
  /** The prompt that opens the turn. Enters the durable inbox like any other message. */
  readonly prompt: string;
  readonly route: LoopRoute;
  /** Routes registered on the composed `amcLlm`. Must include `route.providerId`. */
  readonly routes: readonly LlmRouteConfig[];
  /** Replaces the platform `fetch` — the stub provider answers in-process. */
  readonly transport?: HttpTransport;
  readonly tools?: AgentToolSeam;
  readonly config?: Partial<AgentLoopConfig>;
  readonly credentials?: CredentialsServiceConfig;
  /** Live-only mirror. Never load-bearing: the log is the record. */
  readonly notify?: (notification: LoopNotification) => void;
  /** Called once the driver exists and before the prompt is sent. */
  readonly onReady?: (handle: ComposedTurnHandle) => void;
  /**
   * A steering message to send mid-turn.
   *
   * Sent through `steer()` — the same durable inbox a human uses — rather than
   * through some privileged path a flag gets: an operator demonstrating that
   * steering works has to be demonstrating the mechanism users have.
   */
  readonly onSteer?: { readonly afterMs: number; readonly text: string };
}

export interface ComposedTurnOutcome {
  readonly sessionId: string;
  /** The driver's terminal state. `failed` means the spine refused a closer. */
  readonly status: AgentStatus;
}

/** Read a composed service off the tree by the name its seam declares. */
function serviceOn<T>(ctx: Context, name: string): T {
  const found = (ctx as unknown as Record<string, T | undefined>)[name];
  if (found === undefined) {
    throw new Error(`composition did not provide ${name}; the fiber booted but registered no service`);
  }
  return found;
}

/**
 * What this run was composed from, as a digest.
 *
 * Recorded on the `session/open` row, so "which build of which composition
 * produced this session" is answerable from the log alone. It commits to the
 * plugin names, the routes registered and the model actually addressed — the
 * three things that decide what the agent could do.
 */
function compositionDigestOf(options: ComposedTurnOptions): string {
  const shape = JSON.stringify({
    plugins: [credentialsServices.name, llmServices.name, agentLoopServices.name],
    providers: options.routes.map((route) => ({
      providerId: route.providerId,
      adapterId: route.adapter.id,
      adapterVersion: route.adapter.version,
      baseUrl: route.baseUrl,
      models: route.models
    })),
    route: { providerId: options.route.providerId, model: options.route.model },
    version: amcVersion
  });
  return createHash("sha256").update(shape).digest("hex");
}

/** The loop bounds this run enforced, as a digest, for the `session/open` row. */
function policyDigestOf(options: ComposedTurnOptions): string {
  return createHash("sha256").update(JSON.stringify(options.config ?? {})).digest("hex");
}

/**
 * Compose the seams, run ONE turn to completion, and tear the tree down.
 *
 * "To completion" means `whenIdle()`: a follow-up queued by a tool, or a steer
 * that arrived while the turn was stopping, runs before this returns. That is
 * the loop's own definition of done, and second-guessing it here would let a
 * command exit with work still committed to the inbox.
 */
export async function runComposedTurn(options: ComposedTurnOptions): Promise<ComposedTurnOutcome> {
  const session = new SessionService(options.workspace);
  session.open({
    agentId: options.agentId,
    harnessVersion: amcVersion,
    compositionDigest: compositionDigestOf(options),
    policyDigest: policyDigestOf(options)
  });
  const sessionId = session.sessionId;
  const ctx = new Context();
  const fibers: { dispose(): Promise<void> }[] = [];
  let steerTimer: NodeJS.Timeout | null = null;

  try {
    const credentialsFiber = ctx.plugin(credentialsServices, options.credentials ?? {});
    await credentialsFiber.await();
    fibers.push(credentialsFiber);

    const llmFiber = ctx.plugin(llmServices, {
      session,
      credentials: serviceOn<CredentialsSeamService>(ctx, CREDENTIALS_SEAM.name),
      routes: options.routes,
      ...(options.transport !== undefined ? { transport: options.transport } : {})
    });
    await llmFiber.await();
    fibers.push(llmFiber);

    const loopFiber = ctx.plugin(agentLoopServices, {
      session,
      // The COMPOSED model seam, not a runtime built beside it: that is what
      // makes this a composition rather than three objects in a function.
      llm: serviceOn<LlmSeamService>(ctx, LLM_SEAM.name),
      route: options.route,
      systemPromptEventId: session.recordSystemPrompt(options.systemPrompt).eventId,
      ...(options.tools !== undefined ? { tools: options.tools } : {}),
      ...(options.config !== undefined ? { config: options.config } : {}),
      ...(options.notify !== undefined
        ? {
            hooks: {
              preStep: (_input, next) => next(),
              turnStopping: () => Promise.resolve(),
              notify: options.notify
            }
          }
        : {})
    });
    await loopFiber.await();
    fibers.push(loopFiber);

    const loop = serviceOn<AgentLoopSeamService>(ctx, AGENT_LOOP_SEAM.name);
    options.onReady?.({
      sessionId,
      cancel: (cause: TurnCancelCause) => {
        loop.cancel(cause);
      }
    });
    loop.followup(options.prompt);
    if (options.onSteer !== undefined) {
      const steer = options.onSteer;
      steerTimer = setTimeout(() => {
        // A driver that already reached a terminal `failed` state refuses input,
        // and a steer that threw here would replace the real failure with this
        // one. The inbox row is worth attempting; the throw is not worth raising.
        try {
          loop.steer(steer.text);
        } catch {
          // Reported by the summary the caller reads from the log.
        }
      }, steer.afterMs);
    }
    await loop.whenIdle();
    return { sessionId, status: loop.status };
  } finally {
    if (steerTimer !== null) clearTimeout(steerTimer);
    // Reverse order: the loop lets go of the model seam before the model seam
    // lets go of the credentials it resolves per request.
    for (const fiber of [...fibers].reverse()) {
      await fiber.dispose();
    }
    try {
      session.close({ reason: "completed" });
    } catch {
      // A driver that entered `failed` left an open turn only recovery may
      // close, and the spine refuses a close over it. Swallowed HERE and only
      // here: the status returned above already reports it, and throwing from a
      // finally would replace the real failure with this one.
    }
  }
}

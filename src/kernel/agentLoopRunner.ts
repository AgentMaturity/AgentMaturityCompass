/**
 * One agent turn, run through the COMPOSED tree (plan P3.2, extended by P3.3).
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
 * through every seam: `amcCredentials` → `amcLlm` → `amcPrompt` →
 * (`amcApproval`) → `amcAgentLoop`.
 *
 * WHAT P3.3 ADDED, AND WHERE IT SITS IN THAT ORDER. `amcPrompt` is composed
 * before the loop because the loop needs the `system/prompt` row's id at
 * construction, and because rendering the prompt EARLY is what makes an
 * unresolvable `{{variable}}` cost nothing: it throws with no turn started and
 * no request sent. `amcApproval` is composed only when the caller asked for a
 * gate, and its presence is what permits the system prompt to tell the model
 * that approval exists — see {@link promptProfileFor} for why that is derived
 * rather than configured.
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
import { Context } from "./amcRuntime.js";
import { createHash } from "node:crypto";
import { gateToolCallsOnApproval, type ToolApprovalGateOptions } from "../agent/approvalGate.js";
import type { AgentLoopConfig, AgentStatus, LoopHooks, LoopNotification } from "../agent/loopTypes.js";
import type { LoopRoute } from "../agent/stepRunner.js";
import { EMPTY_TOOL_SEAM, type AgentToolSeam } from "../agent/toolSeam.js";
import type { NativeValidationPlan, NativeValidationResult } from "../agent/nativeValidation.js";
import { projectNativeValidation } from "../agent/nativeValidationProjection.js";
import type { ApprovalAnswerer } from "../approvals/seam/approvalSeamTypes.js";
import type { LlmRouteConfig } from "../llm/adapter/adapterRegistry.js";
import type { HttpTransport } from "../llm/adapter/transport.js";
import type { LiveTextPreviewEvent } from "../llm/adapter/liveTextPreview.js";
import {
  agentPromptProfile,
  type AgentPromptProfile,
  type AgentPromptProfileOptions
} from "../prompt/agentPromptProfile.js";
import { SessionService } from "../session/sessionService.js";
import { forkSession, resumeSession, type ResumeReport } from "../session/sessionResume.js";
import type { RecoveryClaimant } from "../session/sessionRecovery.js";
import type { SessionLineage } from "../session/sessionApiTypes.js";
import { rootIdentity } from "../agent/delegationIdentity.js";
import type { SubagentRunner } from "../agent/subagentSpawn.js";
import { parseSubagentStopConditions } from "../agent/subagentStopConditions.js";
import type { ActionClass } from "../types.js";
import { createDriverRunner } from "../agent/subagentRunner.js";
import type { SubagentCapability } from "../agent/delegateTool.js";
import type { TurnCancelCause } from "../session/sessionTypes.js";
import { amcVersion } from "../version.js";
import { credentialsServices, CREDENTIALS_SEAM } from "./services/credentialsServices.js";
import type { CredentialsSeamService, CredentialsServiceConfig } from "./services/credentialsServices.js";
import { llmServices, LLM_SEAM } from "./services/llmServices.js";
import type { LlmSeamService } from "./services/llmServices.js";
import { promptServices, PROMPT_SEAM } from "./services/promptServices.js";
import type { PromptSeamService } from "./services/promptServices.js";
import { approvalServices, APPROVAL_SEAM } from "./services/approvalServices.js";
import type { ApprovalSeamService } from "./services/approvalServices.js";
import { agentLoopServices, AGENT_LOOP_SEAM } from "./services/agentLoopServices.js";
import type { AgentLoopSeamService } from "./services/agentLoopServices.js";

/** The section name a pinned system prompt is registered under. */
export const PINNED_PROMPT_SECTION = "host:pinned-prompt";

/**
 * Order of the pinned section.
 *
 * It is a `complete` section, so it replaces the section LIST rather than
 * joining it and the order never decides anything — but a registered section
 * still needs one, and a value below the harness identity says plainly that this
 * is the whole prompt and not an addition to the front of it.
 */
export const PINNED_PROMPT_ORDER = -1000;

/** Deployment-level prompt choices. The workspace, agent and guardrails are derived. */
export type ComposedPromptOptions = Omit<
  AgentPromptProfileOptions,
  "workspace" | "agentId" | "approvalGated"
>;

/** How this run gates tool calls on a human. */
export interface ComposedApprovalGate extends ToolApprovalGateOptions {
  /**
   * Answerers consulted AHEAD of the approvals engine, in order.
   *
   * The ADR-5 dev-profile exception is composed here and nowhere else — see
   * src/approvals/seam/devProfileException.ts. It is a parameter rather than a
   * flag because an exception has to be constructed, and constructing one
   * requires stating a tracked id, a person and an expiry.
   */
  readonly answerers?: readonly ApprovalAnswerer[];
  /** Reports the engine request id the moment it exists, so a UI can render the prompt. */
  readonly onRaised?: (event: { readonly approvalId: string; readonly approvalRequestId: string }) => void;
}

/** What a caller may do to a turn while it runs. */
export interface ComposedTurnHandle {
  readonly sessionId: string;
  /** Stop the turn. The cause rides inside the signed `turn/end`. */
  cancel(cause: TurnCancelCause): void;
}

/** Narrow evidence capability for tools, bound to the actual selected session. */
export interface ComposedToolSession {
  readonly sessionId: string;
  readonly recordProjectedEvidence: SessionService["recordProjectedEvidence"];
}

export interface ComposedTurnOptions {
  readonly workspace: string;
  readonly agentId: string;
  /**
   * The session id to open, minted when absent.
   *
   * Supplied by a caller that must know it BEFORE the turn starts -- notably one
   * building an `agentToolset`, whose tool evidence has to name the session its
   * calls ran in. Without this the toolset was constructed before the session
   * existed and had nothing truthful to name.
   */
  readonly sessionId?: string;
  /**
   * Continue an EXISTING, unsealed session as its next writer (AMC-1511).
   * Requires `sessionId`. Verification, liveness and crash recovery happen in
   * sessionResume.ts before anything is dispatched; a refusal throws
   * SessionResumeRefused and this turn never starts.
   */
  readonly resume?: { readonly claimant: RecoveryClaimant; readonly staleAfterMs?: number };
  /** Open a NEW session whose open row names this parent's verified final row. */
  readonly forkFrom?: { readonly parentSessionId: string; readonly claimant: RecoveryClaimant };
  /**
   * Leave the session unsealed at exit so another process can resume it. The
   * turn is still sealed; only the session-level seal is deferred. Default
   * false: a run seals its session, as it always has.
   */
  readonly keepOpen?: boolean;
  /**
   * Pins the exact `system/prompt` text, bypassing assembly.
   *
   * Registered as a `complete` section, so it REPLACES the assembled sections
   * rather than joining them. Omitted — the ordinary case — the prompt is
   * assembled from the profile, which is what gives a run its identity.
   */
  readonly systemPrompt?: string;
  /**
   * Deployment prompt choices: persona, identity override, instruction budgets.
   *
   * Omitted alongside a pinned `systemPrompt`, the run carries NO runtime
   * context: pinning the prompt is a statement about exactly what the model
   * sees, and quietly appending a snapshot to it would falsify that statement.
   * Omitted on its own, the default native-agent profile applies.
   */
  readonly promptProfile?: ComposedPromptOptions;
  /**
   * Compose the approval seam and put it in front of every tool call.
   *
   * Its presence is also what lets the system prompt tell the model that
   * approval exists — see {@link promptProfileFor}. A composition that claimed
   * the guardrail without installing it would be lying to the model in a signed
   * row, so the claim is derived from the gate rather than configured beside it.
   */
  readonly approvalGate?: ComposedApprovalGate;
  /** The prompt that opens the turn. Enters the durable inbox like any other message. */
  readonly prompt: string;
  readonly route: LoopRoute;
  /** Routes registered on the composed `amcLlm`. Must include `route.providerId`. */
  readonly routes: readonly LlmRouteConfig[];
  /** Replaces the platform `fetch` — the stub provider answers in-process. */
  readonly transport?: HttpTransport;
  readonly tools?: AgentToolSeam;
  readonly validation?: NativeValidationPlan;
  /** Binds prebuilt tools after new/resume/fork selects the writer, before dispatch. */
  readonly bindToolSession?: (session: ComposedToolSession) => void;
  readonly config?: Partial<AgentLoopConfig>;
  readonly credentials?: CredentialsServiceConfig;
  /** Live-only mirror. Never load-bearing: the log is the record. */
  readonly notify?: (notification: LoopNotification) => void;
  readonly onLiveText?: (event: LiveTextPreviewEvent) => void;
  /** Called once the driver exists and before the prompt is sent. */
  readonly onReady?: (handle: ComposedTurnHandle) => void;
  /**
   * Let this run delegate to in-process children (P6.1a).
   *
   * INVERTED ON PURPOSE. The capability needs three things only this function
   * has once composition is done — the parent's `SessionService`, so the
   * delegation rows land in the parent's own log; a way to build an `LlmRuntime`
   * bound to a CHILD's session, since `LlmRuntime` captures its session at
   * construction; and the rendered system prompt. None of them exist when a
   * caller builds its toolset, so the caller cannot construct the capability and
   * this function cannot know what to do with it. So the kernel builds it and
   * hands it over; the caller decides where it goes — in practice
   * `toolset.registry.define(delegateTool(capability))`, which works after
   * construction because `seam.schemas()` re-reads the registry each step.
   */
  readonly delegation?: {
    /**
     * The action classes a delegate may invoke, declared by the OPERATOR.
     *
     * Threaded because the kernel's grant is the only call site in the codebase:
     * without it `delegationScope` is honoured by `spawnSubagent`, enforced by
     * `createDriverRunner` and projected as evidence, while nothing can ever set
     * it — three layers gated on a field no caller could populate.
     */
    readonly scope?: readonly ActionClass[];
    /** Operator-selected lifetime limits, enforced before each child dispatch. */
    readonly stopConditions?: readonly string[];
    /**
     * Execute children with this instead of the in-process driver.
     *
     * The kernel builds `createDriverRunner` because only it can: that runner
     * needs the parent's session and a factory for a CHILD-session-bound
     * `LlmRuntime`. A foreign runner needs neither — it spawns a separate
     * process — so a caller holding a self-contained executor supplies it here
     * rather than the kernel growing a provider registry it has no business
     * owning.
     */
    readonly runner?: SubagentRunner;
    readonly maxDepth?: number;
    /** Receives the composed capability. Called once, before the first turn. */
    grant(capability: SubagentCapability): void;
  };
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
  readonly validation: NativeValidationResult;
  /**
   * The `system/prompt` row every request in this run cites.
   *
   * Returned so a caller can read the prompt back out of the SIGNED LOG rather
   * than trusting a copy this function handed it. The two would agree today;
   * only one of them is evidence.
   */
  readonly systemPromptEventId: string;
  /** The section names in the order they assembled, for an operator summary. */
  readonly promptSections: readonly string[];
  /** Set when this turn continued an existing session (AMC-1511). */
  readonly resumed?: ResumeReport | null;
  /** Set when this session was forked from a verified parent. */
  readonly parent?: SessionLineage | null;
  /** True when the session was left unsealed for a later process. */
  readonly keptOpen?: boolean;
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
 * The prompt profile this run assembles from.
 *
 * TWO DERIVATIONS HAPPEN HERE AND NEITHER IS CONFIGURABLE, because both are
 * claims the prompt makes about the run and a claim the run cannot honour must
 * not be sayable:
 *
 *   `approvalGated` follows the presence of the gate. The model is told that
 *   approval blocks tool calls only when something really is in front of them.
 *
 *   A pinned prompt with no profile carries NO context plugins. Pinning says
 *   "this exact text is what the model sees"; appending a runtime snapshot to it
 *   would make that false while the log recorded it as true.
 */
function promptProfileFor(options: ComposedTurnOptions): AgentPromptProfile {
  const pinned = options.systemPrompt;
  const profile = agentPromptProfile({
    workspace: options.workspace,
    agentId: options.agentId,
    approvalGated: options.approvalGate !== undefined,
    ...(pinned !== undefined && options.promptProfile === undefined ? { contextPlugins: [] } : {}),
    ...(options.promptProfile ?? {})
  });
  if (pinned === undefined) return profile;
  return {
    ...profile,
    sections: [
      ...profile.sections,
      { name: PINNED_PROMPT_SECTION, order: PINNED_PROMPT_ORDER, text: pinned, complete: true }
    ]
  };
}

/**
 * What this run was composed from, as a digest.
 *
 * Recorded on the `session/open` row, so "which build of which composition
 * produced this session" is answerable from the log alone. It commits to the
 * plugin names, the routes registered, the model actually addressed, what the
 * prompt was built out of, and whether a human stood in front of the tools —
 * the facts that decide what the agent could do and what it was told it could do.
 */
function compositionDigestOf(options: ComposedTurnOptions, profile: AgentPromptProfile): string {
  const gate = options.approvalGate;
  const shape = JSON.stringify({
    plugins: [
      credentialsServices.name,
      llmServices.name,
      promptServices.name,
      ...(gate === undefined ? [] : [approvalServices.name]),
      agentLoopServices.name
    ],
    providers: options.routes.map((route) => ({
      providerId: route.providerId,
      adapterId: route.adapter.id,
      adapterVersion: route.adapter.version,
      baseUrl: route.baseUrl,
      models: route.models
    })),
    route: { providerId: options.route.providerId, model: options.route.model },
    prompt: {
      sections: profile.sections.map((section) => section.name),
      contexts: profile.contextPlugins.map((plugin) => plugin.name),
      variables: Object.keys(profile.variables).sort(),
      pinned: options.systemPrompt !== undefined
    },
    // The answerer NAMES are the point: an ADR-5 exception renders its tracked
    // id, its approver and its expiry into its name, so composing one changes
    // this digest and the change is attributable.
    approval:
      gate === undefined
        ? null
        : {
            actionClass: gate.actionClass,
            riskTier: gate.riskTier,
            toolNames: gate.toolNames ?? null,
            answerers: (gate.answerers ?? []).map((answerer) => answerer.name)
          },
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
  if (options.delegation !== undefined) {
    const parsed = parseSubagentStopConditions(options.delegation.stopConditions);
    if (!parsed.ok) throw new Error(`Delegation stop conditions: ${parsed.reason}`);
    // Pin the operator's declaration before asynchronous composition or provider
    // work. A later caller mutation cannot change the child authorization.
    options = { ...options, delegation: Object.freeze({ ...options.delegation,
      ...(options.delegation.scope === undefined ? {} : { scope: Object.freeze([...options.delegation.scope]) }),
      ...(options.delegation.stopConditions === undefined ? {} : { stopConditions: Object.freeze([...parsed.conditions]) })
    }) };
  }
  const profile = promptProfileFor(options);
  const identity = {
    agentId: options.agentId,
    harnessVersion: amcVersion,
    compositionDigest: compositionDigestOf(options, profile),
    policyDigest: policyDigestOf(options)
  };
  let session: SessionService;
  let resumed: ResumeReport | null = null;
  let parent: SessionLineage | null = null;
  if (options.resume !== undefined) {
    if (options.sessionId === undefined) throw new Error("runComposedTurn: resume requires sessionId");
    const opened = resumeSession({ workspace: options.workspace, sessionId: options.sessionId, ...options.resume, ...identity });
    session = opened.service;
    resumed = opened.report;
  } else if (options.forkFrom !== undefined) {
    const opened = forkSession({ workspace: options.workspace, ...options.forkFrom, ...identity });
    session = opened.service;
    parent = opened.parent;
  } else {
    session = new SessionService(options.workspace);
    session.open({ ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }), ...identity });
  }
  const sessionId = session.sessionId;
  const ctx = new Context();
  const fibers: { dispose(): Promise<void> }[] = [];
  let steerTimer: NodeJS.Timeout | null = null;

  try {
    options.bindToolSession?.({
      sessionId,
      recordProjectedEvidence: (row) => session.recordProjectedEvidence(row)
    });
    const credentialsFiber = ctx.plugin(credentialsServices, options.credentials ?? {});
    await credentialsFiber.await();
    fibers.push(credentialsFiber);

    const llmFiber = ctx.plugin(llmServices, {
      session,
      credentials: serviceOn<CredentialsSeamService>(ctx, CREDENTIALS_SEAM.name),
      routes: options.routes,
      ...(options.onLiveText === undefined ? {} : { onLiveText: options.onLiveText }),
      ...(options.transport !== undefined ? { transport: options.transport } : {})
    });
    await llmFiber.await();
    fibers.push(llmFiber);

    const promptFiber = ctx.plugin(promptServices, { profile, sessionId });
    await promptFiber.await();
    fibers.push(promptFiber);
    const prompt = serviceOn<PromptSeamService>(ctx, PROMPT_SEAM.name);

    // Rendered BEFORE the loop is composed, so an unknown `{{variable}}` throws
    // here — with no turn started, no request sent, and a session that closes
    // cleanly in the `finally`. A prompt with a hole in it never reaches a model.
    const systemPromptRef = session.recordSystemPrompt(prompt.render());

    const gate = options.approvalGate;
    let approval: ApprovalSeamService | null = null;
    if (gate !== undefined) {
      const approvalFiber = ctx.plugin(approvalServices, {
        session,
        workspace: options.workspace,
        agentId: options.agentId,
        ...(gate.answerers === undefined ? {} : { answerers: gate.answerers }),
        ...(gate.onRaised === undefined ? {} : { onRaised: gate.onRaised })
      });
      await approvalFiber.await();
      fibers.push(approvalFiber);
      approval = serviceOn<ApprovalSeamService>(ctx, APPROVAL_SEAM.name);
    }

    // The COMPOSED seam gates the COMPOSED tools. A gate built over a seam this
    // function constructed on the side would be a second approval path, and the
    // second one is always the one that forgets a rule.
    //
    // A gate with no tool seam still wraps EMPTY_TOOL_SEAM rather than being
    // skipped. That keeps the invariant the system prompt depends on airtight:
    // when `approvalGate` is set, EVERY call this loop can make goes through an
    // approval — including the invented call a model makes at a mount that
    // offers nothing — so the sentence telling the model so is true of the whole
    // composition and not only of its configured half.
    const tools: AgentToolSeam | undefined =
      approval === null || gate === undefined
        ? options.tools
        : gateToolCallsOnApproval(options.tools ?? EMPTY_TOOL_SEAM, approval, gate);

    // Always present, so context reaches the model whether or not anyone asked
    // to watch. `notify` is the live mirror and is optional; `preStep` is how the
    // workspace's own instructions get in front of the agent, and is not.
    const hooks: LoopHooks = {
      preStep: prompt.preStep,
      turnStopping: () => Promise.resolve(),
      notify:
        options.notify ??
        ((): void => {
          // A run with no observer is a normal configuration, not an error.
        })
    };

    // Built here because nowhere else has all three inputs: the parent's own
    // session for the delegation rows, a child-session-bound LLM factory, and
    // the prompt this composition rendered.
    if (options.delegation !== undefined) {
      const llmSeam = serviceOn<LlmSeamService>(ctx, LLM_SEAM.name);
      // A recursive native closure uses each child's own identity, session and
      // inherited scope. The existing spawn boundary enforces the real depth.
      // An explicitly supplied foreign runner keeps its existing contract.
      let runner = options.delegation.runner;
      if (runner === undefined) {
        const runNative: SubagentRunner = (child) => runner!(child);
        runner = createDriverRunner({
          workspace: options.workspace,
          makeLlm: (childSession) => llmSeam.runtimeForSession(childSession),
          route: options.route,
          systemPrompt: prompt.render(),
          harnessVersion: amcVersion,
          compositionDigest: compositionDigestOf(options, profile),
          policyDigest: policyDigestOf(options),
          ...(options.config === undefined ? {} : { config: options.config }),
          ...(gate === undefined ? {} : { approvalGate: gate }),
          grantDelegation: { runner: runNative,
            ...(options.delegation.maxDepth === undefined ? {} : { maxDepth: options.delegation.maxDepth }),
            ...(options.delegation.scope === undefined ? {} : { delegationScope: options.delegation.scope }),
            ...(options.delegation.stopConditions === undefined ? {} : { stopConditions: options.delegation.stopConditions }) }
        });
      }
      options.delegation.grant({
        identity: rootIdentity(options.agentId),
        session,
        runner,
        ...(options.delegation.maxDepth === undefined
          ? {}
          : { maxDepth: options.delegation.maxDepth }),
        ...(options.delegation.scope === undefined
          ? {}
          : { delegationScope: options.delegation.scope }),
        ...(options.delegation.stopConditions === undefined ? {} : { stopConditions: options.delegation.stopConditions })
      });
    }

    const loopFiber = ctx.plugin(agentLoopServices, {
      session,
      // The COMPOSED model seam, not a runtime built beside it: that is what
      // makes this a composition rather than three objects in a function.
      llm: serviceOn<LlmSeamService>(ctx, LLM_SEAM.name),
      route: options.route,
      systemPromptEventId: systemPromptRef.eventId,
      ...(tools !== undefined ? { tools } : {}),
      ...(options.validation !== undefined ? { validation: options.validation } : {}),
      ...(options.config !== undefined ? { config: options.config } : {}),
      hooks
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
    return {
      sessionId,
      status: loop.status,
      validation: projectNativeValidation(options.workspace, session.readEvents()),
      systemPromptEventId: systemPromptRef.eventId,
      // From the ASSEMBLY, not from `sectionNames()`: a `complete` section
      // replaces the section list, and reporting the registered names there
      // would name sections the prompt does not contain.
      promptSections: prompt.assemble().sections.map((section) => section.name)
    };
  } finally {
    if (steerTimer !== null) clearTimeout(steerTimer);
    // Reverse order: the loop lets go of the model seam before the model seam
    // lets go of the credentials it resolves per request.
    for (const fiber of [...fibers].reverse()) {
      await fiber.dispose();
    }
    try {
      if (options.keepOpen) {
        // Hand-over point: the turn is sealed, the session is not. A later
        // process resumes it through sessionResume.ts, which re-verifies first.
        session.releaseWithoutClosing();
      } else {
        session.close({ reason: "completed" });
      }
    } catch {
      // A driver that entered `failed` left an open turn only recovery may
      // close, and the spine refuses a close over it. Swallowed HERE and only
      // here: the status returned above already reports it, and throwing from a
      // finally would replace the real failure with this one.
    }
  }
}

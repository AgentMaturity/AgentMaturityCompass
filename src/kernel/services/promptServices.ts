/**
 * System-prompt assembly as a composed service (P3.3).
 *
 * `ctx.amcPrompt` is the loop's IDENTITY and its CONTEXT: the ordered sections
 * that say who the agent is, and the plugins that say what is true right now. A
 * consumer that declares `inject: ["amcPrompt"]` stays PENDING until a host has
 * composed one, which is the point — a loop that could not find a prompt seam
 * must not quietly send a model a bare user message with no identity, no
 * governance statement and no workspace instructions. Before this phase that is
 * exactly what AMC did, and the workspace's own `AGENTS.md` — a file AMC itself
 * writes — was never read back by anything.
 *
 * WHY THE SERVICE OWNS THE REGISTRY AND THE HOST TOGETHER. Because the pre-step
 * hook only works if the host's plugins are registered as contexts on the SAME
 * registry the assembly comes from, and a host that was registered on a
 * different registry would produce an empty snapshot forever while looking
 * exactly like a workspace with nothing to say. Binding them at construction
 * removes the arrangement in which that mistake is expressible.
 *
 * WHAT DISPOSAL DOES. Removes the context registrations this service made, and
 * nothing else. The registry itself is this service's own object and dies with
 * it; the plugins belong to whoever supplied them. There is no in-flight work to
 * abandon — `assemble()` is synchronous, and a `refresh()` in progress is owned
 * by the step boundary that started it and is bounded by that step's signal.
 *
 * This module lives under src/kernel/ because it imports workspace packages the
 * published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement. The assembly itself deliberately does not — see
 * src/prompt/agentPromptProfile.ts.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import type { PreStepDecision, PreStepInput } from "../../agent/loopTypes.js";
import type { AgentPromptProfile } from "../../prompt/agentPromptProfile.js";
import { buildAgentPromptRegistry } from "../../prompt/agentPromptProfile.js";
import { renderContextSections, renderPrompt } from "../../prompt/assembly/interpolate.js";
import type { PromptAssemblyRegistry } from "../../prompt/assembly/promptRegistry.js";
import type {
  AssembleContext,
  AssembledContext,
  PromptAssembly,
  PromptSection,
  PromptVariableProvider
} from "../../prompt/assembly/promptTypes.js";
import { ContextPluginHost } from "../../prompt/context/contextHost.js";
import { createContextPreStep } from "../../prompt/context/contextPreStep.js";

export const PROMPT_SEAM = defineSeam("amcPrompt");

export interface PromptServiceConfig {
  /** What to assemble, as data. Built by `agentPromptProfile`. */
  readonly profile: AgentPromptProfile;
  /** Handed to every section provider and every context plugin. */
  readonly sessionId?: string;
  /** Identity for the synthesized snapshot message. Injected so a test can pin it. */
  readonly newMessageId?: () => string;
}

/**
 * The prompt seam, on the tree.
 *
 * Delegation, not reimplementation. The ordering rule, the fail-loud
 * `{{variable}}` contract, the literal-context boundary and the "context never
 * manufactures a turn" refusal each have exactly one implementation under
 * src/prompt/, and this class must not acquire a second one. In particular it
 * does NOT cache the rendered prompt: a cached render is a render that can
 * disagree with the registry the moment a plugin registers a section, and the
 * signed `system/prompt` row must be the text the registry actually produces.
 */
export class PromptSeamService extends AmcSeam {
  private readonly registry: PromptAssemblyRegistry;

  private readonly host: ContextPluginHost;

  private readonly sessionId: string | undefined;

  /**
   * The loop's `agent/pre-step` waterfall entry, bound at construction.
   *
   * Exposed as a property rather than a method so a host can hand it straight to
   * `LoopHooks.preStep` without binding `this` — a hook that lost its receiver
   * would fail at the first step boundary of a real turn, which is the worst
   * possible place to discover it.
   */
  readonly preStep: (input: PreStepInput, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>;

  constructor(ctx: Context, config: PromptServiceConfig) {
    super(ctx, PROMPT_SEAM.name);
    this.registry = buildAgentPromptRegistry(config.profile);
    this.host = new ContextPluginHost(config.profile.contextPlugins);
    this.sessionId = config.sessionId;
    const seam = createContextPreStep({
      registry: this.registry,
      host: this.host,
      ...(config.sessionId === undefined ? {} : { sessionId: config.sessionId }),
      ...(config.newMessageId === undefined ? {} : { newMessageId: config.newMessageId })
    });
    this.preStep = seam.preStep;
    this.ctx.effect(() => () => {
      seam.dispose();
    }, "amcPrompt context registrations");
  }

  /** The section names in the order they assemble. */
  sectionNames(): readonly string[] {
    return this.registry.sectionNames();
  }

  /** The context plugins in the order they contribute to a snapshot. */
  get contextPluginNames(): readonly string[] {
    return this.host.pluginNames;
  }

  /**
   * Resolve everything registered, without interpolating.
   *
   * @param context - overrides the composed session id for this one assembly.
   * @returns the resolved assembly.
   * @throws PromptAssemblyError when more than one complete section is active.
   */
  assemble(context: AssembleContext = {}): PromptAssembly {
    return this.registry.assemble({
      ...(this.sessionId === undefined ? {} : { sessionId: this.sessionId }),
      ...context
    });
  }

  /**
   * Render the system prompt.
   *
   * @param context - overrides the composed session id for this one render.
   * @returns the rendered system prompt.
   * @throws PromptAssemblyError on an unknown or valueless `{{variable}}`. It is
   * a THROW and not a hole in the prompt: a run whose identity could not be
   * assembled must not reach a model, because the signed log would then record a
   * prompt the deployment did not write as though it had.
   */
  render(context: AssembleContext = {}): string {
    return renderPrompt(this.assemble(context));
  }

  /**
   * The runtime-context snapshot as the named contributions it came from.
   *
   * Reads whatever the LAST refresh cached, so a caller that has not run a step
   * boundary sees the plugins' empty initial state rather than triggering I/O
   * from a getter.
   */
  contextSections(context: AssembleContext = {}): readonly AssembledContext[] {
    return renderContextSections(this.assemble(context));
  }

  /**
   * Collect every context plugin once, outside a turn.
   *
   * The loop does not need this — its pre-step hook refreshes at every step
   * boundary — but an operator command that prints "the context this run would
   * carry" does, and printing a snapshot from an unrefreshed host would show
   * every plugin as silent.
   */
  refreshContext(input: { readonly turn: number; readonly step: number; readonly signal?: AbortSignal }): Promise<void> {
    return this.host.refresh({
      ...(this.sessionId === undefined ? {} : { sessionId: this.sessionId }),
      ...input
    });
  }

  /**
   * Register a section, bound to the CALLING fiber.
   *
   * The disposer is wrapped in `ctx.effect`, so a plugin that contributed tool
   * guidance and was then unloaded stops contributing it. Without that binding a
   * disposed plugin's section would keep reaching the model from a scope that no
   * longer exists.
   *
   * @throws PromptAssemblyError on a duplicate name or a non-finite order.
   */
  section(section: PromptSection): void {
    const remove = this.registry.section(section);
    this.ctx.effect(() => remove, `amcPrompt section ${section.name}`);
  }

  /**
   * Register a `{{variable}}` provider, bound to the CALLING fiber.
   *
   * @throws PromptAssemblyError on an illegal or duplicate name.
   */
  variable(name: string, provider: PromptVariableProvider): void {
    const remove = this.registry.variable(name, provider);
    this.ctx.effect(() => remove, `amcPrompt variable ${name}`);
  }
}

/**
 * Registers the prompt seam.
 *
 * A single-service plugin rather than a group: it is complete on its own, and
 * the thing it needs — a profile — is data a host builds first and hands in.
 */
export const promptServices = {
  name: "amc-prompt-services",
  apply(ctx: Context, config: PromptServiceConfig): void {
    ctx.plugin(PromptSeamService, config);
  }
};

/**
 * The prompt a native AMC agent actually runs under (plan P3.3, stage 4).
 *
 * WHY THIS MODULE EXISTS AT ALL. Three places need to agree on what a governed
 * agent's system prompt is: the composed loop that sends it to a model, the
 * kernel service that assembles it, and the operator command that prints it.
 * If each built its own registry they would agree today and drift by the second
 * release, and the drift would be invisible — the operator would be shown a
 * prompt the model never saw, which is the same class of untruth as an unsigned
 * side-channel, just pointed at the human instead of the log. So the profile is
 * DATA, built once here, and every consumer builds from it.
 *
 * IT LIVES IN src/prompt/ AND NOT IN src/kernel/. Nothing here imports the
 * vendored cordis packages, so the profile is usable from the published npm
 * tarball — which is what lets `amc system-prompt show` work on a plain install
 * even though the composed loop behind it does not.
 *
 * EVERY SENTENCE IN A SECTION MUST BE TRUE OF THIS COMPOSITION. That is the one
 * rule the conditionals below exist to keep. The approval paragraph is emitted
 * only when the composition really does gate tool calls on a signed approval;
 * the context paragraph only when context plugins are really mounted. A prompt
 * that promises a guardrail the run does not have is worse than a prompt that
 * says nothing: the model relaxes, the log faithfully records the promise, and
 * the auditor reads a guarantee nobody implemented.
 */
import { basename } from "node:path";
import {
  HARNESS_IDENTITY_ORDER,
  type PromptSection,
  type PromptVariableProvider
} from "./assembly/promptTypes.js";
import { PromptAssemblyRegistry, type PromptRegistryOptions } from "./assembly/promptRegistry.js";
import type { ContextPlugin } from "./context/contextTypes.js";
import { createInstructionsContextPlugin } from "./context/instructionsContext.js";
import type { InstructionLoad } from "./context/instructionFiles.js";
import { createTimeContextPlugin } from "./context/timeContext.js";
import { amcVersion } from "../version.js";

/** The harness-authored section describing how this deployment is governed. */
export const GOVERNANCE_SECTION = "harness:governance";

/**
 * Prompt order of the governance band: after identity, before the persona.
 *
 * Deliberately adjacent to identity rather than in the deployment's band. How
 * the harness governs is not a persona choice, and an operator who reorders
 * their own sections must not be able to move it after them.
 */
export const GOVERNANCE_ORDER = HARNESS_IDENTITY_ORDER + 50;

/**
 * What the model is told about runtime context — emitted only when some is mounted.
 *
 * It names the supersession rule explicitly because the snapshot enters history
 * as an ordinary user-role message: without this sentence a model reading back
 * through the turn sees several contradictory clock readings and no statement of
 * which one is current.
 */
const CONTEXT_RULE =
  "Runtime context reaches you as a user-role snapshot that is refreshed between " +
  "steps. The most recent snapshot supersedes every earlier one; treat superseded " +
  "snapshots as history rather than as current fact.";

/**
 * What the model is told about human-in-the-loop — emitted only when it is true.
 *
 * The last clause is the load-bearing one. An agent that reads "denied" and
 * immediately looks for an equivalent action by another route is the single
 * behaviour a governed harness must not encourage, and saying so is cheaper than
 * catching every route.
 */
const APPROVAL_RULE =
  "Some tool calls require signed human approval before they run. Such a call " +
  "blocks until an approver decides, and is REFUSED when nobody decides. A " +
  "refusal is final for that call: report what you needed and why, and do not " +
  "attempt an equivalent action by another route.";

export interface AgentPromptProfileOptions {
  /** The workspace whose instruction files are read, and whose name is a variable. */
  readonly workspace: string;
  /** The agent this prompt is for. Exposed to sections as `{{agent_id}}`. */
  readonly agentId: string;
  /** The deployment's persona. Empty or omitted leaves the order-0 slot open. */
  readonly persona?: string;
  /** Replaces the default harness identity without giving up its order. */
  readonly harnessIdentity?: string;
  /**
   * True ONLY when this composition really gates tool calls on a signed approval.
   *
   * Not a preference and not a hint: it decides whether the model is told a
   * guardrail exists. See the module header.
   */
  readonly approvalGated?: boolean;
  /**
   * Replaces the default plugin set outright.
   *
   * An empty array is meaningful and is honoured: it composes a prompt with no
   * runtime context at all, which is what a caller pinning an exact prompt wants.
   */
  readonly contextPlugins?: readonly ContextPlugin[];
  /** Home directory the user-scope instruction files are looked for under. */
  readonly amcHome?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Injected so a test — or the CLI's `--at` — can pin what the clock says. */
  readonly now?: () => number;
  readonly timeZone?: string;
  readonly maxInstructionFileBytes?: number;
  readonly maxInstructionTotalBytes?: number;
  /** Diagnostics the model must not be shown (duplicate collapse, byte budgets). */
  readonly onInstructionLoad?: (load: InstructionLoad) => void;
}

/** Everything a registry needs, as data. */
export interface AgentPromptProfile {
  readonly registry: PromptRegistryOptions;
  /** Harness-authored sections beyond identity and persona, in registration order. */
  readonly sections: readonly PromptSection[];
  readonly variables: Readonly<Record<string, PromptVariableProvider>>;
  readonly contextPlugins: readonly ContextPlugin[];
}

/** The governance section for this composition, or null when it would say nothing. */
function governanceSection(
  approvalGated: boolean,
  hasContext: boolean
): PromptSection | null {
  const rules: string[] = [];
  if (hasContext) rules.push(CONTEXT_RULE);
  if (approvalGated) rules.push(APPROVAL_RULE);
  if (rules.length === 0) return null;
  return {
    name: GOVERNANCE_SECTION,
    order: GOVERNANCE_ORDER,
    text: `How this deployment is governed:\n\n${rules.join("\n\n")}`
  };
}

/** The default runtime context of a native run: what the workspace says, and when it is. */
function defaultContextPlugins(options: AgentPromptProfileOptions): readonly ContextPlugin[] {
  return [
    createInstructionsContextPlugin({
      workspace: options.workspace,
      ...(options.amcHome === undefined ? {} : { amcHome: options.amcHome }),
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.maxInstructionFileBytes === undefined
        ? {}
        : { maxFileBytes: options.maxInstructionFileBytes }),
      ...(options.maxInstructionTotalBytes === undefined
        ? {}
        : { maxTotalBytes: options.maxInstructionTotalBytes }),
      ...(options.onInstructionLoad === undefined ? {} : { onLoad: options.onInstructionLoad })
    }),
    createTimeContextPlugin({
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone })
    })
  ];
}

/**
 * Build the profile a native AMC agent runs under.
 *
 * @param options - the workspace, the agent, and which guardrails this
 * composition really has.
 * @returns the registry options, sections, variables and context plugins.
 * @throws Error when `timeZone` is not a zone `Intl` can resolve — at
 * composition, where the deployment can still be named, rather than at the first
 * step of a real turn.
 */
export function agentPromptProfile(options: AgentPromptProfileOptions): AgentPromptProfile {
  const contextPlugins = options.contextPlugins ?? defaultContextPlugins(options);
  const governance = governanceSection(options.approvalGated === true, contextPlugins.length > 0);
  const workspaceName = basename(options.workspace);
  return {
    registry: {
      ...(options.harnessIdentity === undefined ? {} : { harnessIdentity: options.harnessIdentity }),
      ...(options.persona === undefined ? {} : { persona: options.persona })
    },
    sections: governance === null ? [] : [governance],
    // The namespace a deployment-authored persona may reference. Each is a fact
    // about THIS run that a human writing a persona file cannot know; anything
    // else a section wants to say, it can simply say.
    variables: {
      agent_id: () => options.agentId,
      harness_version: () => amcVersion,
      workspace_name: () => workspaceName
    },
    contextPlugins
  };
}

/**
 * Construct a registry with this profile's sections and variables registered.
 *
 * Context plugins are NOT registered here: a plugin's text has to be collected
 * before it can be resolved, and that is the plugin host's job (see
 * ./context/contextHost.ts). A registry returned from here therefore assembles
 * identity and persona correctly and reports an empty context — which is the
 * honest reading for a caller that has not mounted a host.
 *
 * @param profile - a profile from {@link agentPromptProfile}.
 * @returns the registry, ready to assemble.
 * @throws PromptAssemblyError on a duplicate section or an illegal variable name.
 */
export function buildAgentPromptRegistry(profile: AgentPromptProfile): PromptAssemblyRegistry {
  const registry = new PromptAssemblyRegistry(profile.registry);
  for (const section of profile.sections) registry.section(section);
  for (const [name, provider] of Object.entries(profile.variables)) {
    registry.variable(name, provider);
  }
  return registry;
}

import { studioStatus } from "../../studio/studioSupervisor.js";
import { loadAdaptersConfig } from "../../adapters/adapterConfigStore.js";
import { claudeCliForeignRunner } from "./claudeCliProvider.js";
import type { SubagentRunner } from "../subagentSpawn.js";
import type { SubagentCapability } from "../delegateTool.js";
import type { ActionClass } from "../../types.js";
import { loadNativeCommandHooks } from "../../extensions/nativeCommandHookConfig.js";

/**
 * Which executors a delegation may be handed to, and what each one needs.
 *
 * Kept out of both the kernel and the CLI on purpose. The kernel builds the
 * in-process driver because only it can — that runner needs the parent's session
 * and a child-session-bound LLM factory — but it has no business owning a
 * registry of foreign CLIs. The CLI knows how to read flags, not how to compose
 * a governed foreign child. This is the small piece in between.
 */

/** The default: children run in this process, under the kernel's own driver. */
export const IN_PROCESS_PROVIDER = "in-process";

export const FOREIGN_PROVIDER_IDS = ["claude-cli"] as const;

export type DelegationProviderId = typeof IN_PROCESS_PROVIDER | typeof FOREIGN_PROVIDER_IDS[number];

function delegationProviderIds(): string[] {
  return [IN_PROCESS_PROVIDER, ...FOREIGN_PROVIDER_IDS];
}

export type ForeignRunnerResolution =
  | { readonly ok: true; readonly runner: SubagentRunner; readonly describedAs: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Build the runner for a chosen provider, or explain why it cannot be built.
 *
 * REFUSES WITHOUT A GATEWAY, and that is the load-bearing part. A foreign child
 * is governed by exactly one thing AMC controls: the environment it is handed,
 * which points its provider traffic at AMC's gateway and authenticates it with a
 * short-lived scoped lease. With no gateway to point at there is nothing
 * governing it at all — it would reach the provider directly with whatever
 * credentials it finds, unmetered and unrecorded. Refused up front rather than
 * at the moment a model asks to delegate, because by then the operator has
 * already been told delegation is available.
 */
export function resolveForeignRunner(params: {
  readonly providerId: string;
  readonly workspace: string;
  readonly agentId: string;
  readonly timeoutMs?: number;
  /** AXR-10: govern only the child's model route; without it the child's tools must meet AMC's control hook. */
  readonly observeOnly?: boolean;
}): ForeignRunnerResolution {
  if (!(FOREIGN_PROVIDER_IDS as readonly string[]).includes(params.providerId)) {
    return {
      ok: false,
      reason: `unknown delegation provider ${JSON.stringify(params.providerId)}; this build has ${delegationProviderIds().join(", ")}`
    };
  }

  // A foreign child's tool calls never consult the workspace's .amc/hooks.json (they are governed by AMC's provider
  // control hook), so while a hooks file is present a PreToolUse guard could be routed around through it. Refused.
  if (loadNativeCommandHooks(params.workspace).status !== "absent") {
    return { ok: false, reason: `delegating to ${params.providerId} is refused while ${params.workspace}/.amc/hooks.json is present: a foreign child does not run the workspace's command hooks, so a PreToolUse denial could be routed around through it. Remove the hooks file, or delegate in-process.` };
  }

  const status = studioStatus(params.workspace);
  if (!status.running || !status.state) {
    return {
      ok: false,
      reason:
        `delegating to ${params.providerId} routes the child's provider traffic through AMC's `
        + "gateway, and AMC Studio is not running to serve it. Start it first with: amc up"
    };
  }

  const adapters = loadAdaptersConfig(params.workspace);
  const profile = adapters.adapters.perAgent[params.agentId];
  const providerRoute = profile?.preferredProviderRoute ?? "/anthropic";
  const model = profile?.preferredModel ?? adapters.adapters.defaults.modelDefault;
  const gatewayBase = `http://${status.state.host}:${status.state.gatewayPort}`;

  return {
    ok: true,
    describedAs: `${params.providerId} via ${gatewayBase}${providerRoute} (${model})`,
    runner: claudeCliForeignRunner({
      workspace: params.workspace,
      gatewayBase,
      providerRoute,
      model,
      ...(params.timeoutMs === undefined ? {} : { timeoutMs: params.timeoutMs }),
      ...(params.observeOnly === undefined ? {} : { observeOnly: params.observeOnly })
    })
  };
}

/**
 * Assemble the `delegation` option a composed turn is given.
 *
 * A function rather than an inline object literal because the CLI's own tests
 * cannot reach the path that populates it: selecting a foreign provider requires
 * a running gateway, so every CLI test lands on a refusal and the success branch
 * is never exercised. Mutation testing showed the consequence — deleting the
 * spread that hands the runner to the kernel left the whole suite green, so the
 * CLI could announce an out-of-process delegate and pass none.
 *
 * Optional fields are omitted rather than set to `undefined`, because
 * `exactOptionalPropertyTypes` distinguishes the two and the kernel reads
 * presence.
 */
export function delegationTurnOptions(params: {
  readonly grant: (capability: SubagentCapability) => void;
  readonly maxDepth: number;
  readonly maxActiveChildren?: number;
  readonly scope?: readonly ActionClass[] | undefined;
  readonly stopConditions?: readonly string[] | undefined;
  readonly runner?: SubagentRunner | null;
}): {
  readonly grant: (capability: SubagentCapability) => void;
  readonly maxDepth: number;
  readonly maxActiveChildren?: number;
  readonly scope?: readonly ActionClass[];
  readonly stopConditions?: readonly string[];
  readonly runner?: SubagentRunner;
} {
  return {
    grant: params.grant,
    maxDepth: params.maxDepth,
    ...(params.maxActiveChildren === undefined ? {} : { maxActiveChildren: params.maxActiveChildren }),
    ...(params.scope === undefined ? {} : { scope: params.scope }),
    ...(params.stopConditions === undefined ? {} : { stopConditions: Object.freeze([...params.stopConditions]) }),
    ...(params.runner === null || params.runner === undefined ? {} : { runner: params.runner })
  };
}

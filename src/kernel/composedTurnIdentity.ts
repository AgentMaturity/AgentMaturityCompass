/**
 * What a composed turn IS, as a digest (SH-LOOP line-budget extraction from
 * ./agentLoopRunner.ts; behaviour unchanged). The profile a run assembles from
 * and the two digests recorded on its `session/open` row live here so the
 * runner stays within its budget.
 */
import { createHash } from "node:crypto";
import { agentPromptProfile, type AgentPromptProfile } from "../prompt/agentPromptProfile.js";
import { amcVersion } from "../version.js";
import { credentialsServices } from "./services/credentialsServices.js";
import { llmServices } from "./services/llmServices.js";
import { promptServices } from "./services/promptServices.js";
import { approvalServices } from "./services/approvalServices.js";
import { agentLoopServices } from "./services/agentLoopServices.js";
import { PINNED_PROMPT_ORDER, PINNED_PROMPT_SECTION, type ComposedTurnOptions } from "./agentLoopRunner.js";

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
export function promptProfileFor(options: ComposedTurnOptions): AgentPromptProfile {
  const pinned = options.systemPrompt;
  const profile = agentPromptProfile({
    workspace: options.workspace,
    agentId: options.agentId,
    approvalGated: options.approvalGate !== undefined,
    planMode: options.planMode !== undefined,
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
export function compositionDigestOf(options: ComposedTurnOptions, profile: AgentPromptProfile): string {
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
    sources: options.compositionSources ?? [],
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
            ...(gate.reviewedActionClasses === undefined ? {} : { reviewedActionClasses: gate.reviewedActionClasses }),
            answerers: (gate.answerers ?? []).map((answerer) => answerer.name)
          },
    version: amcVersion
  });
  return createHash("sha256").update(shape).digest("hex");
}

/** The loop bounds this run enforced, as a digest, for the `session/open` row. */
export function policyDigestOf(options: ComposedTurnOptions): string {
  return createHash("sha256").update(JSON.stringify(options.config ?? {})).digest("hex");
}

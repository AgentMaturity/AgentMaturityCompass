/**
 * The two digests the `session/open` row carries for a composed turn (split out of agentLoopRunner.ts for its line
 * budget): what the run was composed from, and the loop bounds it enforced.
 */
import { createHash } from "node:crypto";
import type { AgentPromptProfile } from "../prompt/agentPromptProfile.js";
import { amcVersion } from "../version.js";
import type { ComposedTurnOptions } from "./agentLoopRunner.js";
import { agentLoopServices } from "./services/agentLoopServices.js";
import { approvalServices } from "./services/approvalServices.js";
import { credentialsServices } from "./services/credentialsServices.js";
import { llmServices } from "./services/llmServices.js";
import { promptServices } from "./services/promptServices.js";

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
            // SH-SANDBOX-04: a mode's class narrowing is composition too; without it accept-edits signed the same digest as --approve-tools.
            ...(gate.gatesClasses === undefined ? {} : { gatesClasses: [...gate.gatesClasses].sort() }),
            ...(gate.exemptToolNames === undefined ? {} : { exemptToolNames: [...gate.exemptToolNames].sort() }),
            ...(gate.reviewedActionClasses === undefined ? {} : { reviewedActionClasses: gate.reviewedActionClasses }),
            answerers: (gate.answerers ?? []).map((answerer) => answerer.name)
          },
    // `plan` composes no gate, so the mode itself is in the shape: a plan run is not an ungated run.
    ...(options.approvalMode === undefined ? {} : { approvalMode: options.approvalMode }),
    version: amcVersion
  });
  return createHash("sha256").update(shape).digest("hex");
}

/** The loop bounds this run enforced, as a digest, for the `session/open` row. */
export function policyDigestOf(options: ComposedTurnOptions): string {
  return createHash("sha256").update(JSON.stringify(options.config ?? {})).digest("hex");
}

import type { ActionClass } from "../../types.js";
import type { AgentPreset } from "../../presets/agentPresets.js";
import type { AgentBlueprint } from "./blueprintTypes.js";

/**
 * Map a blueprint onto the signed preset schema in src/presets/agentPresets.ts.
 *
 * This is the READY-TO-WIRE boundary: the object returned here is what an
 * operator appends to `.amc/agents.yaml` through `savePresets()` (which
 * validates against the strict schema and signs). Nothing in this module
 * writes `.amc/`.
 *
 * `approveTools` selects the approval-policy rule the gate runs under and gates
 * EVERY tool call by default (src/agent/approvalGate.ts). The strictest gated
 * class in scope is chosen so the quorum is never weaker than the policy for
 * the most sensitive action the agent may take.
 */

export interface PresetBinding {
  readonly model: string;
  readonly providerId: string;
  readonly id?: string;
  readonly maxSteps?: number;
  readonly maxTokens?: number;
}

const APPROVAL_PRECEDENCE: readonly ActionClass[] = ["WRITE_HIGH", "WRITE_LOW", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT"];

export function blueprintPresetId(blueprint: AgentBlueprint): string {
  return blueprint.packId === undefined ? `blueprint-${blueprint.station}` : `blueprint-${blueprint.station}-${blueprint.packId}`;
}

export function renderRolePrompt(blueprint: AgentBlueprint): string {
  const lines = [
    `You are the ${blueprint.name}. Purpose: ${blueprint.purpose}`,
    `Station profile: ${blueprint.profile.ruleId} (risk tier ${blueprint.profile.tier}).`,
    `Permitted tool classes: ${blueprint.toolScope.classes.join(", ")}. Every other class is denied.`,
    "Guardrails (each cites the industry-pack question it derives from):",
    ...blueprint.guardrails.map((guardrail) => `- ${guardrail.text} [${guardrail.derivedFrom.regulatoryRef}]`)
  ];
  return lines.join("\n");
}

export function toAgentPreset(blueprint: AgentBlueprint, binding: PresetBinding): AgentPreset {
  const approveTools = APPROVAL_PRECEDENCE.find((actionClass) => blueprint.approvals.gatedClasses.includes(actionClass));
  const onlyReads = blueprint.toolScope.classes.every((actionClass) => actionClass === "READ_ONLY");
  return {
    id: binding.id ?? blueprintPresetId(blueprint),
    description: `${blueprint.name} (${blueprint.profile.ruleId}; ${blueprint.guardrails.length} guardrails from ${blueprint.renderedFrom.packIds.join(", ")})`,
    model: binding.model,
    providerId: binding.providerId,
    ...(binding.maxSteps === undefined ? {} : { maxSteps: binding.maxSteps }),
    ...(binding.maxTokens === undefined ? {} : { maxTokens: binding.maxTokens }),
    tools: onlyReads && blueprint.toolScope.classes.length === 0 ? "none" : "workspace",
    toolMode: "native",
    persona: renderRolePrompt(blueprint),
    ...(approveTools === undefined ? {} : { approveTools })
  };
}

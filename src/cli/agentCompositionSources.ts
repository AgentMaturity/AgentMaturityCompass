import type { Command } from "commander";
import type { AgentPreset } from "../presets/agentPresets.js";
import type { RunOptions } from "../cli-agent-options.js";
import { IN_PROCESS_PROVIDER } from "../agent/providers/delegationProviders.js";
import { presetCompositionSources, type CompositionSource } from "../prompt/context/compositionProvenance.js";

/** Capture explicit flags before approval and delegation fill options from a verified preset. */
export function explicitPresetCompositionOptions(command: Pick<Command, "getOptionValueSource">): ReadonlySet<string> {
  return new Set([
    "provider", "model", "persona", "maxTokens", "maxSteps", "tools", "toolMode", "approveTools",
    "delegate", "delegateScope", "maxDelegationDepth", "delegateProvider", "delegateTimeout", "delegateStop"
  ].filter(name => command.getOptionValueSource(name) === "cli"));
}

interface NativePresetCompositionValues {
  readonly providerId: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly maxSteps: number;
  readonly tools: string;
  readonly toolMode: string;
  readonly approveTools?: string;
  readonly delegateEnabled: boolean;
  readonly delegateScope?: readonly string[];
  readonly maxDelegationDepth: number;
  readonly delegateTimeout: number;
  readonly delegateStops: readonly string[];
}

/** Attribute the actual parsed composition, including explicit false and cleared child stops. */
export function nativePresetCompositionSources(preset: AgentPreset | undefined, explicitOptions: ReadonlySet<string>,
  options: Pick<RunOptions, "persona" | "delegateProvider">, effective: NativePresetCompositionValues): readonly CompositionSource[] | undefined {
  if (preset === undefined) return undefined;
  return presetCompositionSources(preset, [
    { option: "provider", field: "providerId", presetValue: preset.providerId, effectiveValue: effective.providerId },
    { option: "model", field: "model", presetValue: preset.model, effectiveValue: effective.model },
    { option: "persona", field: "persona", presetValue: preset.persona, effectiveValue: options.persona ?? preset.persona },
    { option: "maxTokens", field: "maxTokens", presetValue: preset.maxTokens, effectiveValue: effective.maxTokens },
    { option: "maxSteps", field: "maxSteps", presetValue: preset.maxSteps, effectiveValue: effective.maxSteps },
    { option: "tools", field: "tools", presetValue: preset.tools, effectiveValue: effective.tools },
    { option: "toolMode", field: "toolMode", presetValue: preset.toolMode, effectiveValue: effective.toolMode },
    { option: "approveTools", field: "approveTools", presetValue: preset.approveTools, effectiveValue: effective.approveTools },
    { option: "delegate", field: "delegate.enabled", presetValue: preset.delegate?.enabled, effectiveValue: effective.delegateEnabled },
    { option: "delegateScope", field: "delegate.scope", presetValue: preset.delegate?.scope, effectiveValue: effective.delegateScope },
    { option: "maxDelegationDepth", field: "delegate.maxDepth", presetValue: preset.delegate?.maxDepth, effectiveValue: effective.maxDelegationDepth },
    { option: "delegateProvider", field: "delegate.provider", presetValue: preset.delegate?.provider, effectiveValue: options.delegateProvider ?? IN_PROCESS_PROVIDER },
    { option: "delegateTimeout", field: "delegate.timeoutMs", presetValue: preset.delegate?.timeoutMs, effectiveValue: effective.delegateTimeout },
    { option: "delegateStop", field: "delegate.stopConditions", presetValue: preset.delegate?.stopConditions, effectiveValue: effective.delegateStops }
  ].filter(override => explicitOptions.has(override.option)));
}

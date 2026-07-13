/**
 * Backward-compatible adapter comparison projection.
 *
 * Capability truth lives in each AdapterDefinition in the authoritative
 * registry. This module retains the older public API without maintaining a
 * second hand-authored capability catalog.
 */

import { listBuiltInAdapters } from "./registry.js";
import type { AdapterDefinition } from "./adapterTypes.js";

export const ADAPTER_CAPABILITY_TIERS = ["native", "bridge", "cli"] as const;
export type AdapterCapabilityTier = (typeof ADAPTER_CAPABILITY_TIERS)[number];

export interface AdapterCapabilityProfile {
  adapterId: string;
  framework: string;
  tier: AdapterCapabilityTier;
  capabilities: AdapterCapabilities;
  coverageScore: number;
  gaps: string[];
  compensations: string[];
}

export interface AdapterCapabilities {
  executionTracing: boolean;
  toolCallCapture: boolean;
  contextStateCapture: boolean;
  tokenUsageCapture: boolean;
  latencyMetrics: boolean;
  errorTracing: boolean;
  multiTurnState: boolean;
  interAgentComms: boolean;
  nativeRedTeam: boolean;
  scenarioInjection: boolean;
}

const MINIMUM_SPEC: (keyof AdapterCapabilities)[] = [
  "executionTracing",
  "toolCallCapture",
  "tokenUsageCapture",
  "latencyMetrics",
  "errorTracing"
];

const LEGACY_ID_ALIASES: Record<string, string> = {
  langchainNode: "langchain-node",
  langchainPython: "langchain-python",
  langgraphPython: "langgraph-python",
  llamaindexPython: "llamaindex-python",
  semanticKernel: "semantic-kernel",
  openaiAgentsSdk: "openai-agents-sdk",
  pythonAmcSdk: "python-amc-sdk",
  genericCli: "generic-cli",
  claudeCli: "claude-cli",
  geminiCli: "gemini-cli",
  openclawCli: "openclaw-cli",
  hermesCli: "hermes-cli",
  openhandsCli: "openhands-cli",
  autogenCli: "autogen-cli",
  crewaiCli: "crewai-cli"
};

function capabilityTier(adapter: AdapterDefinition): AdapterCapabilityTier {
  if (adapter.id === "python-amc-sdk" && adapter.capabilities.versionSource === "package_probe") return "native";
  if (adapter.kind === "CLI") return "cli";
  return "bridge";
}

function capabilitiesFor(adapter: AdapterDefinition): AdapterCapabilities {
  const events = new Set(adapter.capabilities.events.map((row) => row.id));
  return {
    executionTracing: events.has("process.started") && events.has("process.exited"),
    toolCallCapture: events.has("action.requested"),
    contextStateCapture: false,
    tokenUsageCapture: false,
    latencyMetrics: events.has("model.response") || events.has("process.exited"),
    errorTracing: events.has("process.stderr") && events.has("process.exited"),
    multiTurnState: false,
    interAgentComms: false,
    nativeRedTeam: false,
    scenarioInjection: false
  };
}

function profileFor(adapter: AdapterDefinition): AdapterCapabilityProfile {
  const capabilities = capabilitiesFor(adapter);
  const entries = Object.entries(capabilities) as Array<[keyof AdapterCapabilities, boolean]>;
  const supported = entries.filter(([, value]) => value).length;
  return {
    adapterId: adapter.id,
    framework: adapter.displayName,
    tier: capabilityTier(adapter),
    capabilities,
    coverageScore: Math.round((supported / entries.length) * 100),
    gaps: entries.filter(([, value]) => !value).map(([key]) => key),
    compensations: [...adapter.capabilities.lossiness.omitted]
  };
}

export const ADAPTER_PROFILES: AdapterCapabilityProfile[] = listBuiltInAdapters().map(profileFor);

export function getAdapterProfile(adapterId: string): AdapterCapabilityProfile | undefined {
  const canonicalId = LEGACY_ID_ALIASES[adapterId] ?? adapterId;
  return ADAPTER_PROFILES.find((profile) => profile.adapterId === canonicalId);
}

export function getAdaptersByTier(tier: AdapterCapabilityTier): AdapterCapabilityProfile[] {
  return ADAPTER_PROFILES.filter((profile) => profile.tier === tier);
}

export function meetsMinimumSpec(profile: AdapterCapabilityProfile): {
  meets: boolean;
  missingCapabilities: string[];
} {
  const missing = MINIMUM_SPEC.filter((capability) => !profile.capabilities[capability]);
  return { meets: missing.length === 0, missingCapabilities: missing };
}

export function getAdapterScoreAdjustment(adapterId: string): {
  factor: number;
  adjustmentReason: string;
  confidenceImpact: number;
} {
  const profile = getAdapterProfile(adapterId);
  if (!profile) {
    return { factor: 1, adjustmentReason: "Unknown adapter - no verified capability receipt", confidenceImpact: -0.2 };
  }
  if (profile.tier === "native") {
    return { factor: 1, adjustmentReason: "Native package probe; verify the signed capability receipt", confidenceImpact: 0 };
  }
  if (profile.tier === "bridge") {
    return { factor: 1, adjustmentReason: "Bridge declaration; confidence depends on effective receipt state", confidenceImpact: -0.05 };
  }
  return {
    factor: 1,
    adjustmentReason: `CLI declaration; score is unpenalized but confidence is reduced (declared coverage: ${profile.coverageScore}%)`,
    confidenceImpact: -0.15
  };
}

export function getAdapterComparisonMatrix(): {
  adapters: { id: string; framework: string; tier: string; coverage: number }[];
  capabilities: string[];
  matrix: boolean[][];
} {
  const capabilities = Object.keys(ADAPTER_PROFILES[0]?.capabilities ?? {}) as (keyof AdapterCapabilities)[];
  return {
    adapters: ADAPTER_PROFILES.map((profile) => ({
      id: profile.adapterId,
      framework: profile.framework,
      tier: profile.tier,
      coverage: profile.coverageScore
    })),
    capabilities,
    matrix: ADAPTER_PROFILES.map((profile) => capabilities.map((capability) => profile.capabilities[capability]))
  };
}

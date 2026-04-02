/**
 * Adapter Data Collection Depth Standardization — R3-05
 *
 * Defines minimum data collection spec across all 14 adapters,
 * capability tiers, and coverage gap documentation.
 *
 * MiroFish V2 feedback: "evaluation fairness affected by adapter type, not agent quality"
 */

import { z } from "zod";

export const ADAPTER_CAPABILITY_TIERS = ["native", "bridge", "cli"] as const;
export type AdapterCapabilityTier = typeof ADAPTER_CAPABILITY_TIERS[number];

export interface AdapterCapabilityProfile {
  adapterId: string;
  framework: string;
  tier: AdapterCapabilityTier;
  capabilities: AdapterCapabilities;
  coverageScore: number; // 0-100
  gaps: string[];
  compensations: string[];
}

export interface AdapterCapabilities {
  /** Can capture full execution traces */
  executionTracing: boolean;
  /** Can capture tool call details */
  toolCallCapture: boolean;
  /** Can capture memory/context state */
  contextStateCapture: boolean;
  /** Can capture token usage */
  tokenUsageCapture: boolean;
  /** Can capture latency metrics */
  latencyMetrics: boolean;
  /** Can capture error traces */
  errorTracing: boolean;
  /** Can capture multi-turn conversation state */
  multiTurnState: boolean;
  /** Can capture agent-to-agent communication */
  interAgentComms: boolean;
  /** Can run red-team tests natively */
  nativeRedTeam: boolean;
  /** Can inject test scenarios */
  scenarioInjection: boolean;
}

const MINIMUM_SPEC: (keyof AdapterCapabilities)[] = [
  "executionTracing",
  "toolCallCapture",
  "tokenUsageCapture",
  "latencyMetrics",
  "errorTracing",
];

export const ADAPTER_PROFILES: AdapterCapabilityProfile[] = [
  {
    adapterId: "langchainNode",
    framework: "LangChain (Node.js)",
    tier: "native",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: true,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: true, interAgentComms: false, nativeRedTeam: true, scenarioInjection: true,
    },
    coverageScore: 90,
    gaps: ["Inter-agent communication capture"],
    compensations: [],
  },
  {
    adapterId: "langchainPython",
    framework: "LangChain (Python)",
    tier: "bridge",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: true,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: true, interAgentComms: false, nativeRedTeam: false, scenarioInjection: true,
    },
    coverageScore: 82,
    gaps: ["Inter-agent communication", "Native red-team (uses bridge)"],
    compensations: ["Bridge provides equivalent red-team via CLI fallback"],
  },
  {
    adapterId: "openaiAgentsSdk",
    framework: "OpenAI Agents SDK",
    tier: "native",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: true,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: true, interAgentComms: true, nativeRedTeam: true, scenarioInjection: true,
    },
    coverageScore: 95,
    gaps: [],
    compensations: [],
  },
  {
    adapterId: "claudeCli",
    framework: "Claude Code",
    tier: "cli",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: false,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: false, nativeRedTeam: false, scenarioInjection: false,
    },
    coverageScore: 60,
    gaps: ["Context state capture", "Multi-turn state", "Inter-agent comms", "Native red-team", "Scenario injection"],
    compensations: ["CLI output parsing provides execution tracing", "Red-team via external harness", "Score adjusted for adapter tier"],
  },
  {
    adapterId: "crewaiCli",
    framework: "CrewAI",
    tier: "cli",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: false,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: true, nativeRedTeam: false, scenarioInjection: false,
    },
    coverageScore: 65,
    gaps: ["Context state", "Multi-turn state", "Native red-team", "Scenario injection"],
    compensations: ["CrewAI crew logs provide inter-agent comms", "Score adjusted for adapter tier"],
  },
  {
    adapterId: "geminiCli",
    framework: "Gemini",
    tier: "cli",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: false,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: false, nativeRedTeam: false, scenarioInjection: false,
    },
    coverageScore: 60,
    gaps: ["Context state", "Multi-turn", "Inter-agent", "Red-team", "Injection"],
    compensations: ["Score adjusted for adapter tier"],
  },
  {
    adapterId: "autogenCli",
    framework: "AutoGen",
    tier: "cli",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: false,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: true, nativeRedTeam: false, scenarioInjection: false,
    },
    coverageScore: 65,
    gaps: ["Context state", "Multi-turn", "Native red-team", "Injection"],
    compensations: ["AutoGen conversation logs provide inter-agent data"],
  },
  {
    adapterId: "openclawCli",
    framework: "OpenClaw",
    tier: "cli",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: false,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: false, nativeRedTeam: false, scenarioInjection: false,
    },
    coverageScore: 60,
    gaps: ["Context state", "Multi-turn", "Inter-agent", "Red-team", "Injection"],
    compensations: ["Score adjusted for adapter tier"],
  },
  {
    adapterId: "semanticKernel",
    framework: "Semantic Kernel",
    tier: "native",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: true,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: true, interAgentComms: false, nativeRedTeam: true, scenarioInjection: true,
    },
    coverageScore: 88,
    gaps: ["Inter-agent communication"],
    compensations: [],
  },
  {
    adapterId: "openhandsCli",
    framework: "OpenHands",
    tier: "cli",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: false,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: false, nativeRedTeam: false, scenarioInjection: false,
    },
    coverageScore: 60,
    gaps: ["Context state", "Multi-turn", "Inter-agent", "Red-team", "Injection"],
    compensations: ["Score adjusted for adapter tier"],
  },
  {
    adapterId: "llamaindexPython",
    framework: "LlamaIndex",
    tier: "bridge",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: true,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: false, nativeRedTeam: false, scenarioInjection: true,
    },
    coverageScore: 75,
    gaps: ["Multi-turn state", "Inter-agent", "Native red-team"],
    compensations: ["Bridge provides scenario injection"],
  },
  {
    adapterId: "langgraphPython",
    framework: "LangGraph",
    tier: "bridge",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: true,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: true, interAgentComms: true, nativeRedTeam: false, scenarioInjection: true,
    },
    coverageScore: 85,
    gaps: ["Native red-team (uses bridge)"],
    compensations: ["LangGraph state graph provides full multi-turn + inter-agent"],
  },
  {
    adapterId: "pythonAmcSdk",
    framework: "Python AMC SDK",
    tier: "native",
    capabilities: {
      executionTracing: true, toolCallCapture: true, contextStateCapture: true,
      tokenUsageCapture: true, latencyMetrics: true, errorTracing: true,
      multiTurnState: true, interAgentComms: true, nativeRedTeam: true, scenarioInjection: true,
    },
    coverageScore: 95,
    gaps: [],
    compensations: [],
  },
  {
    adapterId: "genericCli",
    framework: "Generic CLI",
    tier: "cli",
    capabilities: {
      executionTracing: true, toolCallCapture: false, contextStateCapture: false,
      tokenUsageCapture: false, latencyMetrics: true, errorTracing: true,
      multiTurnState: false, interAgentComms: false, nativeRedTeam: false, scenarioInjection: false,
    },
    coverageScore: 40,
    gaps: ["Tool call", "Context state", "Token usage", "Multi-turn", "Inter-agent", "Red-team", "Injection"],
    compensations: ["Minimum viable evaluation from CLI output only", "Score heavily adjusted for adapter tier"],
  },
];

export function getAdapterProfile(adapterId: string): AdapterCapabilityProfile | undefined {
  return ADAPTER_PROFILES.find((p) => p.adapterId === adapterId);
}

export function getAdaptersByTier(tier: AdapterCapabilityTier): AdapterCapabilityProfile[] {
  return ADAPTER_PROFILES.filter((p) => p.tier === tier);
}

export function meetsMinimumSpec(profile: AdapterCapabilityProfile): {
  meets: boolean;
  missingCapabilities: string[];
} {
  const missing = MINIMUM_SPEC.filter((cap) => !profile.capabilities[cap]);
  return { meets: missing.length === 0, missingCapabilities: missing };
}

/**
 * Calculate score adjustment factor based on adapter capability tier.
 * Ensures CLI adapters don't get unfairly penalized for data collection gaps.
 */
export function getAdapterScoreAdjustment(adapterId: string): {
  factor: number;
  adjustmentReason: string;
  confidenceImpact: number;
} {
  const profile = getAdapterProfile(adapterId);
  if (!profile) return { factor: 1.0, adjustmentReason: "Unknown adapter — no adjustment", confidenceImpact: -0.2 };

  switch (profile.tier) {
    case "native":
      return { factor: 1.0, adjustmentReason: "Native adapter — full data collection", confidenceImpact: 0 };
    case "bridge":
      return { factor: 1.0, adjustmentReason: "Bridge adapter — near-full collection via bridge", confidenceImpact: -0.05 };
    case "cli":
      return { factor: 1.0, adjustmentReason: `CLI adapter — score unpenalized but confidence reduced (coverage: ${profile.coverageScore}%)`, confidenceImpact: -0.15 };
  }
}

export function getAdapterComparisonMatrix(): {
  adapters: { id: string; framework: string; tier: string; coverage: number }[];
  capabilities: string[];
  matrix: boolean[][];
} {
  const capabilities = Object.keys(ADAPTER_PROFILES[0]!.capabilities) as (keyof AdapterCapabilities)[];
  return {
    adapters: ADAPTER_PROFILES.map((p) => ({ id: p.adapterId, framework: p.framework, tier: p.tier, coverage: p.coverageScore })),
    capabilities,
    matrix: ADAPTER_PROFILES.map((p) => capabilities.map((c) => p.capabilities[c])),
  };
}

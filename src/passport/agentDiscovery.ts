/**
 * Agent Discovery & Reputation Portability
 *
 * Extends Agent Passport with capability declarations, searchable maturity,
 * cross-platform identity linking, and reputation portability.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CapabilityDeclaration {
  id: string;
  agentId: string;
  capability: string;
  evidenceEventIds: string[];
  declaredTs: number;
  maturityLevel: number | null;
}

export interface PlatformLink {
  id: string;
  agentId: string;
  platform: string;
  identity: string;
  linkedTs: number;
  attestationHash: string;
}

export interface CapabilitySearchQuery {
  capability: string;
  minLevel?: number;
  platform?: string;
}

export interface CapabilitySearchResult {
  agentIdHash: string;
  capability: string;
  maturityLevel: number | null;
  evidenceCount: number;
  platforms: string[];
}

export interface PortableReputationBundle {
  version: 1;
  agentIdHash: string;
  generatedTs: number;
  capabilities: CapabilityDeclaration[];
  platformLinks: PlatformLink[];
  maturitySummary: {
    overallLevel: number | null;
    evidenceCount: number;
    trustLabel: string;
  };
  bundleHash: string;
}

export interface AgentDiscoveryRegistry {
  agents: Map<string, AgentDiscoveryEntry>;
}

export interface AgentDiscoveryEntry {
  agentId: string;
  agentIdHash: string;
  capabilities: CapabilityDeclaration[];
  platformLinks: PlatformLink[];
  maturityLevel: number | null;
  trustLabel: string;
  evidenceCount: number;
}

// ── Schema ─────────────────────────────────────────────────────────────────

export const capabilityDeclarationSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  capability: z.string().min(1),
  evidenceEventIds: z.array(z.string().min(1)),
  declaredTs: z.number().int(),
  maturityLevel: z.number().min(0).max(5).nullable(),
});

export const platformLinkSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  platform: z.string().min(1),
  identity: z.string().min(1),
  linkedTs: z.number().int(),
  attestationHash: z.string().min(1),
});

// ── Core Logic ─────────────────────────────────────────────────────────────

export function createDiscoveryRegistry(): AgentDiscoveryRegistry {
  return { agents: new Map() };
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * Path of the on-disk discovery registry for a workspace.
 */
export function discoveryRegistryPath(workspace: string): string {
  return join(workspace, ".amc", "passport", "discovery.json");
}

/**
 * Loads the registry from disk, or an empty one when none exists.
 *
 * Every CLI command previously built a fresh in-memory registry, so an added
 * capability vanished the moment the process exited and searches always
 * returned nothing.
 */
export function loadDiscoveryRegistry(workspace: string): AgentDiscoveryRegistry {
  const path = discoveryRegistryPath(workspace);
  if (!existsSync(path)) return createDiscoveryRegistry();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      agents?: AgentDiscoveryEntry[];
    };
    const registry = createDiscoveryRegistry();
    for (const entry of parsed.agents ?? []) {
      registry.agents.set(entry.agentId, entry);
    }
    return registry;
  } catch {
    // A corrupt registry must not silently present as empty-but-fine.
    throw new Error(`Discovery registry at ${path} is unreadable or corrupt.`);
  }
}

/** Persists the registry so later commands can see it. */
export function saveDiscoveryRegistry(
  workspace: string,
  registry: AgentDiscoveryRegistry
): string {
  const path = discoveryRegistryPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ v: 1, agents: [...registry.agents.values()] }, null, 2)}\n`,
    { mode: 0o600 }
  );
  return path;
}

export function ensureAgentEntry(
  registry: AgentDiscoveryRegistry,
  agentId: string
): AgentDiscoveryEntry {
  const hash = sha256Hex(agentId).slice(0, 16);
  if (!registry.agents.has(agentId)) {
    registry.agents.set(agentId, {
      agentId,
      agentIdHash: hash,
      capabilities: [],
      platformLinks: [],
      maturityLevel: null,
      trustLabel: "LOW TRUST",
      evidenceCount: 0,
    });
  }
  return registry.agents.get(agentId)!;
}

export function addCapability(
  registry: AgentDiscoveryRegistry,
  agentId: string,
  capability: string,
  evidenceEventIds: string[],
  maturityLevel: number | null = null
): CapabilityDeclaration {
  const entry = ensureAgentEntry(registry, agentId);
  const decl: CapabilityDeclaration = {
    id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    capability,
    evidenceEventIds,
    declaredTs: Date.now(),
    maturityLevel,
  };
  entry.capabilities.push(decl);
  entry.evidenceCount += evidenceEventIds.length;
  if (maturityLevel !== null && (entry.maturityLevel === null || maturityLevel > entry.maturityLevel)) {
    entry.maturityLevel = maturityLevel;
  }
  return decl;
}

export function linkPlatform(
  registry: AgentDiscoveryRegistry,
  agentId: string,
  platform: string,
  identity: string
): PlatformLink {
  const entry = ensureAgentEntry(registry, agentId);
  const attestationData = `${agentId}:${platform}:${identity}:${Date.now()}`;
  const link: PlatformLink = {
    id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    platform,
    identity,
    linkedTs: Date.now(),
    attestationHash: sha256Hex(attestationData),
  };
  entry.platformLinks.push(link);
  return link;
}

export function searchCapabilities(
  registry: AgentDiscoveryRegistry,
  query: CapabilitySearchQuery
): CapabilitySearchResult[] {
  const results: CapabilitySearchResult[] = [];
  const capLower = query.capability.toLowerCase();

  for (const entry of registry.agents.values()) {
    const matchingCaps = entry.capabilities.filter((c) =>
      c.capability.toLowerCase().includes(capLower)
    );
    if (matchingCaps.length === 0) continue;

    const bestLevel = Math.max(
      ...matchingCaps.map((c) => c.maturityLevel ?? 0),
      entry.maturityLevel ?? 0
    );
    if (query.minLevel !== undefined && bestLevel < query.minLevel) continue;

    if (query.platform) {
      const hasPlat = entry.platformLinks.some((l) => l.platform === query.platform);
      if (!hasPlat) continue;
    }

    results.push({
      agentIdHash: entry.agentIdHash,
      capability: matchingCaps[0]!.capability,
      maturityLevel: bestLevel || null,
      evidenceCount: matchingCaps.reduce((a, c) => a + c.evidenceEventIds.length, 0),
      platforms: entry.platformLinks.map((l) => l.platform),
    });
  }

  return results.sort((a, b) => (b.maturityLevel ?? 0) - (a.maturityLevel ?? 0));
}

export function exportPortableReputation(
  registry: AgentDiscoveryRegistry,
  agentId: string
): PortableReputationBundle | null {
  const entry = registry.agents.get(agentId);
  if (!entry) return null;

  // Privacy-safe: hash agent ID, strip raw evidence
  const sanitizedCaps = entry.capabilities.map((c) => ({
    ...c,
    agentId: entry.agentIdHash,
    evidenceEventIds: c.evidenceEventIds.map((e) => sha256Hex(e).slice(0, 16)),
  }));

  const sanitizedLinks = entry.platformLinks.map((l) => ({
    ...l,
    agentId: entry.agentIdHash,
  }));

  const bundle: Omit<PortableReputationBundle, "bundleHash"> = {
    version: 1,
    agentIdHash: entry.agentIdHash,
    generatedTs: Date.now(),
    capabilities: sanitizedCaps,
    platformLinks: sanitizedLinks,
    maturitySummary: {
      overallLevel: entry.maturityLevel,
      evidenceCount: entry.evidenceCount,
      trustLabel: entry.trustLabel,
    },
  };

  const bundleHash = sha256Hex(JSON.stringify(bundle));
  return { ...bundle, bundleHash };
}

export function verifyPortableReputation(bundle: PortableReputationBundle): boolean {
  const { bundleHash, ...rest } = bundle;
  const computed = sha256Hex(JSON.stringify(rest));
  return computed === bundleHash;
}

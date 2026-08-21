export interface PolicyPack {
  packId: string;
  name: string;
  description: string;
  modules: string[];
  config: Record<string, unknown>;
}

export interface ApplyResult {
  /** Always false here: this resolver does not enforce anything. */
  applied: boolean;
  /** True when the pack was found and its modules resolved. */
  resolved?: boolean;
  agentId: string;
  packId: string;
  /** Modules the pack WOULD enable, not modules now in force. */
  modulesEnabled: string[];
}

const builtInPacks: PolicyPack[] = [
  { packId: 'minimal', name: 'Minimal', description: 'Basic safety checks only', modules: ['safety'], config: { strictness: 'low' } },
  { packId: 'standard', name: 'Standard', description: 'Recommended defaults for most agents', modules: ['safety', 'audit', 'explainability'], config: { strictness: 'medium' } },
  { packId: 'strict', name: 'Strict', description: 'Full compliance and audit trail', modules: ['safety', 'audit', 'explainability', 'vault', 'attestation'], config: { strictness: 'high' } },
  { packId: 'financial', name: 'Financial Services', description: 'SOX/PCI-DSS compliance pack', modules: ['safety', 'audit', 'explainability', 'vault', 'attestation', 'residency'], config: { strictness: 'high', compliance: ['SOX', 'PCI-DSS'] } },
  { packId: 'healthcare', name: 'Healthcare', description: 'HIPAA compliance pack', modules: ['safety', 'audit', 'explainability', 'vault', 'attestation', 'residency', 'redaction'], config: { strictness: 'high', compliance: ['HIPAA'] } },
  {
    packId: 'mcp-safety',
    name: 'MCP Safety Assurance',
    description: 'MCP-focused controls for tool validation, trusted servers, injection defense, and scope enforcement',
    modules: ['safety', 'audit', 'explainability', 'mcp-trust', 'mcp-injection-defense', 'mcp-permission-scope'],
    config: {
      strictness: 'high',
      compliance: ['MCP'],
      controls: ['tool_validation', 'server_trust', 'prompt_injection_detection', 'permission_scope_enforcement']
    }
  },
];

export class PolicyPackRegistry {
  private readonly packs = new Map<string, PolicyPack>();

  constructor() {
    for (const pack of builtInPacks) {
      this.packs.set(pack.packId, { ...pack });
    }
  }

  loadPolicyPack(packId: string): PolicyPack | null {
    return this.packs.get(packId) ?? null;
  }

  /**
   * Resolves which modules a pack would enable for an agent.
   *
   * This does not enforce anything: no configuration is written and no control
   * is activated. `applied` previously read true, implying the pack had taken
   * effect. Applying a policy pack for real goes through the signed policy
   * store (see src/policyPacks and `amc policy pack`).
   */
  applyPolicyPack(agentId: string, packId: string): ApplyResult {
    const pack = this.packs.get(packId);
    if (!pack) return { applied: false, agentId, packId, modulesEnabled: [] };
    // Resolved, not applied — nothing was enforced by this call.
    return { applied: false, resolved: true, agentId, packId, modulesEnabled: [...pack.modules] };
  }

  listPolicyPacks(): PolicyPack[] {
    return [...this.packs.values()];
  }

  createPolicyPack(pack: PolicyPack): void {
    this.packs.set(pack.packId, pack);
  }
}

import { randomUUID } from 'node:crypto';

/** Backward-compatible wrappers */
export function createPolicyPackCompat(name: string, modules: string[]) {
  return { packId: randomUUID(), name, version: '1.0', modules };
}

export function validatePolicyPack(pack: { name?: string; modules: string[] }) {
  const errors: string[] = [];
  if (!pack.name) errors.push('Missing pack name');
  if (pack.modules.length === 0) errors.push('Pack has no modules');
  return { valid: errors.length === 0, errors };
}

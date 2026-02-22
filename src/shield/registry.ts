import { verify, KeyObject } from 'node:crypto';
import { emitGuardEvent } from '../enforce/evidenceEmitter.js';

export interface SkillMetadata {
  name: string;
  version: string;
  author?: string;
  signature?: Buffer;
  [key: string]: unknown;
}

export interface RegistryEntry {
  skillId: string;
  metadata: SkillMetadata;
  registeredAt: string;
  verified: boolean;
  revoked: boolean;
}

export interface RegistryCheckResult {
  registered: boolean;
  version: string;
  trusted: boolean;
  revoked: boolean;
}

export class SkillRegistry {
  private store = new Map<string, RegistryEntry>();

  register(skillId: string, metadata: SkillMetadata): RegistryEntry {
    const entry: RegistryEntry = {
      skillId,
      metadata,
      registeredAt: new Date().toISOString(),
      verified: false,
      revoked: false,
    };
    this.store.set(skillId, entry);
    return entry;
  }

  lookup(skillId: string): RegistryEntry | undefined {
    return this.store.get(skillId);
  }

  verify(skillId: string, signature: Buffer, publicKey: KeyObject): boolean {
    const entry = this.store.get(skillId);
    if (!entry || entry.revoked) return false;
    const data = Buffer.from(JSON.stringify(entry.metadata), 'utf-8');
    const valid = verify(null, data, publicKey, signature);
    if (valid) {
      entry.verified = true;
      entry.metadata.signature = signature;
    }
    return valid;
  }

  list(): RegistryEntry[] {
    return Array.from(this.store.values());
  }

  revoke(skillId: string): boolean {
    const entry = this.store.get(skillId);
    if (!entry) return false;
    entry.revoked = true;
    entry.verified = false;
    return true;
  }
}

const defaultRegistry = new SkillRegistry();

export function checkRegistry(skillId: string, registry: SkillRegistry = defaultRegistry): RegistryCheckResult {
  const entry = registry.lookup(skillId);
  const result: RegistryCheckResult = {
    registered: Boolean(entry),
    version: entry?.metadata.version ?? '0.0.0',
    trusted: Boolean(entry && entry.verified && !entry.revoked),
    revoked: Boolean(entry?.revoked),
  };
  emitGuardEvent({
    agentId: 'system',
    moduleCode: 'S7',
    decision: result.trusted ? 'allow' : 'warn',
    reason: result.registered ? `Registry lookup for ${skillId}` : `Skill not found: ${skillId}`,
    severity: result.trusted ? 'low' : 'medium',
    meta: { skillId, ...result },
  });
  return result;
}

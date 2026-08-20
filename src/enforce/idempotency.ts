import { emitGuardEvent } from './evidenceEmitter.js';
export interface IdempotencyCheck {
  canProceed: boolean;
  existingResult?: unknown;
  key: string;
}

interface CacheEntry {
  result: unknown;
  expiresAt: number;
}

export class IdempotencyStore {
  private cache = new Map<string, CacheEntry>();

  check(requestId: string): { found: boolean; result?: unknown } {
    this.cleanup();
    const entry = this.cache.get(requestId);
    if (entry && entry.expiresAt > Date.now()) {
      return { found: true, result: entry.result };
    }
    return { found: false };
  }

  store(requestId: string, result: unknown, ttlMs: number = 300000): void {
    this.cache.set(requestId, { result, expiresAt: Date.now() + ttlMs });
  }

  cleanup(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  size(): number { return this.cache.size; }
}

const defaultStore = new IdempotencyStore();

export function checkIdempotency(workflowId: string, action: string, params: Record<string, unknown>): IdempotencyCheck {
  const key = `${workflowId}:${action}:${JSON.stringify(params)}`;
  const { found, result } = defaultStore.check(key);
    const __e29Allowed = !found;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E29', severity: 'low', decision: __e29Allowed ? 'allow' : 'deny', reason: `E29 ${__e29Allowed ? 'allowed' : 'denied'}` });
  return { canProceed: !found, existingResult: result, key };
}
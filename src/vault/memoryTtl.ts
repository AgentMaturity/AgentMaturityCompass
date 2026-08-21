interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

export class MemoryTtlStore {
  private readonly store = new Map<string, MemoryEntry>();

  setMemory(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  getMemory(key: string): { value: unknown; expiresAt: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { value: entry.value, expiresAt: entry.expiresAt };
  }

  evictExpired(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  has(key: string): boolean {
    return this.getMemory(key) !== null;
  }

  size(): number {
    this.evictExpired();
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Process-wide store backing the convenience wrappers below.
 */
const defaultStore = new MemoryTtlStore();

/**
 * Stores a value with a TTL in the module-level store.
 *
 * This wrapper previously discarded `value` entirely and returned
 * `stored: true`, so callers believed data had been stored with an expiry when
 * nothing was written at all.
 */
export function storeWithTtl(key: string, value: unknown, purpose: string, ttlSeconds?: number) {
  const ttl = ttlSeconds ?? 3600;
  defaultStore.setMemory(key, value, ttl * 1000);
  const stored = defaultStore.has(key);
  return { key, purpose, expiresAt: new Date(Date.now() + ttl * 1000), stored };
}

/** Reads back a value written by {@link storeWithTtl}. */
export function readWithTtl(key: string): { value: unknown; expiresAt: number } | null {
  return defaultStore.getMemory(key);
}

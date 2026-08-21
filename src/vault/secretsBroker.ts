import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

interface StoredSecret {
  iv: Buffer;
  authTag: Buffer;
  encrypted: Buffer;
  createdAt: string;
  lastAccessed?: string;
}

interface AccessLogEntry {
  requesterId: string;
  accessedAt: string;
}

export interface SecretStoreResult { stored: boolean; name: string; }
export interface SecretRetrieveResult { value: string; accessedBy: string; accessedAt: string; }
export interface SecretListItem { name: string; createdAt: string; lastAccessed?: string; }

export class SecretsBroker {
  private readonly masterKey: Buffer;
  private readonly secrets = new Map<string, StoredSecret>();
  private readonly accessLog = new Map<string, AccessLogEntry[]>();

  constructor(masterKey?: Buffer) {
    this.masterKey = masterKey ?? randomBytes(32);
  }

  private encrypt(value: string): { iv: Buffer; authTag: Buffer; encrypted: Buffer } {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { iv, authTag, encrypted };
  }

  private decrypt(stored: StoredSecret): string {
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, stored.iv);
    decipher.setAuthTag(stored.authTag);
    return Buffer.concat([decipher.update(stored.encrypted), decipher.final()]).toString('utf8');
  }

  storeSecret(name: string, value: string): SecretStoreResult {
    const { iv, authTag, encrypted } = this.encrypt(value);
    this.secrets.set(name, { iv, authTag, encrypted, createdAt: new Date().toISOString() });
    return { stored: true, name };
  }

  retrieveSecret(name: string, requesterId: string): SecretRetrieveResult | null {
    const stored = this.secrets.get(name);
    if (!stored) return null;
    const accessedAt = new Date().toISOString();
    stored.lastAccessed = accessedAt;
    const entries = this.accessLog.get(name) ?? [];
    entries.push({ requesterId, accessedAt });
    this.accessLog.set(name, entries);
    return { value: this.decrypt(stored), accessedBy: requesterId, accessedAt };
  }

  rotateSecret(name: string, newValue: string): { rotated: boolean; name: string } {
    const existing = this.secrets.get(name);
    if (!existing) return { rotated: false, name };
    const { iv, authTag, encrypted } = this.encrypt(newValue);
    existing.iv = iv;
    existing.authTag = authTag;
    existing.encrypted = encrypted;
    return { rotated: true, name };
  }

  listSecrets(): SecretListItem[] {
    const result: SecretListItem[] = [];
    for (const [name, s] of this.secrets) {
      result.push({ name, createdAt: s.createdAt, lastAccessed: s.lastAccessed });
    }
    return result;
  }

  deleteSecret(name: string): boolean {
    return this.secrets.delete(name);
  }
}

/**
 * Mints a scoped, expiring reference to a stored secret.
 *
 * The token is recorded so it can be resolved and expired. Previously this
 * returned a random id that was never stored anywhere, so the "token" referred
 * to nothing and could never be redeemed or revoked.
 */
const mintedTokens = new Map<
  string,
  { secretName: string; scope: string; expiresAt: number }
>();

export function mintSecretToken(secretName: string, scope: string, ttlSeconds?: number) {
  const ttl = ttlSeconds ?? 300;
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  mintedTokens.set(tokenId, { secretName, scope, expiresAt: expiresAt.getTime() });
  return { tokenId, maskedValue: `****${secretName.slice(-4)}`, scope, expiresAt };
}

/** Resolves a minted token, or null when unknown or expired. */
export function resolveSecretToken(
  tokenId: string
): { secretName: string; scope: string; expiresAt: number } | null {
  const entry = mintedTokens.get(tokenId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    mintedTokens.delete(tokenId);
    return null;
  }
  return entry;
}

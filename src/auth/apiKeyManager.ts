import { randomBytes, randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";

export const API_KEY_SCOPES = [
  "read-only",
  "write",
  "admin"
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
export type ApiKeyStatus = "active" | "rotated" | "revoked";

export interface ApiKeyRecord {
  keyId: string;
  label: string;
  scope: ApiKeyScope;
  prefix: string;
  createdTs: number;
  expiresTs: number | null;
  status: ApiKeyStatus;
  rotatedToKeyId: string | null;
  graceUntilTs: number | null;
  revokedTs: number | null;
  lastUsedTs: number | null;
  usageCount: number;
}

interface StoredApiKeyRecord extends ApiKeyRecord {
  secretHash: string;
}

export interface ApiKeyIssueResult {
  keyId: string;
  apiKey: string;
  record: ApiKeyRecord;
}

export interface ApiKeyRotateResult {
  oldKeyId: string;
  newKeyId: string;
  newApiKey: string;
  graceUntilTs: number;
}

export interface ApiKeyAuthResult {
  ok: boolean;
  reason?: "invalid_api_key" | "revoked" | "expired" | "rotation_grace_expired" | "insufficient_scope";
  keyId?: string;
  scope?: ApiKeyScope;
  status?: ApiKeyStatus;
  inGracePeriod?: boolean;
}

export interface ApiKeyUsageEvent {
  keyId: string;
  ts: number;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number | null;
}

export interface ApiKeyUsageSummary {
  keyId: string;
  totalRequests: number;
  lastUsedTs: number | null;
  byEndpoint: Record<string, number>;
  byStatusCode: Record<string, number>;
}

const SCOPE_RANK: Record<ApiKeyScope, number> = {
  "read-only": 1,
  write: 2,
  admin: 3
};

export function scopeAllows(grantedScope: ApiKeyScope, requiredScope: ApiKeyScope): boolean {
  return SCOPE_RANK[grantedScope] >= SCOPE_RANK[requiredScope];
}

export class ApiKeyManager {
  private readonly keys = new Map<string, StoredApiKeyRecord>();
  private readonly keyIdBySecretHash = new Map<string, string>();
  private readonly usageEvents = new Map<string, ApiKeyUsageEvent[]>();

  createKey(params: {
    scope: ApiKeyScope;
    label?: string;
    expiresInMs?: number;
    nowTs?: number;
  }): ApiKeyIssueResult {
    const nowTs = params.nowTs ?? Date.now();
    const keyId = `key_${randomUUID().replace(/-/g, "")}`;
    const suffix = randomBytes(24).toString("base64url");
    const apiKey = `amc_${keyId}_${suffix}`;
    const record: StoredApiKeyRecord = {
      keyId,
      label: params.label?.trim() || keyId,
      scope: params.scope,
      prefix: apiKey.slice(0, 16),
      createdTs: nowTs,
      expiresTs: Number.isFinite(params.expiresInMs) && (params.expiresInMs ?? 0) > 0
        ? nowTs + Math.floor(params.expiresInMs!)
        : null,
      status: "active",
      rotatedToKeyId: null,
      graceUntilTs: null,
      revokedTs: null,
      lastUsedTs: null,
      usageCount: 0,
      secretHash: sha256Hex(apiKey)
    };
    this.keys.set(record.keyId, record);
    this.keyIdBySecretHash.set(record.secretHash, record.keyId);
    return {
      keyId: record.keyId,
      apiKey,
      record: this.publicRecord(record)
    };
  }

  listKeys(): ApiKeyRecord[] {
    return Array.from(this.keys.values())
      .map((record) => this.publicRecord(record))
      .sort((a, b) => a.createdTs - b.createdTs);
  }

  getKey(keyId: string): ApiKeyRecord | null {
    const record = this.keys.get(keyId);
    if (!record) {
      return null;
    }
    return this.publicRecord(record);
  }

  authenticate(params: {
    apiKey: string;
    requiredScope?: ApiKeyScope;
    nowTs?: number;
  }): ApiKeyAuthResult {
    const record = this.lookupByApiKey(params.apiKey);
    if (!record) {
      return { ok: false, reason: "invalid_api_key" };
    }
    const nowTs = params.nowTs ?? Date.now();

    if (record.status === "revoked") {
      return { ok: false, reason: "revoked", keyId: record.keyId, scope: record.scope, status: record.status };
    }
    if (record.expiresTs !== null && nowTs > record.expiresTs) {
      return { ok: false, reason: "expired", keyId: record.keyId, scope: record.scope, status: record.status };
    }
    const inGracePeriod = record.status === "rotated" && (record.graceUntilTs ?? 0) >= nowTs;
    if (record.status === "rotated" && !inGracePeriod) {
      return {
        ok: false,
        reason: "rotation_grace_expired",
        keyId: record.keyId,
        scope: record.scope,
        status: record.status,
        inGracePeriod: false
      };
    }

    const requiredScope = params.requiredScope ?? "read-only";
    if (!scopeAllows(record.scope, requiredScope)) {
      return {
        ok: false,
        reason: "insufficient_scope",
        keyId: record.keyId,
        scope: record.scope,
        status: record.status,
        inGracePeriod
      };
    }

    record.lastUsedTs = nowTs;
    record.usageCount += 1;
    return {
      ok: true,
      keyId: record.keyId,
      scope: record.scope,
      status: record.status,
      inGracePeriod
    };
  }

  rotateKey(params: {
    keyId: string;
    gracePeriodMs: number;
    expiresInMs?: number;
    nowTs?: number;
  }): ApiKeyRotateResult {
    const existing = this.keys.get(params.keyId);
    if (!existing) {
      throw new Error(`unknown api key: ${params.keyId}`);
    }
    if (existing.status === "revoked") {
      throw new Error(`cannot rotate revoked api key: ${params.keyId}`);
    }
    const nowTs = params.nowTs ?? Date.now();
    const issued = this.createKey({
      scope: existing.scope,
      label: `${existing.label}:rotated`,
      expiresInMs: params.expiresInMs,
      nowTs
    });
    const gracePeriodMs = Math.max(0, Math.floor(params.gracePeriodMs));
    existing.status = "rotated";
    existing.rotatedToKeyId = issued.keyId;
    existing.graceUntilTs = nowTs + gracePeriodMs;
    return {
      oldKeyId: existing.keyId,
      newKeyId: issued.keyId,
      newApiKey: issued.apiKey,
      graceUntilTs: existing.graceUntilTs
    };
  }

  revokeKey(params: {
    keyId: string;
    nowTs?: number;
  }): ApiKeyRecord {
    const existing = this.keys.get(params.keyId);
    if (!existing) {
      throw new Error(`unknown api key: ${params.keyId}`);
    }
    if (existing.status !== "revoked") {
      existing.status = "revoked";
      existing.revokedTs = params.nowTs ?? Date.now();
      existing.graceUntilTs = null;
    }
    return this.publicRecord(existing);
  }

  recordUsage(params: {
    keyId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs?: number;
    ts?: number;
  }): ApiKeyUsageEvent {
    const record = this.keys.get(params.keyId);
    if (!record) {
      throw new Error(`unknown api key: ${params.keyId}`);
    }
    const event: ApiKeyUsageEvent = {
      keyId: params.keyId,
      ts: params.ts ?? Date.now(),
      endpoint: params.endpoint,
      method: params.method.toUpperCase(),
      statusCode: params.statusCode,
      latencyMs: Number.isFinite(params.latencyMs) ? Math.max(0, Math.floor(params.latencyMs!)) : null
    };
    const current = this.usageEvents.get(params.keyId) ?? [];
    current.push(event);
    this.usageEvents.set(params.keyId, current);
    record.lastUsedTs = event.ts;
    return event;
  }

  recordUsageForApiKey(params: {
    apiKey: string;
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs?: number;
    ts?: number;
  }): ApiKeyUsageEvent {
    const auth = this.authenticate({
      apiKey: params.apiKey,
      nowTs: params.ts
    });
    if (!auth.ok || !auth.keyId) {
      throw new Error(`invalid api key usage record: ${auth.reason ?? "unknown"}`);
    }
    return this.recordUsage({
      keyId: auth.keyId,
      endpoint: params.endpoint,
      method: params.method,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      ts: params.ts
    });
  }

  getUsageSummary(keyId: string): ApiKeyUsageSummary {
    const rows = this.usageEvents.get(keyId) ?? [];
    const byEndpoint: Record<string, number> = {};
    const byStatusCode: Record<string, number> = {};
    let lastUsedTs: number | null = null;
    for (const row of rows) {
      const endpointKey = `${row.method} ${row.endpoint}`;
      byEndpoint[endpointKey] = (byEndpoint[endpointKey] ?? 0) + 1;
      const statusKey = String(row.statusCode);
      byStatusCode[statusKey] = (byStatusCode[statusKey] ?? 0) + 1;
      lastUsedTs = lastUsedTs === null ? row.ts : Math.max(lastUsedTs, row.ts);
    }
    return {
      keyId,
      totalRequests: rows.length,
      lastUsedTs,
      byEndpoint,
      byStatusCode
    };
  }

  private lookupByApiKey(apiKey: string): StoredApiKeyRecord | null {
    const secretHash = sha256Hex(apiKey);
    const keyId = this.keyIdBySecretHash.get(secretHash);
    if (!keyId) {
      return null;
    }
    return this.keys.get(keyId) ?? null;
  }

  private publicRecord(record: StoredApiKeyRecord): ApiKeyRecord {
    return {
      keyId: record.keyId,
      label: record.label,
      scope: record.scope,
      prefix: record.prefix,
      createdTs: record.createdTs,
      expiresTs: record.expiresTs,
      status: record.status,
      rotatedToKeyId: record.rotatedToKeyId,
      graceUntilTs: record.graceUntilTs,
      revokedTs: record.revokedTs,
      lastUsedTs: record.lastUsedTs,
      usageCount: record.usageCount
    };
  }
}

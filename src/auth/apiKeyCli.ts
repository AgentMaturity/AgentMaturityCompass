import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  API_KEY_SCOPES,
  ApiKeyManager,
  type ApiKeyRecord,
  type ApiKeyScope,
  type ApiKeyStoreSnapshot
} from "./apiKeyManager.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";

export function apiKeyStorePath(workspace: string): string {
  return join(workspace, ".amc", "auth", "api-keys.json");
}

export function parseApiKeyScope(raw: string): ApiKeyScope {
  const normalized = raw.trim().toLowerCase();
  if ((API_KEY_SCOPES as readonly string[]).includes(normalized)) {
    return normalized as ApiKeyScope;
  }
  throw new Error(`Invalid API key scope '${raw}'. Use one of: ${API_KEY_SCOPES.join(", ")}`);
}

export function parseApiKeyDuration(raw: string | undefined): number | undefined {
  if (!raw || raw.trim().length === 0 || raw.trim().toLowerCase() === "never") {
    return undefined;
  }
  const match = /^(\d+)\s*(m|h|d|w)?$/i.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid duration '${raw}'. Use examples like 30m, 12h, 90d, 4w, or never.`);
  }
  const value = Number(match[1]);
  const unit = (match[2] ?? "d").toLowerCase();
  const factor = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : 7 * 86_400_000;
  return value * factor;
}

export function loadApiKeyManager(workspace: string): ApiKeyManager {
  const file = apiKeyStorePath(workspace);
  if (!pathExists(file)) {
    return new ApiKeyManager();
  }
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as ApiKeyStoreSnapshot;
  return ApiKeyManager.fromSnapshot(snapshot);
}

export function saveApiKeyManager(workspace: string, manager: ApiKeyManager): string {
  const file = apiKeyStorePath(workspace);
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(manager.toSnapshot(), null, 2), 0o600);
  return file;
}

export function createApiKeyForCli(params: {
  workspace: string;
  scope: string;
  label?: string;
  expiresIn?: string;
  nowTs?: number;
}): {
  keyId: string;
  apiKey: string;
  record: ApiKeyRecord;
  storePath: string;
} {
  const manager = loadApiKeyManager(params.workspace);
  const issued = manager.createKey({
    scope: parseApiKeyScope(params.scope),
    label: params.label,
    expiresInMs: parseApiKeyDuration(params.expiresIn),
    nowTs: params.nowTs
  });
  const storePath = saveApiKeyManager(params.workspace, manager);
  return {
    ...issued,
    storePath
  };
}

export function listApiKeysForCli(params: { workspace: string }): {
  keys: ApiKeyRecord[];
  storePath: string;
} {
  const manager = loadApiKeyManager(params.workspace);
  return {
    keys: manager.listKeys(),
    storePath: apiKeyStorePath(params.workspace)
  };
}

export function revokeApiKeyForCli(params: {
  workspace: string;
  keyId: string;
  nowTs?: number;
}): {
  record: ApiKeyRecord;
  storePath: string;
} {
  const manager = loadApiKeyManager(params.workspace);
  const record = manager.revokeKey({ keyId: params.keyId, nowTs: params.nowTs });
  const storePath = saveApiKeyManager(params.workspace, manager);
  return {
    record,
    storePath
  };
}

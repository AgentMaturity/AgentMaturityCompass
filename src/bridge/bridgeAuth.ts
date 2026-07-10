import { randomInt, randomUUID } from "node:crypto";
import { join } from "node:path";
import { URL } from "node:url";
import { issueLeaseToken } from "../leases/leaseSigner.js";
import { extractLeaseCarrier, type LeaseCarrier } from "../leases/leaseCarriers.js";
import { loadLeaseRevocations, verifyLeaseRevocationsSignature } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import type { LeasePayload, LeaseScope } from "../leases/leaseSchema.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { normalizeAgentId } from "../fleet/paths.js";

interface BridgePairingCodeRecord {
  id: string;
  codeHash: string;
  createdTs: number;
  expiresTs: number;
  usedTs?: number;
  agentId: string;
  scopes: LeasePayload["scopes"];
  routeAllowlist: string[];
  modelAllowlist: string[];
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
}

interface BridgePairingStore {
  v: 1;
  updatedTs: number;
  codes: BridgePairingCodeRecord[];
}

function bridgePairingStorePath(workspace: string): string {
  return join(workspace, ".amc", "bridge", "pairing-codes.json");
}

function readBridgePairingStore(workspace: string): BridgePairingStore {
  const path = bridgePairingStorePath(workspace);
  if (!pathExists(path)) {
    return {
      v: 1,
      updatedTs: Date.now(),
      codes: []
    };
  }
  return JSON.parse(readUtf8(path)) as BridgePairingStore;
}

function writeBridgePairingStore(workspace: string, store: BridgePairingStore): void {
  const path = bridgePairingStorePath(workspace);
  ensureDir(join(workspace, ".amc", "bridge"));
  writeFileAtomic(path, JSON.stringify(store, null, 2), 0o600);
}

function cleanPairingStore(store: BridgePairingStore, now = Date.now()): BridgePairingStore {
  return {
    ...store,
    updatedTs: now,
    codes: store.codes.filter((row) => now <= row.expiresTs + 24 * 60 * 60_000)
  };
}

const PAIR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomPairBlock(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PAIR_ALPHABET[randomInt(0, PAIR_ALPHABET.length)] ?? "A";
  }
  return out;
}

function generatePairingCode(): string {
  return `AMC-${randomPairBlock(4)}-${randomPairBlock(4)}`;
}

export function createBridgePairingCode(params: {
  workspace: string;
  agentName: string;
  ttlMinutes: number;
  scopes?: LeasePayload["scopes"];
  routeAllowlist?: string[];
  modelAllowlist?: string[];
  maxRequestsPerMinute?: number;
  maxTokensPerMinute?: number;
}): {
  pairingId: string;
  code: string;
  agentId: string;
  expiresTs: number;
} {
  const now = Date.now();
  const ttlMs = Math.max(60_000, Math.trunc(params.ttlMinutes) * 60_000);
  const code = generatePairingCode();
  const store = cleanPairingStore(readBridgePairingStore(params.workspace), now);
  const agentId = normalizeAgentId(params.agentName);
  const record: BridgePairingCodeRecord = {
    id: `pair_${randomUUID().replace(/-/g, "")}`,
    codeHash: sha256Hex(code),
    createdTs: now,
    expiresTs: now + ttlMs,
    agentId,
    scopes: params.scopes ?? ["gateway:llm", "toolhub:intent", "toolhub:execute"],
    routeAllowlist: params.routeAllowlist ?? ["/openai", "/anthropic", "/gemini", "/grok", "/openrouter", "/local"],
    modelAllowlist: params.modelAllowlist ?? ["*"],
    maxRequestsPerMinute: Math.max(1, params.maxRequestsPerMinute ?? 60),
    maxTokensPerMinute: Math.max(128, params.maxTokensPerMinute ?? 200_000)
  };
  store.codes.push(record);
  writeBridgePairingStore(params.workspace, store);
  return {
    pairingId: record.id,
    code,
    agentId,
    expiresTs: record.expiresTs
  };
}

export function redeemBridgePairingCode(params: {
  workspace: string;
  code: string;
  leaseTtlMinutes?: number;
}): {
  ok: boolean;
  error?: string;
  lease?: string;
  payload?: LeasePayload;
  pairingId?: string;
} {
  const now = Date.now();
  const store = cleanPairingStore(readBridgePairingStore(params.workspace), now);
  const hash = sha256Hex(params.code.trim().toUpperCase());
  const record = store.codes.find((row) => row.codeHash === hash);
  if (!record) {
    writeBridgePairingStore(params.workspace, store);
    return { ok: false, error: "pairing code invalid" };
  }
  if (record.usedTs) {
    writeBridgePairingStore(params.workspace, store);
    return { ok: false, error: "pairing code already used" };
  }
  if (now > record.expiresTs) {
    writeBridgePairingStore(params.workspace, store);
    return { ok: false, error: "pairing code expired" };
  }
  record.usedTs = now;
  writeBridgePairingStore(params.workspace, store);

  const issued = issueLeaseToken({
    workspace: params.workspace,
    workspaceId: workspaceIdFromDirectory(params.workspace),
    agentId: record.agentId,
    ttlMs: Math.max(60_000, Math.trunc(params.leaseTtlMinutes ?? 60) * 60_000),
    scopes: record.scopes,
    routeAllowlist: record.routeAllowlist,
    modelAllowlist: record.modelAllowlist,
    maxRequestsPerMinute: record.maxRequestsPerMinute,
    maxTokensPerMinute: record.maxTokensPerMinute,
    maxCostUsdPerDay: null
  });

  return {
    ok: true,
    lease: issued.token,
    payload: issued.payload,
    pairingId: record.id
  };
}

export interface BridgeLeaseAuthResult {
  ok: boolean;
  status: number;
  error?: string;
  auditType?: string;
  leaseToken?: string;
  leaseCarrier?: LeaseCarrier | null;
  payload?: LeasePayload;
}

export function verifyBridgeLease(params: {
  workspace: string;
  requestUrl: URL;
  headers: Record<string, string | string[] | undefined>;
  expectedAgentId?: string;
  routePath?: string;
  model?: string | null;
  requiredScope?: LeaseScope;
}): BridgeLeaseAuthResult {
  const carrier = extractLeaseCarrier({
    headers: params.headers,
    url: params.requestUrl,
    allowQueryCarrier: false
  });
  if (!carrier.leaseToken) {
    return {
      ok: false,
      status: 401,
      error: "missing lease token",
      auditType: "LEASE_INVALID_OR_MISSING",
      leaseCarrier: carrier.leaseCarrier
    };
  }
  const revocation = verifyLeaseRevocationsSignature(params.workspace);
  if (!revocation.valid) {
    return {
      ok: false,
      status: 401,
      error: `lease revocation signature invalid: ${revocation.reason ?? "unknown"}`,
      auditType: "LEASE_INVALID_OR_MISSING",
      leaseCarrier: carrier.leaseCarrier
    };
  }
  const revokedLeaseIds = new Set(loadLeaseRevocations(params.workspace).revocations.map((row) => row.leaseId));
  const verification = verifyLeaseToken({
    workspace: params.workspace,
    token: carrier.leaseToken,
    expectedWorkspaceId: workspaceIdFromDirectory(params.workspace),
    expectedAgentId: params.expectedAgentId,
    requiredScope: params.requiredScope ?? "gateway:llm",
    routePath: params.routePath,
    model: params.model,
    revokedLeaseIds
  });
  if (!verification.ok || !verification.payload) {
    const error = verification.error ?? "lease verification failed";
    const status = error.includes("scope denied") ||
      error.includes("route denied") ||
      error.includes("model denied") ||
      error.includes("workspace mismatch") ||
      error.includes("agent mismatch")
      ? 403
      : 401;
    const auditType = error.includes("workspace mismatch")
      ? "LEASE_WORKSPACE_MISMATCH_ATTEMPT"
      : error.includes("agent mismatch")
        ? "LEASE_AGENT_MISMATCH"
        : error.includes("scope denied")
          ? "LEASE_SCOPE_DENIED"
          : error.includes("route denied")
            ? "LEASE_ROUTE_DENIED"
            : error.includes("model denied")
              ? "LEASE_MODEL_DENIED"
              : "LEASE_INVALID_OR_MISSING";
    return {
      ok: false,
      status,
      error,
      auditType,
      leaseCarrier: carrier.leaseCarrier
    };
  }
  return {
    ok: true,
    status: 200,
    leaseToken: carrier.leaseToken,
    leaseCarrier: carrier.leaseCarrier,
    payload: verification.payload
  };
}

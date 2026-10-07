import { randomUUID, timingSafeEqual } from "node:crypto";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { readUtf8 } from "../utils/fs.js";
import { unlockVault, vaultStatus, getVaultSecret, setVaultSecret } from "../vault/vault.js";
import { valueContractTemplate, valueContractSchema, type ValueContract } from "./valueContracts.js";
import { valuePolicySchema, defaultValuePolicy, type ValuePolicy } from "./valuePolicySchema.js";
import { valueWebhookPayloadSchema, valueEventSchema, type ValueEvent } from "./valueEventSchema.js";
import { assertNoSuspiciousStrings } from "./valueRedaction.js";
import {
  appendValueEvents,
  initValuePolicy,
  loadValueContract,
  loadValuePolicy,
  loadValueSchedulerState,
  loadValueSnapshot,
  saveValueContract,
  saveValuePolicy,
  saveValueSchedulerState,
  valuePolicyPath,
  verifyValueContractSignature,
  verifyValuePolicySignature,
  verifyValueSchedulerSignature
} from "./valueStore.js";
import { createValueReport, createValueSnapshot } from "./valueReports.js";

function scopeNormalized(scopeType: string | null | undefined, scopeId?: string | null): {
  type: "WORKSPACE" | "NODE" | "AGENT";
  id: string;
} {
  const typeRaw = String(scopeType ?? "WORKSPACE").toUpperCase();
  if (typeRaw === "AGENT") {
    return {
      type: "AGENT",
      id: (scopeId ?? "default").trim() || "default"
    };
  }
  if (typeRaw === "NODE") {
    return {
      type: "NODE",
      id: (scopeId ?? "default").trim() || "default"
    };
  }
  return {
    type: "WORKSPACE",
    id: "workspace"
  };
}

function scopeIdHash(scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }): string {
  return sha256Hex(`${scope.type}:${scope.id}`).slice(0, 16);
}

function ensureVaultReady(workspace: string): void {
  const status = vaultStatus(workspace);
  if (status.unlocked) {
    return;
  }
  const passphrase = process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) {
    throw new Error("vault is locked and AMC_VAULT_PASSPHRASE is not set");
  }
  unlockVault(workspace, passphrase);
}

function ensureValueWebhookSecret(workspace: string): string {
  ensureVaultReady(workspace);
  const existing = getVaultSecret(workspace, "value/webhook/token");
  if (existing && existing.length > 0) {
    return existing;
  }
  const generated = `vw_${randomUUID().replace(/-/g, "")}`;
  setVaultSecret(workspace, "value/webhook/token", generated);
  return generated;
}

export function verifyValueWebhookToken(workspace: string, provided: string | null | undefined): boolean {
  const token = (provided ?? "").trim();
  if (!token) {
    return false;
  }
  const expected = ensureValueWebhookSecret(workspace);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(token, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function valueInitForApi(workspace: string): {
  policy: ReturnType<typeof initValuePolicy>;
  workspaceContract: ReturnType<typeof saveValueContract>;
  scheduler: ReturnType<typeof saveValueSchedulerState>;
} {
  const policy = initValuePolicy(workspace);
  const workspaceContract = saveValueContract({
    workspace,
    contract: valueContractTemplate({
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      type: "other"
    })
  });
  const scheduler = saveValueSchedulerState(workspace, loadValueSchedulerState(workspace));
  ensureValueWebhookSecret(workspace);
  return {
    policy,
    workspaceContract,
    scheduler
  };
}

export function valuePolicyForApi(workspace: string): {
  policy: ValuePolicy;
  signature: ReturnType<typeof verifyValuePolicySignature>;
} {
  return {
    policy: loadValuePolicy(workspace),
    signature: verifyValuePolicySignature(workspace)
  };
}

export function valuePolicyApplyForApi(params: {
  workspace: string;
  policy: unknown;
}) {
  const parsed = valuePolicySchema.parse(params.policy);
  const saved = saveValuePolicy(params.workspace, parsed);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "VALUE_POLICY_APPLIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      id: "value-policy",
      sha256: sha256Hex(readUtf8(saved.path))
    }
  });
  return {
    ...saved,
    transparencyHash: entry.hash
  };
}

export function valueContractInitForApi(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  type: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
  deployment?: "single" | "host" | "k8s" | "compose";
}) {
  const contract = valueContractTemplate({
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    type: params.type,
    deployment: params.deployment
  });
  const saved = saveValueContract({
    workspace: params.workspace,
    contract,
    agentId: params.scopeType === "AGENT" ? params.scopeId : null
  });
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "VALUE_CONTRACT_APPLIED",
    agentId: params.scopeType === "AGENT" ? params.scopeId : "workspace",
    artifact: {
      kind: "policy",
      id: `${params.scopeType}:${params.scopeId}`,
      sha256: sha256Hex(Buffer.from(canonicalize(contract), "utf8"))
    }
  });
  return {
    contract,
    ...saved,
    transparencyHash: entry.hash
  };
}

export function valueContractForApi(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
}) {
  const contract = loadValueContract({
    workspace: params.workspace,
    agentId: params.scopeType === "AGENT" ? params.scopeId : null
  });
  const signature = verifyValueContractSignature({
    workspace: params.workspace,
    agentId: params.scopeType === "AGENT" ? params.scopeId : null
  });
  return {
    contract,
    signature
  };
}

export function valueContractApplyForApi(params: {
  workspace: string;
  contract: unknown;
  scopeType?: string | null;
  scopeId?: string | null;
}) {
  const parsed = valueContractSchema.parse(params.contract);
  const scope = scopeNormalized(params.scopeType ?? parsed.valueContract.scope.type, params.scopeId ?? parsed.valueContract.scope.id);
  const saved = saveValueContract({
    workspace: params.workspace,
    contract: parsed,
    agentId: scope.type === "AGENT" ? scope.id : null
  });
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "VALUE_CONTRACT_APPLIED",
    agentId: scope.type === "AGENT" ? scope.id : "workspace",
    artifact: {
      kind: "policy",
      id: `${scope.type}:${scope.id}`,
      sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8"))
    }
  });
  return {
    contract: parsed,
    ...saved,
    transparencyHash: entry.hash
  };
}

/**
 * Value events from a webhook, a file or an operator are SELF_REPORTED: a session or webhook token proves who sent them,
 * not that a third party vouches for them, and nothing verifies a signature here (P0-18 follow-up).
 */
const IMPORTED_VALUE_TRUST = "SELF_REPORTED" as const;

export function ingestValueWebhookForApi(params: {
  workspace: string;
  payload: unknown;
}) {
  const parsed = valueWebhookPayloadSchema.parse(params.payload);
  assertNoSuspiciousStrings(parsed, "value webhook payload");
  const scope = scopeNormalized(parsed.scope.type, parsed.scope.id);
  const idHash = scopeIdHash(scope);
  const sourceId = parsed.sourceId;

  const events: ValueEvent[] = parsed.events.map((row) =>
    valueEventSchema.parse({
      v: 1,
      eventId: `ve_${randomUUID().replace(/-/g, "")}`,
      ts: row.ts ?? Date.now(),
      scope: {
        type: scope.type,
        idHash
      },
      kpiId: row.kpiId,
      value: row.value,
      unit: row.unit ?? "unit",
      source: {
        sourceId,
        trustKind: IMPORTED_VALUE_TRUST,
        signatureValid: false
      },
      evidenceRefs: {},
      labels: row.labels ?? {}
    })
  );

  const saved = appendValueEvents(params.workspace, events);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "VALUE_EVENT_INGESTED",
    agentId: scope.type === "AGENT" ? scope.id : "workspace",
    artifact: {
      kind: "policy",
      id: sourceId,
      sha256: saved.sha256
    }
  });
  return {
    ingested: events.length,
    file: saved.path,
    sha256: saved.sha256,
    trustKind: IMPORTED_VALUE_TRUST,
    transparencyHash: entry.hash
  };
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((part) => part.trim());
}

export function importValueCsvForApi(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  kpiId: string;
  csvText: string;
}) {
  const scope = scopeNormalized(params.scopeType, params.scopeId);
  const idHash = scopeIdHash(scope);
  const lines = params.csvText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error("CSV is empty");
  }

  const events: ValueEvent[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const [tsRaw, valueRaw] = parseCsvLine(lines[index]!);
    const ts = Number(tsRaw);
    const value = Number(valueRaw);
    if (!Number.isFinite(ts) || !Number.isFinite(value)) {
      throw new Error(`CSV row ${index + 1} must be 'ts,value' numeric`);
    }
    events.push(
      valueEventSchema.parse({
        v: 1,
        eventId: `ve_${randomUUID().replace(/-/g, "")}`,
        ts: Math.trunc(ts),
        scope: {
          type: scope.type,
          idHash
        },
        kpiId: params.kpiId,
        value,
        unit: "unit",
        source: {
          sourceId: "csv.import",
          trustKind: IMPORTED_VALUE_TRUST,
          signatureValid: false
        },
        evidenceRefs: {},
        labels: {}
      })
    );
  }

  const saved = appendValueEvents(params.workspace, events);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "VALUE_EVENT_INGESTED",
    agentId: scope.type === "AGENT" ? scope.id : "workspace",
    artifact: {
      kind: "policy",
      id: "csv.import",
      sha256: saved.sha256
    }
  });
  return {
    ingested: events.length,
    file: saved.path,
    sha256: saved.sha256,
    transparencyHash: entry.hash,
    trustKind: IMPORTED_VALUE_TRUST
  };
}

export async function valueSnapshotLatestForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  windowDays?: number;
}) {
  const scope = scopeNormalized(params.scopeType, params.scopeId);
  const verify = verifyValuePolicySignature(params.workspace);
  const policy = loadValuePolicy(params.workspace);
  if (!verify.valid && policy.valuePolicy.enforceSignedInputs) {
    throw new Error(`VALUE_POLICY_UNTRUSTED:${verify.reason ?? "unknown"}`);
  }
  const latest = loadValueSnapshot(params.workspace, scope);
  if (latest) {
    return latest;
  }
  return (
    await createValueSnapshot({
      workspace: params.workspace,
      scopeType: scope.type,
      scopeId: scope.id,
      windowDays: params.windowDays
    })
  ).snapshot;
}

export async function valueReportForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  windowDays?: number;
}) {
  const scope = scopeNormalized(params.scopeType, params.scopeId);
  const verify = verifyValuePolicySignature(params.workspace);
  const policy = loadValuePolicy(params.workspace);
  if (!verify.valid && policy.valuePolicy.enforceSignedInputs) {
    throw new Error(`VALUE_POLICY_UNTRUSTED:${verify.reason ?? "unknown"}`);
  }
  return await createValueReport({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id,
    windowDays: params.windowDays
  });
}

export function valueSchedulerStatusForApi(workspace: string) {
  return {
    state: loadValueSchedulerState(workspace),
    signature: verifyValueSchedulerSignature(workspace)
  };
}

export async function valueSchedulerRunNowForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  windowDays?: number;
}) {
  const scope = scopeNormalized(params.scopeType, params.scopeId);
  const report = await createValueReport({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id,
    windowDays: params.windowDays
  });
  const current = loadValueSchedulerState(params.workspace);
  const policy = loadValuePolicy(params.workspace);
  const nowTs = Date.now();
  const next = {
    ...current,
    lastSnapshotTs: nowTs,
    nextSnapshotTs: nowTs + policy.valuePolicy.cadence.snapshotEveryHours * 60 * 60 * 1000,
    lastReportTs: nowTs,
    nextReportTs: nowTs + policy.valuePolicy.cadence.reportEveryHours * 60 * 60 * 1000,
    lastOutcome: {
      status: "OK" as const,
      reason: ""
    }
  };
  saveValueSchedulerState(params.workspace, next);
  return {
    report,
    scheduler: next
  };
}

export function valueSchedulerSetEnabledForApi(params: {
  workspace: string;
  enabled: boolean;
}) {
  const current = loadValueSchedulerState(params.workspace);
  const next = {
    ...current,
    enabled: params.enabled
  };
  const saved = saveValueSchedulerState(params.workspace, next);
  return {
    state: next,
    ...saved
  };
}

export function valueReadinessGate(workspace: string): {
  ok: boolean;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const policy = loadValuePolicy(workspace);
  const verify = verifyValuePolicySignature(workspace);
  if (!verify.valid && policy.valuePolicy.enforceSignedInputs) {
    reasons.push(`VALUE_POLICY_UNTRUSTED:${verify.reason ?? "unknown"}`);
  } else if (!verify.valid) {
    warnings.push(`VALUE_POLICY_UNTRUSTED:${verify.reason ?? "unknown"}`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
    warnings
  };
}

export function valuePolicyDefaultsForApi(): ValuePolicy {
  return defaultValuePolicy();
}

export function valuePolicyFileForApi(workspace: string): string {
  return valuePolicyPath(workspace);
}

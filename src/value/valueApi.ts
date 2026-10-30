import { randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningKey } from "../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { readUtf8 } from "../utils/fs.js";
import { unlockVault, vaultStatus, getVaultSecret, getVaultSecretReadOnly, setVaultSecret } from "../vault/vault.js";
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
  valuePolicyPath, valueEventsDir,
  verifyValueContractSignature,
  verifyValuePolicySignature,
  verifyValueSchedulerSignature
} from "./valueStore.js";
import { createValueReport, createValueReportRun, createValueSnapshot, ValueOutputsPartialError } from "./valueReports.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { captureOrgPairsAuthority, captureOrgPairs, assertOrgPairsCurrent, prepareOrgPairsAsync, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { pathExists } from "../utils/fs.js";
import { initValueFilesRunAsync, loadValuePolicyAsync, loadValuePolicyAttemptAsync, loadValuePolicyReadOnly, prepareValuePolicyAsync, prepareValueContractAsync, valueSchedulerPath } from "./valueStore.js";
import { valueSchedulerStateSchema } from "./valuePolicySchema.js";

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

function prepareValueWebhookInput(params: Parameters<typeof ingestValueWebhookForApi>[0]) {
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

  return { workspace: params.workspace, scope, events, sourceId };
}

export function ingestValueWebhookForApi(params: {
  workspace: string;
  payload: unknown;
}) {
  const { workspace, scope, events, sourceId } = prepareValueWebhookInput(params);
  const saved = appendValueEvents(workspace, events);
  const entry = appendTransparencyEntry({
    workspace,
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

function prepareValueCsvInput(params: Parameters<typeof importValueCsvForApi>[0]) {
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

  return { workspace: params.workspace, scope, events };
}

export function importValueCsvForApi(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  kpiId: string;
  csvText: string;
}) {
  const { workspace, scope, events } = prepareValueCsvInput(params);
  const saved = appendValueEvents(workspace, events);
  const entry = appendTransparencyEntry({
    workspace,
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
}, options: OrgPairsOptions = {}) {
  params = { ...params }; options = { ...options }; options.beforePublish?.();
  // Preserve the existing cached read: no signing/unlock gate when this call has no publication to perform.
  if (pathExists(valuePolicyPath(params.workspace))) {
    const policy = loadValuePolicyReadOnly(params.workspace), verify = verifyValuePolicySignature(params.workspace);
    if (!verify.valid && policy.valuePolicy.enforceSignedInputs) throw new Error(`VALUE_POLICY_UNTRUSTED:${verify.reason ?? "unknown"}`);
    const latest = loadValueSnapshot(params.workspace, scopeNormalized(params.scopeType, params.scopeId));
    if (latest !== null) return latest;
  }
  options = { ...options, beforePublish: captureOrgPairsAuthority(params.workspace, options.beforePublish) };
  const policyAttempt = await loadValuePolicyAttemptAsync(params.workspace, options);
  options = { ...options, beforePublish: policyAttempt.assertCurrent };
  const scope = scopeNormalized(params.scopeType, params.scopeId);
  const verify = verifyValuePolicySignature(params.workspace);
  const policy = loadValuePolicyReadOnly(params.workspace);
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
    }, options)
  ).snapshot;
}

export async function valueReportForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  windowDays?: number;
}, options: OrgPairsOptions = {}) {
  params = { ...params }; options = { ...options, beforePublish: captureOrgPairsAuthority(params.workspace, options.beforePublish) };
  const policyAttempt = await loadValuePolicyAttemptAsync(params.workspace, options);
  options = { ...options, beforePublish: policyAttempt.assertCurrent };
  const scope = scopeNormalized(params.scopeType, params.scopeId);
  const verify = verifyValuePolicySignature(params.workspace);
  const policy = loadValuePolicyReadOnly(params.workspace);
  if (!verify.valid && policy.valuePolicy.enforceSignedInputs) {
    throw new Error(`VALUE_POLICY_UNTRUSTED:${verify.reason ?? "unknown"}`);
  }
  return await createValueReport({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id,
    windowDays: params.windowDays
  }, options);
}

export function valueSchedulerStatusForApi(workspace: string) {
  return {
    state: loadValueSchedulerState(workspace),
    signature: verifyValueSchedulerSignature(workspace)
  };
}

export async function valueSchedulerRunNowRun(params: { workspace: string; scopeType?: string | null; scopeId?: string | null; windowDays?: number }, options: OrgPairsOptions = {}) {
  options = { ...options }; params = { ...params }; const initial = captureOrgPairsAuthority(params.workspace, options.beforePublish);
  const policyAttempt = await loadValuePolicyAttemptAsync(params.workspace, { beforePublish: initial }), beforePublish = policyAttempt.assertCurrent;
  const scope = scopeNormalized(params.scopeType, params.scopeId), reportAttempt = await createValueReportRun({ workspace: params.workspace,
    scopeType: scope.type, scopeId: scope.id, windowDays: params.windowDays }, { beforePublish, assertInputsCurrent: options.assertInputsCurrent });
  const report = reportAttempt.result;
  try {
    const previous = captureOrgPairs([valueSchedulerPath(params.workspace)]), current = loadValueSchedulerState(params.workspace);
    const policyPair = captureOrgPairs([valuePolicyPath(params.workspace)]), policy = loadValuePolicyReadOnly(params.workspace), nowTs = Date.now();
    assertOrgPairsCurrent(previous); assertOrgPairsCurrent(policyPair);
    const next = { ...current, lastSnapshotTs: nowTs, nextSnapshotTs: nowTs + policy.valuePolicy.cadence.snapshotEveryHours * 60 * 60 * 1000,
      lastReportTs: nowTs, nextReportTs: nowTs + policy.valuePolicy.cadence.reportEveryHours * 60 * 60 * 1000, lastOutcome: { status: "OK" as const, reason: "" } };
    const assertAuthorityCurrent = () => { beforePublish?.(); reportAttempt.assertCurrent(); assertOrgPairsCurrent(policyPair); };
    const prepared = await prepareOrgPairsAsync(params.workspace, [{ path: valueSchedulerPath(params.workspace), bytes: Buffer.from(JSON.stringify(valueSchedulerStateSchema.parse(next), null, 2)) }], {
      beforePublish: assertAuthorityCurrent,
      assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(policyPair); }
    }, previous);
    prepared.publish();
    return { result: { report, scheduler: next }, assertCurrent: prepared.assertCurrent, assertAuthorityCurrent };
  } catch (error) { throw new ValueOutputsPartialError([report.saved.path, report.saved.sigPath], "scheduler-after-report", error, [report.transparencyHash]); }
}
export async function valueSchedulerRunNowForApi(params: Parameters<typeof valueSchedulerRunNowRun>[0], options: OrgPairsOptions = {}) {
  return (await valueSchedulerRunNowRun(params, options)).result;
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
  const policy = pathExists(valuePolicyPath(workspace)) ? loadValuePolicy(workspace) : defaultValuePolicy();
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

export async function valueInitForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const original = captureOrgPairsAuthority(workspace, options.beforePublish);
  const attempt = await initValueFilesRunAsync(workspace, valueContractTemplate({ scopeType: "WORKSPACE", scopeId: "workspace", type: "other" }), { ...options, beforePublish: original }), saved = attempt.result;
  try { attempt.assertCurrent(); ensureValueWebhookSecret(workspace); return saved; }
  catch (error) { throw new ValueOutputsPartialError([saved.policy.path, saved.policy.sigPath, saved.workspaceContract.path, saved.workspaceContract.sigPath, saved.scheduler.path, saved.scheduler.sigPath], "webhook-secret-after-files", error); }
}
export async function valuePolicyForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  if (pathExists(valuePolicyPath(workspace))) return { policy: loadValuePolicyReadOnly(workspace), signature: verifyValuePolicySignature(workspace) };
  const original = captureOrgPairsAuthority(workspace, options.beforePublish);
  await loadValuePolicyAsync(workspace, { ...options, beforePublish: original }); original(); return { policy: loadValuePolicyReadOnly(workspace), signature: verifyValuePolicySignature(workspace) };
}
export async function valuePolicyApplyForApiAsync(params: { workspace: string; policy: unknown }, options: OrgPairsOptions = {}) {
  const workspace = params.workspace, policy = valuePolicySchema.parse(params.policy), prepared = await prepareValuePolicyAsync(workspace, policy, options), saved = prepared.publish();
  try { prepared.assertCurrent(); const entry = await appendTransparencyEntryAsync({ workspace, type: "VALUE_POLICY_APPLIED", agentId: "workspace",
    artifact: { kind: "policy", id: "value-policy", sha256: prepared.sha256 } }, { beforeCommit: prepared.assertCurrent });
    return { ...saved, transparencyHash: entry.hash };
  } catch (error) { throw new ValueOutputsPartialError([saved.path, saved.sigPath], "policy-transparency", error); }
}
export async function valueContractInitForApiAsync(params: Parameters<typeof valueContractInitForApi>[0], options: OrgPairsOptions = {}) {
  const own = { ...params }, contract = valueContractTemplate({ scopeType: own.scopeType, scopeId: own.scopeId, type: own.type, deployment: own.deployment });
  return valueContractApplyForApiAsync({ workspace: own.workspace, contract, scopeType: own.scopeType, scopeId: own.scopeId }, options);
}
export async function valueContractApplyForApiAsync(params: Parameters<typeof valueContractApplyForApi>[0], options: OrgPairsOptions = {}) {
  const workspace = params.workspace, parsed = valueContractSchema.parse(params.contract), scope = scopeNormalized(params.scopeType ?? parsed.valueContract.scope.type, params.scopeId ?? parsed.valueContract.scope.id);
  const prepared = await prepareValueContractAsync({ workspace, contract: parsed, agentId: scope.type === "AGENT" ? scope.id : null }, options), saved = prepared.publish();
  try { prepared.assertCurrent(); const entry = await appendTransparencyEntryAsync({ workspace, type: "VALUE_CONTRACT_APPLIED", agentId: scope.type === "AGENT" ? scope.id : "workspace",
    artifact: { kind: "policy", id: `${scope.type}:${scope.id}`, sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")) } }, { beforeCommit: prepared.assertCurrent });
    return { contract: parsed, ...saved, transparencyHash: entry.hash };
  } catch (error) { throw new ValueOutputsPartialError([saved.path, saved.sigPath], "contract-transparency", error); }
}
export async function valueSchedulerSetEnabledForApiAsync(params: { workspace: string; enabled: boolean }, options: OrgPairsOptions = {}) {
  const own = { ...params }, previous = captureOrgPairs([valueSchedulerPath(own.workspace)]), current = loadValueSchedulerState(own.workspace);
  assertOrgPairsCurrent(previous); const next = { ...current, enabled: own.enabled };
  const saved = (await prepareOrgPairsAsync(own.workspace, [{ path: valueSchedulerPath(own.workspace), bytes: Buffer.from(JSON.stringify(valueSchedulerStateSchema.parse(next), null, 2)) }], options, previous)).publish()[0]!;
  return { state: next, ...saved };
}

/** Negative gate for the already-authenticated webhook token; never creates or rotates a secret or unlocks the vault. */
export function assertValueWebhookTokenCurrent(workspace: string, provided: string): void {
  const token = provided.trim(), expected = getVaultSecretReadOnly(workspace, "value/webhook/token");
  if (!token || !expected) throw new Error("value webhook authority changed while signing");
  const left = Buffer.from(expected, "utf8"), right = Buffer.from(token, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("value webhook authority changed while signing");
}
function writtenValueEventPaths(workspace: string, events: readonly ValueEvent[]): string[] {
  // Both actual ingress parsers require non-empty events; appendValueEvents returned after writing both members of every month.
  return [...new Set(events.map(event => new Date(event.ts).toISOString().slice(0, 7)))].sort().flatMap(month => {
    const path = join(valueEventsDir(workspace), month, "events.ndjson"); return [path, `${path}.sha256`];
  });
}
/** The actual ingress suffix signs only these two existing workspace-log kinds, never a BUNDLE event signature. */
function captureValueIngestLogAuthority(workspace: string, callback?: () => void): () => void {
  const actor = callback; actor?.();
  const descriptors = (["TRANSPARENCY_ROOT", "MERKLE_ROOT"] as const).map(kind => Object.freeze({ ...describePolicySigner(workspace, kind) }));
  const purpose = descriptors.some(row => row.mode === "VAULT") ? capturePurposePublication(workspace, "artifact-seal") : null;
  const keyset = canonicalize(assertKeysetComplete(workspace)), trust = canonicalize(loadTrustConfig(workspace));
  const holder = purpose === null ? null : boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file";
  const current = () => {
    actor?.(); for (const descriptor of descriptors) assertPolicySignerCurrent(workspace, descriptor);
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(loadTrustConfig(workspace)) !== trust)
      throw new Error("original value ingress log authority changed while signing");
    if (purpose !== null && holder !== null) {
      const committed = assertKeysetComplete(workspace), policy = keyPolicy(loadKeysConfig(workspace));
      if (committed === null || canonicalize(committed) !== purpose.keyset || (holder === "file" && policy.requireNonExportable))
        throw new Error("original value ingress purpose is refused");
      for (const descriptor of descriptors.filter(row => row.mode === "VAULT")) {
        if (!policy.allowed.includes(descriptor.algorithm)) throw new Error("current key policy refuses original value ingress authority");
        assertSigningKeyUsable(workspace, "artifact-seal", descriptor.publicKeyPem, holder);
        if (holder === "file") {
          if (!vaultStatus(workspace).unlocked) throw new Error("value ingress vault is locked; unlock before publication");
          if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== descriptor.publicKeyPem) throw new Error("value ingress vault purpose changed");
        }
      }
    }
  };
  current(); return current;
}
export async function ingestValueWebhookForApiAsync(params: Parameters<typeof ingestValueWebhookForApi>[0], options: OrgPairsOptions = {}) {
  const { workspace, scope, events, sourceId } = prepareValueWebhookInput(params), original = captureValueIngestLogAuthority(workspace, options.beforePublish);
  original(); const saved = appendValueEvents(workspace, events), published = writtenValueEventPaths(workspace, events);
  try {
    original(); const entry = await appendTransparencyEntryAsync({ workspace, type: "VALUE_EVENT_INGESTED", agentId: scope.type === "AGENT" ? scope.id : "workspace",
      artifact: { kind: "policy", id: sourceId, sha256: saved.sha256 } }, { beforeCommit: original });
    return { ingested: events.length, file: saved.path, sha256: saved.sha256, trustKind: IMPORTED_VALUE_TRUST, transparencyHash: entry.hash };
  } catch (error) { throw new ValueOutputsPartialError(published, "webhook-transparency-after-events", error); }
}
export async function importValueCsvForApiAsync(params: Parameters<typeof importValueCsvForApi>[0], options: OrgPairsOptions = {}) {
  const { workspace, scope, events } = prepareValueCsvInput(params), original = captureValueIngestLogAuthority(workspace, options.beforePublish);
  original(); const saved = appendValueEvents(workspace, events), published = writtenValueEventPaths(workspace, events);
  try {
    original(); const entry = await appendTransparencyEntryAsync({ workspace, type: "VALUE_EVENT_INGESTED", agentId: scope.type === "AGENT" ? scope.id : "workspace",
      artifact: { kind: "policy", id: "csv.import", sha256: saved.sha256 } }, { beforeCommit: original });
    return { ingested: events.length, file: saved.path, sha256: saved.sha256, transparencyHash: entry.hash, trustKind: IMPORTED_VALUE_TRUST };
  } catch (error) { throw new ValueOutputsPartialError(published, "csv-transparency-after-events", error); }
}

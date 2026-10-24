import { captureAuditOutputAliases } from "./binderOutputAliases.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { captureOrgFiles, captureOrgPairsAuthority, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { sha256Hex } from "../utils/hash.js";
import { loadAuditSchedulerState, auditSchedulerPath } from "./auditPolicyStore.js";
import { defaultAuditSchedulerState, type AuditSchedulerState } from "./auditPolicySchema.js";
import { binderCachePath, prepareBinderCacheAsync } from "./binderStore.js";
import { prepareAuditSchedulerState } from "./binderStatePublication.js";
import { captureAuditBinderPolicies, prepareAuditBinderCollection } from "./binderCollectionPlan.js";
import { publishAuditFiles, AuditBinderPublicationError, type AuditPublicationOptions } from "./binderPublication.js";
import type { EvidenceRequest } from "./evidenceRequestSchema.js";

function state(workspace: string) { try { return loadAuditSchedulerState(workspace); } catch { return defaultAuditSchedulerState(); } }
export async function auditSchedulerSetEnabledAsync(params: { workspace: string; enabled: boolean }, options: AuditPublicationOptions = {}) {
  options = { ...options };
  const workspace = params.workspace, enabled = params.enabled, actor = options.beforePublish; actor?.();
  const original = captureOrgPairsAuthority(workspace);
  const path = auditSchedulerPath(workspace), before = captureOrgFiles([path, `${path}.sig`]), next = { ...state(workspace), enabled };
  const inputs = () => { options.assertInputsCurrent?.(); };
  const preparation = () => { options.assertPreparationInputsCurrent?.(); assertOrgPairsCurrent(before); };
  const prepared = await prepareAuditSchedulerState(workspace, next, { beforePublish: () => { actor?.(); original(); }, assertInputsCurrent: inputs, assertPreparationInputsCurrent: preparation, assertOutputsSafe: options.assertOutputsSafe }, before);
  return { state: next, ...prepared.publish() };
}
async function publishAuditSchedulerRunOwned(input: { workspace: string; scopeType?: "WORKSPACE" | "NODE" | "AGENT"; scopeId?: string; request?: EvidenceRequest | null }, options: AuditPublicationOptions = {}) {
  options = { ...options };
  const params = structuredClone(input), workspace = params.workspace, scopeType = params.scopeType ?? "WORKSPACE";
  const scopeId = scopeType === "WORKSPACE" ? "workspace" : (params.scopeId?.trim() || "default");
  const actor = options.beforePublish; actor?.();
  const bundle = captureOrgPairsAuthority(workspace), log = captureWorkspaceLogAuthority(workspace);
  const policies = captureAuditBinderPolicies(workspace, false), original = () => { bundle(); log.assertCurrent(); policies.assertCurrent(); };
  const cachePath = binderCachePath(workspace, scopeType, scopeId), schedulerPath = auditSchedulerPath(workspace);
  const targets = captureOrgFiles([cachePath, `${cachePath}.sig`, schedulerPath, `${schedulerPath}.sig`]), current = state(workspace);
  const collection = prepareAuditBinderCollection({ workspace, scope: { type: scopeType, id: scopeId }, policy: policies.policy, map: policies.map, request: params.request ?? null }, original, false);
  const destinations = Object.freeze(targets.members.map(row => row.path)), aliases = captureAuditOutputAliases(destinations, [...policies.inputPaths, ...collection.inputPaths]);
  const publicationInputs = () => { actor?.(); options.assertInputsCurrent?.(); options.assertOutputsSafe?.(destinations); aliases(); original(); collection.assertCurrent(); };
  const inputs = () => { options.assertPreparationInputsCurrent?.(); publicationInputs(); assertOrgPairsCurrent(targets); };
  inputs();
  let phase = "collection", paths: readonly string[] = []; const logs: string[] = [];
  try {
    const collected = await collection.collect(); phase = "cache-signature";
    const cache = await prepareBinderCacheAsync({ workspace, scopeType, scopeId, binder: collected.binder }, { beforePublish: original, assertInputsCurrent: inputs }, targets);
    // Retain the old selected clock boundary: after the real cache Sign, before preparing scheduler state.
    const nowTs = Date.now(), next: AuditSchedulerState = { enabled: current.enabled, lastRefreshTs: nowTs,
      nextRefreshTs: nowTs + Math.max(1, policies.policy.auditPolicy.recurrence.refreshCadenceHours) * 60 * 60 * 1000, lastOutcome: { status: "OK", reason: "" } };
    const beforeState = () => { inputs(); cache.assertCurrent(); };
    phase = "state-signature";
    const scheduler = await prepareAuditSchedulerState(workspace, next, { beforePublish: original, assertInputsCurrent: beforeState }, targets);
    const writes = [...cache.writes, ...scheduler.writes]; phase = "files";
    const files = publishAuditFiles(workspace, writes, targets, () => { publicationInputs(); cache.assertCurrent(); scheduler.assertCurrent(); }, inputs); paths = files.publishedPaths;
    const assertPublished = files.assertCurrent;
    const continuation = () => { actor?.(); options.assertInputsCurrent?.(); options.assertOutputsSafe?.(destinations); aliases(); original(); cache.assertCurrent(); scheduler.assertCurrent(); assertPublished(); };
    phase = "created-log";
    const entry = await appendTransparencyEntryAsync({ workspace, type: "AUDIT_BINDER_CREATED", agentId: scopeType === "AGENT" ? scopeId : "workspace",
      artifact: { kind: "policy", sha256: sha256Hex(cache.writes[0]!.bytes), id: collected.binder.binderId } }, { beforeCommit: continuation }); logs.push(entry.hash);
    continuation(); return { binder: collected.binder, cache: { path: cache.path, sigPath: cache.sigPath }, scheduler: next, transparencyHash: entry.hash };
  } catch (cause) { if (paths.length === 0 && logs.length === 0 && (cause instanceof KeyProviderError || cause instanceof KeyRevokedError)) throw cause;
    if (cause instanceof AuditBinderPublicationError) paths = cause.publishedPaths;
    throw new AuditBinderPublicationError(phase, paths, Object.freeze([...logs]), cause, cause instanceof AuditBinderPublicationError ? cause.attemptedPath : null); }
}

export async function publishAuditSchedulerRun(input: Parameters<typeof publishAuditSchedulerRunOwned>[0], options: AuditPublicationOptions = {}) {
  try { return await publishAuditSchedulerRunOwned(input, options); }
  catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("prepare", [], [], cause); }
}

/**
 * Activate's rollback (P1-62 slice B; design §10.4 Rollback). An owner previews the rollback of a release and opens its
 * effect gate `a4.activate.rollback` (DEPLOY, a separately decided engine request whose intent binds the preview), on
 * the release's own direction gate so A4's separation of duties applies to its approvers. Confirming names the exact
 * release and Enforce manifest the preview bound; then, after the grant is verified and consumed as step 0: an incident
 * freeze first for a high or critical risk tier, `restoreEnforceResourceSnapshot({ apply: true, confirmManifestId })`
 * (signed restore and lifecycle-rollback receipts), every lease of the release revoked, the prepared operator commands,
 * the signed `a4-rollback-receipt`, and ROLLBACK, then the automatic hold. The lifecycle is never moved backwards, no
 * runtime-run event is appended (no run of the deployed runtime was observed), and `deployed_release_id` moves only
 * when the operator records the rollback row (src/a4/a4Deploy.ts). A rollback is allowed on a held or frozen project:
 * it is the remedy; every other check still applies.
 */
import { join, dirname, relative, sep } from "node:path";
import { z } from "zod";
import { approvalRequestBindingDigest, loadApprovalConsumed, loadApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { consumeApprovedExecution, createApprovalForIntent } from "../approvals/approvalEngine.js";
import { getPrivateKeyPem } from "../crypto/keys.js";
import { activeFreezeStatus, createFreezeIncident } from "../drift/freezeEngine.js";
import { latestEnforceResourceManifestPath, restoreEnforceResourceSnapshot } from "../enforce/resourceManifest.js";
import { revokedLeaseIdSet, revokeLease } from "../leases/leaseStore.js";
import { assertOwnerMode } from "../mode/mode.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { mintedLeases } from "./a4Deploy.js";
import { verifyAndConsumeEffect, type A4EffectDef } from "./a4Effects.js";
import { assertAllowed, autoHold, engineRiskTier, evaluateFor, gateRowOf, livePrincipal, loadA4State, signedA4Floor, type A4Call } from "./a4Gates.js";
import { writeReleaseRecord } from "./a4Package.js";
import { isRegulated, type A4GateRow, type A4ReadinessState } from "./a4Readiness.js";
import { a4ReleaseV1Schema, a4RollbackReceiptV1Schema, type A4ChainLink } from "./a4Schema.js";
import { A4StoreError, type A4Store, type A4TransitionResult } from "./a4Store.js";
import { ROLLBACK_EFFECT_ID } from "./spec/activate.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const FROZEN_CLASSES: ActionClass[] = ["WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"];
const base = { environment: z.enum(["staging", "production"]), expectedHeadSeq: z.number().int().min(0), clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) };
export const rollbackPreviewSchema = z.strictObject(base);
export const rollbackSchema = z.strictObject({ ...base, reason: z.string().trim().min(1).max(2000),
  toReleaseId: z.string().regex(/^a4r_[0-9a-f]{32}$/).nullable(), confirmManifestId: z.string().regex(/^enforce-resources-[0-9a-f]{16}$/).nullable() });

/** A rollback may run on a held or frozen project (it is the remedy); every other refusal of `rollback` stands. */
function rollbackState(store: A4Store, projectId: string, input: A4Call, expectedHeadSeq: number, now: number): { state: A4ReadinessState; principal: ReturnType<typeof livePrincipal> } {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 rollback");
  const state = loadA4State(store, projectId, now);
  const stage = state.project.stage === "retired" ? "activate" : state.project.stage;
  assertAllowed(evaluateFor(store, state, principal, input, stage, now).readiness, "rollback", ["ON_HOLD", "FREEZE_ACTIVE"]);
  if (state.project.head_seq !== expectedHeadSeq) throw fail(409, "A4_STALE_HEAD", "The project moved; reload and retry.", { headSeq: state.project.head_seq });
  return { state, principal };
}

/** The release's RELEASE link and the direction gate whose consumed effect built it (the gate a rollback's effect is opened on). */
function releaseAndGate(state: A4ReadinessState, releaseId: string): { release: A4ChainLink; gate: A4GateRow } {
  const release = state.chain.find((link) => link.kind === "RELEASE" && link.body.releaseId === releaseId);
  if (release === undefined) throw fail(404, "A4_RELEASE_NOT_FOUND", `no release ${releaseId} on this project`);
  const started = state.chain.find((link) => link.kind === "EFFECT_STARTED" && link.body.executionId === release.body.executionId);
  return { release, gate: gateRowOf(state, String(started?.body.gateId)) };
}

/** What a rollback of `releaseId` would do now (design §10.4 Rollback preview); the engine request binds its digest. */
function previewOf(store: A4Store, state: A4ReadinessState, releaseId: string, environment: string): Record<string, unknown> {
  const { release } = releaseAndGate(state, releaseId);
  if (state.chain.some((link) => link.kind === "ROLLBACK" && link.body.releaseId === releaseId)) throw fail(409, "ROLLBACK_RECORDED", `release ${releaseId} was already rolled back`);
  const toReleaseId = typeof release.body.previousReleaseId === "string" ? release.body.previousReleaseId : null;
  const to = toReleaseId === null ? undefined : state.chain.find((link) => link.kind === "RELEASE" && link.body.releaseId === toReleaseId);
  const confirmManifestId = typeof to?.body.enforceManifestId === "string" ? to.body.enforceManifestId : null;
  const minted = mintedLeases(state.chain, releaseId);
  const row = store.snapshot(state.project.project_id).rows.a4_releases.find((candidate) => candidate.release_id === releaseId);
  const record = row === undefined ? null : a4ReleaseV1Schema.parse({ ...JSON.parse(String(row.surfaces_json)) as Record<string, unknown>, envelope: JSON.parse(String(row.envelope_json)) });
  let restore: Record<string, unknown> = { manifestId: null, entries: 0, note: "no earlier release: nothing to restore" };
  if (confirmManifestId !== null) {
    try {
      const plan = restoreEnforceResourceSnapshot({ workspace: store.workspace, agentId: state.project.agent_id, manifestPath: snapshotPath(store.workspace, state.project.agent_id, confirmManifestId) });
      restore = { manifestId: plan.targetManifestId, baselineManifestId: plan.baselineManifestId, entries: plan.entries.length };
    } catch (error) {
      throw fail(409, (error as { code?: unknown }).code === undefined ? "ROLLBACK_PREVIEW_FAILED" : String((error as { code: unknown }).code),
        `the Enforce restore cannot be planned: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`);
    }
  }
  return { schema: "amc.a4-rollback-preview/v1", releaseId, toReleaseId, confirmManifestId, environment, target: release.body.target,
    leaseIds: [...minted.staging, ...(minted.production === null ? [] : [minted.production])], preparedCommands: record?.rollback.preparedCommands ?? [],
    restore, freezeFirst: ["high", "critical"].includes(engineRiskTier(state)),
    lifecycle: "never moved backwards; deployed_release_id moves when the operator records the rollback row" };
}
const snapshotPath = (workspace: string, agentId: string, manifestId: string): string =>
  join(dirname(latestEnforceResourceManifestPath(workspace, agentId)), "snapshots", `${manifestId}.json`);
/** The effect as verifyAndConsumeEffect reads it: the intent the opened engine request bound. */
const effectDef = (intent: Record<string, unknown>): A4EffectDef => ({ id: ROLLBACK_EFFECT_ID, toolName: "a4.activate.rollback", actionClass: "DEPLOY", consumes: "A4",
  executionId: () => `a4-rollback-${String(intent.releaseId)}`, intent: () => intent, run: async () => ({}) });

/**
 * POST …/releases/:rid/rollback/preview (owner): the preview and its DEPLOY engine request (two distinct approvers when
 * regulated), recorded as EFFECT_GATE_OPENED on the release's direction gate. Approvers decide it through
 * POST …/approvals/:id/approve under A4's separation of duties.
 */
export function previewRollback(store: A4Store, projectId: string, releaseId: string, input: A4Call & { body: z.infer<typeof rollbackPreviewSchema> }):
  { result: A4TransitionResult; preview: Record<string, unknown>; approvalRequestId: string } {
  const now = Date.now();
  const { state, principal } = rollbackState(store, projectId, input, input.body.expectedHeadSeq, now);
  const preview = previewOf(store, state, releaseId, input.body.environment);
  const { gate } = releaseAndGate(state, releaseId);
  const intent = { schema: "amc.a4-rollback-intent/v1", projectId, releaseId, previewSha256: sha256Hex(canonicalize(preview)), toReleaseId: preview.toReleaseId,
    confirmManifestId: preview.confirmManifestId, environment: input.body.environment };
  const regulated = isRegulated(state, signedA4Floor(store.workspace));
  const approvalRequestId = createApprovalForIntent({ workspace: store.workspace, agentId: state.project.agent_id, intentId: `a4-${projectId}-rollback-${releaseId}`,
    toolName: "a4.activate.rollback", actionClass: "DEPLOY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: engineRiskTier(state), intentPayload: intent,
    quorumFloor: regulated ? { requiredApprovals: 2, requireDistinctUsers: true } : undefined }).approval.approvalRequestId;
  const requestDigestSha256 = approvalRequestBindingDigest(loadApprovalRequestRecord({ workspace: store.workspace, agentId: state.project.agent_id, approvalRequestId,
    requireValidSignature: true }));
  const result = store.transition(projectId, principal, () => ({ kind: "EFFECT_GATE_OPENED", stage: state.project.stage, revisionNo: gate.revision_no,
    payload: { gateId: gate.gate_id, effect: ROLLBACK_EFFECT_ID, approvalRequestId, requestDigestSha256, intentHash: sha256Hex(canonicalize(intent)), intent, preview } }),
  { expectedHeadSeq: input.body.expectedHeadSeq, request: input.request, response: { approvalRequestId, requestDigestSha256 } });
  return { result, preview, approvalRequestId };
}

/**
 * POST …/releases/:rid/rollback (owner): the exact-id confirmation of the opened preview, then the effect. Each step that
 * fails answers its code and records nothing; a retry with the same grant re-runs (the grant is consumed by this
 * execution, the restore and the revocations are idempotent) until ROLLBACK is recorded once.
 */
export function rollbackRelease(store: A4Store, projectId: string, releaseId: string, input: A4Call & { body: z.infer<typeof rollbackSchema> }):
  { result: A4TransitionResult; rollbackId: string; receiptPath: string; leaseIdsRevoked: string[]; preparedCommands: string[]; frozen: string | null } {
  const { body } = input;
  const now = Date.now();
  const { state, principal } = rollbackState(store, projectId, input, body.expectedHeadSeq, now);
  const opened = [...state.chain].reverse().find((link) => link.kind === "EFFECT_GATE_OPENED" && link.body.effect === ROLLBACK_EFFECT_ID
    && (link.body.intent as { releaseId?: unknown } | undefined)?.releaseId === releaseId);
  if (opened === undefined) throw fail(409, "EFFECT_GATE_NOT_OPEN", "Preview the rollback first; its engine request is decided separately.");
  const intent = opened.body.intent as Record<string, unknown>;
  const preview = opened.body.preview as { leaseIds: string[]; preparedCommands: string[]; target: string; restore: Record<string, unknown> };
  if (intent.toReleaseId !== body.toReleaseId || intent.confirmManifestId !== body.confirmManifestId || intent.environment !== body.environment) {
    throw fail(409, "ROLLBACK_CONFIRMATION_REQUIRED", "Confirm the exact release, Enforce manifest and environment the preview bound.",
      { toReleaseId: intent.toReleaseId, confirmManifestId: intent.confirmManifestId, environment: intent.environment });
  }
  if (state.chain.some((link) => link.kind === "ROLLBACK" && link.body.releaseId === releaseId)) throw fail(409, "ROLLBACK_RECORDED", `release ${releaseId} was already rolled back`);
  const { gate } = releaseAndGate(state, releaseId);
  const approvalRequestId = String(opened.body.approvalRequestId);
  const def = effectDef(intent);
  const executionId = def.executionId(state, gate);
  verifyAndConsumeEffect(store, state, { def, gate, approvalRequestId, callerKey: principal.key, regulated: isRegulated(state, signedA4Floor(store.workspace)) });
  // Signing keys first: every later step signs, and none may run when the record of it could not be written.
  try {
    getPrivateKeyPem(store.workspace, "auditor");
  } catch {
    throw fail(423, "A4_VAULT_LOCKED", "Unlock the vault to roll back: every step signs a receipt.");
  }
  // Step 0: the engine grant, consumed by this execution (a replay by it is this rollback's own retry).
  const grant = consumeApprovedExecution({ workspace: store.workspace, approvalId: approvalRequestId, expectedAgentId: state.project.agent_id, executionId });
  if (grant.replay && loadApprovalConsumed({ workspace: store.workspace, agentId: state.project.agent_id, approvalRequestId })?.executionId !== executionId) {
    throw fail(409, "GRANT_ALREADY_USED", "The rollback's engine grant was consumed by another execution.");
  }
  const agentId = state.project.agent_id;
  // Freeze first for a high or critical tier; a retry reuses the freeze its earlier attempt raised.
  const active = (() => {
    try {
      return activeFreezeStatus(store.workspace, agentId);
    } catch {
      return { active: false, incidentIds: [] as string[] }; // unreadable: raise a fresh freeze rather than trust none
    }
  })();
  const frozen = !["high", "critical"].includes(engineRiskTier(state)) ? null : active.active ? active.incidentIds[0] ?? null
    : createFreezeIncident({ workspace: store.workspace, agentId, ruleId: "a4-rollback", previousRunId: releaseId, currentRunId: body.toReleaseId ?? "none",
      deltas: { overallDrop: 0, integrityDrop: 0, correlationDrop: 0, maxLayerDrop: 0 }, actionClasses: FROZEN_CLASSES, reason: `A4 rollback of ${releaseId}: ${body.reason}` }).incidentId;
  let restoreReceipt: string | null = null;
  if (body.confirmManifestId !== null) {
    try {
      const restored = restoreEnforceResourceSnapshot({ workspace: store.workspace, agentId, manifestPath: snapshotPath(store.workspace, agentId, body.confirmManifestId),
        apply: true, confirmManifestId: body.confirmManifestId });
      restoreReceipt = restored.receiptPath === null ? null : relative(store.workspace, restored.receiptPath).split(sep).join("/");
    } catch (error) {
      throw fail(409, "ROLLBACK_RESTORE_FAILED", (error instanceof Error ? error.message : String(error)).slice(0, 300), { frozen });
    }
  }
  const revoked = (() => {
    try {
      return revokedLeaseIdSet(store.workspace);
    } catch {
      return new Set<string>();
    }
  })();
  for (const leaseId of preview.leaseIds.filter((id) => !revoked.has(id))) {
    try {
      revokeLease(store.workspace, leaseId, `A4 rollback of release ${releaseId}`);
    } catch (error) {
      throw fail(409, "LEASE_REVOKE_FAILED", `${leaseId}: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`, { frozen, restoreReceipt });
    }
  }
  const rollbackId = `a4rb_${sha256Hex(`${approvalRequestId}:${executionId}`).slice(0, 32)}`;
  const doc = a4RollbackReceiptV1Schema.parse({ schema: "amc.a4-rollback-receipt/v1", rollbackId, releaseId, toReleaseId: body.toReleaseId, projectId,
    environment: body.environment, target: preview.target, enforceManifestId: body.confirmManifestId, preparedCommands: preview.preparedCommands,
    leaseIdsRevoked: preview.leaseIds, receiptSha256: sha256Hex(canonicalize({ restoreReceipt, leaseIdsRevoked: preview.leaseIds, frozen })),
    // AMC's own steps (restore, revocations) completed; what the operator then ran is the rollback row they record.
    recordedStatus: "succeeded", amcCheckStatus: "not_evaluated", recordedByKey: principal.key, claimKind: "self_reported", ts: now });
  const file = writeReleaseRecord(store.workspace, projectId, "rollbacks", releaseId, rollbackId, doc, "a4-rollback-receipt");
  // Recorded on any head: the steps above ran, so their record must land (a duplicate for this grant is refused). ROLLBACK
  // carries the store's own A4_RECORD envelope; a notary that cannot sign it is NOTARY_UNREACHABLE, and a retry records it.
  const result = notaryCoded(() => store.transition(projectId, principal, ({ head, seq, ts }) => {
    if (store.readChain(projectId).some((link) => link.kind === "ROLLBACK" && link.body.releaseId === releaseId)) {
      throw fail(409, "ROLLBACK_RECORDED", `release ${releaseId} was already rolled back`);
    }
    return { kind: "ROLLBACK", stage: head!.stage, payload: { rollbackId, releaseId, toReleaseId: body.toReleaseId, environment: body.environment, approvalRequestId,
      executionId, receiptPath: file.path, receiptFileSha256: file.sha256, enforceManifestId: body.confirmManifestId, restoreReceiptPath: restoreReceipt,
      leaseIdsRevoked: preview.leaseIds, freezeIncidentId: frozen, reason: body.reason, lifecycle: "not moved (never backwards)",
      runtimeRunEvent: "not appended: no run of the deployed runtime was observed", claimKind: "self_reported" },
    sideRows: [{ table: "a4_evidence_refs", values: { project_id: projectId, seq, revision_no: head!.revision_no, stage: head!.stage,
      lane: "implementation", ref_kind: "rollback_receipt", ref_id: file.path, sha256: file.sha256, claim_kind: "self_reported", trust_tier: null, method: null,
      label: `rollback ${rollbackId} of ${releaseId}: AMC restored and revoked; the operator's run is their rollback row (self_reported)`, actor_key: principal.key, ts } }] };
  }, { request: input.request, response: { rollbackId, receiptPath: file.path } }));
  if (frozen !== null && !result.replay) autoHold(store, projectId, [frozen]);
  return { result, rollbackId, receiptPath: file.path, leaseIdsRevoked: preview.leaseIds, preparedCommands: preview.preparedCommands, frozen };
}

/** A store write whose envelope a notary could not sign answers 409 NOTARY_UNREACHABLE (as governed writes do), never a 500. */
function notaryCoded<T>(write: () => T): T {
  try {
    return write();
  } catch (error) {
    if (error instanceof A4StoreError && error.code === "A4_SIGNING_UNAVAILABLE") {
      throw fail(409, "NOTARY_UNREACHABLE", "The record could not be signed; retry once the notary answers.");
    }
    throw error;
  }
}

/** The release's rollbacks as the chain records them (AMC's side; the operator's rollback rows are its deployments). */
export const rollbackViews = (chain: readonly A4ChainLink[], releaseId: string): Array<Record<string, unknown>> =>
  chain.filter((link) => link.kind === "ROLLBACK" && link.body.releaseId === releaseId).map((link) => ({ rollbackId: link.body.rollbackId,
    toReleaseId: link.body.toReleaseId, environment: link.body.environment, receiptPath: link.body.receiptPath, enforceManifestId: link.body.enforceManifestId,
    leaseIdsRevoked: link.body.leaseIdsRevoked, freezeIncidentId: link.body.freezeIncidentId, lifecycle: link.body.lifecycle, claimKind: "self_reported" }));

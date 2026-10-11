/**
 * Activate's rollback (P1-62 slice B; design §10.4 Rollback). An owner previews the rollback of a release and opens its
 * effect gate `a4.activate.rollback` (DEPLOY, a separately decided engine request whose intent binds the preview), on
 * the release's own direction gate so A4's separation of duties applies to its approvers. Confirming names the exact
 * release and Enforce manifest the preview bound and journals the attempt (EFFECT_STARTED); then, after the grant is
 * consumed as step 0: an incident freeze first for a high or critical risk tier, `restoreEnforceResourceSnapshot({ apply:
 * true, confirmManifestId })` (signed restore and lifecycle-rollback receipts), every lease of the release revoked (read
 * again at execution), the prepared operator commands, the signed `a4-rollback-receipt`, and ROLLBACK with EFFECT_FINISHED,
 * then the automatic hold. The lifecycle is never moved backwards, no
 * runtime-run event is appended (no run of the deployed runtime was observed), and `deployed_release_id` moves only
 * when the operator records the rollback row (src/a4/a4Deploy.ts). A rollback is allowed on a held or frozen project:
 * it is the remedy; every other check still applies.
 */
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { join, dirname, relative, sep } from "node:path";
import { z } from "zod";
import { DEFAULT_ACTION_STALE_AFTER_MS } from "../actions/actionRecovery.js";
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
import { settleEffect, sweepA4Effects, verifyAndConsumeEffect, type A4EffectDef } from "./a4Effects.js";
import { A4_RUNTIME, assertAllowed, autoHold, engineRiskTier, evaluateFor, gateRowOf, livePrincipal, loadA4State, pendingExecutors, signedA4Floor, type A4Call } from "./a4Gates.js";
import { journaledLeaseIds, writeReleaseRecord } from "./a4Package.js";
import { isRegulated, type A4GateRow, type A4ReadinessState } from "./a4Readiness.js";
import { a4ReleaseV1Schema, a4RollbackReceiptV1Schema, type A4ChainLink } from "./a4Schema.js";
import { A4StoreError, type A4Store, type A4TransitionResult } from "./a4Store.js";
import { effectUnsettled, PRODUCTION_LEASE_EFFECT_ID, ROLLBACK_EFFECT_ID, rollbackExecutionId } from "./spec/activate.js";

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
  executionId: () => rollbackExecutionId(String(intent.releaseId)), intent: () => intent, run: async () => ({}) });

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
 * POST …/releases/:rid/rollback (owner): the exact-id confirmation of the opened preview, then the effect, journaled as
 * every A4 effect is (plan §7 rule 9). The checks run on rows read now (a lost earlier attempt, and a lost production-lease
 * effect, settled first as process_lost); the grant's quorum is verified only while it is unconsumed (one this rollback's
 * own execution consumed already proved it, as retryEffect treats it; one another execution consumed is GRANT_ALREADY_USED);
 * EFFECT_STARTED (owner pid and host, heartbeat) and its liveness row commit pinned to `expectedHeadSeq`, refused while
 * another attempt runs or the deployment approval's production-lease effect does (409 EFFECT_RUNNING: a lease it minted
 * after this read would outlive the rollback). Only then: the engine grant consumed as step 0, the freeze,
 * the Enforce restore, every lease of the release revoked (read again now: the preview's, a production lease minted after
 * it, and a failed attempt's from the lease journal), and the signed receipt; ROLLBACK and EFFECT_FINISHED settle it in one
 * transaction (its intent binds the preview, so it checks no resource slot). A step that throws is EFFECT_FAILED with its
 * code; an outcome that cannot be written leaves the attempt unsettled (process_lost, outcome unknown), never a failure of
 * steps that ran. A new request re-runs it (the grant is consumed by this execution; the restore and the revocations are
 * idempotent) until ROLLBACK is recorded once. A replay of the request answers its attempt (rollbackReplay).
 */
export function rollbackRelease(store: A4Store, projectId: string, releaseId: string, input: A4Call & { body: z.infer<typeof rollbackSchema> }):
  { result: A4TransitionResult; attemptId: string; rollbackId: string | null; receiptPath: string | null; leaseIdsRevoked: string[]; preparedCommands: string[];
    frozen: string | null } {
  const { body } = input;
  const now = Date.now();
  const executionId = rollbackExecutionId(releaseId);
  // A lost earlier attempt, and a lost production-lease effect, are settled first, so neither holds the rollback shut; the
  // head the client saw moves by exactly those rows.
  const lost = new Set([executionId, ...store.readChain(projectId).filter((link) => link.kind === "EFFECT_STARTED" && link.body.effect === PRODUCTION_LEASE_EFFECT_ID)
    .map((link) => String(link.body.executionId))]);
  const expectedHeadSeq = body.expectedHeadSeq + [...lost].reduce((count, id) => count + sweepA4Effects(store, DEFAULT_ACTION_STALE_AFTER_MS, { projectId, executionId: id }).length, 0);
  const { state, principal } = rollbackState(store, projectId, input, expectedHeadSeq, now);
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
  // An earlier attempt that ran step 0 consumed the grant for this execution, which proved its quorum (retryEffect's rule):
  // it is re-run on that grant. A grant another execution consumed is refused; only an unconsumed one is verified now.
  const consumed = loadApprovalConsumed({ workspace: store.workspace, agentId: state.project.agent_id, approvalRequestId });
  if (consumed !== null && consumed.executionId !== executionId) throw fail(409, "GRANT_ALREADY_USED", "The rollback's engine grant was consumed by another execution.");
  if (consumed === null) {
    verifyAndConsumeEffect(store, state, { def: effectDef(intent), gate, approvalRequestId, callerKey: principal.key, regulated: isRegulated(state, signedA4Floor(store.workspace)) });
  }
  // Signing keys first: every later step signs, and none may run when the record of it could not be written.
  try {
    getPrivateKeyPem(store.workspace, "auditor");
  } catch {
    throw fail(423, "A4_VAULT_LOCKED", "Unlock the vault to roll back: every step signs a receipt.");
  }
  // Every lease the release's effects minted, read now: revoking more than the preview bound only cuts the safe way.
  let journaled: string[];
  try {
    journaled = journaledLeaseIds(store.workspace, projectId, releaseId);
  } catch (error) {
    throw fail(409, "LEASE_JOURNAL_UNREADABLE", `the release's lease journal does not read, so its leases cannot all be named: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
  }
  const minted = mintedLeases(state.chain, releaseId);
  const leaseIds = [...new Set([...preview.leaseIds, ...minted.staging, ...(minted.production === null ? [] : [minted.production]), ...journaled])];
  const attemptId = `a4e_${randomBytes(16).toString("hex")}`;
  const started = store.transition(projectId, principal, ({ ts }) => {
    const chain = store.readChain(projectId);
    if (chain.some((link) => link.kind === "ROLLBACK" && link.body.releaseId === releaseId)) throw fail(409, "ROLLBACK_RECORDED", `release ${releaseId} was already rolled back`);
    if (effectUnsettled(chain, (started) => started.executionId === executionId)) {
      throw fail(409, "EFFECT_RUNNING", "Another attempt of this rollback is still running; retry once it has settled.");
    }
    // The production-lease effect checks for this rollback before it mints (assertProductionCurrent); one already past that
    // check is still running here, and its lease would outlive the rollback.
    if (effectUnsettled(chain, (started) => started.effect === PRODUCTION_LEASE_EFFECT_ID)) {
      throw fail(409, "EFFECT_RUNNING", "The deployment approval's production-lease effect is still running; roll back once it has settled.");
    }
    return { kind: "EFFECT_STARTED", stage: gate.stage, revisionNo: gate.revision_no, payload: { effectId: attemptId, effect: ROLLBACK_EFFECT_ID, gateId: gate.gate_id, executionId,
      approvalRequestId, releaseId, ownerPid: process.pid, ownerHost: hostname(), heartbeatTs: ts },
    startEffect: { effectId: attemptId, gateId: gate.gate_id, executionId, approvalRequestId } };
  }, { expectedHeadSeq, request: input.request, response: { attemptId } });
  if (started.replay) return { result: started, attemptId: String(started.response?.attemptId ?? ""), rollbackId: null, receiptPath: null, leaseIdsRevoked: [], preparedCommands: [], frozen: null };
  const agentId = state.project.agent_id;
  const rollbackId = `a4rb_${sha256Hex(`${approvalRequestId}:${executionId}`).slice(0, 32)}`;
  let frozen: string | null = null;
  pendingExecutors.add(attemptId);
  try {
    let file: { path: string; sha256: string };
    let restoreReceipt: string | null = null;
    let revokedIds = leaseIds;
    try {
      // Step 0: the engine grant, consumed by this execution (a replay by it is this rollback's own retry).
      const grant = consumeApprovedExecution({ workspace: store.workspace, approvalId: approvalRequestId, expectedAgentId: agentId, executionId });
      if (grant.replay && loadApprovalConsumed({ workspace: store.workspace, agentId, approvalRequestId })?.executionId !== executionId) {
        throw fail(409, "GRANT_ALREADY_USED", "The rollback's engine grant was consumed by another execution.");
      }
      // Freeze first for a high or critical tier; a retry reuses the freeze its earlier attempt raised.
      const active = (() => {
        try {
          return activeFreezeStatus(store.workspace, agentId);
        } catch {
          return { active: false, incidentIds: [] as string[] }; // unreadable: raise a fresh freeze rather than trust none
        }
      })();
      frozen = !["high", "critical"].includes(engineRiskTier(state)) ? null : active.active ? active.incidentIds[0] ?? null
        : createFreezeIncident({ workspace: store.workspace, agentId, ruleId: "a4-rollback", previousRunId: releaseId, currentRunId: body.toReleaseId ?? "none",
          deltas: { overallDrop: 0, integrityDrop: 0, correlationDrop: 0, maxLayerDrop: 0 }, actionClasses: FROZEN_CLASSES, reason: `A4 rollback of ${releaseId}: ${body.reason}` }).incidentId;
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
      const revokeEach = (ids: readonly string[]): void => {
        for (const leaseId of ids.filter((id) => !revoked.has(id))) {
          try {
            revokeLease(store.workspace, leaseId, `A4 rollback of release ${releaseId}`);
          } catch (error) {
            throw fail(409, "LEASE_REVOKE_FAILED", `${leaseId}: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`, { frozen, restoreReceipt });
          }
        }
      };
      revokeEach(leaseIds);
      // The lease journal read again: a lease minted after the first read (nothing should, with the production effect refused
      // beside this one) is revoked before the rollback settles, never left live on a rolled-back release.
      let late: string[];
      try {
        late = journaledLeaseIds(store.workspace, projectId, releaseId).filter((id) => !leaseIds.includes(id));
      } catch (error) {
        throw fail(409, "LEASE_JOURNAL_UNREADABLE", `the release's lease journal does not read again: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`, { frozen, restoreReceipt });
      }
      revokeEach(late);
      revokedIds = [...leaseIds, ...late];
      const doc = a4RollbackReceiptV1Schema.parse({ schema: "amc.a4-rollback-receipt/v1", rollbackId, releaseId, toReleaseId: body.toReleaseId, projectId,
        environment: body.environment, target: preview.target, enforceManifestId: body.confirmManifestId, preparedCommands: preview.preparedCommands,
        leaseIdsRevoked: revokedIds, receiptSha256: sha256Hex(canonicalize({ restoreReceipt, leaseIdsRevoked: revokedIds, frozen })),
        // AMC's own steps (restore, freeze, revocations) are amcSteps and leaseIdsRevoked; the operator's statement of what they
        // then ran is their rollback row, so this receipt states none (C-35: the two columns never merge).
        amcSteps: { restoreReceiptPath: restoreReceipt, freezeIncidentId: frozen },
        recordedStatus: null, amcCheckStatus: "not_evaluated", recordedByKey: principal.key, claimKind: "self_reported", ts: now });
      file = writeReleaseRecord(store.workspace, projectId, "rollbacks", releaseId, rollbackId, doc, "a4-rollback-receipt");
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      try {
        settleEffect(store, projectId, attemptId, "EFFECT_FAILED", { error: `${typeof code === "string" ? code : "ROLLBACK_FAILED"}: ${(error instanceof Error ? error.message : String(error)).slice(0, 400)}` });
      } catch {
        // Left unsettled: the next request settles it as process_lost.
      }
      throw error;
    }
    // ROLLBACK and EFFECT_FINISHED by amc-runtime on any head, settling the liveness row: the steps above ran, so their record
    // must land (a duplicate is refused). ROLLBACK carries the store's own A4_RECORD envelope; a notary that cannot sign it
    // is NOTARY_UNREACHABLE, the attempt stays unsettled (outcome unknown) and a new request records it.
    const settle = (): A4TransitionResult => notaryCoded(() => store.transition(projectId, A4_RUNTIME, ({ head, seq, ts }) => {
      const chain = store.readChain(projectId);
      if (chain.some((link) => link.kind === "ROLLBACK" && link.body.releaseId === releaseId)) throw fail(409, "ROLLBACK_RECORDED", `release ${releaseId} was already rolled back`);
      if (chain.some((link) => (link.kind === "EFFECT_FINISHED" || link.kind === "EFFECT_FAILED") && link.body.effectId === attemptId)) {
        throw fail(409, "EFFECT_SETTLED", `effect attempt ${attemptId} already settled`);
      }
      return [{ kind: "ROLLBACK", stage: head!.stage, payload: { rollbackId, releaseId, toReleaseId: body.toReleaseId, environment: body.environment, approvalRequestId,
        executionId, attemptId, confirmedByKey: principal.key, receiptPath: file.path, receiptFileSha256: file.sha256, enforceManifestId: body.confirmManifestId,
        restoreReceiptPath: restoreReceipt, leaseIdsRevoked: revokedIds, freezeIncidentId: frozen, reason: body.reason, lifecycle: "not moved (never backwards)",
        runtimeRunEvent: "not appended: no run of the deployed runtime was observed", claimKind: "self_reported" },
      sideRows: [{ table: "a4_evidence_refs", values: { project_id: projectId, seq, revision_no: head!.revision_no, stage: head!.stage,
        lane: "implementation", ref_kind: "rollback_receipt", ref_id: file.path, sha256: file.sha256, claim_kind: "self_reported", trust_tier: null, method: null,
        label: `rollback ${rollbackId} of ${releaseId}: AMC restored and revoked; the operator's run is their rollback row (self_reported)`, actor_key: A4_RUNTIME.key, ts } }] },
      { kind: "EFFECT_FINISHED", stage: gate.stage, revisionNo: gate.revision_no, payload: { effectId: attemptId, effect: ROLLBACK_EFFECT_ID, executionId, approvalRequestId,
        consumedExecutionId: null, receipt: null, slotChecks: [], record: { rollbackId, releaseId, leaseIdsRevoked: revokedIds } },
      settleEffect: { effectId: attemptId, state: "finished" as const } }];
    }));
    let result: A4TransitionResult;
    try {
      result = settle();
    } catch (error) {
      // One retry for a transient store error; a refusal (already recorded or settled, a notary that cannot sign) stands.
      if (error instanceof A4StoreError) throw error;
      result = settle();
    }
    if (frozen !== null) autoHold(store, projectId, [frozen]);
    return { result, attemptId, rollbackId, receiptPath: file.path, leaseIdsRevoked: revokedIds, preparedCommands: preview.preparedCommands, frozen };
  } finally {
    pendingExecutors.delete(attemptId);
  }
}

/**
 * A replay of POST …/rollback answers its attempt from the chain: the ROLLBACK it recorded once it finished, its own
 * failure when it failed, and 409 EFFECT_NOT_SETTLED while it has not settled. Lease ids and commands stay out of the answer.
 */
export function rollbackReplay(store: A4Store, projectId: string, replay: Record<string, unknown>): Record<string, unknown> {
  const chain = store.readChain(projectId);
  const outcome = chain.find((link) => (link.kind === "EFFECT_FINISHED" || link.kind === "EFFECT_FAILED") && link.body.effectId === replay.attemptId);
  if (outcome?.kind === "EFFECT_FINISHED") {
    const rollback = chain.find((link) => link.kind === "ROLLBACK" && link.body.attemptId === replay.attemptId);
    return { ...replay, rollbackId: rollback?.body.rollbackId ?? null, receiptPath: rollback?.body.receiptPath ?? null };
  }
  const error = outcome === undefined ? "EFFECT_NOT_SETTLED" : String(outcome.body.error ?? "ROLLBACK_FAILED");
  const code = /^[A-Z][A-Z0-9_]{2,63}/.exec(error)?.[0] ?? "ROLLBACK_FAILED";
  throw fail(code === "A4_VAULT_LOCKED" ? 423 : 409, code, `The rollback attempt did not finish: ${error}`, { attemptId: replay.attemptId });
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

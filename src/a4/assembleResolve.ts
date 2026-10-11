/**
 * The outcome_unknown flow and the A4 card's engine decisions (P1-60 slice A; design §6.1, §10.2). A cancelled or failed
 * journaled call leaves `outcome_unknown` and blocks the agent's journaled calls (P1-03/P1-04). From the A4 card:
 * "Request resolution" files the engine request an operator's statement needs (`requestManualResolution`) and records
 * it on the project; a second person decides it here, bound to the request digest, as the live-resolved A4 principal
 * (`decideApprovalInStudio` on its strict bound path; never Studio's admission actor); "Resolve" records the operator's
 * statement (`resolveManually`) only once A4's own dual control holds: bound approvals from live project approvers or
 * owners other than the operator, two distinct live-checked keys when regulated. The action journal writes it
 * SELF_REPORTED, so its ref is implementation / self_reported, never observed. The note is sealed in the project's blob
 * store; the engine request and the ledger carry only a reference naming the sealed blob and the note's sha256. The same
 * decide route takes the engine request of an effect gate opened on the project, refused at write when consumption would
 * refuse it. A request no transition of this project names is 404: the card decides nothing else.
 */
import { z } from "zod";
import { verifyChainIn } from "../actions/actionJournal.js";
import { receiptDigest, type ActionReceiptV1 } from "../actions/receiptStates.js";
import { requestManualResolution, resolveManually } from "../actions/reconcile.js";
import { apiSuccess } from "../api/apiHelpers.js";
import { approvalRequestBindingDigest, loadApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { ApprovalStudioError, decideApprovalInStudio } from "../approvals/approvalStudioService.js";
import { assertOwnerMode } from "../mode/mode.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { sha256Hex } from "../utils/hash.js";
import { getPrivate, putPrivate } from "./a4Blobs.js";
import { assertEffectVoteAllowed, boundMemberApprovalKeys } from "./a4Effects.js";
import { assertAllowed, evaluateFor, gateRowOf, livePrincipal, loadA4State, signedA4Floor } from "./a4Gates.js";
import { assertMember } from "./a4Identity.js";
import { isRegulated } from "./a4Readiness.js";
// Function declarations only: a4Router.ts imports this module (through a4RouterStages.ts), so nothing here reads its bindings at load time.
import { a4Fail, assertNoSecrets, callOf, headStage, mutationResult, precheck, priorReplay, readJson, requirePrincipal, type A4Route } from "./a4Router.js";
import type { A4ChainLink } from "./a4Schema.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { blockingExecutionsIn } from "./assembleLockout.js";
import { RESOLUTION_PURPOSE } from "./spec/assemble.js";

const RESOLUTION = RESOLUTION_PURPOSE;
const base = { expectedHeadSeq: z.number().int().min(0), clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) };
const requestSchema = z.strictObject({ ...base, effect: z.enum(["applied", "not_applied"]), externalRef: z.string().trim().min(1).max(512).nullable(),
  note: z.string().trim().min(1).max(4000) });
const resolveSchema = z.strictObject(base);
const decideSchema = z.strictObject({ reason: z.string().trim().min(1).max(1000), expectedRequestDigestSha256: z.string().regex(/^[0-9a-f]{64}$/) });
/** The engine's business refusals (src/actions/reconcile.ts): fixed texts that name no path. */
const BUSINESS_REFUSAL = /^(dual_control|resolution_not_approved|nothing to resolve)\b|^\S+ already records effect (applied|not_applied); /;

/**
 * A resolution refusal for the client: the engine's business refusals keep their text; anything else (journal, policy
 * and file errors embed workspace paths) is its code with a fixed message.
 */
function refused(error: unknown): Error {
  const text = error instanceof Error ? error.message : "";
  if (BUSINESS_REFUSAL.test(text)) return a4Fail(409, "RESOLUTION_REFUSED", text.slice(0, 300));
  return a4Fail(409, errorCodeOf(error, "RESOLUTION_REFUSED"), "The action journal refused the resolution; reload the project and retry.");
}

/** What the engine request and the ledger carry instead of the note: the sealed blob and the note's sha256 (both calls pass the same string). */
const sealedNoteRef = (projectId: string, blobRef: string, noteSha256: string): string => `a4-sealed-note:${projectId}:${blobRef}:${noteSha256}`;

/** The receipt an earlier resolve wrote for this request (a retry after the A4 record failed), from the verified chain; else null. */
function settledBy(route: A4Route, executionId: string, approvalRequestId: string): ActionReceiptV1 | null {
  const chain = verifyChainIn(route.store.ledger, executionId);
  const head = chain.ok ? chain.receipts.at(-1) : undefined;
  return head?.resolution === "operator" && head.reasonCode === `operator_resolved:${approvalRequestId}` ? head : null;
}

/**
 * POST …/outcome-unknown/:executionId/request: the operator's statement (effect, external ref, note) as an engine request
 * of tool amc.action.resolve, recorded as an `approval` ref (self_reported). The statement is scanned for secrets before
 * anything is written; the note is sealed in the project's blob store. Builder or owner; refused unless the execution
 * blocks this project's agent.
 * ponytail: the sealed note and the engine request are written before the transition; a refused transition leaves an
 * unreferenced blob and a PENDING request that expires unconsumed (openEffectGate's ceiling).
 */
async function requestResolution(route: A4Route, projectId: string, executionId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, requestSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const state = precheck(route, projectId, "review", body.expectedHeadSeq);
  assertOwnerMode(route.workspace, "a4 resolve");
  // The external reference is stored inline in the signed EVIDENCE_REF row and in the engine request (design §16 rule 11).
  assertNoSecrets({ externalRef: body.externalRef, note: body.note }, "The resolution statement");
  const agentId = state.project.agent_id;
  if (!blockingExecutionsIn(route.store.ledger.db, route.workspace, agentId).includes(executionId)) {
    throw a4Fail(409, "OUTCOME_NOT_OPEN", `${executionId} is not an outcome_unknown execution blocking agent ${agentId}.`);
  }
  const keySha256 = state.chain[0]?.body.projectPublicKeySha256;
  if (typeof keySha256 !== "string") throw a4Fail(409, "A4_INTEGRITY_FAILED", "The CREATED record names no project key.");
  const sealed = putPrivate(route.workspace, projectId, Buffer.from(body.note, "utf8"), keySha256);
  const noteSha256 = sha256Hex(body.note);
  let requested: ReturnType<typeof requestManualResolution>;
  try {
    requested = requestManualResolution(executionId, { workspace: route.workspace, effect: body.effect, externalRef: body.externalRef, operatorId: principal.userId,
      note: sealedNoteRef(projectId, sealed.blobRef, noteSha256) });
  } catch (error) {
    throw refused(error);
  }
  const digest = approvalRequestBindingDigest(loadApprovalRequestRecord({ workspace: route.workspace, agentId: requested.agentId,
    approvalRequestId: requested.approvalRequestId, requireValidSignature: true }));
  const result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "approval", refId: requested.approvalRequestId, sha256: digest,
    claimKind: "self_reported", method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
    label: `outcome_unknown resolution requested for ${executionId}: the operator states ${body.effect} (self-reported)`,
    note: { purpose: RESOLUTION, executionId, effect: body.effect, externalRef: body.externalRef, noteBlobRef: sealed.blobRef, noteSha256,
      operatorUserId: principal.userId, operatorKey: principal.key, actionClass: requested.actionClass, requiredApprovals: requested.requiredApprovals } });
  apiSuccess(route.res, mutationResult(result, { approvalRequestId: requested.approvalRequestId, requestDigestSha256: digest }), 201);
  return true;
}

/** The newest resolution request this project recorded for `executionId`. */
const resolutionOf = (chain: readonly A4ChainLink[], executionId: string): A4ChainLink | undefined =>
  [...chain].reverse().find((link) => link.kind === "EVIDENCE_REF" && link.body.purpose === RESOLUTION && link.body.executionId === executionId);

/**
 * A4's dual control on the recorded request, before anything is recorded: the request still binds the digest the
 * project recorded, and enough bound APPROVE_EXECUTE decisions come from live project approvers or owners other than the
 * operator — max(the class rule's requiredApprovals, 1), or 2 distinct live-checked (users.yaml) keys when regulated —
 * else 409 RESOLUTION_QUORUM_INSUFFICIENT.
 */
function assertResolutionQuorum(route: A4Route, state: ReturnType<typeof precheck>, link: A4ChainLink): void {
  const approvalRequestId = String(link.body.refId);
  const operatorKey = link.body.operatorKey;
  if (typeof operatorKey !== "string" || typeof link.body.sha256 !== "string") throw a4Fail(409, "A4_INTEGRITY_FAILED", "The resolution request names no operator or digest.");
  const record = loadApprovalRequestRecord({ workspace: route.workspace, agentId: state.project.agent_id, approvalRequestId, requireValidSignature: true });
  if (approvalRequestBindingDigest(record) !== link.body.sha256) throw a4Fail(409, "A4_INTEGRITY_FAILED", "The engine request no longer binds the digest the project recorded.");
  const regulated = isRegulated(state, signedA4Floor(route.workspace));
  const keys = boundMemberApprovalKeys(route.workspace, state, { approvalRequestId, bindingDigest: link.body.sha256, excludedKeys: [operatorKey], regulated });
  const needed = Math.max(record.requiredApprovals, regulated ? 2 : 1);
  if (keys.length < needed) {
    throw a4Fail(409, "RESOLUTION_QUORUM_INSUFFICIENT", `${keys.length} of ${needed} approval(s) bound to the request from project approvers or owners other than the operator${
      regulated ? " (distinct live-checked identities: the project is regulated)" : ""}.`);
  }
}

/** The ACTION_STATE evidence row the journal wrote for `receipt`, as a ledger_event ref (the row's payload is the receipt's canonical bytes). */
function receiptRow(route: A4Route, receipt: ActionReceiptV1): { refId: string; sha256: string } {
  const row = route.store.ledger.db.prepare("SELECT evidence_event_id AS id FROM action_transitions WHERE execution_id = ? AND seq = ?")
    .get(receipt.executionId, receipt.seq) as { id: string } | undefined;
  if (row === undefined) throw a4Fail(409, "A4_INTEGRITY_FAILED", "The resolution receipt has no evidence row.");
  return { refId: row.id, sha256: receiptDigest(receipt) };
}

/**
 * POST …/outcome-unknown/:executionId/resolve: once A4's dual control holds, `resolveManually` with exactly the recorded
 * statement (the sealed note's reference); the ACTION_STATE row it writes becomes a ledger_event ref, self_reported. A
 * retry after the journal already settled it under this request records that receipt.
 */
async function resolveResolution(route: A4Route, projectId: string, executionId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, resolveSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const state = precheck(route, projectId, "review", body.expectedHeadSeq);
  assertOwnerMode(route.workspace, "a4 resolve");
  const link = resolutionOf(state.chain, executionId);
  if (link === undefined) throw a4Fail(404, "A4_RESOLUTION_NOT_REQUESTED", `No resolution was requested on this project for ${executionId}.`);
  const approvalRequestId = String(link.body.refId);
  const blobRef = String(link.body.noteBlobRef);
  const noteSha256 = String(link.body.noteSha256);
  // The sealed note must still be the one the request named (fail closed); its plaintext is never passed on.
  if (sha256Hex(getPrivate(route.workspace, projectId, blobRef).toString("utf8")) !== noteSha256) {
    throw a4Fail(409, "A4_INTEGRITY_FAILED", "The sealed resolution note does not match its recorded hash.");
  }
  assertResolutionQuorum(route, state, link);
  let receipt: ActionReceiptV1;
  try {
    receipt = resolveManually(executionId, { workspace: route.workspace, effect: link.body.effect as "applied" | "not_applied",
      externalRef: typeof link.body.externalRef === "string" ? link.body.externalRef : null, operatorId: String(link.body.operatorUserId),
      note: sealedNoteRef(projectId, blobRef, noteSha256), approvalRequestId });
  } catch (error) {
    const prior = settledBy(route, executionId, approvalRequestId);
    if (prior === null) throw refused(error);
    receipt = prior;
  }
  const row = receiptRow(route, receipt);
  const result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "ledger_event", refId: row.refId, sha256: row.sha256,
    claimKind: "self_reported", method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
    label: `operator resolution of ${executionId}: ${String(receipt.effect)} (self-reported; AMC did not observe it)`,
    note: { purpose: "outcome_unknown_resolved", executionId, approvalRequestId, receiptSeq: receipt.seq } });
  apiSuccess(route.res, mutationResult(result, { executionId, state: receipt.state, effect: receipt.effect }), 201);
  return true;
}

/**
 * POST …/approvals/:approvalRequestId/approve|deny: an engine request this project named (an effect gate it opened, an
 * outcome_unknown resolution it requested), decided by a live project approver or owner, bound to the request digest
 * they reviewed. A regulated project takes decisions from live-checked (users.yaml) identities only; the operator never
 * approves their own resolution; an APPROVE on an effect gate's request is refused when consumption would refuse it (A4's
 * SoD and membership, the gate's exclusions and the revision's builders). A DENY is always recordable by a member. The
 * engine records the decision; A4 records no transition, and an effect's counted decisions are re-checked at consumption.
 */
async function decideEngineRequest(route: A4Route, projectId: string, approvalRequestId: string, verb: "approve" | "deny"): Promise<true> {
  const call = callOf(route);
  const principal = livePrincipal(route.store, call);
  const { body } = await readJson(route, decideSchema);
  assertOwnerMode(route.workspace, verb === "approve" ? "a4 approve" : "a4 deny");
  const now = Date.now();
  const state = loadA4State(route.store, projectId, now);
  const opened = state.chain.find((link) => link.kind === "EFFECT_GATE_OPENED" && link.body.approvalRequestId === approvalRequestId);
  const resolution = state.chain.find((link) => link.kind === "EVIDENCE_REF" && link.body.purpose === RESOLUTION && link.body.refId === approvalRequestId);
  if (opened === undefined && resolution === undefined) throw a4Fail(404, "A4_APPROVAL_NOT_FOUND", "This project names no such engine request.");
  const { readiness, query } = evaluateFor(route.store, state, principal, call, headStage(state.project), now);
  assertAllowed(readiness, "requestChanges");
  assertMember(state.members, principal, ["approver", "owner"]);
  const regulated = isRegulated(state, query.floor);
  if (regulated && principal.identityCheck !== "users_yaml") {
    throw a4Fail(403, "IDENTITY_CHECK_LIMITED", "A regulated project takes decisions from live-checked identities only (host sessions wait for P2-33).");
  }
  if (verb === "approve" && resolution !== undefined && resolution.body.operatorKey === principal.key) {
    throw a4Fail(400, "SOD_VIOLATION", "requester_not_approver: the operator who stated this resolution cannot approve it.");
  }
  if (verb === "approve" && opened !== undefined) {
    assertEffectVoteAllowed(route.workspace, state, gateRowOf(state, String(opened.body.gateId)), approvalRequestId,
      { userId: principal.userId, username: principal.username, roles: [...principal.roles] }, regulated);
  }
  let decided: Awaited<ReturnType<typeof decideApprovalInStudio>>;
  try {
    decided = await decideApprovalInStudio({ workspace: route.workspace, agentId: state.project.agent_id, approvalRequestId,
      actor: { isAdmin: false, username: principal.username, userId: principal.userId, roles: [...principal.roles] },
      input: { decision: verb === "approve" ? "APPROVE_EXECUTE" : "DENY", reason: body.reason }, requireExplicitDecision: true,
      expectedRequestDigestSha256: body.expectedRequestDigestSha256,
      writeAudit: (entry) => {
        const written = appendOpsAuditEvent({ workspace: route.workspace, auditType: entry.auditType, severity: entry.severity,
          payload: { ...entry.payload, agentId: entry.agentId, via: "a4", projectId } });
        return { eventId: written.eventId, receiptId: written.eventId };
      } });
  } catch (error) {
    if (error instanceof ApprovalStudioError) throw a4Fail(error.statusCode, "APPROVAL_REFUSED", error.message);
    throw error;
  }
  apiSuccess(route.res, { approvalRequestId, status: decided.approval.status, event: decided.approvalEvent }, 201);
  return true;
}

/** Assemble's POST routes; false when none matches. */
export async function handleAssembleRoute(route: A4Route, projectId: string, tail: string): Promise<boolean> {
  const outcome = /^\/outcome-unknown\/([A-Za-z0-9_-]{1,128})\/(request|resolve)$/.exec(tail);
  if (outcome !== null) return outcome[2] === "request" ? requestResolution(route, projectId, outcome[1]!) : resolveResolution(route, projectId, outcome[1]!);
  const decision = /^\/approvals\/(apprreq_[a-f0-9]{32})\/(approve|deny)$/.exec(tail);
  if (decision !== null) return decideEngineRequest(route, projectId, decision[1]!, decision[2] as "approve" | "deny");
  return false;
}

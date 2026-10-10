/**
 * The outcome_unknown flow and the A4 card's engine decisions (P1-60 slice A; design §6.1, §10.2). A cancelled or failed
 * journaled call leaves `outcome_unknown` and blocks the agent's journaled calls (P1-03/P1-04). From the A4 card:
 * "Request resolution" files the engine request an operator's statement needs (`requestManualResolution`, dual control
 * per the class rule) and records it on the project; a second person decides it here, bound to the request digest, as
 * the live-resolved A4 principal (`decideApprovalInStudio` on its strict bound path; never Studio's admission actor);
 * "Resolve" records the operator's statement (`resolveManually`), which the action journal writes SELF_REPORTED, so its
 * ref is implementation / self_reported, never observed. The same decide route takes the engine request of an effect
 * gate opened on the project. A request no transition of this project names is 404: the card decides nothing else.
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
import { assertAllowed, evaluateFor, livePrincipal, loadA4State } from "./a4Gates.js";
import { assertMember } from "./a4Identity.js";
import { blockingExecutionsIn } from "./assembleLockout.js";
// Function declarations only: a4Router.ts imports this module (through a4RouterStages.ts), so nothing here reads its bindings at load time.
import { a4Fail, callOf, headStage, mutationResult, precheck, priorReplay, readJson, requirePrincipal, type A4Route } from "./a4Router.js";
import type { A4ChainLink } from "./a4Schema.js";
import { RESOLUTION_PURPOSE } from "./spec/assemble.js";

const RESOLUTION = RESOLUTION_PURPOSE;
const base = { expectedHeadSeq: z.number().int().min(0), clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) };
const requestSchema = z.strictObject({ ...base, effect: z.enum(["applied", "not_applied"]), externalRef: z.string().trim().min(1).max(512).nullable(),
  note: z.string().trim().min(1).max(4000) });
const resolveSchema = z.strictObject(base);
const decideSchema = z.strictObject({ reason: z.string().trim().min(1).max(1000), expectedRequestDigestSha256: z.string().regex(/^[0-9a-f]{64}$/) });
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);

/** The receipt an earlier resolve wrote for this request (a retry after the A4 record failed), from the verified chain; else null. */
function settledBy(route: A4Route, executionId: string, approvalRequestId: string): ActionReceiptV1 | null {
  const chain = verifyChainIn(route.store.ledger, executionId);
  const head = chain.ok ? chain.receipts.at(-1) : undefined;
  return head?.resolution === "operator" && head.reasonCode === `operator_resolved:${approvalRequestId}` ? head : null;
}

/**
 * POST …/outcome-unknown/:executionId/request: the operator's statement (effect, external ref, note) as an engine request
 * of tool amc.action.resolve, recorded as an `approval` ref (self_reported). The note is sealed in the project's blob
 * store; the ledger keeps its sha256. Builder or owner; refused unless the execution blocks this project's agent.
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
  const agentId = state.project.agent_id;
  if (!blockingExecutionsIn(route.store.ledger.db, route.workspace, agentId).includes(executionId)) {
    throw a4Fail(409, "OUTCOME_NOT_OPEN", `${executionId} is not an outcome_unknown execution blocking agent ${agentId}.`);
  }
  const keySha256 = state.chain[0]?.body.projectPublicKeySha256;
  if (typeof keySha256 !== "string") throw a4Fail(409, "A4_INTEGRITY_FAILED", "The CREATED record names no project key.");
  const sealed = putPrivate(route.workspace, projectId, Buffer.from(body.note, "utf8"), keySha256);
  let requested: ReturnType<typeof requestManualResolution>;
  try {
    requested = requestManualResolution(executionId, { workspace: route.workspace, effect: body.effect, externalRef: body.externalRef, operatorId: principal.userId,
      note: body.note });
  } catch (error) {
    throw a4Fail(409, "RESOLUTION_REFUSED", message(error));
  }
  const digest = approvalRequestBindingDigest(loadApprovalRequestRecord({ workspace: route.workspace, agentId: requested.agentId,
    approvalRequestId: requested.approvalRequestId, requireValidSignature: true }));
  const result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "approval", refId: requested.approvalRequestId, sha256: digest,
    claimKind: "self_reported", method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
    label: `outcome_unknown resolution requested for ${executionId}: the operator states ${body.effect} (self-reported)`,
    note: { purpose: RESOLUTION, executionId, effect: body.effect, externalRef: body.externalRef, noteBlobRef: sealed.blobRef, noteSha256: sha256Hex(body.note),
      operatorUserId: principal.userId, actionClass: requested.actionClass, requiredApprovals: requested.requiredApprovals } });
  apiSuccess(route.res, mutationResult(result, { approvalRequestId: requested.approvalRequestId, requestDigestSha256: digest }), 201);
  return true;
}

/** The newest resolution request this project recorded for `executionId`. */
const resolutionOf = (chain: readonly A4ChainLink[], executionId: string): A4ChainLink | undefined =>
  [...chain].reverse().find((link) => link.kind === "EVIDENCE_REF" && link.body.purpose === RESOLUTION && link.body.executionId === executionId);

/**
 * POST …/outcome-unknown/:executionId/resolve: `resolveManually` with exactly the recorded statement, once the engine
 * request is approved; the receipt becomes an implementation ref, self_reported. A retry after the journal already
 * settled it under this request records that receipt.
 */
async function resolveResolution(route: A4Route, projectId: string, executionId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, resolveSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const state = precheck(route, projectId, "review", body.expectedHeadSeq);
  const link = resolutionOf(state.chain, executionId);
  if (link === undefined) throw a4Fail(404, "A4_RESOLUTION_NOT_REQUESTED", `No resolution was requested on this project for ${executionId}.`);
  const approvalRequestId = String(link.body.refId);
  const note = getPrivate(route.workspace, projectId, String(link.body.noteBlobRef)).toString("utf8");
  if (sha256Hex(note) !== link.body.noteSha256) throw a4Fail(409, "A4_INTEGRITY_FAILED", "The sealed resolution note does not match its recorded hash.");
  let receipt: ActionReceiptV1;
  try {
    receipt = resolveManually(executionId, { workspace: route.workspace, effect: link.body.effect as "applied" | "not_applied",
      externalRef: typeof link.body.externalRef === "string" ? link.body.externalRef : null, operatorId: String(link.body.operatorUserId), note, approvalRequestId });
  } catch (error) {
    const prior = settledBy(route, executionId, approvalRequestId);
    if (prior === null) throw a4Fail(409, "RESOLUTION_REFUSED", message(error));
    receipt = prior;
  }
  const result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "receipt", refId: `${executionId}#${receipt.seq}`, sha256: receiptDigest(receipt),
    claimKind: "self_reported", method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
    label: `operator resolution of ${executionId}: ${String(receipt.effect)} (self-reported; AMC did not observe it)`,
    note: { purpose: "outcome_unknown_resolved", executionId, approvalRequestId } });
  apiSuccess(route.res, mutationResult(result, { executionId, state: receipt.state, effect: receipt.effect }), 201);
  return true;
}

/**
 * POST …/approvals/:approvalRequestId/approve|deny: an engine request this project named (an effect gate it opened, an
 * outcome_unknown resolution it requested), decided by a live project approver or owner, bound to the request digest
 * they reviewed. The engine records the decision; A4 records no transition, and an effect's counted decisions are
 * re-checked against A4's separation of duties and membership when it is consumed.
 */
async function decideEngineRequest(route: A4Route, projectId: string, approvalRequestId: string, verb: "approve" | "deny"): Promise<true> {
  const call = callOf(route);
  const principal = livePrincipal(route.store, call);
  const { body } = await readJson(route, decideSchema);
  assertOwnerMode(route.workspace, verb === "approve" ? "a4 approve" : "a4 deny");
  const now = Date.now();
  const state = loadA4State(route.store, projectId, now);
  const named = state.chain.some((link) => (link.kind === "EFFECT_GATE_OPENED" && link.body.approvalRequestId === approvalRequestId)
    || (link.kind === "EVIDENCE_REF" && link.body.purpose === RESOLUTION && link.body.refId === approvalRequestId));
  if (!named) throw a4Fail(404, "A4_APPROVAL_NOT_FOUND", "This project names no such engine request.");
  assertAllowed(evaluateFor(route.store, state, principal, call, headStage(state.project), now).readiness, "requestChanges");
  assertMember(state.members, principal, ["approver", "owner"]);
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

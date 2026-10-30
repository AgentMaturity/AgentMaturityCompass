/**
 * /api/v1/operator (P2-22): the operator workflow over the plan diff, the blocker inbox, review packets and opt-in review
 * timing. Role classes live in src/api/accessPolicy.ts (reads: every human role; activate and the timing export: OWNER;
 * packets: AUDITOR or OWNER). Agent and lease credentials never reach here (src/studio/apiDelegation.ts refuses them).
 * Verification and export are free: nothing here consults the paid industry-pack gate.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { vaultStatus } from "../vault/vault.js";
import { buildBlockerInbox, type InboxSource } from "../operator/blockerInbox.js";
import { activateOperatorPlan, listOperatorPlans, OperatorPlanError, operatorPlanDiff, type PlanSource } from "../operator/planDiffView.js";
import { buildReviewPacket, PACKET_ID, reviewPacketBytes, type packetSource } from "../operator/reviewPacket.js";
import { exportReviewTimingCsv, recordReviewTiming, reviewTimingEnabled, reviewTimingInputSchema, ReviewTimingError } from "../operator/reviewTiming.js";
import { apiSuccess, bodyJsonSchema, isRequestBodyError } from "./apiHelpers.js";
import type { ApiRouteContext } from "./index.js";

const PREFIX = "/api/v1/operator";
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REVIEW_TIMING_NOTICE = "Review timing is on in this workspace. If you accept, Studio records when you open and decide each item and your active "
  + "time (the timer pauses after 60 seconds on a hidden page), under a pseudonym only. The data feeds the reviewer-time study; correctness is scored by the study, not by AMC.";

export interface OperatorRouteDeps {
  planSources?: Readonly<Record<string, PlanSource>>;
  inboxSources?: Readonly<Record<string, InboxSource>>;
  packetSource?: typeof packetSource;
}

const activateSchema = z.strictObject({ planDigest: z.string().regex(DIGEST), approvalId: z.string().min(1).max(200).optional() });
const packetSchema = z.strictObject({
  planDigest: z.string().regex(DIGEST), agentIds: z.array(z.string().regex(/^[A-Za-z0-9._-]{1,128}$/)).max(64).optional(),
  window: z.strictObject({ fromTs: z.number().int().min(0), toTs: z.number().int().min(0) }),
  formats: z.array(z.enum(["json", "oscal", "pdf"])).min(1).max(3)
});

function send(res: ServerResponse, status: number, code: string, message: string): true {
  res.writeHead(status, { "Content-Type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ ok: false, error: message, code }));
  return true;
}

function caller(context: ApiRouteContext): string {
  if (!context.principal) throw new OperatorPlanError(403, "PRINCIPAL_REQUIRED", "this action needs a signed-in user");
  return context.principal;
}

function assertVaultUnlocked(workspace: string): void {
  if (!vaultStatus(workspace).unlocked) throw new OperatorPlanError(423, "VAULT_LOCKED", "unlock the vault first");
}

function assertCurrent(context: ApiRouteContext): void {
  if (context.revalidateAuthority !== undefined && context.revalidateAuthority() !== true) {
    throw new OperatorPlanError(401, "AUTHORITY_CHANGED", "the original sign-in is no longer current");
  }
}

function timeParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(value)) throw new OperatorPlanError(400, "QUERY_INVALID", `${key} is not a time`);
  return value;
}

async function dispatch(pathname: string, method: string, req: IncomingMessage, res: ServerResponse, context: ApiRouteContext, deps: OperatorRouteDeps): Promise<boolean> {
  const { workspace } = context;
  const params = new URL(req.url ?? "/", "http://operator.invalid").searchParams;
  const rest = pathname.slice(PREFIX.length);
  if (method === "GET" && rest === "/plans") {
    const { plans, sources } = listOperatorPlans(workspace, Date.now(), deps.planSources);
    apiSuccess(res, { plans, sources });
    return true;
  }
  if (method === "GET" && rest === "/plans/diff") {
    const from = params.get("from") ?? "", to = params.get("to") ?? "";
    if (!DIGEST.test(from) || !DIGEST.test(to)) throw new OperatorPlanError(400, "QUERY_INVALID", "from and to are plan digests (sha256:<64 hex>)");
    apiSuccess(res, operatorPlanDiff(workspace, from, to, Date.now(), deps.planSources));
    return true;
  }
  if (method === "POST" && rest === "/plans/activate") {
    const body = await bodyJsonSchema(req, activateSchema);
    assertVaultUnlocked(workspace);
    assertCurrent(context);
    apiSuccess(res, activateOperatorPlan({ workspace, planDigest: body.planDigest, approvalId: body.approvalId, caller: caller(context), sources: deps.planSources }));
    return true;
  }
  if (method === "GET" && rest === "/inbox") {
    apiSuccess(res, buildBlockerInbox({ workspace, nowTs: Date.now(), sources: deps.inboxSources }));
    return true;
  }
  if (method === "POST" && rest === "/review-packets") {
    const body = await bodyJsonSchema(req, packetSchema);
    assertVaultUnlocked(workspace);
    assertCurrent(context);
    apiSuccess(res, await buildReviewPacket({ workspace, ...body, source: deps.packetSource }), 201);
    return true;
  }
  const download = /^\/review-packets\/([^/]+)\/download$/.exec(rest);
  if (method === "GET" && download !== null) {
    const id = download[1]!;
    const bytes = PACKET_ID.test(id) ? reviewPacketBytes(workspace, id) : null;
    if (bytes === null) return send(res, 404, "PACKET_NOT_FOUND", "no review packet with this id");
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${id}.zip"`, "cache-control": "no-store" });
    res.end(bytes);
    return true;
  }
  if (method === "GET" && rest === "/review-timing/status") {
    apiSuccess(res, { enabled: reviewTimingEnabled(workspace), notice: REVIEW_TIMING_NOTICE });
    return true;
  }
  if (method === "POST" && rest === "/review-timing/events") {
    const input = await bodyJsonSchema(req, reviewTimingInputSchema);
    assertCurrent(context);
    apiSuccess(res, recordReviewTiming({ workspace, subject: caller(context), input }), 201);
    return true;
  }
  if (method === "GET" && rest === "/review-timing/export") {
    const csv = exportReviewTimingCsv(workspace, timeParam(params, "from", 0), timeParam(params, "to", Date.now()));
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "cache-control": "no-store" });
    res.end(csv);
    return true;
  }
  return send(res, 404, "OPERATOR_ROUTE_NOT_FOUND", "no operator route matches this path");
}

export async function handleOperatorRoute(pathname: string, method: string, req: IncomingMessage, res: ServerResponse, context: ApiRouteContext,
  deps: OperatorRouteDeps = {}): Promise<boolean> {
  if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return false;
  try {
    return await dispatch(pathname, method.toUpperCase(), req, res, context, deps);
  } catch (error) {
    if (isRequestBodyError(error)) return send(res, error.statusCode, "BODY_INVALID", error.message);
    if (error instanceof OperatorPlanError || error instanceof ReviewTimingError) return send(res, error.status, error.code, error.message);
    return send(res, 500, "OPERATOR_INTERNAL", "the operator request could not be completed");
  }
}

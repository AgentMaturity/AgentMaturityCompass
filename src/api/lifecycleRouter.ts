/**
 * /api/v1/lifecycle (P2-23): a governed agent's lifecycle state, transitions and reassessments, and the OWNER transition.
 * Role classes live in src/api/accessPolicy.ts (GET: every human role; POST .../transition: OWNER). The actor is the
 * signed-in user resolved live in the signed users.yaml; a body never names one, and the bootstrap admin token never acts.
 */
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { z } from "zod";
import { listVerifiedUsers } from "../auth/authApi.js";
import { openLedger } from "../ledger/ledger.js";
import {
  GOVERNANCE_STATES, LIFECYCLE_AUDIT, LifecycleError, lifecycleEvents, lifecycleView, requestTransitionApproval, type LifecycleActor
} from "../lifecycle/governanceLifecycle.js";
import { applyOwnerTransition, listReassessments } from "../lifecycle/reassessment.js";
import { retireAgent } from "../lifecycle/retirement.js";
import { agentVersionManifestSchema } from "../lifecycle/versionManifest.js";
import { apiSuccess, bodyJsonSchema, isRequestBodyError } from "./apiHelpers.js";
import type { ApiRouteContext } from "./index.js";

const AGENT_PATH = /^\/api\/v1\/lifecycle\/agents\/([A-Za-z0-9._-]{1,128})(\/transition)?$/;
const note = z.string().trim().min(1).max(2000);
const transitionSchema = z.strictObject({
  to: z.enum(GOVERNANCE_STATES), approvalId: z.string().regex(/^apprreq_[a-f0-9]{32}$/).optional(), requestApproval: z.literal(true).optional(),
  manifest: agentVersionManifestSchema.optional(), note: note.optional(), acceptOutcomeUnknown: note.optional()
});

function send(res: ServerResponse, status: number, code: string, message: string): true {
  res.writeHead(status, { "Content-Type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ ok: false, error: message, code }));
  return true;
}

/** The signed-in OWNER as an active users.yaml record; anything else refuses. */
function actorOf(context: ApiRouteContext): LifecycleActor {
  const user = context.principal === undefined ? undefined
    : listVerifiedUsers(context.workspace).users.find((row) => row.username === context.principal && row.status === "ACTIVE");
  if (user === undefined || !user.roles.includes("OWNER")) throw new LifecycleError("owner_required", "a signed-in OWNER in users.yaml is required", 403);
  if (context.revalidateAuthority !== undefined && context.revalidateAuthority() !== true) {
    throw new LifecycleError("authority_changed", "the original sign-in is no longer current", 401);
  }
  return { userId: user.userId, username: user.username, roles: [...user.roles], via: "studio-session" };
}

function transitions(workspace: string, agentId: string): Array<Record<string, unknown>> {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return [];
  const ledger = openLedger(workspace);
  try {
    return lifecycleEvents(ledger.db, LIFECYCLE_AUDIT.transition, agentId).map((row) => ({ eventId: row.id, ts: row.ts, ...row.meta }));
  } finally {
    ledger.close();
  }
}

async function dispatch(agentId: string, isTransition: boolean, method: string, req: IncomingMessage, res: ServerResponse, context: ApiRouteContext): Promise<boolean> {
  const { workspace } = context;
  if (method === "GET" && !isTransition) {
    apiSuccess(res, { state: lifecycleView(workspace, agentId), transitions: transitions(workspace, agentId), reassessments: listReassessments(workspace, agentId) });
    return true;
  }
  if (method !== "POST" || !isTransition) return send(res, 405, "LIFECYCLE_METHOD", "GET the agent, or POST its /transition");
  const body = await bodyJsonSchema(req, transitionSchema);
  const actor = actorOf(context);
  if (body.requestApproval) {
    apiSuccess(res, await requestTransitionApproval({ workspace, agentId, to: body.to, actor, ...(body.manifest ? { manifest: body.manifest } : {}) }), 201);
  } else if (body.to === "retired") {
    apiSuccess(res, await retireAgent({ workspace, agentId, actor, ...(body.note ? { note: body.note } : {}),
      ...(body.acceptOutcomeUnknown ? { acceptOutcomeUnknown: body.acceptOutcomeUnknown } : {}) }));
  } else {
    apiSuccess(res, applyOwnerTransition({ workspace, agentId, to: body.to, actor, ...(body.approvalId ? { approvalId: body.approvalId } : {}),
      ...(body.manifest ? { manifest: body.manifest } : {}), ...(body.note ? { note: body.note } : {}) }));
  }
  return true;
}

export async function handleLifecycleRoute(pathname: string, method: string, req: IncomingMessage, res: ServerResponse, context: ApiRouteContext): Promise<boolean> {
  // The rest of /api/v1/lifecycle (surfaces, runs, latest, status) is the workflow router's.
  if (!pathname.startsWith("/api/v1/lifecycle/agents/")) return false;
  const match = AGENT_PATH.exec(pathname);
  if (match === null) return send(res, 404, "LIFECYCLE_ROUTE_NOT_FOUND", "no lifecycle route matches this path");
  try {
    return await dispatch(match[1]!, match[2] !== undefined, method.toUpperCase(), req, res, context);
  } catch (error) {
    if (isRequestBodyError(error)) return send(res, error.statusCode, "BODY_INVALID", error.message);
    if (error instanceof LifecycleError) return send(res, error.status, error.code, error.message);
    return send(res, 500, "LIFECYCLE_INTERNAL", "the lifecycle request could not be completed");
  }
}

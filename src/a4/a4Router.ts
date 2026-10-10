/**
 * The /api/v1/a4 router (P1-57; design §5.1, §12.1). The refusals run once, at the entry, before any dispatch: 401
 * without native Studio admission, 403 DEMO_REFUSED for the demo session on every method, 404 A4_PREVIEW_DISABLED
 * unless the process runs with AMC_A4_PREVIEW=1 (D-20: no signed config carries a features section, so the v1 gate is
 * the variable alone), then the live principal (the admin token reads only, NATIVE_READ_ONLY on mutations, the route's
 * role class re-run on live roles). Bodies are read losslessly and never name an identity; every mutation carries a
 * clientRequestId the store deduplicates inside its first write's transaction. This file holds the entry, the project
 * routes and the reads; src/a4/a4RouterStages.ts the stage, gate and effect routes; src/a4/a4RouterReleases.ts the
 * release seam (P1-62).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { z, ZodError } from "zod";
import { approvalDecisionSchema, approvalRequestBindingDigest } from "../approvals/approvalChainStore.js";
import { loadApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { evaluateApprovalQuorum } from "../approvals/approvalQuorum.js";
import { apiError, apiSuccess, isRequestBodyError } from "../api/apiHelpers.js";
import type { NativeTaskApiContext } from "../api/nativeTasksRouter.js";
import { envelopeForUnboundResult } from "../claims/eligibility/adapters.js";
import { eventMeta } from "../claims/evidenceProvenance.js";
import { signingRoute } from "../crypto/signing/signer.js";
import { getAgentPaths } from "../fleet/paths.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { requestTrustOverride } from "../trust/requestTrust.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { auditA4 } from "./a4Audit.js";
import { A4BlobError, getPrivate } from "./a4Blobs.js";
import { A4_EVENT_WINDOW, a4Events } from "./a4Events.js";
import {
  acknowledgeItem, assertAllowed, autoHold, changeGatePolicy, evaluateFor, holdProject, loadA4State, reopenStage, requestGate, resumeProject, retireProject,
  tuneProject, type A4Call
} from "./a4Gates.js";
import { memberCandidates, resolveA4Principal } from "./a4Identity.js";
import { A4_PRESENCE_TTL_MS, presenceOf, touchPresence } from "./a4Presence.js";
import { gateStatus, type A4Action, type A4ReadinessState } from "./a4Readiness.js";
import { handleA4ReleaseRoute } from "./a4RouterReleases.js";
import { handleA4StageRoute, STAGE_QUESTIONS } from "./a4RouterStages.js";
import {
  A4_GATES, A4_PROJECT_ROLES, A4_REF_KINDS, A4_STAGES, A4_STEPS, a4GatePolicyV1Schema, a4PreviewEnabled, type A4Member, type A4Principal,
  type A4ProjectRow, type A4Stage
} from "./a4Schema.js";
import { A4_REQUEST_WINDOW_MS, A4StoreError, openA4Store, refreshVolatileFacts, type A4RequestKey, type A4Store, type A4TransitionResult } from "./a4Store.js";
import { verifyA4Chain } from "./a4Verify.js";

export const A4_API_PREFIX = "/api/v1/a4";
const BODY_LIMIT = 1024 * 1024;
const SPEC_LIMIT = 256 * 1024;
const PROJECT_PATH = /^\/projects\/(a4p_[0-9a-f]{32})(\/.*)?$/;
/** Never read from a body: identity comes from the session, trust from the operator (design §12.1, §16 rule 1). */
const IDENTITY_FIELDS = ["userId", "roles", "approver", "author", "approved", "approvalId", "token"];


/** One admitted request. `principal` is null for the bootstrap admin token, which reads and does nothing else. */
export interface A4Route {
  readonly workspace: string;
  readonly store: A4Store;
  readonly native: NativeTaskApiContext;
  readonly principal: A4Principal | null;
  readonly pathname: string;
  readonly method: "GET" | "POST";
  readonly params: URLSearchParams;
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
}

export function a4Fail(status: number, code: string, message: string, detail?: unknown): A4StoreError {
  return new A4StoreError(status, code, message, detail);
}

const clientRequestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, "clientRequestId: 8 to 128 letters, digits, _ or -");
const headSeqSchema = z.number().int().min(0);
const reasonSchema = z.string().trim().min(1).max(2000);

/** Every supported query parameter, once; anything else is 400 (proxies and the server must read one URL alike). */
export function assertQuery(params: URLSearchParams, allowed: readonly string[]): void {
  if ([...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1)) {
    throw a4Fail(400, "QUERY_INVALID", `Supply each supported query parameter once${allowed.length > 0 ? ` (${allowed.join(", ")})` : "; this route takes none"}.`);
  }
}

/**
 * A client value (body, path segment, query parameter) parsed against `schema`: 400 INPUT_INVALID on a mismatch. Any
 * other ZodError is a stored row that no longer parses, which sendError reports as an integrity failure.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown, what = "body"): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw a4Fail(400, "INPUT_INVALID", `Invalid A4 request: ${issue ? `${issue.path.join(".") || what}: ${issue.message}` : "schema mismatch"}`);
}
/** A stage named by a path segment or query parameter. */
export function stageInput(value: unknown): A4Stage {
  return parseInput(z.enum(A4_STAGES), value, "stage");
}

/** The body as sent: lossless UTF-8 JSON (native admission hashes the exact bytes), at most 1 MiB. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let refused = false;
    req.on("data", (chunk: Buffer | string) => {
      if (refused) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      length += bytes.length;
      if (length > BODY_LIMIT) {
        refused = true;
        chunks.length = 0;
        reject(a4Fail(413, "INPUT_TOO_LARGE", "A4 request bodies are at most 1 MiB."));
        return;
      }
      chunks.push(bytes);
    });
    req.once("end", () => {
      if (refused) return;
      const bytes = Buffer.concat(chunks);
      const text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes)) reject(a4Fail(400, "INPUT_INVALID", "A4 requests are lossless UTF-8 JSON."));
      else resolve(text);
    });
    req.once("error", () => reject(a4Fail(400, "INPUT_INVALID", "The request body could not be read.")));
  });
}

/**
 * The parsed body and, for a mutation, its request key. A body naming an identity or trust field is 400, whatever the
 * schema says; `bodyHash` binds the method, the path (which names the project) and the exact bytes.
 */
export async function readJson<S extends z.ZodType>(route: A4Route, schema: S): Promise<{ body: z.output<S>; text: string; request: A4RequestKey | undefined }> {
  const text = await readBody(route.req);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw a4Fail(400, "INPUT_INVALID", "The request body must be a JSON object.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw a4Fail(400, "INPUT_INVALID", "The request body must be a JSON object.");
  const named = IDENTITY_FIELDS.find((field) => Object.hasOwn(value as object, field));
  if (named !== undefined) throw a4Fail(400, "IDENTITY_FIELD_REFUSED", `"${named}" is refused: identity comes only from your signed-in session.`);
  const trust = requestTrustOverride(value);
  if (trust !== null) throw a4Fail(400, "TRUST_FIELD_REFUSED", trust);
  const body = parseInput(schema, value);
  const clientRequestId = (body as { clientRequestId?: unknown }).clientRequestId;
  const request = typeof clientRequestId === "string" && route.principal !== null
    ? { principalKey: route.principal.key, clientRequestId, bodyHash: sha256Hex(`${route.method} ${route.pathname}\n${text}`) } : undefined;
  return { body, text, request };
}

/** Free text a writer stores inline is scanned with the release detectors first (design §16 rule 11). */
export function assertNoSecrets(value: unknown, what: string): void {
  const json = canonicalize(value);
  if (json.length > SPEC_LIMIT) throw a4Fail(413, "INPUT_TOO_LARGE", `${what} is larger than 256 KiB.`);
  const found = highSeveritySecretTypes(json);
  if (found.length > 0) throw a4Fail(400, "SECRET_IN_INPUT", `${what} looks like it holds a credential (${found.join(", ")}); remove it.`);
}

/**
 * A request already recorded answers what it answered, before any precheck could refuse it (the store's own dedupe
 * inside the transaction stays authoritative). A different body or project under the same id is 409.
 */
export function priorReplay(store: A4Store, request: A4RequestKey | undefined, projectId: string | null): Record<string, unknown> | null {
  if (request === undefined) return null;
  const row = store.ledger.db.prepare("SELECT body_hash, project_id, response_json, redacted, ts FROM a4_requests WHERE principal_key = ? AND client_request_id = ?")
    .get(request.principalKey, request.clientRequestId) as { body_hash: string; project_id: string | null; response_json: string; redacted: number; ts: number } | undefined;
  if (row === undefined || row.ts < Date.now() - A4_REQUEST_WINDOW_MS) return null;
  if (row.body_hash !== request.bodyHash || (projectId !== null && row.project_id !== projectId)) {
    throw a4Fail(409, "REQUEST_CONFLICT", "That request ID already names a different A4 request.");
  }
  const stored = JSON.parse(row.response_json) as Record<string, unknown>;
  return { ...(row.redacted === 1 ? { ...stored, token: null, reasonCode: "TOKEN_ALREADY_DELIVERED" } : stored), replay: true };
}

/** What a mutation answers; a replay answers the stored projection the store recorded. */
export function mutationResult(result: A4TransitionResult, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return result.replay ? { ...result.response, replay: true }
    : { projectId: result.projectId, seq: result.seq, kind: result.kind, bodyDigest: result.bodyDigest, replay: false, ...extra };
}

/** The gate functions' call: the live principal, the request key and the plane facts the session implies. */
export function callOf(route: A4Route, request?: A4RequestKey, fullIntegrity = false): A4Call {
  const principal = requirePrincipal(route);
  // A WORKSPACE_ROUTER session is minted by the hosted router (/w/<id>/), so it is both hosted and host mode.
  const hosted = principal.authSource === "WORKSPACE_ROUTER";
  return { principal, ...(request ? { request } : {}), hostedRouter: hosted, hostMode: hosted, fullIntegrity };
}

export function requirePrincipal(route: A4Route): A4Principal {
  if (route.principal === null) throw a4Fail(403, "ADMIN_TOKEN_REFUSED", "The admin token reads A4 projects only; sign in as a workspace user to act.");
  return route.principal;
}

/** Project reads: members, workspace OWNERs and AUDITORs (implicit owner and reviewer), and the read-only admin token. */
export function assertVisible(route: A4Route, members: readonly A4Member[]): void {
  const principal = route.principal;
  if (principal === null || principal.roles.includes("OWNER") || principal.roles.includes("AUDITOR")) return;
  if (!members.some((member) => member.principalKey === principal.key)) throw a4Fail(403, "A4_NOT_A_MEMBER", "You are not a member of this project.");
}

/** The stage readiness is evaluated at: the head stage, or Activate once retired. */
export const headStage = (project: Pick<A4ProjectRow, "stage">): A4Stage => project.stage === "retired" ? "activate" : project.stage;

/**
 * The readiness refusal for a write that does not go through a governed gate function (members, evidence, observe): the
 * same evaluator on freshly loaded rows; a freeze writes the automatic hold before refusing, as governed writes do. The
 * evaluated head must be `expectedHeadSeq`, the head the store then commits on (it refuses any other), so the write
 * lands on exactly the rows this evaluation read.
 */
export function precheck(route: A4Route, projectId: string, action: A4Action, expectedHeadSeq: number): A4ReadinessState {
  const now = Date.now();
  const state = loadA4State(route.store, projectId, now);
  const { readiness } = evaluateFor(route.store, state, requirePrincipal(route), callOf(route), headStage(state.project), now);
  try {
    assertAllowed(readiness, action);
  } catch (error) {
    if (error instanceof A4StoreError && error.code === "FREEZE_ACTIVE") {
      autoHold(route.store, projectId, refreshVolatileFacts(route.workspace, state.project).freeze?.incidentIds ?? []);
    }
    throw error;
  }
  if (state.project.head_seq !== expectedHeadSeq) {
    throw a4Fail(409, "A4_STALE_HEAD", "The project moved; reload and retry.", { headSeq: state.project.head_seq });
  }
  return state;
}

function sendError(res: ServerResponse, error: unknown, projectId: string | null): void {
  if (isRequestBodyError(error)) return apiError(res, error.statusCode, error.message);
  const send = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): void => {
    if (res.headersSent) return;
    res.writeHead(status, { "Content-Type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: message, code, ...extra }));
  };
  if (error instanceof ZodError) {
    // Client input is parsed through parseInput (400); a ZodError here is a stored row or record that does not parse.
    const issue = error.issues[0];
    return send(409, "A4_INTEGRITY_FAILED", `A stored A4 record does not parse${issue ? ` (${issue.path.join(".") || "row"}: ${issue.message})` : ""}.`);
  }
  if (error instanceof A4StoreError) {
    const stale = error.code === "A4_STALE_HEAD" && projectId !== null
      ? { head: error.detail ?? null, diff: `${A4_API_PREFIX}/projects/${projectId}/transitions` } : {};
    return send(error.status, error.code, error.message, { ...(error.detail === undefined ? {} : { detail: error.detail }), ...stale });
  }
  if (error instanceof A4BlobError) {
    return send(error.code === "VAULT_LOCKED" ? 423 : error.code === "SECRET_SCAN_REFUSED" ? 400 : 409, error.code, error.message);
  }
  const text = error instanceof Error ? error.message : String(error);
  const tagged = error as { status?: unknown; code?: unknown };
  if (typeof tagged.status === "number" && typeof tagged.code === "string") return send(tagged.status, tagged.code, text);
  if (/blocked in agent mode/.test(text)) return send(403, "AGENT_MODE", text);
  if (/vault locked/i.test(text)) return send(423, "A4_VAULT_LOCKED", "Unlock the vault to record this.");
  send(500, "A4_INTERNAL", "The A4 request could not be completed; reload the project before retrying.");
}

/** A result body that claims nothing: its own unbound envelope, so the wrapper repeats it (one claim per result). */
export function unboundClaim(projectId: string, what: string, regulated: boolean) {
  return envelopeForUnboundResult({ producer: `a4:${projectId}:${what}`, method: "human_review", regulated, now: Date.now() });
}

const projectView = (row: A4ProjectRow, members: readonly A4Member[], readiness: { status: string; bindingDigest: string } | null) => ({
  schema: "amc.a4-project/v1", projectId: row.project_id, workspaceId: row.workspace_id, agentId: row.agent_id, name: row.name, stage: row.stage,
  step: row.step, hold: row.hold === 1, holdReason: row.hold_reason, revisionNo: row.revision_no, headSeq: row.head_seq, headDigest: row.head_digest,
  deployedReleaseId: row.deployed_release_id, baseReleaseId: row.base_release_id, createdByKey: row.created_by_key, createdTs: row.created_ts,
  updatedTs: row.updated_ts, members: [...members], readiness
});

const createSchema = z.strictObject({
  clientRequestId: clientRequestIdSchema,
  name: z.string().trim().min(1).max(200),
  agentId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,127}$/, "Choose a valid agent ID.").optional(),
  archetype: z.string().trim().min(1).max(128).optional(),
  expertise: z.enum(["novice", "practitioner", "expert"])
});

/**
 * POST /projects (design §12.1): a human session with a live OPERATOR or OWNER role (the store checks it again); a
 * project for an agent that already exists (its config, context graph or target profile is on disk) needs OWNER (`AgentConfig` names no owner and `signAgentConfig` records no
 * signer, so nobody else can show a claim on it), so one OPERATOR cannot fill every agent's slot.
 */
async function createProject(route: A4Route): Promise<void> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, createSchema);
  const replay = priorReplay(route.store, request, null);
  if (replay) return apiSuccess(route.res, replay);
  assertNoSecrets({ name: body.name, archetype: body.archetype ?? null }, "The project name");
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent";
  const agentId = body.agentId ?? `${slug}-${randomBytes(3).toString("hex")}`;
  let existing = true;
  try {
    // Any of the agent's own files makes it existing: the root default agent of `amc init` has a context graph and a
    // signed target profile but no agent config, and Aspire's Build re-signs what it finds (src/a4/stages/aspire.ts).
    const paths = getAgentPaths(route.workspace, agentId);
    existing = [paths.agentConfig, paths.contextGraph, join(paths.targetsDir, "default.target.json")].some((path) => pathExists(path));
  } catch {
    // An agent the fleet cannot resolve is treated as existing: OWNER only.
  }
  if (existing && !principal.roles.includes("OWNER")) {
    throw a4Fail(403, "A4_EXISTING_AGENT_OWNER_ONLY", `Agent ${agentId} already exists; only a workspace OWNER can start a project for it.`);
  }
  const call = callOf(route, request);
  const result = route.store.createProject({ actor: principal, agentId, name: body.name, hostedRouter: call.hostedRouter === true, request,
    profile: { expertise: body.expertise, archetype: body.archetype ?? null } });
  apiSuccess(route.res, mutationResult(result, { agentId }), result.replay ? 200 : 201);
}

/** GET /options: vocabularies, limits and this workspace's A4 state; no project data. */
function options(route: A4Route): void {
  assertQuery(route.params, []);
  let route_: string | null;
  try {
    route_ = signingRoute(route.workspace, "A4_RECORD");
  } catch {
    route_ = null;
  }
  apiSuccess(route.res, {
    schema: "amc.a4-options/v1", previewEnabled: true, stages: A4_STAGES, steps: A4_STEPS, gates: A4_GATES, projectRoles: A4_PROJECT_ROLES,
    refKinds: A4_REF_KINDS, expertise: ["novice", "practitioner", "expert"], questions: STAGE_QUESTIONS,
    limits: { eventWindow: A4_EVENT_WINDOW, presenceTtlMs: A4_PRESENCE_TTL_MS, requestWindowMs: A4_REQUEST_WINDOW_MS, bodyBytes: BODY_LIMIT },
    workspace: { signingRoute: route_, readOnly: !route.native.executionAllowed() },
    // Supported integration paths arrive with Assemble (P1-60); the running image digest with the bootstrap report.
    integrationClaims: [], imageDigest: null
  });
}

/** Projects this principal may read; listing verifies every project's chain (one that fails fails the list). */
function visibleProjects(route: A4Route): Array<{ row: A4ProjectRow; members: A4Member[] }> {
  return route.store.listProjects().map((row) => ({ row, members: route.store.membersOf(row.project_id) })).filter(({ members }) => {
    try {
      assertVisible(route, members);
      return true;
    } catch {
      return false;
    }
  });
}

/** GET /inbox: this principal's non-READY mandatory items across the projects it reads (P2-22's blocker inbox, generalised). */
function inbox(route: A4Route): void {
  assertQuery(route.params, []);
  const now = Date.now();
  const items = visibleProjects(route).flatMap(({ row }) => {
    const state = loadA4State(route.store, row.project_id, now);
    const { readiness } = evaluateFor(route.store, state, route.principal, route.principal ? callOf(route) : {}, headStage(row), now);
    const blockers = readiness.items.filter((entry) => entry.mandatory && entry.status !== "READY" && entry.status !== "COMPLETE")
      .map((entry) => ({ id: entry.id, status: entry.status, kind: entry.kind, reasonCodes: entry.reasonCodes }));
    return blockers.length === 0 ? [] : [{ projectId: row.project_id, name: row.name, stage: row.stage, step: row.step, status: readiness.status, blockers }];
  });
  apiSuccess(route.res, { items });
}

const membersSchema = z.strictObject({
  event: z.enum(["added", "roles_changed", "removed"]).default("added"),
  principalKey: z.string().regex(/^(LOCAL_USER|WORKSPACE_ROUTER):.{1,200}$/),
  // `projectRoles`, never `roles`: a body naming `roles` is refused as an identity claim (design §12.1).
  projectRoles: z.array(z.enum(A4_PROJECT_ROLES)).max(A4_PROJECT_ROLES.length).default([]),
  expectedHeadSeq: headSeqSchema,
  clientRequestId: clientRequestIdSchema
});
const commentSchema = z.strictObject({
  body: z.string().trim().min(1).max(16_384), cardId: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
  inReplyTo: z.string().regex(/^a4c_[0-9a-f]{32}$/).nullable().optional(), clientRequestId: clientRequestIdSchema
});
const evidenceSchema = z.strictObject({
  refKind: z.enum(A4_REF_KINDS), refId: z.string().min(1).max(512), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  label: z.string().trim().min(1).max(500), expectedHeadSeq: headSeqSchema, clientRequestId: clientRequestIdSchema
});
const ownerBase = { reason: reasonSchema, expectedHeadSeq: headSeqSchema, clientRequestId: clientRequestIdSchema };
const OWNER_SCHEMAS = {
  hold: z.strictObject(ownerBase),
  resume: z.strictObject(ownerBase),
  reopen: z.strictObject({ ...ownerBase, toStage: z.enum(A4_STAGES) }),
  tune: z.strictObject({ ...ownerBase, capabilityChange: z.boolean(), mechanicPlanId: z.string().min(1).max(200).optional() }),
  retire: z.strictObject({ ...ownerBase, acceptanceNote: z.string().trim().min(1).max(2000).optional() }),
  acknowledge: z.strictObject({ ...ownerBase, itemId: z.string().min(1).max(128), stage: z.enum(A4_STAGES).optional() })
} as const;
const gatePolicySchema = z.union([
  z.strictObject({ proposedGatePolicy: a4GatePolicyV1Schema, expectedHeadSeq: headSeqSchema, clientRequestId: clientRequestIdSchema }),
  z.strictObject({ gateId: z.string().regex(/^a4gate_[0-9a-f]{32}$/), expectedHeadSeq: headSeqSchema, clientRequestId: clientRequestIdSchema })
]);

/** Answers a recorded request, or runs `write` and answers its result. */
async function mutate<S extends z.ZodType>(route: A4Route, projectId: string, schema: S,
  write: (body: z.output<S>, request: A4RequestKey | undefined) => A4TransitionResult, status = 200): Promise<true> {
  const { body, request } = await readJson(route, schema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) apiSuccess(route.res, replay);
  else apiSuccess(route.res, mutationResult(write(body, request)), status);
  return true;
}

/** POSTs on a project that are not stage, gate or release routes. Returns false when none matches. */
async function projectMutation(route: A4Route, projectId: string, rest: string): Promise<boolean> {
  const { store } = route;
  const principal = requirePrincipal(route);
  const headOf = (): A4ProjectRow => {
    const head = store.readHead(projectId);
    if (head === null) throw a4Fail(404, "A4_PROJECT_NOT_FOUND", `no A4 project ${projectId}`);
    return head;
  };
  switch (rest) {
    case "/presence": {
      // Never deduplicated, journaled or signed; members only (read roles suffice, membership is checked here).
      const { body } = await readJson(route, z.strictObject({ card: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/) }));
      // Only a project that exists gets a presence entry (the map is per process memory).
      headOf();
      assertVisible(route, store.membersOf(projectId));
      touchPresence(projectId, principal.key, principal.username, body.card);
      apiSuccess(route.res, { presence: presenceOf(projectId) });
      return true;
    }
    case "/comments":
      // Read roles plus membership: an APPROVER-only or AUDITOR member can discuss without being granted OPERATOR.
      return mutate(route, projectId, commentSchema, (body, request) => {
        assertVisible(route, store.membersOf(projectId));
        return store.addComment(projectId, { actor: principal, body: body.body, cardId: body.cardId, inReplyTo: body.inReplyTo ?? null, request });
      }, 201);
    case "/members":
      return mutate(route, projectId, membersSchema, (body, request) => {
        if (body.event !== "removed" && body.projectRoles.length === 0) throw a4Fail(400, "INPUT_INVALID", "A member holds at least one project role.");
        precheck(route, projectId, "addMember", body.expectedHeadSeq);
        // The store re-checks owner mode and a current project owner on live roles (defence in depth).
        return store.recordMember(projectId, { actor: principal, event: body.event, principalKey: body.principalKey,
          roles: body.event === "removed" ? [] : body.projectRoles, expectedHeadSeq: body.expectedHeadSeq, request });
      });
    case "/evidence":
      return mutate(route, projectId, evidenceSchema, (body, request) => {
        const state = precheck(route, projectId, "build", body.expectedHeadSeq);
        const event = body.refKind === "ledger_event" ? store.ledger.getEventById(body.refId) : undefined;
        const meta = event ? eventMeta(event) : null;
        // The store refuses it again under the project lock; refusing here first means nothing is planned on another agent's row.
        if (meta !== null && (meta.agentId ?? meta.agent_id) !== state.project.agent_id) {
          throw a4Fail(409, "EVIDENCE_REF_FOREIGN_AGENT", `ledger row ${body.refId} is not a row of agent ${state.project.agent_id}`);
        }
        // A ledger row earns the observed lane only through its recomputed tier (the runtime wrote it); the rest is self_reported.
        const ledgerRow = body.refKind === "ledger_event";
        return store.addEvidenceRef(projectId, { actor: principal, refKind: body.refKind, refId: body.refId, sha256: body.sha256,
          claimKind: ledgerRow ? "observed" : "self_reported", method: ledgerRow ? "runtime_observation" : null, label: body.label,
          column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request });
      }, 201);
    case "/gate-policy":
      // A proposal opens the `policy` gate (always a distinct approver); a gate id applies the decided proposal.
      return mutate(route, projectId, gatePolicySchema, (body, request) => {
        const call = callOf(route, request);
        if (!("proposedGatePolicy" in body)) return changeGatePolicy(store, projectId, { ...call, gateId: body.gateId, expectedHeadSeq: body.expectedHeadSeq });
        const head = headOf();
        const result = requestGate(store, projectId, { ...call, stage: headStage(head), gate: "policy", proposedGatePolicy: body.proposedGatePolicy,
          expectedHeadSeq: body.expectedHeadSeq });
        if (!result.replay) auditA4(route.workspace, { type: "A4_GATE_OPENED", agentId: head.agent_id, projectId, username: principal.username,
          summary: `A4 policy gate opened on ${head.name}`, details: { gate: "policy", seq: result.seq } });
        return result;
      });
    case "/hold":
      return mutate(route, projectId, OWNER_SCHEMAS.hold, (body, request) => {
        const head = headOf();
        const result = holdProject(store, projectId, { ...callOf(route, request), ...body });
        if (!result.replay) auditA4(route.workspace, { type: "A4_HOLD", agentId: head.agent_id, projectId, username: principal.username,
          summary: `A4 project ${head.name} held`, details: { reason: body.reason, seq: result.seq } });
        return result;
      });
    case "/resume":
      return mutate(route, projectId, OWNER_SCHEMAS.resume, (body, request) => resumeProject(store, projectId, { ...callOf(route, request), ...body }));
    case "/reopen":
      return mutate(route, projectId, OWNER_SCHEMAS.reopen, (body, request) => reopenStage(store, projectId, { ...callOf(route, request), ...body }));
    case "/tune":
      return mutate(route, projectId, OWNER_SCHEMAS.tune, (body, request) => tuneProject(store, projectId, { ...callOf(route, request), ...body }));
    case "/retire":
      return mutate(route, projectId, OWNER_SCHEMAS.retire, (body, request) => retireProject(store, projectId, { ...callOf(route, request), ...body }));
    case "/acknowledge":
      return mutate(route, projectId, OWNER_SCHEMAS.acknowledge, (body, request) =>
        acknowledgeItem(store, projectId, { ...callOf(route, request), ...body, stage: body.stage ?? headStage(headOf()) }));
    default:
      return false;
  }
}

/** The decisions of a gate as `amc.a4-decision/v1`. */
function decisionViews(state: A4ReadinessState, gateId: string) {
  return state.decisions.filter((row) => row.gate_id === gateId).map((row) => {
    const record = approvalDecisionSchema.parse(JSON.parse(row.decision_json));
    return { schema: "amc.a4-decision/v1", decisionId: row.decision_id, gateId: row.gate_id, projectId: row.project_id, decision: record.decision,
      reason: record.reason ?? "", requestDigestSha256: row.request_digest, approverKey: row.approver_key, authSource: row.auth_source, userId: record.userId,
      username: record.username, roles: record.roles, admission: row.admission, identityCheck: row.identity_check,
      identityProvenance: JSON.parse(row.identity_provenance_json) as unknown, selfApproved: row.self_approved === 1,
      selfApprovalFacts: (({ degraded: _degraded, ...facts }) => facts)(JSON.parse(row.self_approval_facts_json) as Record<string, unknown>),
      evaluatedItems: JSON.parse(row.evaluated_items_json) as unknown, claimKind: "self_reported", evidenceEventId: row.evidence_event_id, ts: row.ts };
  });
}

/** The gates of a project as `amc.a4-gate/v1`. */
function gateViews(route: A4Route, state: A4ReadinessState) {
  const policy = loadApprovalPolicy(route.workspace);
  const now = Date.now();
  return state.gates.map((row) => {
    const status = gateStatus(state, row, policy, now);
    const quorum = evaluateApprovalQuorum({ request: status.request, now, policy,
      decisions: status.counted.map((decision) => approvalDecisionSchema.parse(JSON.parse(decision.decision_json))) });
    const decisions = decisionViews(state, row.gate_id);
    return { schema: "amc.a4-gate/v1", gateId: row.gate_id, projectId: row.project_id, revisionNo: row.revision_no, stage: row.stage, gate: row.gate,
      request: status.request, bindingDigest: row.binding_digest, intent: JSON.parse(row.intent_json) as unknown, readinessSha256: row.readiness_sha256,
      boundItems: JSON.parse(row.bound_items_json) as unknown, gatePolicyDigest: row.gate_policy_digest, requestedByKey: row.requested_by_key,
      excludedKeys: JSON.parse(row.excluded_keys_json) as unknown, expiresTs: row.expires_ts, decisions, status: status.status,
      quorum: { status: quorum.status, approvals: quorum.received, required: quorum.required },
      integrity: { bindingDigestValid: approvalRequestBindingDigest(status.request) === row.binding_digest,
        decisionsBound: decisions.every((decision) => decision.requestDigestSha256 === row.binding_digest), envelopeValid: null },
      supersededBy: status.supersededBy ? { seq: status.supersededBy.seq, kind: status.supersededBy.kind } : null, ts: row.ts };
  });
}

const flatSpec = (value: unknown, prefix = ""): Record<string, string> => value === null || typeof value !== "object" || Array.isArray(value)
  ? { [prefix || "."]: canonicalize(value ?? null) }
  : Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => Object.entries(flatSpec(child, `${prefix}${prefix ? "." : ""}${key}`))));

/** Project-scoped GETs. Returns false when none matches. */
function projectRead(route: A4Route, projectId: string, rest: string): boolean {
  const { store, params } = route;
  if (rest === "/verify") return verifyRead(route, projectId);
  const now = Date.now();
  const state = loadA4State(store, projectId, now);
  assertVisible(route, state.members);
  const readinessAt = (stage: A4Stage) => evaluateFor(store, state, route.principal, route.principal ? callOf(route, undefined, true) : { fullIntegrity: true }, stage, now).readiness;
  if (rest === "") {
    assertQuery(params, []);
    const readiness = readinessAt(headStage(state.project));
    const revision = state.revisions.find((row) => row.revision_no === state.project.revision_no) ?? null;
    apiSuccess(route.res, { ...projectView(state.project, state.members, { status: readiness.status, bindingDigest: readiness.bindingDigest }),
      revision: revision && { revisionNo: revision.revision_no, stage: revision.stage, parentRevisionNo: revision.parent_revision_no,
        specDigest: revision.spec_digest, resourceDigestsSha256: revision.resource_digests_sha256, createdByKey: revision.created_by_key, ts: revision.ts },
      gates: readiness.gates, claim: readiness.claim });
    return true;
  }
  if (rest === "/readiness") {
    assertQuery(params, params.has("stage") ? ["stage"] : []);
    apiSuccess(route.res, readinessAt(params.has("stage") ? stageInput(params.get("stage")) : headStage(state.project)));
    return true;
  }
  if (rest === "/events") {
    assertQuery(params, ["cursor", "card"].filter((key) => params.has(key)));
    const raw = params.get("cursor") ?? "0";
    if (!/^(0|[1-9][0-9]{0,9})$/.test(raw) || Number(raw) > state.project.head_seq + 1) throw a4Fail(400, "QUERY_INVALID", "Choose a cursor between 0 and the head seq + 1.");
    const card = params.get("card");
    if (card !== null && !/^[A-Za-z0-9_.:-]{1,128}$/.test(card)) throw a4Fail(400, "QUERY_INVALID", "Choose a valid card id.");
    apiSuccess(route.res, a4Events({ chain: state.chain, head: state.project, cursor: Number(raw), card, presence: presenceOf(projectId) }));
    return true;
  }
  if (rest === "/revisions") {
    assertQuery(params, []);
    apiSuccess(route.res, { revisions: state.revisions.map((row) => ({ revisionNo: row.revision_no, stage: row.stage, parentRevisionNo: row.parent_revision_no,
      specDigest: row.spec_digest, resourceDigestsSha256: row.resource_digests_sha256, createdByKey: row.created_by_key, ts: row.ts })) });
    return true;
  }
  if (rest === "/revisions/diff") {
    assertQuery(params, ["from", "to"]);
    const pick = (key: string) => state.revisions.find((row) => String(row.revision_no) === params.get(key));
    const from = pick("from"), to = pick("to");
    if (!from || !to) throw a4Fail(404, "A4_REVISION_NOT_FOUND", "Name two revisions of this project.");
    const a = { ...flatSpec(JSON.parse(from.spec_json), "spec"), ...flatSpec(JSON.parse(from.resource_digests_json), "resources") };
    const b = { ...flatSpec(JSON.parse(to.spec_json), "spec"), ...flatSpec(JSON.parse(to.resource_digests_json), "resources") };
    apiSuccess(route.res, { from: from.revision_no, to: to.revision_no, changed: [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
      .filter((key) => a[key] !== b[key]).map((key) => ({ path: key, from: a[key] ?? null, to: b[key] ?? null })) });
    return true;
  }
  const revisionNo = /^\/revisions\/([1-9][0-9]{0,8})$/.exec(rest)?.[1];
  if (revisionNo !== undefined) {
    assertQuery(params, []);
    const row = state.revisions.find((candidate) => candidate.revision_no === Number(revisionNo));
    if (!row) throw a4Fail(404, "A4_REVISION_NOT_FOUND", `no revision ${revisionNo}`);
    apiSuccess(route.res, { schema: "amc.a4-revision/v1", projectId, revisionNo: row.revision_no, stage: row.stage, parentRevisionNo: row.parent_revision_no,
      spec: JSON.parse(row.spec_json) as unknown, specDigest: row.spec_digest, resourceDigests: JSON.parse(row.resource_digests_json) as unknown,
      resourceDigestsSha256: row.resource_digests_sha256, operatingScope: row.operating_scope_json === null ? null : JSON.parse(row.operating_scope_json) as unknown,
      createdByKey: row.created_by_key, evidenceEventId: row.evidence_event_id, ts: row.ts });
    return true;
  }
  if (rest === "/transitions") {
    assertQuery(params, params.has("cursor") ? ["cursor"] : []);
    const cursor = Number(params.get("cursor") ?? "0");
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw a4Fail(400, "QUERY_INVALID", "Choose a nonnegative cursor.");
    const links = store.readChain(projectId).filter((link) => link.seq >= cursor).slice(0, A4_EVENT_WINDOW);
    apiSuccess(route.res, { transitions: links.map(({ row, body }) => ({ schema: "amc.a4-transition/v1", projectId, seq: row.seq, kind: row.kind, stage: row.stage,
      revisionNo: row.revision_no, actorKey: row.actor_key, actorUsername: row.actor_username, body, bodyDigest: row.body_digest, prevDigest: row.prev_digest,
      readinessSha256: row.readiness_sha256, evidenceEventId: row.evidence_event_id, ts: row.ts })), nextCursor: (links.at(-1)?.seq ?? cursor - 1) + 1 });
    return true;
  }
  if (rest === "/gates") {
    assertQuery(params, []);
    apiSuccess(route.res, { gates: gateViews(route, state) });
    return true;
  }
  if (rest === "/members") {
    assertQuery(params, []);
    const owner = route.principal !== null && (route.principal.roles.includes("OWNER")
      || state.members.some((member) => member.principalKey === route.principal?.key && member.roles.includes("owner")));
    const candidates = owner ? memberCandidates(route.workspace, route.principal?.authSource === "WORKSPACE_ROUTER") : null;
    apiSuccess(route.res, { members: state.members, candidates: candidates?.candidates ?? null, candidatesLimited: candidates?.limited ?? null });
    return true;
  }
  if (rest === "/comments") {
    assertQuery(params, params.has("card") ? ["card"] : []);
    const card = params.get("card");
    const rows = store.snapshot(projectId).rows.a4_comments.filter((row) => card === null || row.card_id === card);
    apiSuccess(route.res, { comments: rows.map((row) => {
      let body: string | null = null;
      let reasonCode: string | null = null;
      try {
        body = getPrivate(route.workspace, projectId, String(row.blob_ref), String(row.body_sha256)).toString("utf8");
      } catch (error) {
        reasonCode = error instanceof A4BlobError ? error.code : "BLOB_UNREADABLE";
      }
      return { commentId: row.comment_id, cardId: row.card_id, revisionNo: row.revision_no, stage: row.stage, authorKey: row.author_key,
        inReplyTo: row.in_reply_to, body, reasonCode, ts: row.ts };
    }) });
    return true;
  }
  if (rest === "/evidence") {
    assertQuery(params, params.has("revision") ? ["revision"] : []);
    const revision = params.has("revision") ? Number(params.get("revision")) : state.project.revision_no;
    if (!Number.isSafeInteger(revision) || revision < 0) throw a4Fail(400, "QUERY_INVALID", "Choose a revision number.");
    apiSuccess(route.res, { revisionNo: revision, refs: state.refs.filter((ref) => ref.revisionNo === revision).map((ref) => ({ refKind: ref.refKind, refId: ref.refId,
      sha256: ref.sha256, status: ref.status, trustTier: ref.trustTier, reasonCodes: ref.reasonCodes, lane: ref.lane, claimKind: ref.claimKind })) });
    return true;
  }
  const unproduced = /^\/(value|monitor|conformance)$/.exec(rest)?.[1];
  if (unproduced !== undefined) {
    // The producers land with Adapt (P1-61, conformance) and Activate (P1-62, value and monitor); until then nothing is evaluated.
    assertQuery(params, unproduced === "conformance" && params.has("stage") ? ["stage"] : []);
    if (params.has("stage")) stageInput(params.get("stage"));
    apiSuccess(route.res, { projectId, view: unproduced, status: "not_evaluated", reasonCodes: ["NO_PRODUCER_REGISTERED"], items: [],
      claim: unboundClaim(projectId, unproduced, unproduced !== "monitor") });
    return true;
  }
  return false;
}

/**
 * GET …/verify, before any verified snapshot: it exists to show a failing chain. No query parameters at all (trust
 * comes from the server operator's trust list only; `?trustList=` is 400). Workspace OWNERs, AUDITORs and the admin
 * token read every project; anyone else proves membership through the verified chain, so a chain that fails to verify
 * is 403 for them rather than a report hidden from privileged readers.
 */
function verifyRead(route: A4Route, projectId: string): true {
  const { store, principal } = route;
  assertQuery(route.params, []);
  // Nor a body: one naming a trust list (or anything else) is refused rather than silently ignored (P1-63).
  const headers = route.req.headers ?? {};
  if (headers["transfer-encoding"] !== undefined || Number(headers["content-length"] ?? 0) > 0) {
    throw a4Fail(400, "INPUT_INVALID", "This route takes no body; verification trust comes only from the server operator's trust list.");
  }
  let head: A4ProjectRow | null | undefined;
  try {
    head = store.readHead(projectId);
  } catch {
    head = undefined; // Rows exist and do not verify: report them.
  }
  if (head === null) throw a4Fail(404, "A4_PROJECT_NOT_FOUND", `no A4 project ${projectId}`);
  if (principal !== null && !principal.roles.includes("OWNER") && !principal.roles.includes("AUDITOR")) {
    let members: A4Member[];
    try {
      members = store.membersOf(projectId);
    } catch {
      throw a4Fail(403, "A4_NOT_A_MEMBER", "Membership cannot be read from a chain that fails verification; a workspace OWNER or AUDITOR can read the report.");
    }
    assertVisible(route, members);
  }
  apiSuccess(route.res, { schema: "amc.a4-verify/v1", projectId, section: "integrity", report: verifyA4Chain(store.ledger, projectId),
    boundary: "Integrity of bytes under this workspace's keys and the operator's trust list; not evidence about the agent.",
    claim: unboundClaim(projectId, "verify", false) });
  return true;
}

async function dispatch(route: A4Route): Promise<void> {
  const rest = route.pathname.slice(A4_API_PREFIX.length);
  if (rest === "/options" && route.method === "GET") return options(route);
  if (rest === "/inbox" && route.method === "GET") return inbox(route);
  if (rest === "/projects" && route.method === "GET") {
    assertQuery(route.params, []);
    return apiSuccess(route.res, { projects: visibleProjects(route).map(({ row, members }) => projectView(row, members, null)) });
  }
  if (rest === "/projects" && route.method === "POST") {
    assertQuery(route.params, []);
    return createProject(route);
  }
  const match = PROJECT_PATH.exec(rest);
  if (match !== null) {
    const projectId = match[1]!;
    const tail = match[2] ?? "";
    if (/^\/releases(\/|$)/.test(tail)) {
      if (await handleA4ReleaseRoute(route, projectId, tail)) return;
    } else if (route.method === "GET") {
      if (projectRead(route, projectId, tail)) return;
    } else {
      assertQuery(route.params, []);
      if (await handleA4StageRoute(route, projectId, tail)) return;
      if (await projectMutation(route, projectId, tail)) return;
    }
  }
  throw a4Fail(404, "A4_ROUTE_NOT_FOUND", "No A4 route matches this path.");
}

function refuse(res: ServerResponse, status: number, code: string, message: string): true {
  res.writeHead(status, { "Content-Type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ ok: false, error: message, code }));
  return true;
}

export async function handleA4Route(pathname: string, method: string, req: IncomingMessage, res: ServerResponse,
  context: { workspace: string; nativeTasks?: NativeTaskApiContext }): Promise<boolean> {
  if (pathname !== A4_API_PREFIX && !pathname.startsWith(`${A4_API_PREFIX}/`)) return false;
  const nativeTasks = context.nativeTasks;
  if (!nativeTasks) return refuse(res, 401, "A4_AUTH_REQUIRED", "A4 routes are served only through authenticated Studio sessions.");
  if (nativeTasks.demo) return refuse(res, 403, "DEMO_REFUSED", "The demo session cannot reach A4 projects.");
  if (!a4PreviewEnabled()) return refuse(res, 404, "A4_PREVIEW_DISABLED", "A4 Forge is not enabled in this workspace.");
  const resolved = resolveA4Principal({ workspace: context.workspace, nativeTasks, pathname, method });
  if (!resolved.ok) return refuse(res, resolved.status, resolved.code, resolved.message);
  const verb = method.toUpperCase();
  if (verb !== "GET" && verb !== "POST") return refuse(res, 405, "METHOD_NOT_ALLOWED", "A4 routes take GET or POST.");
  res.setHeader("cache-control", "no-store");
  let store: A4Store;
  try {
    store = openA4Store(context.workspace);
  } catch (error) {
    sendError(res, error, null);
    return true;
  }
  try {
    await dispatch({ workspace: context.workspace, store, native: nativeTasks, principal: resolved.principal, pathname, method: verb,
      params: new URL(req.url ?? "/", "http://a4.invalid").searchParams, req, res });
  } catch (error) {
    sendError(res, error, PROJECT_PATH.exec(pathname.slice(A4_API_PREFIX.length))?.[1] ?? null);
  } finally {
    store.close();
  }
  return true;
}

/**
 * A4 Forge over MCP (P1-64; design §12.3): four reads and one self-reported comment, registered only under
 * AMC_A4_PREVIEW=1. No tool decides, builds, completes or releases; decisions stay with people in Studio. Every result
 * goes through withClaim with the server's own envelope (the readiness evaluator's `claim`, or the router's unbound
 * claim where no producer exists yet), never one composed here.
 *
 * Identity: the MCP server is a local process with no per-user session. An `amc approvals login` token file named by
 * AMC_A4_SESSION_TOKEN_FILE in the server's MCP config is the principal (admission native_login_token, in memory only),
 * re-resolved against the signed users.yaml on every call. That file is the user's whole Studio session and the agent
 * host can read it, so only a VIEWER-only user's session is accepted. The comment tool refuses without one; reads without
 * one answer as the router's admin token does (every project, reads only). Never a tool argument. Every tool refuses
 * while the workspace is read-only.
 *
 * Signing: this process never holds the vault. A comment is a signed transition, so amc_a4_comment sends it to the
 * workspace's running Studio as POST /api/v1/a4/projects/:id/comments with that session, and Studio's process signs.
 * The session goes only to a Studio whose recorded process is alive and whose recorded address is this machine. The vault
 * passphrase opens the auditor key that signs users.yaml, and anything in this server's environment is readable by the
 * agent host, so every A4 tool refuses while AMC_VAULT_PASSPHRASE or AMC_VAULT_PASSPHRASE_FILE is set here (P1-64 review).
 */
import { networkInterfaces } from "node:os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";
import { A4BlobError } from "../a4/a4Blobs.js";
import { evaluateFor, loadA4State } from "../a4/a4Gates.js";
import { A4_API_PREFIX, a4PreviewEnabled, headStage, unboundClaim as a4UnboundClaim } from "../a4/a4Router.js";
import { A4_STAGES, type A4Member, type A4Principal, type A4ProjectRow, type A4ProjectV1, type A4Stage } from "../a4/a4Schema.js";
import { A4StoreError, openA4Store, type A4Store } from "../a4/a4Store.js";
import { resolveApiRolePolicy } from "../api/accessPolicy.js";
import { listVerifiedUsers, verifyUsersConfigSignature } from "../auth/authApi.js";
import { createA4Client, type A4Session } from "../sdk/a4Client.js";
import { AMCSDKError } from "../sdk/errors.js";
import { readNativeApprovalSession } from "../setup/nativeApprovalIdentity.js";
import { nativeCsrfTokenForSession } from "../studio/nativeAdmission.js";
import { processRunning, readStudioState } from "../studio/studioState.js";
import { verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { unboundClaim, withClaim } from "./mcpClaimOutput.js";

/** The MCP server config's env entry naming the `amc approvals login` token file; its path is never printed. */
export const A4_SESSION_TOKEN_ENV = "AMC_A4_SESSION_TOKEN_FILE";

const TOOLS = [
  { name: "amc_a4_list_projects", description: "List the A4 Forge projects this identity may read (read-only)", input: "{ workspace?: string }" },
  { name: "amc_a4_project", description: "Show one A4 project: head, members, current revision and readiness status (read-only)", input: "{ projectId: string, workspace?: string }" },
  { name: "amc_a4_readiness", description: "The server's A4 readiness for a project stage, with its own claim (read-only)", input: "{ projectId: string, stage?: string, workspace?: string }" },
  { name: "amc_a4_conformance", description: "The A4 conformance view for a project stage (read-only)", input: "{ projectId: string, stage?: string, workspace?: string }" },
  { name: "amc_a4_comment", description: `Add a self-reported comment to an A4 project card as the user of the ${A4_SESSION_TOKEN_ENV} session (writes a comment; never a decision)`,
    input: "{ projectId: string, cardId: string, body: string, clientRequestId: string, inReplyTo?: string, workspace?: string }" }
];

/** Variables that open the vault; the agent host can read this server's environment (P1-64 review). */
const VAULT_ENV = ["AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE"] as const;
const STUDIO_TIMEOUT_MS = 10_000;
/** state.json is unsigned and outlives a crashed Studio; pid > 0 because processRunning(0) signals the process group. */
const studioStateSchema = z.object({ pid: z.number().int().positive(), apiPort: z.number().int().min(1).max(65_535), host: z.string().min(1) });
/** Studio's answer to POST …/comments: a recorded transition, or a refusal with its code. */
const studioAnswerSchema = z.union([
  z.object({ ok: z.literal(true), data: z.object({ projectId: z.string(), seq: z.number().int().nonnegative(), kind: z.string(), bodyDigest: z.string(),
    replay: z.boolean() }) }),
  z.object({ ok: z.literal(false).optional(), error: z.string(), code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional() })
]);

/** The five A4 tools for MCP_TOOL_METADATA; none without AMC_A4_PREVIEW=1. */
export function a4ToolMetadata(): Array<{ name: string; description: string; input: string }> {
  return a4PreviewEnabled() ? TOOLS : [];
}

interface Ctx { readonly store: A4Store; readonly principal: A4Principal | null; readonly session: A4Session | null; readonly now: number }
type Refusal = { content: Array<{ type: "text"; text: string }>; structuredContent?: { status: number; code: string }; isError: true };
type ToolResult = ReturnType<typeof withClaim> | Refusal;
interface Host { readonly defaultWorkspace: string; readonly enforceRateLimit: () => void; readonly validateWorkspace: (workspace: string) => string }

/** Studio's read-only rule (users or trust signature invalid; a4Store's readOnlyNow keeps it private); unreadable counts as read-only. */
function readOnly(workspace: string): boolean {
  try {
    const users = verifyUsersConfigSignature(workspace);
    return (users.signatureExists && !users.valid) || !verifyTrustConfigSignature(workspace).valid;
  } catch {
    return true;
  }
}

/** The refusal an MCP client can key on: the status and code as text and as structuredContent. A4 messages start with their code. */
function refusal(name: string, status: number, code: string, message: string): Refusal {
  const text = message.startsWith(`${code}: `) ? message : `${code}: ${message}`;
  return { content: [{ type: "text", text: `${name} refused (${status}): ${text}` }], structuredContent: { status, code }, isError: true };
}

/** The router's sendError classification, so a stored row that no longer parses is an integrity failure and nothing else leaks raw. */
function refusalFor(name: string, error: unknown): Refusal {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return refusal(name, 409, "A4_INTEGRITY_FAILED", `A stored A4 record does not parse${issue ? ` (${issue.path.join(".") || "row"}: ${issue.message})` : ""}.`);
  }
  if (error instanceof A4BlobError) return refusal(name, error.code === "VAULT_LOCKED" ? 423 : error.code === "SECRET_SCAN_REFUSED" ? 400 : 409, error.code, error.message);
  const tagged = error as { status?: unknown; code?: unknown } | null;
  if (error instanceof Error && typeof tagged?.status === "number" && typeof tagged.code === "string") return refusal(name, tagged.status, tagged.code, error.message);
  return refusal(name, 500, "A4_INTERNAL", "The A4 request could not be completed; retry, and check the workspace if it persists.");
}

/**
 * The workspace's Studio, only while its recorded process is alive and its recorded address is this machine (loopback, a
 * wildcard bind, or one of this machine's interface addresses), so the session never reaches another host or a listener
 * left on a dead Studio's port. The recorded bind is used unchanged so Studio's native host and origin checks match.
 */
function localStudioUrl(workspace: string): string {
  let recorded: unknown = null;
  try {
    recorded = readStudioState(workspace);
  } catch {
    // An unreadable state file names no running Studio.
  }
  const studio = studioStateSchema.safeParse(recorded);
  // ponytail: pid liveness, not identity; a reused pid of this same OS user still passes.
  if (!studio.success || !processRunning(studio.data.pid)) {
    throw new A4StoreError(503, "A4_STUDIO_NOT_RUNNING", "Studio records and signs comments; start it with `amc studio start` and AMC_A4_PREVIEW=1.");
  }
  const host = studio.data.host.replace(/^\[|\]$/g, "").toLowerCase();
  const local = ["127.0.0.1", "::1", "localhost", "0.0.0.0", "::"].includes(host)
    || Object.values(networkInterfaces()).some((nics) => nics?.some((nic) => nic.address.toLowerCase() === host));
  if (!local) throw new A4StoreError(403, "A4_STUDIO_NOT_LOCAL", `Studio's recorded address ${host} is not on this machine, so the session is not sent there.`);
  return `http://${host.includes(":") ? `[${host}]` : host}:${studio.data.apiPort}`;
}

/** A failed call to Studio: only a failed connection means Studio is not running. */
function studioFailure(error: unknown, baseUrl: string): unknown {
  if (!(error instanceof AMCSDKError)) return error;
  if (error.code === "INVALID_JSON") {
    return new A4StoreError(502, "A4_STUDIO_BAD_ANSWER", `${baseUrl} answered HTTP ${error.status ?? "?"} without JSON; it may not be this workspace's Studio.`);
  }
  if (error.cause instanceof Error && error.cause.name === "TimeoutError") {
    return new A4StoreError(504, "A4_STUDIO_TIMEOUT", `Studio at ${baseUrl} did not answer within ${STUDIO_TIMEOUT_MS / 1000} s. The comment may be recorded: `
      + "retry with the same clientRequestId for the recorded result.");
  }
  return new A4StoreError(503, "A4_STUDIO_NOT_RUNNING", `Studio at ${baseUrl} did not answer; start it with \`amc studio start\` and AMC_A4_PREVIEW=1.`);
}

/**
 * The configured session's principal from one verified users.yaml read, with the route's role class re-run, and the
 * Studio credentials of that same session (cookie and native CSRF proof); null without one.
 */
function sessionPrincipal(workspace: string, pathname: string, method: "GET" | "POST"): { principal: A4Principal; session: A4Session } | null {
  const tokenFile = process.env[A4_SESSION_TOKEN_ENV];
  if (!tokenFile) return null;
  let read: ReturnType<typeof readNativeApprovalSession>;
  try {
    read = readNativeApprovalSession(workspace, tokenFile);
  } catch (error) {
    // An open error names the file; only the token checks' own messages pass through.
    const reason = error instanceof Error && (error as NodeJS.ErrnoException).code === undefined ? error.message : "The session token file could not be opened";
    throw new A4StoreError(401, "A4_SESSION_REQUIRED", `${reason}. Run \`amc approvals login\` for a new token file.`);
  }
  const actor = read.payload;
  let verified: ReturnType<typeof listVerifiedUsers>;
  try {
    verified = listVerifiedUsers(workspace);
  } catch (error) {
    throw new A4StoreError(403, "A4_IDENTITY_UNVERIFIED", `users.yaml could not be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
  const user = verified.users.find((row) => row.userId === actor.userId && row.username === actor.username);
  if (!user || user.status !== "ACTIVE") throw new A4StoreError(403, "A4_USER_DISABLED", "The session's user is not an ACTIVE user in the signed users.yaml.");
  // The agent host can read this file and call Studio with it, so it must not be able to decide or build: APPROVER, AUDITOR
  // and OWNER decide A4 gates, OPERATOR builds. Live roles equal the token's (verifyTrackedSessionToken refuses a change).
  if (user.roles.some((role) => role !== "VIEWER")) {
    throw new A4StoreError(403, "A4_SESSION_TOO_PRIVILEGED", `The ${A4_SESSION_TOKEN_ENV} session can act in Studio beyond reading and commenting. Log in as a dedicated user whose only role is VIEWER.`);
  }
  const required = resolveApiRolePolicy(pathname, method).roles;
  if (!user.roles.some((role) => required.includes(role))) throw new A4StoreError(403, "PRINCIPAL_ROLE_INSUFFICIENT", `This tool needs one of ${required.join(", ")}.`);
  const principal: A4Principal = { key: `LOCAL_USER:${user.userId}`, authSource: "LOCAL_USER", userId: user.userId, username: user.username,
    roles: [...user.roles], admission: "native_login_token", identityCheck: "users_yaml", provenance: {
      usersYamlSignerFingerprint: verified.signerFingerprint, createdTs: user.createdTs, createdBy: user.createdBy ?? null, hostMembershipId: null } };
  return { principal, session: { cookie: `amc_session=${encodeURIComponent(read.token)}`, nativeCsrfToken: nativeCsrfTokenForSession(actor) } };
}

/** The router's read rule (assertVisible): members, workspace OWNERs and AUDITORs, and the admin-token view. */
const visible = (principal: A4Principal | null, members: readonly A4Member[]): boolean => principal === null
  || principal.roles.includes("OWNER") || principal.roles.includes("AUDITOR") || members.some((member) => member.principalKey === principal.key);

function readable(ctx: Ctx, projectId: string) {
  const state = loadA4State(ctx.store, projectId, ctx.now);
  if (!visible(ctx.principal, state.members)) throw new A4StoreError(403, "A4_NOT_A_MEMBER", "You are not a member of this project.");
  return state;
}

/** GET /projects/:id/readiness's evaluation: the one evaluator, full integrity, for this principal. */
const readinessAt = (ctx: Ctx, state: ReturnType<typeof loadA4State>, stage: A4Stage) =>
  evaluateFor(ctx.store, state, ctx.principal, { fullIntegrity: true }, stage, ctx.now).readiness;

/** `amc.a4-project/v1`, as the router's projectView builds it. */
const projectView = (row: A4ProjectRow, members: readonly A4Member[], readiness: A4ProjectV1["readiness"]): A4ProjectV1 => ({
  schema: "amc.a4-project/v1", projectId: row.project_id, workspaceId: row.workspace_id, agentId: row.agent_id, name: row.name, stage: row.stage,
  step: row.step, hold: row.hold === 1, holdReason: row.hold_reason, revisionNo: row.revision_no, headSeq: row.head_seq, headDigest: row.head_digest,
  deployedReleaseId: row.deployed_release_id, baseReleaseId: row.base_release_id, createdByKey: row.created_by_key, createdTs: row.created_ts,
  updatedTs: row.updated_ts, members: [...members], readiness
});

async function a4Tool(host: Host, name: string, workspace: string | undefined, pathname: string, method: "GET" | "POST",
  handle: (ctx: Ctx) => ToolResult | Promise<ToolResult>): Promise<ToolResult> {
  host.enforceRateLimit();
  try {
    // Before anything reads the vault: readiness probes the signing key, which would unlock it from this variable.
    const vaultVariable = VAULT_ENV.find((variable) => process.env[variable]);
    if (vaultVariable) {
      throw new A4StoreError(403, "A4_SIGNING_KEY_IN_AGENT_HOST", `${vaultVariable} is set in this MCP server's environment, where the agent host can read it, `
        + "and it opens the workspace's signing keys. Remove it from the MCP config's env and from the shell that starts the agent host; Studio signs A4 records.");
    }
    const ws = host.validateWorkspace(workspace ?? host.defaultWorkspace);
    if (readOnly(ws)) throw new A4StoreError(403, "NATIVE_READ_ONLY", "The workspace is read-only until its users and trust signatures verify.");
    const signedIn = sessionPrincipal(ws, pathname, method);
    const store = openA4Store(ws);
    try {
      return await handle({ store, principal: signedIn?.principal ?? null, session: signedIn?.session ?? null, now: Date.now() });
    } finally {
      store.close();
    }
  } catch (error) {
    return refusalFor(name, error);
  }
}

/** Registers the five A4 tools on `server`; nothing without AMC_A4_PREVIEW=1. */
export function registerA4Tools(server: McpServer, host: Host): void {
  if (!a4PreviewEnabled()) return;
  const workspace = z.string().optional().describe("Path to the AMC workspace (defaults to current directory)");
  const projectId = z.string().regex(/^a4p_[0-9a-f]{32}$/).describe("A4 project ID (a4p_ and 32 hex characters)");
  const stage = z.enum(A4_STAGES).optional().describe("Stage (default: the project's head stage)");
  const projectPath = (id: string) => `${A4_API_PREFIX}/projects/${id}`;

  server.tool("amc_a4_list_projects", TOOLS[0]!.description, { workspace }, async (args) =>
    a4Tool(host, "amc_a4_list_projects", args.workspace, `${A4_API_PREFIX}/projects`, "GET", (ctx) => {
      const projects = ctx.store.listProjects().map((row) => ({ row, members: ctx.store.membersOf(row.project_id) }))
        .filter(({ members }) => visible(ctx.principal, members)).map(({ row, members }) => projectView(row, members, null));
      const rows = projects.map((p) => `- ${p.name} (${p.projectId}): ${p.stage}, ${p.step}${p.hold ? ", on hold" : ""}`);
      return withClaim(projects.length === 0 ? "No A4 projects this identity may read." : `${projects.length} A4 project(s):\n${rows.join("\n")}`,
        unboundClaim("mcp:amc_a4_list_projects", "human_review"), { projects });
    }));

  server.tool("amc_a4_project", TOOLS[1]!.description, { projectId, workspace }, async (args) =>
    a4Tool(host, "amc_a4_project", args.workspace, projectPath(args.projectId), "GET", (ctx) => {
      const state = readable(ctx, args.projectId);
      const readiness = readinessAt(ctx, state, headStage(state.project));
      const revision = state.revisions.find((row) => row.revision_no === state.project.revision_no) ?? null;
      const body = { ...projectView(state.project, state.members, { status: readiness.status, bindingDigest: readiness.bindingDigest }),
        revision: revision && { revisionNo: revision.revision_no, stage: revision.stage, parentRevisionNo: revision.parent_revision_no,
          specDigest: revision.spec_digest, resourceDigestsSha256: revision.resource_digests_sha256, createdByKey: revision.created_by_key, ts: revision.ts },
        gates: readiness.gates, claim: readiness.claim };
      return withClaim(`A4 project ${body.name} (${body.projectId}): ${body.stage}, ${body.step}; readiness ${readiness.status}; `
        + `${body.members.length} member(s); head seq ${body.headSeq}.`, readiness.claim, body);
    }));

  server.tool("amc_a4_readiness", TOOLS[2]!.description, { projectId, stage, workspace }, async (args) =>
    a4Tool(host, "amc_a4_readiness", args.workspace, `${projectPath(args.projectId)}/readiness`, "GET", (ctx) => {
      const state = readable(ctx, args.projectId);
      const readiness = readinessAt(ctx, state, args.stage ?? headStage(state.project));
      const open = readiness.items.filter((item) => item.mandatory && item.status !== "READY" && item.status !== "COMPLETE")
        .map((item) => `- ${item.id}: ${item.status}${item.reasonCodes.length > 0 ? ` (${item.reasonCodes.join(", ")})` : ""}`);
      return withClaim([`A4 readiness for ${args.projectId} at ${args.stage ?? headStage(state.project)}: ${readiness.status}`, ...open,
        ...(readiness.nextAction ? [`Next: ${readiness.nextAction.label}`] : [])].join("\n"), readiness.claim, readiness);
    }));

  server.tool("amc_a4_conformance", TOOLS[3]!.description, { projectId, stage, workspace }, async (args) =>
    a4Tool(host, "amc_a4_conformance", args.workspace, `${projectPath(args.projectId)}/conformance`, "GET", (ctx) => {
      readable(ctx, args.projectId);
      // The router's answer until Adapt (P1-61) registers the producer: nothing is evaluated.
      const body = { projectId: args.projectId, view: "conformance", status: "not_evaluated", reasonCodes: ["NO_PRODUCER_REGISTERED"], items: [],
        claim: a4UnboundClaim(args.projectId, "conformance", true) };
      return withClaim(`A4 conformance for ${args.projectId}: not evaluated (NO_PRODUCER_REGISTERED).`, body.claim, body);
    }));

  server.tool("amc_a4_comment", TOOLS[4]!.description, {
    projectId,
    cardId: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).describe("The card the comment belongs to"),
    body: z.string().trim().min(1).max(16_384).describe("Comment text; stored encrypted in the project's blob store"),
    inReplyTo: z.string().regex(/^a4c_[0-9a-f]{32}$/).optional().describe("Comment ID this replies to"),
    clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/).describe("Your idempotency key; a retry with the same key and text answers the recorded result"),
    workspace
  }, async (args) =>
    a4Tool(host, "amc_a4_comment", args.workspace, `${projectPath(args.projectId)}/comments`, "POST", async (ctx) => {
      if (ctx.session === null) {
        throw new A4StoreError(401, "A4_SESSION_REQUIRED", `Comments need a signed-in user: set ${A4_SESSION_TOKEN_ENV} in this MCP server's config to an \`amc approvals login\` token file.`);
      }
      // Studio's route checks membership, dedupes the clientRequestId, writes the encrypted blob and signs the transition.
      const baseUrl = localStudioUrl(ctx.store.workspace);
      const { status, body } = await createA4Client({ baseUrl, session: ctx.session, timeoutMs: STUDIO_TIMEOUT_MS }).comment(args.projectId,
        { body: args.body, cardId: args.cardId, inReplyTo: args.inReplyTo ?? null, clientRequestId: args.clientRequestId }).catch((error: unknown) => {
        throw studioFailure(error, baseUrl);
      });
      // Missing data never reads as recorded: a success names this project and a seq, and a refusal carries its error.
      const answer = studioAnswerSchema.safeParse(body);
      const success = status >= 200 && status < 300;
      if (!answer.success || (answer.data.ok === true) !== success || (answer.data.ok === true && answer.data.data.projectId !== args.projectId)) {
        throw new A4StoreError(502, "A4_STUDIO_BAD_ANSWER", `${baseUrl} answered HTTP ${status} without a recorded comment or a refusal; nothing was reported as recorded.`);
      }
      if (answer.data.ok !== true) return refusal("amc_a4_comment", status, answer.data.code ?? `HTTP_${status}`, answer.data.error);
      const result = answer.data.data;
      return withClaim(`Recorded a self-reported comment on ${args.projectId} at seq ${result.seq}${result.replay ? " (an earlier request with this clientRequestId)" : ""}.`,
        unboundClaim("mcp:amc_a4_comment", "human_review"), { ...result });
    }));
}

/**
 * A4 Forge over MCP (P1-64; design §12.3): four reads and one self-reported comment, registered only under
 * AMC_A4_PREVIEW=1. No tool decides, builds, completes or releases; decisions stay with people in Studio. Every result
 * goes through withClaim with the server's own envelope (the readiness evaluator's `claim`, or the router's unbound
 * claim where no producer exists yet), never one composed here.
 *
 * Identity: the MCP server is a local process with no per-user session. An `amc approvals login` token file named by
 * AMC_A4_SESSION_TOKEN_FILE in the server's MCP config is the principal (admission native_login_token, in memory only:
 * a comment records the user's key and name, as one typed in Studio), re-resolved against the signed users.yaml on
 * every call. That file is the user's whole Studio session and the agent host can read it, so only a VIEWER-only user's
 * session is accepted. The comment tool refuses without one; reads without one answer as the router's admin token does
 * (every project, reads only). Never a tool argument. Every tool refuses while the workspace is read-only.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { evaluateFor, loadA4State } from "../a4/a4Gates.js";
import { A4_API_PREFIX, a4PreviewEnabled, headStage, mutationResult, priorReplay, unboundClaim as a4UnboundClaim } from "../a4/a4Router.js";
import { A4_STAGES, type A4Member, type A4Principal, type A4ProjectRow, type A4ProjectV1, type A4Stage } from "../a4/a4Schema.js";
import { A4StoreError, openA4Store, type A4Store } from "../a4/a4Store.js";
import { resolveApiRolePolicy } from "../api/accessPolicy.js";
import { listVerifiedUsers, verifyUsersConfigSignature } from "../auth/authApi.js";
import { readNativeApprovalActor } from "../setup/nativeApprovalIdentity.js";
import { verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
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

/** The five A4 tools for MCP_TOOL_METADATA; none without AMC_A4_PREVIEW=1. */
export function a4ToolMetadata(): Array<{ name: string; description: string; input: string }> {
  return a4PreviewEnabled() ? TOOLS : [];
}

interface Ctx { readonly store: A4Store; readonly principal: A4Principal | null; readonly now: number }
type ToolResult = ReturnType<typeof withClaim> | { content: Array<{ type: "text"; text: string }>; isError: true };
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

/** The configured session's principal from one verified users.yaml read, with the route's role class re-run; null without one. */
function sessionPrincipal(workspace: string, pathname: string, method: "GET" | "POST"): A4Principal | null {
  const tokenFile = process.env[A4_SESSION_TOKEN_ENV];
  if (!tokenFile) return null;
  let actor: ReturnType<typeof readNativeApprovalActor>;
  try {
    actor = readNativeApprovalActor(workspace, tokenFile);
  } catch (error) {
    // An open error names the file; only the token checks' own messages pass through.
    const reason = error instanceof Error && (error as NodeJS.ErrnoException).code === undefined ? error.message : "The session token file could not be opened";
    throw new A4StoreError(401, "A4_SESSION_REQUIRED", `${reason}. Run \`amc approvals login\` for a new token file.`);
  }
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
  return { key: `LOCAL_USER:${user.userId}`, authSource: "LOCAL_USER", userId: user.userId, username: user.username, roles: [...user.roles],
    admission: "native_login_token", identityCheck: "users_yaml", provenance: { usersYamlSignerFingerprint: verified.signerFingerprint,
      createdTs: user.createdTs, createdBy: user.createdBy ?? null, hostMembershipId: null } };
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
  handle: (ctx: Ctx) => ToolResult): Promise<ToolResult> {
  host.enforceRateLimit();
  try {
    const ws = host.validateWorkspace(workspace ?? host.defaultWorkspace);
    if (readOnly(ws)) throw new A4StoreError(403, "NATIVE_READ_ONLY", "The workspace is read-only until its users and trust signatures verify.");
    const principal = sessionPrincipal(ws, pathname, method);
    const store = openA4Store(ws);
    try {
      return handle({ store, principal, now: Date.now() });
    } finally {
      store.close();
    }
  } catch (error) {
    return { content: [{ type: "text", text: `${name} refused: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
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
  }, async (args) => {
    const pathname = `${projectPath(args.projectId)}/comments`;
    return a4Tool(host, "amc_a4_comment", args.workspace, pathname, "POST", (ctx) => {
      const principal = ctx.principal;
      if (principal === null) {
        throw new A4StoreError(401, "A4_SESSION_REQUIRED", `Comments need a signed-in user: set ${A4_SESSION_TOKEN_ENV} in this MCP server's config to an \`amc approvals login\` token file.`);
      }
      const fields = { body: args.body, cardId: args.cardId, inReplyTo: args.inReplyTo ?? null, clientRequestId: args.clientRequestId };
      const request = { principalKey: principal.key, clientRequestId: args.clientRequestId, bodyHash: sha256Hex(`POST ${pathname}\n${canonicalize(fields)}`) };
      let result = priorReplay(ctx.store, request, args.projectId);
      if (result === null) {
        // Read roles plus membership, as the router's POST …/comments; the store writes the blob, the dedupe row and the transition.
        if (!visible(principal, ctx.store.membersOf(args.projectId))) throw new A4StoreError(403, "A4_NOT_A_MEMBER", "You are not a member of this project.");
        result = mutationResult(ctx.store.addComment(args.projectId, { actor: principal, body: fields.body, cardId: fields.cardId, inReplyTo: fields.inReplyTo, request }));
      }
      return withClaim(`Recorded a self-reported comment on ${args.projectId} at seq ${String(result.seq)}${result.replay ? " (an earlier request with this clientRequestId)" : ""}.`,
        unboundClaim("mcp:amc_a4_comment", "human_review"), result);
    });
  });
}

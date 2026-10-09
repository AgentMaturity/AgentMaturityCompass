/**
 * A4 Forge identity at the boundary (P1-56; design §5.1, Option B, no frozen edit).
 *
 * Native Studio admission (`isNativeStudioPath` covers /api/v1/a4) already ran Host, Origin, intent and CSRF checks
 * and handed the router `NativeTaskApiContext.principalId`. This module parses that id and re-reads the live record:
 * a LOCAL_USER from the signed users.yaml (`identityCheck: users_yaml`), a WORKSPACE_ROUTER user from the live tracked
 * session records (`identityCheck: session_record`, not a live check: a host deprovisioning is invisible until the
 * record expires, so readiness says IDENTITY_CHECK_LIMITED until P2-33). The records are unsigned files, so a router
 * user holds only the roles every live record for that user grants: Studio admitted the request on the record its
 * signed token names, which is among them, so a planted record can narrow the roles but never widen them (P2-33 passes
 * the token-verified roles through instead). It also re-runs the route's role class
 * against the live roles, because the native path admits `local-demo` as VIEWER. Identity never comes from a body.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { NativeTaskApiContext } from "../api/nativeTasksRouter.js";
import { resolveApiRolePolicy } from "../api/accessPolicy.js";
import { listUsers, listVerifiedUsers } from "../auth/authApi.js";
import { USER_ROLES, type UserRole } from "../auth/roles.js";
import type { A4Member, A4Principal } from "./a4Schema.js";

export type A4Refusal = { ok: false; status: 401 | 403; code: string; message: string };
export type A4Resolution =
  /** The route's role class passed on live roles; project membership is still checked per action (assertMember). */
  | { ok: true; principal: A4Principal; allowed: { read: true; mutate: true } }
  /** The bootstrap admin token reads and does nothing else; there is no flag that lets it decide or create. */
  | { ok: true; principal: null; adminToken: true; allowed: { read: true; mutate: false } }
  | A4Refusal;

const refuse = (status: 401 | 403, code: string, message: string): A4Refusal => ({ ok: false, status, code, message });
const isMutation = (method: string): boolean => !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());

/** The `SessionStoreRecord` fields A4 reads (src/auth/authApi.ts), checked rather than cast. */
const sessionRecordSchema = z.object({
  userId: z.string().min(1), username: z.string().min(1), roles: z.array(z.enum(USER_ROLES)), issuedTs: z.number(), expiresTs: z.number(),
  revoked: z.boolean(), authSource: z.enum(["LOCAL_USER", "WORKSPACE_ROUTER"]).optional()
});
type SessionRecord = z.infer<typeof sessionRecordSchema>;

/**
 * Live, unrevoked WORKSPACE_ROUTER session records. Null, never "none", when the directory cannot be listed for any
 * reason but absence, or when any record in it does not parse: an unreadable source is not an empty one.
 */
function liveRouterSessions(workspace: string, now: number): SessionRecord[] | null {
  const dir = join(workspace, ".amc", "studio", "sessions");
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : null;
  }
  const records: SessionRecord[] = [];
  for (const name of names) {
    let record: SessionRecord;
    try {
      record = sessionRecordSchema.parse(JSON.parse(readFileSync(join(dir, name), "utf8")));
    } catch {
      return null;
    }
    if (record.authSource === "WORKSPACE_ROUTER" && !record.revoked && record.expiresTs > now) records.push(record);
  }
  return records;
}

/** A LOCAL_USER or WORKSPACE_ROUTER principal resolved from live records, or the reason it cannot be. */
function livePrincipal(workspace: string, authSource: A4Principal["authSource"], userId: string, admission: A4Principal["admission"],
  now: number): A4Principal | A4Refusal {
  if (authSource === "WORKSPACE_ROUTER") {
    const sessions = liveRouterSessions(workspace, now);
    if (sessions === null) return refuse(401, "A4_SESSION_UNREADABLE", "The workspace session records could not be read; reopen the console.");
    const mine = sessions.filter((record) => record.userId === userId);
    if (mine.length === 0) return refuse(401, "A4_SESSION_EXPIRED", "No live workspace session for this user; reopen the console.");
    const roles = mine[0]!.roles.filter((role) => mine.every((record) => record.roles.includes(role)));
    if (roles.length === 0 || new Set(mine.map((record) => record.username)).size !== 1) {
      return refuse(401, "A4_SESSION_INCONSISTENT", "This user's live workspace sessions disagree; sign in again.");
    }
    return { key: `WORKSPACE_ROUTER:${userId}`, authSource, userId, username: mine[0]!.username, roles, admission,
      identityCheck: "session_record", provenance: { usersYamlSignerFingerprint: null, createdTs: null, createdBy: null, hostMembershipId: null } };
  }
  // Roles, status and the signer fingerprint all come from the one read whose signature verified.
  let verified;
  try {
    verified = listVerifiedUsers(workspace);
  } catch (error) {
    return refuse(403, "A4_IDENTITY_UNVERIFIED", `users.yaml could not be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
  const user = verified.users.find((row) => row.userId === userId);
  if (!user) return refuse(401, "A4_PRINCIPAL_UNKNOWN", "This session's user is not in users.yaml.");
  if (user.status !== "ACTIVE") return refuse(403, "A4_USER_DISABLED", "This user is revoked; a project membership row is history, not authority.");
  return { key: `LOCAL_USER:${userId}`, authSource, userId, username: user.username, roles: [...user.roles], admission, identityCheck: "users_yaml",
    provenance: { usersYamlSignerFingerprint: verified.signerFingerprint, createdTs: user.createdTs,
      createdBy: user.createdBy ?? null, hostMembershipId: null } };
}

/**
 * The router-entry identity for /api/v1/a4 (design §5.1): 401 without native admission, 403 DEMO_REFUSED for the demo
 * session on every method, read-only for the bootstrap admin token (403 ADMIN_TOKEN_REFUSED on every mutation, project
 * creation included), 403 NATIVE_READ_ONLY on mutations while Studio is read-only, and the route's role class re-run
 * against the live roles.
 */
export function resolveA4Principal(input: { workspace: string; nativeTasks: NativeTaskApiContext | undefined; pathname: string; method: string;
  now?: number }): A4Resolution {
  const { nativeTasks } = input;
  if (!nativeTasks) return refuse(401, "A4_AUTH_REQUIRED", "A4 routes are served only through authenticated Studio sessions.");
  if (nativeTasks.demo) return refuse(403, "DEMO_REFUSED", "The demo session cannot reach A4 projects.");
  const mutation = isMutation(input.method);
  if (nativeTasks.principalId === "bootstrap-admin") {
    if (mutation) return refuse(403, "ADMIN_TOKEN_REFUSED", "The admin token reads A4 projects only; sign in as a workspace user to act.");
    return { ok: true, principal: null, adminToken: true, allowed: { read: true, mutate: false } };
  }
  if (mutation && !nativeTasks.executionAllowed()) return refuse(403, "NATIVE_READ_ONLY", "Studio is read-only until its signed configuration verifies.");
  const parsed = /^session:(LOCAL_USER|WORKSPACE_ROUTER):(.+)$/.exec(nativeTasks.principalId);
  if (!parsed) return refuse(401, "A4_PRINCIPAL_UNRECOGNIZED", "This session does not name a human principal.");
  const principal = livePrincipal(input.workspace, parsed[1] as A4Principal["authSource"], parsed[2]!, "browser_csrf", input.now ?? Date.now());
  if ("ok" in principal) return principal;
  const required = resolveApiRolePolicy(input.pathname, input.method).roles;
  if (!principal.roles.some((role) => required.includes(role))) {
    return refuse(403, "PRINCIPAL_ROLE_INSUFFICIENT", `This route needs one of ${required.join(", ")}.`);
  }
  return { ok: true, principal, allowed: { read: true, mutate: true } };
}

/** The live roles of a principal now; empty when the user is gone or revoked. The CLI (P1-65) refuses token roles beyond these. */
export function liveRolesFor(workspace: string, principal: Pick<A4Principal, "authSource" | "userId">, now = Date.now()): UserRole[] {
  const live = livePrincipal(workspace, principal.authSource, principal.userId, "native_login_token", now);
  return "ok" in live ? [] : live.roles;
}

/**
 * Throws A4_NOT_A_MEMBER unless the principal holds one of `roles` on the project. Workspace OWNERs are implicit
 * project owners and AUDITORs implicit reviewers (design §5.2).
 */
export function assertMember(members: readonly A4Member[], principal: Pick<A4Principal, "key" | "username" | "roles">,
  roles: readonly A4Member["roles"][number][]): void {
  const held = new Set(members.find((member) => member.principalKey === principal.key)?.roles ?? []);
  if (principal.roles.includes("OWNER")) held.add("owner");
  if (principal.roles.includes("AUDITOR")) held.add("reviewer");
  if (!roles.some((role) => held.has(role))) throw Object.assign(new Error(`A4_NOT_A_MEMBER: ${principal.username} holds none of ${roles.join(", ")} on this project`), { code: "A4_NOT_A_MEMBER", status: 403 });
}

/**
 * Who can be added: ACTIVE users.yaml users plus live tracked host sessions, keyed by principal key. `limited` in host
 * mode, or when users.yaml or the session records cannot be read: an unreadable source is not an empty one.
 */
export function memberCandidates(workspace: string, hostMode: boolean, now = Date.now()): {
  candidates: Array<{ principalKey: string; authSource: A4Principal["authSource"]; userId: string; username: string }>; limited: boolean;
} {
  let local: Array<{ principalKey: string; authSource: A4Principal["authSource"]; userId: string; username: string }> = [];
  let localUnreadable = false;
  try {
    local = listUsers(workspace).filter((user) => user.status === "ACTIVE")
      .map((user) => ({ principalKey: `LOCAL_USER:${user.userId}`, authSource: "LOCAL_USER" as const, userId: user.userId, username: user.username }));
  } catch {
    localUnreadable = true;
  }
  const sessions = liveRouterSessions(workspace, now);
  const hosted = new Map((sessions ?? []).map((record) => [`WORKSPACE_ROUTER:${record.userId}`,
    { principalKey: `WORKSPACE_ROUTER:${record.userId}`, authSource: "WORKSPACE_ROUTER" as const, userId: record.userId, username: record.username }]));
  return { candidates: [...local, ...hosted.values()], limited: hostMode || sessions === null || localUnreadable };
}

/** Distinct live host principals and the ACTIVE local user ids, the inputs `deriveSelfApprovalAllowed` reads; null when unreadable. */
export function principalPopulation(workspace: string, now = Date.now()): { activeLocal: string[] | null; hostPrincipals: number | null } {
  let activeLocal: string[] | null;
  try {
    activeLocal = listUsers(workspace).filter((user) => user.status === "ACTIVE").map((user) => user.userId);
  } catch {
    activeLocal = null;
  }
  const sessions = liveRouterSessions(workspace, now);
  return { activeLocal, hostPrincipals: sessions === null ? null : new Set(sessions.map((record) => record.userId)).size };
}

/**
 * users.yaml records of any status created at or after `ts` (a project's CREATED time); null when unreadable. A user
 * added after a project was created, even one revoked again before any A4 write recorded the population, means two
 * principals existed: the self-approval ratchet holds (design §5.3, `amc user add` then `amc user revoke`).
 */
export function usersCreatedSince(workspace: string, ts: number): number | null {
  try {
    return listUsers(workspace).filter((user) => user.createdTs >= ts).length;
  } catch {
    return null;
  }
}

/**
 * LIVE-VAULT-09: console account changes in the auth audit trail. Each change made by the `amc user` commands or the
 * /users/* routes writes one USER_CHANGE audit event (the signed ledger, mirrored as HUMAN_USER_CHANGE in the human action
 * log) naming the account, the change and who made it. Never a password or its hash.
 */
import { userInfo } from "node:os";
import type { UserRole } from "./roles.js";

export type UserChangeActor = { kind: "cli"; osUser: string } | { kind: "session"; userId: string; username: string };
export interface UserChange {
  action: "init" | "add" | "revoke" | "roles" | "password";
  username: string;
  userId: string;
  roles?: UserRole[];
  actor: UserChangeActor;
}

/**
 * The OS account running the command. A uid with no passwd entry (an arbitrary-UID container) has no username and
 * os.userInfo() throws there, so it is recorded as `uid:<n>`: the audit never stops the change it records.
 */
export function cliActor(): UserChangeActor {
  try { return { kind: "cli", osUser: userInfo().username }; } catch { return { kind: "cli", osUser: `uid:${process.getuid?.() ?? "unknown"}` }; }
}

/** The signed-in console user behind a /users/* request (the admin token never gets this far: LIVE-VAULT-16). */
export function sessionActor(auth: { userId: string | null; username: string | null }): UserChangeActor {
  return { kind: "session", userId: auth.userId ?? "unknown", username: auth.username ?? "unknown" };
}

/**
 * Called after the change it records, which stands whatever happens here: a failed ledger write is reported on stderr
 * with the event name, never thrown. The human-log mirror inside writeStudioAuditEventAsync swallows its own failures by
 * design (src/studio/studioAudit.ts), so those are not reported here.
 */
export async function recordUserChange(workspace: string, change: UserChange): Promise<void> {
  try {
    const { writeStudioAuditEventAsync } = await import("../studio/studioAudit.js");
    await writeStudioAuditEventAsync({ workspace, auditType: "USER_CHANGE", severity: "MEDIUM", payload: { ...change } });
  } catch (error) {
    process.stderr.write(`AMC: the USER_CHANGE audit event (${change.action} ${change.username}) was not written: `
      + `${error instanceof Error ? error.message : String(error)}\n`);
  }
}

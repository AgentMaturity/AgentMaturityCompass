import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

/** os.userInfo() as on a uid with no passwd entry (arbitrary-UID containers): it throws. */
const passwd = vi.hoisted(() => ({ missing: false }));
vi.mock("node:os", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:os")>();
  const userInfo = ((options?: { encoding: BufferEncoding }) => {
    if (passwd.missing) throw Object.assign(new Error("A system error occurred: uv_os_get_passwd returned ENOENT (no such file or directory)"), { code: "ERR_SYSTEM_ERROR" });
    return real.userInfo(options);
  }) as typeof real.userInfo;
  return { ...real, userInfo, default: { ...real, userInfo } };
});

import { addUserAsync, initUsersConfig } from "../src/auth/authApi.js";
import { userAddCliAsync, userPasswordCliAsync, userRevokeCliAsync, userRoleSetCliAsync } from "../src/auth/authCli.js";
import { verifyHumanActionLog } from "../src/auth/humanLog.js";
import { recordUserChange } from "../src/auth/userAudit.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/** LIVE-VAULT-09: console account changes are in the auth audit trail (the signed human action log), never with a password or hash. */
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function workspaceWithOwner(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-user-audit-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: "owner-audit-pass-123" });
  return workspace;
}

type Entry = { type: string; username: string | null; payload: Record<string, unknown> };
function userChanges(workspace: string): Entry[] {
  const file = join(workspace, ".amc", "studio", "audit", "human.log");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Entry).filter((entry) => entry.type === "HUMAN_USER_CHANGE");
}

describe("account changes in the human action log", () => {
  test.skipIf(process.platform === "win32")("an OS account without a passwd entry still changes accounts, recorded as uid:<n> (skeptic SK-10)", async () => {
    const workspace = workspaceWithOwner();
    passwd.missing = true;
    try { await userAddCliAsync({ workspace, username: "member", roles: ["VIEWER"], password: "member-audit-pass-123" }); } finally { passwd.missing = false; }
    expect(userChanges(workspace).at(-1)!.payload).toMatchObject({ action: "add", username: "member", actor: { kind: "cli", osUser: `uid:${process.getuid!()}` } });
  });

  test("recordUserChange writes one HUMAN_USER_CHANGE entry and nothing secret", async () => {
    const workspace = workspaceWithOwner();
    const user = await addUserAsync({ workspace, username: "viewer", password: "viewer-audit-pass-123", roles: ["VIEWER"] });
    await recordUserChange(workspace, { action: "add", username: user.username, userId: user.userId, roles: user.roles, actor: { kind: "cli", osUser: "tester" } });
    const changes = userChanges(workspace);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.payload).toEqual({ action: "add", username: "viewer", userId: user.userId, roles: ["VIEWER"], actor: { kind: "cli", osUser: "tester" } });
    expect(JSON.stringify(changes[0])).not.toMatch(/passwordHash|viewer-audit-pass|scrypt\$/);
    expect(verifyHumanActionLog(workspace).ok).toBe(true);
  });

  test("the CLI wrappers record add, roles, password and revoke with the OS user as the actor", async () => {
    const workspace = workspaceWithOwner();
    await userAddCliAsync({ workspace, username: "member", roles: ["VIEWER"], password: "member-audit-pass-123" });
    await userRoleSetCliAsync({ workspace, username: "member", roles: ["AUDITOR"] });
    await userPasswordCliAsync({ workspace, username: "member", password: "member-audit-pass-456" });
    await userRevokeCliAsync({ workspace, username: "member" });
    const changes = userChanges(workspace);
    expect(changes.map((entry) => entry.payload.action)).toEqual(["add", "roles", "password", "revoke"]);
    for (const entry of changes) expect(entry.payload).toMatchObject({ username: "member", actor: { kind: "cli", osUser: userInfo().username } });
    expect(JSON.stringify(changes)).not.toMatch(/passwordHash|member-audit-pass/);
    expect(verifyHumanActionLog(workspace).ok).toBe(true);
  });

  test("a failed audit write never undoes the change and is reported on stderr", async () => {
    const workspace = workspaceWithOwner();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    rmSync(join(workspace, ".amc"), { recursive: true, force: true });
    await recordUserChange(workspace, { action: "revoke", username: "gone", userId: "u-gone", actor: { kind: "cli", osUser: "tester" } });
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toContain("USER_CHANGE audit event (revoke gone) was not written");
  });
});

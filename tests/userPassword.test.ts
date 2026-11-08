import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  addUser, addUserAsync, authenticateUser, createSession, createSessionAsync, initUsersConfig, listUsers, revokeUser, revokeUserAsync, setUserPasswordAsync,
  setUserRoles, setUserRolesAsync, usersConfigPath, usersConfigSigPath, verifyTrackedSessionToken, verifyUsersConfigSignature
} from "../src/auth/authApi.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const OLD = "owner-old-pass-123";
const NEW = "owner-new-pass-456";
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function workspaceWithOwner(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-user-password-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: OLD });
  return workspace;
}
const user = (workspace: string, username: string) => listUsers(workspace).find((row) => row.username === username)!;
const usersFiles = (workspace: string) => [readFileSync(usersConfigPath(workspace)), readFileSync(usersConfigSigPath(workspace))];

describe("amc user password (LIVE-VAULT-06)", () => {
  test("replaces the verifier, keeps the account, and revokes that user's sessions only", async () => {
    const workspace = workspaceWithOwner();
    addUser({ workspace, username: "member", password: "member-pass-1234", roles: ["VIEWER"] });
    const before = user(workspace, "owner");
    const ownerSession = createSession({ workspace, user: before });
    const memberSession = createSession({ workspace, user: user(workspace, "member") });
    await setUserPasswordAsync({ workspace, username: "OWNER", password: NEW });
    expect(authenticateUser({ workspace, username: "owner", password: OLD }).ok).toBe(false);
    expect(authenticateUser({ workspace, username: "owner", password: NEW }).ok).toBe(true);
    expect(verifyTrackedSessionToken({ workspace, token: ownerSession.token })).toMatchObject({ ok: false, error: "session revoked" });
    expect(verifyTrackedSessionToken({ workspace, token: memberSession.token }).ok).toBe(true);
    expect(verifyUsersConfigSignature(workspace).valid).toBe(true);
    const after = user(workspace, "owner");
    expect({ userId: after.userId, status: after.status, roles: after.roles }).toEqual({ userId: before.userId, status: before.status, roles: before.roles });
    expect(after.passwordHash).not.toBe(before.passwordHash);
  });

  test("a login that checked the old password while the reset ran gets no working session (skeptic SK-3a)", async () => {
    const workspace = workspaceWithOwner();
    const login = authenticateUser({ workspace, username: "owner", password: OLD });
    expect(login.ok).toBe(true);
    await setUserPasswordAsync({ workspace, username: "owner", password: NEW });
    await expect(createSessionAsync({ workspace, user: login.user! })).rejects.toThrow("local session authority changed while signing");
    const minted = createSession({ workspace, user: login.user! }); // the synchronous API has no post-sign re-check
    expect(verifyTrackedSessionToken({ workspace, token: minted.token })).toMatchObject({ ok: false, error: "password changed" });
    expect(verifyTrackedSessionToken({ workspace, token: (await createSessionAsync({ workspace, user: user(workspace, "owner") })).token }).ok).toBe(true);
    expect(verifyTrackedSessionToken({ workspace, token: createSession({ workspace, user: user(workspace, "owner") }).token }).ok).toBe(true);
  });

  test("a session whose record the reset could not mark revoked still stops verifying (skeptic SK-3b)", async () => {
    const workspace = workspaceWithOwner();
    const session = createSession({ workspace, user: user(workspace, "owner") });
    const dir = join(workspace, ".amc", "studio", "sessions");
    const record = join(dir, readdirSync(dir).find((name) => name.endsWith(".json"))!);
    chmodSync(record, 0o000); // a Studio-owned 0600 record a CLI running as another user cannot read
    try { await setUserPasswordAsync({ workspace, username: "owner", password: NEW }); } finally { chmodSync(record, 0o600); }
    expect(JSON.parse(readFileSync(record, "utf8")).revoked).toBe(false);
    expect(verifyTrackedSessionToken({ workspace, token: session.token })).toMatchObject({ ok: false, error: "password changed" });
  });

  test("refuses an unknown username without changing users.yaml", async () => {
    const workspace = workspaceWithOwner();
    const before = usersFiles(workspace);
    await expect(setUserPasswordAsync({ workspace, username: "nobody", password: NEW })).rejects.toThrow("user not found: nobody");
    expect(usersFiles(workspace)).toEqual(before);
  });
});

describe("a workspace always keeps one ACTIVE OWNER (LIVE-VAULT-17)", () => {
  const REFUSAL = "refused: this would leave no active OWNER";

  test("the last active owner cannot be revoked or demoted, async or sync", async () => {
    const workspace = workspaceWithOwner();
    const before = usersFiles(workspace);
    await expect(revokeUserAsync({ workspace, username: "owner" })).rejects.toThrow(REFUSAL);
    await expect(setUserRolesAsync({ workspace, username: "owner", roles: ["VIEWER"] })).rejects.toThrow(REFUSAL);
    expect(() => revokeUser({ workspace, username: "owner" })).toThrow(REFUSAL);
    expect(() => setUserRoles({ workspace, username: "owner", roles: ["AUDITOR"] })).toThrow(REFUSAL);
    expect(usersFiles(workspace)).toEqual(before);
  });

  test("a revoked owner does not count as the one that remains", async () => {
    const workspace = workspaceWithOwner();
    await addUserAsync({ workspace, username: "second", password: "second-pass-1234", roles: ["OWNER"] });
    await revokeUserAsync({ workspace, username: "second" });
    await expect(revokeUserAsync({ workspace, username: "owner" })).rejects.toThrow(REFUSAL);
  });

  test("with a second active owner both changes go through", async () => {
    const workspace = workspaceWithOwner();
    await addUserAsync({ workspace, username: "second", password: "second-pass-1234", roles: ["OWNER", "AUDITOR"] });
    await expect(setUserRolesAsync({ workspace, username: "owner", roles: ["VIEWER"] })).resolves.toMatchObject({ roles: ["VIEWER"] });
    await expect(revokeUserAsync({ workspace, username: "owner" })).resolves.toMatchObject({ status: "REVOKED" });
    expect(user(workspace, "second").status).toBe("ACTIVE");
  });
});

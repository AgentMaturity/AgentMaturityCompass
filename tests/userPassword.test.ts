import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  addUser, authenticateUser, createSession, initUsersConfig, listUsers, setUserPasswordAsync, usersConfigPath, usersConfigSigPath,
  verifyTrackedSessionToken, verifyUsersConfigSignature
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

  test("refuses an unknown username without changing users.yaml", async () => {
    const workspace = workspaceWithOwner();
    const before = usersFiles(workspace);
    await expect(setUserPasswordAsync({ workspace, username: "nobody", password: NEW })).rejects.toThrow("user not found: nobody");
    expect(usersFiles(workspace)).toEqual(before);
  });
});

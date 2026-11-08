import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { addUser, initUsersConfig, usersConfigPath, usersConfigSigPath } from "../src/auth/authApi.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * The console account routes /users/add, /users/revoke and /users/roles. LIVE-VAULT-16: the admin token (a bearer file
 * inside the workspace) cannot mint, revoke or promote an account; an OWNER session can. LIVE-VAULT-09: each change lands
 * in the human action log with the signed-in actor.
 */
const ADMIN = "users-routes-admin-token";
const OWNER_PASSWORD = "owner-route-pass-123";
const roots: string[] = [];
const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (servers.length > 0) await servers.pop()!.close();
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

async function studio() {
  const workspace = mkdtempSync(join(tmpdir(), "amc-users-routes-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: OWNER_PASSWORD });
  addUser({ workspace, username: "member", password: "member-route-pass-123", roles: ["VIEWER"] });
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: ADMIN });
  servers.push(api);
  const post = async (path: string, body: unknown, headers: Record<string, string>) => {
    const response = await fetch(`${api.url}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, unknown>, cookie: response.headers.get("set-cookie") };
  };
  const ownerLogin = await post("/auth/login", { username: "owner", password: OWNER_PASSWORD }, {});
  expect(ownerLogin.status).toBe(200);
  const ownerCookie = (ownerLogin.cookie ?? "").split(";", 1)[0]!;
  const usersFiles = () => [readFileSync(usersConfigPath(workspace)), readFileSync(usersConfigSigPath(workspace))];
  return { workspace, post, ownerCookie, usersFiles };
}

function userChanges(workspace: string): Array<{ payload: Record<string, unknown> }> {
  const file = join(workspace, ".amc", "studio", "audit", "human.log");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> })
    .filter((entry) => entry.type === "HUMAN_USER_CHANGE");
}

const REFUSAL = { error: "the admin token cannot change console accounts; sign in as an OWNER" };
const ROUTES: Array<[string, Record<string, unknown>]> = [
  ["/users/add", { username: "minted", password: "minted-route-pass-123", roles: ["OWNER"] }],
  ["/users/revoke", { username: "member" }],
  ["/users/roles", { username: "member", roles: ["OWNER"] }]
];

describe("console account routes", () => {
  test.each(ROUTES)("%s refuses the admin token with 403 and leaves users.yaml unchanged (LIVE-VAULT-16)", async (path, body) => {
    const { post, usersFiles } = await studio();
    const before = usersFiles();
    const refused = await post(path, body, { "x-amc-admin-token": ADMIN });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual(REFUSAL);
    expect(usersFiles()).toEqual(before);
  });

  test("the last active OWNER cannot revoke or demote themselves: 409 and users.yaml unchanged (LIVE-VAULT-17)", async () => {
    const { post, ownerCookie, usersFiles } = await studio();
    const before = usersFiles();
    for (const [path, body] of [["/users/revoke", { username: "owner" }], ["/users/roles", { username: "owner", roles: ["VIEWER"] }]] as const) {
      const refused = await post(path, body, { cookie: ownerCookie });
      expect(refused.status, path).toBe(409);
      expect(refused.body).toEqual({ error: "refused: this would leave no active OWNER" });
    }
    expect(usersFiles()).toEqual(before);
  });

  test("a new password under 12 characters is refused with 400 and users.yaml unchanged (LIVE-VAULT-13)", async () => {
    const { post, ownerCookie, usersFiles } = await studio();
    const before = usersFiles();
    const refused = await post("/users/add", { username: "shorty", password: "eleven-char", roles: ["VIEWER"] }, { cookie: ownerCookie });
    expect(refused.status).toBe(400);
    expect(refused.body).toEqual({ error: "password must be at least 12 characters" });
    expect(usersFiles()).toEqual(before);
  });

  test("an OWNER session adds, re-roles and revokes accounts, and each change names the owner in the audit trail", async () => {
    const { workspace, post, ownerCookie } = await studio();
    const added = await post("/users/add", ROUTES[0]![1], { cookie: ownerCookie });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect((await post("/users/roles", { username: "member", roles: ["AUDITOR"] }, { cookie: ownerCookie })).status).toBe(200);
    expect((await post("/users/revoke", { username: "member" }, { cookie: ownerCookie })).status).toBe(200);
    const changes = userChanges(workspace);
    expect(changes.map((entry) => [entry.payload.action, entry.payload.username])).toEqual([["add", "minted"], ["roles", "member"], ["revoke", "member"]]);
    for (const entry of changes) expect(entry.payload.actor).toMatchObject({ kind: "session", username: "owner" });
    expect(JSON.stringify(changes)).not.toMatch(/passwordHash|minted-route-pass/);
  });
});

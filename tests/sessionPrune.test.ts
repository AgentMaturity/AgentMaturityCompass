import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createSession, initUsersConfig, listUsers } from "../src/auth/authApi.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * LIVE-VAULT-18: .amc/studio/sessions is read on every authenticated request, so creating a session deletes records
 * expired for more than a day, at most once per 5 minutes per process. A revoked record that has not expired stays (its
 * token must keep failing as "session revoked"); an unparseable file is left alone. One file: the pace is process-wide.
 */
const HOUR = 60 * 60_000;
const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

test("creating a session deletes records expired for a day, keeps the rest, and paces itself", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-session-prune-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: "owner-prune-pass-123" });
  const owner = listUsers(workspace)[0]!;
  const dir = join(workspace, ".amc", "studio", "sessions");
  mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const record = (name: string, expiresTs: number, revoked = false) => {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ sessionId: name, userId: owner.userId, username: "owner", roles: ["OWNER"], issuedTs: expiresTs - 8 * HOUR, expiresTs, revoked }));
    return join(dir, `${name}.json`);
  };
  const longExpired = record("expired-two-days", now - 48 * HOUR);
  const recentlyExpired = record("expired-an-hour", now - HOUR);
  const live = record("live", now + HOUR);
  const revokedLive = record("revoked-live", now + HOUR, true);
  writeFileSync(join(dir, "garbage.json"), "{not json");

  createSession({ workspace, user: owner });
  expect(existsSync(longExpired)).toBe(false);
  for (const kept of [recentlyExpired, live, revokedLive, join(dir, "garbage.json")]) expect(existsSync(kept), kept).toBe(true);

  const laterExpired = record("expired-three-days", now - 72 * HOUR);
  createSession({ workspace, user: owner });
  expect(existsSync(laterExpired)).toBe(true);

  vi.useFakeTimers({ now: now + 6 * 60_000, toFake: ["Date"] });
  createSession({ workspace, user: owner });
  expect(existsSync(laterExpired)).toBe(false);
  expect(existsSync(revokedLive)).toBe(true);
});

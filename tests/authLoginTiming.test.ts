import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, expect, test } from "vitest";
import { addUser, authenticateUser, initUsersConfig, revokeUser } from "../src/auth/authApi.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * LIVE-VAULT-05, timing part (the response wording and the login throttle are the runtime area's, coordinator section
 * 9): a login for an unknown or a revoked username runs scrypt against a dummy hash, so its response time does not tell
 * a caller that the account exists. The bound is loose (half the wrong-password median) so a loaded machine cannot flake
 * it; without the dummy verify those paths take microseconds against scrypt's tens of milliseconds.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function medianMs(run: () => unknown, samples = 20): number {
  const times: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    run();
    times.push(performance.now() - started);
  }
  return times.sort((a, b) => a - b)[Math.floor(samples / 2)]!;
}

test("an unknown or revoked username takes the wrong-password time and is still refused", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-login-timing-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: "owner-timing-pass-123" });
  addUser({ workspace, username: "gone", password: "gone-timing-pass-123", roles: ["VIEWER"] });
  revokeUser({ workspace, username: "gone" });
  const attempt = (username: string, password: string) => () => authenticateUser({ workspace, username, password });
  for (const [username, password] of [["nobody", "x-wrong-pass-123"], ["gone", "gone-timing-pass-123"], ["owner", "x-wrong-pass-123"]] as const) {
    expect(attempt(username, password)().ok, username).toBe(false);
  }
  const wrongPassword = medianMs(attempt("owner", "x-wrong-pass-123"));
  const unknownUser = medianMs(attempt("nobody", "x-wrong-pass-123"));
  const revokedUser = medianMs(attempt("gone", "gone-timing-pass-123"));
  expect(unknownUser, `unknown ${unknownUser}ms vs wrong password ${wrongPassword}ms`).toBeGreaterThanOrEqual(wrongPassword * 0.5);
  expect(revokedUser, `revoked ${revokedUser}ms vs wrong password ${wrongPassword}ms`).toBeGreaterThanOrEqual(wrongPassword * 0.5);
  expect(authenticateUser({ workspace, username: "owner", password: "owner-timing-pass-123" }).ok).toBe(true);
});

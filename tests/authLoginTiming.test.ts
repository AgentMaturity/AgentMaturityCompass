import { randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import YAML from "yaml";
import { afterEach, expect, test } from "vitest";
import { addUser, authenticateUser, initUsersConfig, listUsers, revokeUser, usersConfigPath, usersConfigSigPath } from "../src/auth/authApi.js";
import { getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
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

/** The owner's verifier replaced by one in the pre-LIVE-VAULT-13 form (N=2^14), re-signed the way users.yaml always is. */
function legacyOwner(workspace: string, password: string): void {
  const salt = randomBytes(16), config = YAML.parse(readFileSync(usersConfigPath(workspace), "utf8"));
  config.users[0].passwordHash = ["scrypt", 16384, 8, 1, 64, salt.toString("base64"), scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")].join("$");
  const bytes = Buffer.from(YAML.stringify(config), "utf8"), digest = sha256Hex(bytes);
  writeFileSync(usersConfigPath(workspace), bytes);
  writeFileSync(usersConfigSigPath(workspace), JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getSigningKey(workspace, "config-signature")), signedTs: Date.now(), signer: "auditor" }));
}

test("a wrong password for an account whose verifier predates the N=2^15 cost takes the unknown-username time (skeptic SK-4)", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-login-timing-legacy-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: "owner-timing-pass-123" });
  legacyOwner(workspace, "owner-timing-pass-123");
  lockVault(workspace); // as for every account not re-hashed yet: no unlocked vault re-hashes it
  const attempt = (username: string) => () => authenticateUser({ workspace, username, password: "x-wrong-pass-123" });
  const legacyWrong: number[] = [], unknownUser: number[] = [];
  for (let index = 0; index < 21; index += 1) { // interleaved, so a change in machine load hits both
    legacyWrong.push(medianMs(attempt("owner"), 1));
    unknownUser.push(medianMs(attempt("nobody"), 1));
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const ratio = median(unknownUser) / median(legacyWrong);
  expect(listUsers(workspace)[0]!.passwordHash.split("$")[1]).toBe("16384");
  expect(ratio, `unknown ${median(unknownUser)}ms vs legacy wrong password ${median(legacyWrong)}ms`).toBeGreaterThan(0.6);
  expect(ratio, `unknown ${median(unknownUser)}ms vs legacy wrong password ${median(legacyWrong)}ms`).toBeLessThan(1.5);
  expect(authenticateUser({ workspace, username: "owner", password: "owner-timing-pass-123" }).ok).toBe(true);
});

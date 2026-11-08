/**
 * Follow-up 10 (LIVE-VAULT-13's missing piece): a Studio login that meets a verifier made at an older scrypt cost
 * records what the re-hash did as `reason` in its HUMAN_LOGIN_SUCCESS audit payload; a login with a current verifier
 * carries no reason. The outcome values: password-rehashed, password-rehash-skipped-vault-locked,
 * password-rehash-skipped-user-changed, password-rehash-failed.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { initUsersConfig, usersConfigPath, usersConfigSigPath } from "../src/auth/authApi.js";
import { getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault, unlockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const PASSWORD = "owner-rehash-audit-pass";
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) { const root = roots.pop()!; lockVault(root); rmSync(root, { recursive: true, force: true }); }
});

/** A workspace whose owner has a pre-LIVE-VAULT-13 verifier (N=2^14), re-signed the way users.yaml always is. */
function legacyOwner(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-login-rehash-audit-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initUsersConfig({ workspace, username: "owner", password: PASSWORD });
  const salt = randomBytes(16), config = YAML.parse(readFileSync(usersConfigPath(workspace), "utf8"));
  config.users[0].passwordHash = ["scrypt", 16384, 8, 1, 64, salt.toString("base64"), scryptSync(PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")].join("$");
  const bytes = Buffer.from(YAML.stringify(config), "utf8"), digest = sha256Hex(bytes);
  writeFileSync(usersConfigPath(workspace), bytes);
  writeFileSync(usersConfigSigPath(workspace), JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getSigningKey(workspace, "config-signature")), signedTs: Date.now(), signer: "auditor" }));
  return workspace;
}

async function login(workspace: string): Promise<number> {
  const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "admin-token-rehash-audit" });
  closers.push(() => api.close());
  const response = await fetch(`${api.url}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: PASSWORD }) });
  await response.text();
  return response.status;
}

function loginAudits(workspace: string): Array<Record<string, unknown>> {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().map((event) => JSON.parse(event.meta_json ?? "{}") as Record<string, unknown>)
      .filter((meta) => meta.auditType === "HUMAN_LOGIN_SUCCESS");
  } finally {
    ledger.close();
  }
}

describe("the Studio login audit names the re-hash outcome", () => {
  test("unlocked: password-rehashed, then no reason once the verifier is current", async () => {
    const workspace = legacyOwner();
    unlockVault(workspace, process.env.AMC_VAULT_PASSPHRASE!);
    expect(await login(workspace)).toBe(200);
    expect(await login(workspace)).toBe(200);
    const audits = loginAudits(workspace);
    expect(audits.map((meta) => meta.reason)).toEqual(["password-rehashed", undefined]);
  }, 60_000);
  // The other outcomes (vault locked, user changed, write failed) are authenticateUser's (tests/passwordHash.test.ts); a
  // Studio that can sign a login session holds the unlocked vault, so its logins re-hash.
});

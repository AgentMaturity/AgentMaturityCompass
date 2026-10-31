import { sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as auth from "../../src/auth/authApi.js";
import { initWorkspace, loadAMCConfig, saveAMCConfigAsync } from "../../src/workspace.js";
import { rotateKeysForCli } from "../../src/keys/keysCli.js";
import { getSigningKey, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { loadKeysConfig } from "../../src/keys/keysConfig.js";
import { bindPurposeProviderKey, signWithPurposeKey } from "../../src/keys/purposeProviders.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

// Only replace the supported SDK transport boundary. No SDK, default credentials or real KMS is reached.
const transport = vi.hoisted(() => ({ call: undefined as KmsCall | undefined }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => {
    if (transport.call === undefined) throw new Error("owned users transport is unset");
    return transport.call(...args);
  })) };
});
const PASS = "users-provider-owner-passphrase", PASSWORD = "owned-users-login-password";
const roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const close of closers.splice(0).reverse()) try { await close(); } catch (error) { failures.push(error); }
  for (const f of roots.splice(0)) try { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } catch (error) { failures.push(error); }
  transport.call = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs();
  if (failures.length) throw new AggregateError(failures, "owned users fixture cleanup failed");
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function atProviderPause(paused: { entered: ReturnType<typeof deferred> }, operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([paused.entered.promise, operation.then(() => { throw new Error("actual producer settled before its provider signing pause"); }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("actual producer never entered its provider signing pause")), 5_000); })]);
  } finally { clearTimeout(timer); }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-provider-users-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const owner = auth.initUsersConfig({ workspace, username: "owner", password: PASSWORD }).owner;
  auth.addUser({ workspace, username: "reviewer", roles: ["APPROVER"], password: PASSWORD });
  const key = fakeKey("p256"), id = AWS_ARN(basename(root)), sessionKey = fakeKey("p256"), sessionId = AWS_ARN(basename(root) + "-session");
  const fake = awsFake({ [id]: key, [sessionId]: sessionKey });
  const control: { nextPause: null | { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }; fail: boolean; corrupt: boolean } = {
    nextPause: null, fail: false, corrupt: false
  };
  transport.call = async (operation, input, region) => {
    if (operation === "Sign") {
      expect(existsSync(join(workspace, ".amc", ".users-config.lock"))).toBe(false);
      const paused = control.nextPause; control.nextPause = null;
      if (paused) { paused.entered.resolve(); await paused.release.promise; }
      if (control.fail) throw Object.assign(new Error("https://private.invalid PIN=users-fixture-secret"), { name: "TimeoutError" });
    }
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign" && control.corrupt) {
      const signature = Buffer.from(answer.Signature as Uint8Array); signature[signature.length - 1] = signature[signature.length - 1]! ^ 1;
      return { ...answer, Signature: signature };
    }
    return answer;
  };
  const snapshot = () => ({ bytes: readFileSync(auth.usersConfigPath(workspace)), signature: readFileSync(auth.usersConfigSigPath(workspace)),
    keyset: readFileSync(keysetPaths(workspace).keyset) });
  const bind = async () => {
    const config = YAML.parse(readFileSync(join(workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
    const candidate = join(root, "candidate.yaml"); writeFileSync(candidate, YAML.stringify(config));
    await rotateKeysForCli(workspace, { purpose: "config-signature", configCandidate: candidate }); fake.requests.splice(0);
  };
  const pause = () => { const paused = { entered: deferred(), release: deferred() }; control.nextPause = paused; return paused; };
  const signedByProvider = () => {
    const bytes = readFileSync(auth.usersConfigPath(workspace)), sig = JSON.parse(readFileSync(auth.usersConfigSigPath(workspace), "utf8"));
    expect(sig).toMatchObject({ digestSha256: sha256Hex(bytes), signer: "auditor" });
    expect(Object.keys(sig).sort()).toEqual(["digestSha256", "signature", "signedTs", "signer"]);
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sig.digestSha256, "hex"), publicPem(key), Buffer.from(sig.signature, "base64"))).toBe(true);
    expect(auth.verifyUsersConfigSignature(workspace)).toMatchObject({ valid: true, signatureExists: true });
  };
  return { root, workspace, owner, key, fake, control, snapshot, bind, pause, signedByProvider, sessionKey, sessionId };
}
async function server(f: ReturnType<typeof fixture>) {
  const started = await startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: "owned-bootstrap-admin" });
  closers.push(started.close); return started;
}
async function request(url: string, path: string, body: unknown, headers: Record<string, string> = { "x-amc-admin-token": "owned-bootstrap-admin" }) {
  const response = await fetch(url + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

describe("actual users config authoring under owner-bound config-signature", () => {
  test("async vault role update preserves exact legacy YAML and sidecar bytes while sync APIs remain usable", async () => {
    const f = fixture(), now = Date.now() + 1000, clock = vi.spyOn(Date, "now").mockReturnValue(now);
    auth.setUserRoles({ workspace: f.workspace, username: "reviewer", roles: ["VIEWER"] });
    const before = f.snapshot();
    await auth.setUserRolesAsync({ workspace: f.workspace, username: "reviewer", roles: ["VIEWER"] });
    expect(f.snapshot()).toEqual(before);
    const expectedSignature = sign(null, Buffer.from(sha256Hex(before.bytes), "hex"), getSigningKey(f.workspace, "config-signature")).toString("base64");
    // Independent original sidecar serialization, rather than only equality of two changed producers.
    expect(before.signature.toString("utf8")).toBe([
      "{", `  "digestSha256": "${sha256Hex(before.bytes)}",`, `  "signature": "${expectedSignature}",`,
      `  "signedTs": ${now},`, '  "signer": "auditor"', "}"
    ].join("\n"));
    expect(auth.verifyUsersConfigSignature(f.workspace).valid).toBe(true); clock.mockRestore();
  });

  test("real owner binding then init/add/role/revoke use the real provider and exact config-purpose public verifier", async () => {
    const f = fixture(); await f.bind();
    await auth.initUsersConfigAsync({ workspace: f.workspace, username: "fresh-owner", password: PASSWORD }); f.signedByProvider();
    expect(auth.authenticateUser({ workspace: f.workspace, username: "fresh-owner", password: PASSWORD }).ok).toBe(true);
    expect(auth.authenticateUser({ workspace: f.workspace, username: "fresh-owner", password: "wrong-password" }).ok).toBe(false);
    await auth.addUserAsync({ workspace: f.workspace, username: "added", password: PASSWORD, roles: ["APPROVER"] }); f.signedByProvider();
    expect(auth.authenticateUser({ workspace: f.workspace, username: "added", password: PASSWORD }).ok).toBe(true);
    await auth.setUserRolesAsync({ workspace: f.workspace, username: "added", roles: ["VIEWER"] }); f.signedByProvider();
    expect(auth.listUsers(f.workspace).find(row => row.username === "added")?.roles).toEqual(["VIEWER"]);
    await auth.revokeUserAsync({ workspace: f.workspace, username: "added" }); f.signedByProvider();
    expect(auth.authenticateUser({ workspace: f.workspace, username: "added", password: PASSWORD }).ok).toBe(false);
    expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(4);
    for (const row of f.fake.requests.filter(row => row.operation === "Sign")) expect(Buffer.from(row.input.Message as Uint8Array)).toHaveLength(32);
  });

  test("sync compatibility cannot replace the body or fall back after binding", async () => {
    const f = fixture(); await f.bind(); const before = f.snapshot();
    for (const operation of [
      () => auth.initUsersConfig({ workspace: f.workspace, username: "reset", password: PASSWORD }),
      () => auth.addUser({ workspace: f.workspace, username: "new", password: PASSWORD, roles: ["VIEWER"] }),
      () => auth.setUserRoles({ workspace: f.workspace, username: "reviewer", roles: ["VIEWER"] }),
      () => auth.revokeUser({ workspace: f.workspace, username: "reviewer" })
    ]) { expect(operation).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" })); expect(f.snapshot()).toEqual(before); }
    expect(f.fake.requests).toEqual([]);
  });

  test("a genuine separately bound session issuer cannot authenticate users config for config-signature", async () => {
    const f = fixture(); await f.bind();
    const config = loadAMCConfig(f.workspace);
    const keys = loadKeysConfig(f.workspace);
    config.keys = { ...keys, refs: { ...keys.refs, session: { provider: "aws-kms", id: f.sessionId } } };
    await saveAMCConfigAsync(f.workspace, config);
    await bindPurposeProviderKey(f.workspace, "session", { passphrase: PASS });
    await auth.setUserRolesAsync({ workspace: f.workspace, username: "reviewer", roles: ["VIEWER"] }); f.signedByProvider();
    const before = f.snapshot(), sidecar = JSON.parse(before.signature.toString());
    const other = await signWithPurposeKey(f.workspace, "session", Buffer.from(sidecar.digestSha256, "hex"));
    expect(other.publicKeyPem).toBe(publicPem(f.sessionKey));
    expect(getPurposeKeyHistory(f.workspace, "session")).toContain(other.publicKeyPem);
    expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(other.publicKeyPem);
    try {
      writeFileSync(auth.usersConfigSigPath(f.workspace), JSON.stringify({ ...sidecar, signature: other.signature.toString("base64") }, null, 2));
      expect(auth.verifyUsersConfigSignature(f.workspace)).toMatchObject({ valid: false, reason: "signature verification failed" });
      expect(auth.authenticateUser({ workspace: f.workspace, username: "reviewer", password: PASSWORD }).ok).toBe(false);
    } finally { writeFileSync(auth.usersConfigSigPath(f.workspace), before.signature); }
  });

  test.each(["unavailable", "bad-crypto"] as const)("%s refuses before body or sidecar publication", async failure => {
    const f = fixture(); await f.bind(); const before = f.snapshot();
    f.control.fail = failure === "unavailable"; f.control.corrupt = failure === "bad-crypto";
    const error = await auth.addUserAsync({ workspace: f.workspace, username: "new", password: PASSWORD, roles: ["VIEWER"] }).catch(error => error);
    expect(error).toMatchObject({ code: failure === "unavailable" ? "KEY_PROVIDER_UNAVAILABLE" : "KEY_PROVIDER_KEY_REFUSED" });
    expect(String(error)).not.toMatch(/private\.invalid|PIN=|users-fixture-secret|owned-users-login-password/); expect(f.snapshot()).toEqual(before);
  });

  test("an actual concurrent signed role change survives and the paused add refuses its stale predecessor", async () => {
    const f = fixture(); await f.bind(); const paused = f.pause();
    const operation = auth.addUserAsync({ workspace: f.workspace, username: "stale-add", password: PASSWORD, roles: ["VIEWER"] });
    const outcome = operation.then(() => null, error => error);
    try {
      await atProviderPause(paused, operation);
      await auth.setUserRolesAsync({ workspace: f.workspace, username: "reviewer", roles: ["VIEWER"] }); const committed = f.snapshot(); f.signedByProvider();
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "users config changed while signing; retry" });
      expect(f.snapshot()).toEqual(committed); expect(auth.listUsers(f.workspace).some(row => row.username === "stale-add")).toBe(false);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("a real committed generation change during signing refuses without replacing users", async () => {
    const f = fixture(); await f.bind(); const before = f.snapshot(), paused = f.pause();
    const operation = auth.setUserRolesAsync({ workspace: f.workspace, username: "reviewer", roles: ["VIEWER"] });
    const outcome = operation.then(() => null, error => error);
    try {
      await atProviderPause(paused, operation);
      rotatePurposeKeys({ workspace: f.workspace, purposes: ["receipt"], passphrase: PASS });
      const changed = readFileSync(keysetPaths(f.workspace).keyset); expect(changed).not.toEqual(before.keyset);
      paused.release.resolve(); expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
      expect(readFileSync(auth.usersConfigPath(f.workspace))).toEqual(before.bytes);
      expect(readFileSync(auth.usersConfigSigPath(f.workspace))).toEqual(before.signature);
      expect(readFileSync(keysetPaths(f.workspace).keyset)).toEqual(changed);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("cold API startup and maintained HTTP add/password-login/role/revoke work after config owner binding", async () => {
    const f = fixture(); await f.bind();
    const promptPolicy = readFileSync(join(f.workspace, ".amc", "prompt", "policy.yaml"));
    expect(existsSync(join(f.workspace, ".amc", "prompt", "scheduler.json"))).toBe(false);
    expect(existsSync(join(f.workspace, ".amc", "passport", "policy.yaml"))).toBe(false);
    const started = await server(f);
    expect(readFileSync(join(f.workspace, ".amc", "prompt", "policy.yaml"))).toEqual(promptPolicy);
    expect(existsSync(join(f.workspace, ".amc", "prompt", "scheduler.json.sig"))).toBe(true);
    const added = await request(started.url, "/users/add", { username: "http-added", password: PASSWORD, roles: ["VIEWER"] });
    expect(added.status).toBe(200); expect(added.body.user).not.toHaveProperty("passwordHash"); f.signedByProvider();
    const login = await request(started.url, "/auth/login", { username: "http-added", password: PASSWORD }, {});
    expect(login.status).toBe(200); expect(login.body.user.username).toBe("http-added"); expect(login.body.user).not.toHaveProperty("passwordHash");
    const roles = await request(started.url, "/users/roles", { username: "http-added", roles: ["AUDITOR"] });
    expect(roles.status).toBe(200); expect(roles.body.user.roles).toEqual(["AUDITOR"]); expect(roles.body.user).not.toHaveProperty("passwordHash"); f.signedByProvider();
    const revoked = await request(started.url, "/users/revoke", { username: "http-added" });
    expect(revoked.status).toBe(200); expect(revoked.body.user.status).toBe("REVOKED"); expect(revoked.body.user).not.toHaveProperty("passwordHash"); f.signedByProvider();
    expect((await request(started.url, "/auth/login", { username: "http-added", password: PASSWORD }, {})).status).toBe(401);
  });

  test.each(["unavailable", "bad-crypto"] as const)("HTTP %s uses the typed provider status and fixed diagnostic before either file changes", async failure => {
    const f = fixture(); await f.bind(); const started = await server(f), before = f.snapshot();
    f.control.fail = failure === "unavailable"; f.control.corrupt = failure === "bad-crypto";
    const refused = await request(started.url, "/users/add", { username: "http-refused", password: PASSWORD, roles: ["VIEWER"] });
    const code = failure === "unavailable" ? "KEY_PROVIDER_UNAVAILABLE" : "KEY_PROVIDER_KEY_REFUSED";
    expect(refused.status).toBe(failure === "unavailable" ? 503 : 409);
    expect(refused.body).toEqual({ error: `${code}: user mutation signing refused`, code });
    expect(JSON.stringify(refused.body)).not.toMatch(/private\.invalid|PIN=|users-fixture-secret|owned-users-login-password|passwordHash/);
    expect(f.snapshot()).toEqual(before);
  });

  test("HTTP genuine locked vault is 423 and does not replace users or sidecar", async () => {
    const f = fixture(), started = await server(f), before = f.snapshot();
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const refused = await request(started.url, "/users/add", { username: "http-locked", password: PASSWORD, roles: ["VIEWER"] });
    expect(refused.status).toBe(423); expect(refused.body).toEqual({ error: "VAULT_LOCKED: unlock the vault to change users", code: "VAULT_LOCKED" });
    expect(f.snapshot()).toEqual(before);
  });

  test("users error responder accepts genuine typed errors and does not copy unknown/provider messages", async () => {
    const { KeyProviderError } = await import("../../src/keys/provider.js"), { KeyRevokedError } = await import("../../src/keys/keyRevocations.js");
    const answers: Array<{ status: number; body: { error: string; code?: string } }> = [], send = (status: number, body: { error: string; code?: string }) => { answers.push({ status, body }); };
    const secret = "https://private.invalid PIN=users-fixture-secret Vault locked";
    const request = { method: "POST", url: "/users/add?owned=true" };
    expect(auth.respondUsersMutationError(request, new KeyProviderError("KEY_PROVIDER_AUTH_FAILED", "aws-kms", secret), send)).toBe(true);
    expect(answers.pop()).toEqual({ status: 503, body: { error: "KEY_PROVIDER_AUTH_FAILED: user mutation signing refused", code: "KEY_PROVIDER_AUTH_FAILED" } });
    expect(auth.respondUsersMutationError(request, new KeyRevokedError("config-signature", "a".repeat(64), { keyId: "a".repeat(64), reason: "key-compromise", revokedAt: new Date().toISOString() }), send)).toBe(true);
    expect(answers.pop()).toEqual({ status: 409, body: { error: "KEY_REVOKED: the config-signature key was revoked", code: "KEY_REVOKED" } });
    expect(auth.respondUsersMutationError(request, new Error(secret), send)).toBe(false);
    expect(auth.respondUsersMutationError({ method: "POST", url: "/unrelated" }, new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "aws-kms", secret), send)).toBe(false);
    for (const url of ["/users/add", "/users/revoke", "/users/roles?owned=true"]) {
      expect(auth.respondUsersMutationError({ method: "POST", url }, new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "aws-kms", secret), send), url).toBe(true);
      expect(answers.pop()).toEqual({ status: 503, body: { error: "KEY_PROVIDER_UNAVAILABLE: user mutation signing refused", code: "KEY_PROVIDER_UNAVAILABLE" } });
    }
    for (const [method, url] of [["GET", "/users/add"], ["POST", "/users/additional"], ["POST", "/users/add/extra"], ["POST", "/api/users/add"], ["POST", "/users/roles/"]]) {
      expect(auth.respondUsersMutationError({ method, url }, new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "aws-kms", secret), send), `${method} ${url}`).toBe(false);
    }
    expect(answers).toEqual([]);
  });

  test("HTTP publication reauthenticates the original tracked owner after provider wait", async () => {
    const f = fixture(), session = auth.createSession({ workspace: f.workspace, user: f.owner }); await f.bind(); const started = await server(f);
    const before = f.snapshot(), paused = f.pause(); let settled = false;
    const response = request(started.url, "/users/add", { username: "late", password: PASSWORD, roles: ["VIEWER"] }, { cookie: `amc_session=${session.token}` });
    const outcome = response.then(value => { settled = true; return value; }, error => { settled = true; throw error; });
    try {
      await atProviderPause(paused, outcome);
      auth.revokeSessionByToken({ workspace: f.workspace, token: session.token });
      expect(f.snapshot()).toEqual(before); expect(settled).toBe(false); paused.release.resolve();
      const refused = await outcome; expect(refused.status).toBe(403); expect(refused.body).toEqual({ error: "user mutation authority changed while signing" });
      expect(f.snapshot()).toEqual(before); expect(auth.listUsers(f.workspace).some(row => row.username === "late")).toBe(false);
    } finally { paused.release.resolve(); await outcome; }
  });
});

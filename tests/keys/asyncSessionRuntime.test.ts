import { randomUUID, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as sessions from "../../src/auth/sessionTokens.js";
import * as auth from "../../src/auth/authApi.js";
import * as pairing from "../../src/pairing/pairingCodes.js";
import * as pairingApi from "../../src/pairing/pairingApi.js";
import { loginNativeApprovals } from "../../src/approvals/nativeApprovalLogin.js";
import { readNativeApprovalActor } from "../../src/setup/nativeApprovalIdentity.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { revokeKey } from "../../src/keys/purposeKeys.js";
import { getPurposeKeyHistory, getSigningKey } from "../../src/keys/signingKeys.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

// Replace only factory transport creation. The real AWS adapter, provider router, signed config,
// keyset/history/revocation gates, receipt bytes and crypto all run. This boundary never imports an SDK or opens a connection.
// Exercise the real built-in distrust reader/parser at its existing filesystem boundary, without editing source files.
const shippedDistrust = vi.hoisted(() => ({ text: "" }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: unknown, ...rest: unknown[]) => /[\\/]trust[\\/]amc-distrust\.json$/.test(String(path)) && shippedDistrust.text
    ? shippedDistrust.text
    : (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest)) as typeof actual.readFileSync;
  return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});
const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? (async (...args) => {
    if (boundary.call === undefined) throw new Error("test provider transport is unset");
    return boundary.call(...args);
  })) };
});
const roots: string[] = [], sockets: Socket[] = [];
const PASS = "async-session-fixture-passphrase";
const PASSWORD = "async-session-user-password";
afterEach(() => {
  shippedDistrust.text = "";
  boundary.call = undefined;
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function workspace() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-async-session-"))); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  auth.initUsersConfig({ workspace: root, username: "administrator", password: "administrator-fixture-password" });
  const user = auth.addUser({ workspace: root, username: "reviewer", roles: ["APPROVER"], password: PASSWORD });
  return { root, user };
}
function recordFiles(root: string) {
  const dir = join(root, ".amc", "studio", "sessions");
  return existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".json")) : [];
}
function pairingRows(root: string): Array<{ id: string; usedTs?: number }> {
  return JSON.parse(readFileSync(join(root, ".amc", "studio", "pairing.codes.json"), "utf8")).codes;
}
function response(): ServerResponse {
  const socket = new Socket(); sockets.push(socket);
  return new ServerResponse(new IncomingMessage(socket));
}
function cookieToken(res: ServerResponse): string {
  const cookie = String(res.getHeader("set-cookie"));
  expect(cookie).toMatch(/^amc_pairing=/);
  return decodeURIComponent(cookie.split(";")[0]!.slice("amc_pairing=".length));
}
function tokenBytes(token: string) { return Buffer.from(token.split(".")[0]!, "base64url"); }
function tokenSignature(token: string) { return Buffer.from(token.split(".")[1]!, "base64url"); }
function expectP256(token: string, publicKeyPem: string): void {
  const bytes = tokenBytes(token), signature = tokenSignature(token);
  expect(signature.length).toBe(64);
  expect(verify("sha256", bytes, { key: publicKeyPem, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function providerFixture() {
  const f = workspace(), key = fakeKey("p256"), arn = AWS_ARN(`session-${randomUUID()}`);
  const fake = awsFake({ [arn]: key });
  const control: { failSign: boolean; gate: ReturnType<typeof deferred> | null; entered: ReturnType<typeof deferred> | null; expectedCalls: number; calls: number } = {
    failSign: false, gate: null, entered: null, expectedCalls: 1, calls: 0
  };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign") {
      control.calls++;
      if (control.calls >= control.expectedCalls) control.entered?.resolve();
      if (control.gate !== null) await control.gate.promise;
      if (control.failSign) throw Object.assign(new Error("secret endpoint https://private.invalid PIN=not-for-output"), { name: "TimeoutError" });
    }
    return fake.call(operation, input, region);
  };
  const configPath = join(f.root, ".amc", "amc.config.yaml");
  const config = YAML.parse(readFileSync(configPath, "utf8"));
  config.keys = { refs: { session: { provider: "aws-kms", id: arn } } };
  writeFileSync(configPath, YAML.stringify(config));
  signAmcConfig(f.root);
  // Real owner-facing binding: no hand-written keyset or history and no provider override at the consumer.
  const bound = await bindPurposeProviderKey(f.root, "session", { passphrase: PASS });
  const pem = publicPem(key);
  expect(bound).toMatchObject({ purpose: "session", provider: "aws-kms", algorithm: "ecdsa-p256-sha256", keyId: signingKeyId(pem) });
  expect(getPurposeKeyHistory(f.root, "session")).toContain(pem);
  control.calls = 0;
  return { ...f, key, arn, fake, control, pem };
}

describe("actual runtime session producers route through the committed async purpose signer", () => {
  test("default async session and pairing preserve legacy Ed25519 signed bytes and sync APIs", async () => {
    const f = workspace(), key = getSigningKey(f.root, "session");
    const issued = await sessions.issueSessionTokenAsync({ workspace: f.root, userId: f.user.userId, username: f.user.username, roles: f.user.roles });
    expect(tokenSignature(issued.token)).toEqual(sign(null, tokenBytes(issued.token), key));
    expect(sessions.verifySessionToken({ workspace: f.root, token: issued.token })).toMatchObject({ ok: true, payload: issued.payload });
    const sync = sessions.issueSessionToken({ workspace: f.root, userId: f.user.userId, username: f.user.username, roles: f.user.roles });
    expect(tokenSignature(sync.token)).toEqual(sign(null, tokenBytes(sync.token), key));
    const created = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    const claimed = await pairing.claimPairingCodeAsync({ workspace: f.root, code: created.code });
    expect(claimed.ok).toBe(true);
    expect(tokenSignature(claimed.token!)).toEqual(sign(null, tokenBytes(claimed.token!), key));
    expect(pairing.verifyPairingToken({ workspace: f.root, token: claimed.token! }).ok).toBe(true);
    const second = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    expect(pairing.claimPairingCode({ workspace: f.root, code: second.code }).ok).toBe(true);
  });

  test("public raw, tracked/router and local-login issuers produce real P-256 without reading the locked vault", async () => {
    const f = await providerFixture();
    lockVault(f.root); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const raw = await sessions.issueSessionTokenAsync({ workspace: f.root, userId: f.user.userId, username: f.user.username, roles: f.user.roles });
    expectP256(raw.token, f.pem);
    expect(sessions.verifySessionToken({ workspace: f.root, token: raw.token }).ok).toBe(true);
    const tracked = await auth.createTrackedSessionAsync({ workspace: f.root, userId: "router-user", username: "router", roles: ["VIEWER"], authSource: "WORKSPACE_ROUTER" });
    expectP256(tracked.token, f.pem);
    expect(auth.verifyTrackedSessionToken({ workspace: f.root, token: tracked.token })).toMatchObject({ ok: true, authSource: "WORKSPACE_ROUTER", payload: { userId: "router-user", roles: ["VIEWER"] } });
    const local = await auth.createSessionAsync({ workspace: f.root, user: f.user });
    expectP256(local.token, f.pem);
    expect(auth.verifyTrackedSessionToken({ workspace: f.root, token: local.token })).toMatchObject({ ok: true, authSource: "LOCAL_USER", payload: { userId: f.user.userId, roles: ["APPROVER"] } });
    const requests = f.fake.requests.filter(row => row.operation === "Sign");
    for (const issued of [raw, tracked, local]) {
      expect(requests.some(row => Buffer.from(row.input.Message as Uint8Array).equals(tokenBytes(issued.token)) && row.input.MessageType === "RAW")).toBe(true);
    }
    expect(() => sessions.issueSessionToken({ workspace: f.root, userId: "no-fallback", username: "refused", roles: ["OWNER"] })).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
  });

  test("the actual native approval caller awaits P-256 and preserves the authenticated user, tracked session and private file contract", async () => {
    const f = await providerFixture(), tokenFile = join(f.root, "reviewer.session");
    lockVault(f.root); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const receipt = await loginNativeApprovals({ workspace: f.root, username: "reviewer", tokenFile }, async () => PASSWORD);
    const token = readFileSync(tokenFile, "utf8").trim();
    expectP256(token, f.pem);
    expect(receipt).toMatchObject({ authSource: "LOCAL_USER", userId: f.user.userId, roles: ["APPROVER"], tokenFile });
    expect(readNativeApprovalActor(f.root, tokenFile)).toMatchObject({ userId: f.user.userId, username: "reviewer", roles: ["APPROVER"] });
    expect(auth.verifyTrackedSessionToken({ workspace: f.root, token })).toMatchObject({ ok: true, authSource: "LOCAL_USER" });
    expect(JSON.stringify(receipt)).not.toContain(token);
    expect(JSON.stringify(receipt)).not.toContain(PASSWORD);
  });

  test("the actual pairing response caller sets its cookie only after a canonical provider signature returns", async () => {
    const f = await providerFixture(), created = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 }), res = response();
    f.control.gate = deferred(); f.control.entered = deferred();
    const pending = pairingApi.claimPairingForResponseAsync({ workspace: f.root, code: created.code, res });
    await f.control.entered.promise;
    expect(res.getHeader("set-cookie")).toBeUndefined();
    expect(pairingRows(f.root).find(row => row.id === created.id)?.usedTs).toBeUndefined();
    expect(existsSync(join(f.root, ".amc", "studio", ".pairing-codes.lock"))).toBe(false);
    f.control.gate.resolve();
    expect(await pending).toMatchObject({ ok: true, pairingId: created.id });
    const token = cookieToken(res);
    expectP256(token, f.pem);
    expect(pairingApi.pairingCookieValid(f.root, `amc_pairing=${encodeURIComponent(token)}`)).toBe(true);
    expect((await pairing.claimPairingCodeAsync({ workspace: f.root, code: created.code })).error).toBe("pairing code already used");
  });

  test("overlapping signed pairing claims return one token and preserve a code created while KMS is pending", async () => {
    const f = await providerFixture(), created = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    f.control.expectedCalls = 2; f.control.gate = deferred(); f.control.entered = deferred();
    const first = pairing.claimPairingCodeAsync({ workspace: f.root, code: created.code });
    const second = pairing.claimPairingCodeAsync({ workspace: f.root, code: created.code });
    await f.control.entered.promise;
    expect(pairingRows(f.root).find(row => row.id === created.id)?.usedTs).toBeUndefined();
    const additional = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    f.control.gate.resolve();
    const results = await Promise.all([first, second]);
    expect(results.filter(row => row.ok)).toHaveLength(1);
    expect(results.filter(row => !row.ok)).toEqual([{ ok: false, error: "pairing code already used" }]);
    expectP256(results.find(row => row.ok)!.token!, f.pem);
    expect(pairingRows(f.root)).toEqual(expect.arrayContaining([expect.objectContaining({ id: additional.id }), expect.objectContaining({ id: created.id, usedTs: expect.any(Number) })]));
  });

  test("local user authority changed during provider signing refuses before any tracked session is published", async () => {
    const f = await providerFixture();
    f.control.gate = deferred(); f.control.entered = deferred();
    const pending = auth.createSessionAsync({ workspace: f.root, user: f.user });
    await f.control.entered.promise;
    expect(recordFiles(f.root)).toEqual([]);
    auth.setUserRoles({ workspace: f.root, username: "reviewer", roles: ["VIEWER"] });
    f.control.gate.resolve();
    await expect(pending).rejects.toThrow("local session authority changed while signing");
    expect(recordFiles(f.root)).toEqual([]);
  });

  test("provider failure returns no fallback token, tracked session, pairing cookie or native approval file; pairing remains claimable", async () => {
    const f = await providerFixture(), created = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 }), res = response();
    f.control.failSign = true;
    const raw = await sessions.issueSessionTokenAsync({ workspace: f.root, userId: "user", username: "fixture", roles: ["VIEWER"] }).catch(error => error);
    expect(raw).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 });
    expect(String(raw)).not.toMatch(/private\.invalid|PIN=|not-for-output/);
    await expect(auth.createSessionAsync({ workspace: f.root, user: f.user })).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" });
    await expect(pairingApi.claimPairingForResponseAsync({ workspace: f.root, code: created.code, res })).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" });
    expect(recordFiles(f.root)).toEqual([]);
    expect(res.getHeader("set-cookie")).toBeUndefined();
    expect(pairingRows(f.root).find(row => row.id === created.id)?.usedTs).toBeUndefined();
    const tokenFile = join(f.root, "refused.session");
    await expect(loginNativeApprovals({ workspace: f.root, username: "reviewer", tokenFile }, async () => PASSWORD)).rejects.toMatchObject({ code: "LOGIN_FAILED" });
    expect(existsSync(tokenFile)).toBe(false);
    expect(recordFiles(f.root)).toEqual([]);
    f.control.failSign = false;
    const retried = await pairing.claimPairingCodeAsync({ workspace: f.root, code: created.code });
    expect(retried.ok).toBe(true);
    expectP256(retried.token!, f.pem);
  });

  test("retired provider session credentials stay valid until actual revocation, then both token kinds refuse while the new key works", async () => {
    const f = await providerFixture();
    const sessionInput = { workspace: f.root, userId: f.user.userId, username: f.user.username, roles: f.user.roles };
    const oldSession = await sessions.issueSessionTokenAsync(sessionInput);
    const oldCode = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    const oldPairing = await pairing.claimPairingCodeAsync({ workspace: f.root, code: oldCode.code });
    expectP256(oldSession.token, f.pem); expectP256(oldPairing.token!, f.pem);
    const nextKey = fakeKey("p256"), nextArn = AWS_ARN(`session-next-${randomUUID()}`), nextFake = awsFake({ [nextArn]: nextKey });
    boundary.call = (operation, input, region) => String(input.KeyId) === nextArn
      ? nextFake.call(operation, input, region) : f.fake.call(operation, input, region);
    const configPath = join(f.root, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(configPath, "utf8"));
    config.keys.refs.session = { provider: "aws-kms", id: nextArn };
    writeFileSync(configPath, YAML.stringify(config)); signAmcConfig(f.root);
    const next = await bindPurposeProviderKey(f.root, "session", { passphrase: PASS });
    const nextPem = publicPem(nextKey);
    expect(next.keyId).not.toBe(signingKeyId(f.pem));
    expect(getPurposeKeyHistory(f.root, "session")).toContain(f.pem);
    // Audit-compatible historical admission remains; retiring an unrevoked key alone does not log users out.
    expect(sessions.verifySessionToken({ workspace: f.root, token: oldSession.token }).ok).toBe(true);
    expect(pairing.verifyPairingToken({ workspace: f.root, token: oldPairing.token! }).ok).toBe(true);
    const currentSession = await sessions.issueSessionTokenAsync(sessionInput);
    const currentCode = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    const currentPairing = await pairing.claimPairingCodeAsync({ workspace: f.root, code: currentCode.code });
    expectP256(currentSession.token, nextPem); expectP256(currentPairing.token!, nextPem);
    // The existing real owner API publishes the signed, sequenced, anchored revocation list.
    revokeKey(f.root, "session", signingKeyId(f.pem)!, "key-compromise", PASS);
    expect(getPurposeKeyHistory(f.root, "session")).toContain(f.pem); // Do not destroy audit history to reject a credential.
    expect(sessions.verifySessionToken({ workspace: f.root, token: oldSession.token }).ok).toBe(false);
    expect(pairing.verifyPairingToken({ workspace: f.root, token: oldPairing.token! }).ok).toBe(false);
    expect(sessions.verifySessionToken({ workspace: f.root, token: currentSession.token }).ok).toBe(true);
    expect(pairing.verifyPairingToken({ workspace: f.root, token: currentPairing.token! }).ok).toBe(true);
  });

  test("provider credentials refuse a missing or unsupported signed revocation list after migration, including a warmed valid read", async () => {
    const f = await providerFixture();
    const issued = await sessions.issueSessionTokenAsync({ workspace: f.root, userId: f.user.userId, username: f.user.username, roles: f.user.roles });
    const code = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    const claimed = await pairing.claimPairingCodeAsync({ workspace: f.root, code: code.code });
    const check = () => [sessions.verifySessionToken({ workspace: f.root, token: issued.token }).ok,
      pairing.verifyPairingToken({ workspace: f.root, token: claimed.token! }).ok];
    expect(check()).toEqual([true, true]);
    const path = join(f.root, ".amc", "keys", "revocations.signed.json"), original = readFileSync(path);
    const invalid = JSON.parse(original.toString("utf8")); invalid.list.version = 999;
    writeFileSync(path, JSON.stringify(invalid));
    expect(check()).toEqual([false, false]);
    writeFileSync(path, original); expect(check()).toEqual([true, true]);
    rmSync(path);
    expect(check()).toEqual([false, false]);
    writeFileSync(path, original); expect(check()).toEqual([true, true]);
  });

  test("premigration raw session and pairing credentials retain the list-absent legacy compatibility path", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-legacy-session-"))); roots.push(root);
    const key = fakeKey("ed25519");
    mkdirSync(join(root, ".amc", "keys"), { recursive: true });
    writeFileSync(join(root, ".amc", "keys", "session_ed25519.pub"), publicPem(key));
    const now = Date.now();
    const token = (payload: Record<string, unknown>) => {
      const bytes = Buffer.from(JSON.stringify(payload), "utf8");
      return `${bytes.toString("base64url")}.${sign(null, bytes, key.privateKey).toString("base64url")}`;
    };
    const session = token({ v: 1, userId: "legacy-user", username: "legacy", roles: ["VIEWER"], issuedTs: now, expiresTs: now + 60_000, nonce: "a".repeat(32) });
    const paired = token({ v: 1, pairingId: "pair_legacy", issuedTs: now, expiresTs: now + 60_000, nonce: "b".repeat(32) });
    expect(existsSync(join(root, ".amc", "keys", "keyset.json"))).toBe(false);
    expect(existsSync(join(root, ".amc", "keys", "revocations.signed.json"))).toBe(false);
    expect(sessions.verifySessionToken({ workspace: root, token: session }).ok).toBe(true);
    expect(pairing.verifyPairingToken({ workspace: root, token: paired }).ok).toBe(true);
  });

  test("actual session and pairing verifiers apply shipped distrust at use time and fail closed on malformed shipped data", async () => {
    const f = await providerFixture();
    const session = await sessions.issueSessionTokenAsync({ workspace: f.root, userId: f.user.userId, username: f.user.username, roles: f.user.roles });
    const code = pairing.createPairingCode({ workspace: f.root, ttlMs: 60_000 });
    const paired = await pairing.claimPairingCodeAsync({ workspace: f.root, code: code.code });
    expect(paired.ok).toBe(true); expectP256(session.token, f.pem); expectP256(paired.token!, f.pem);
    const check = () => [sessions.verifySessionToken({ workspace: f.root, token: session.token }),
      pairing.verifyPairingToken({ workspace: f.root, token: paired.token! })];
    expect(check().map(result => result.ok)).toEqual([true, true]);
    const issued = Math.max(session.payload.issuedTs, JSON.parse(tokenBytes(paired.token!).toString("utf8")).issuedTs as number);
    const clock = vi.spyOn(Date, "now").mockReturnValue(issued + 2_000);
    try {
      const entry = { keyId: signingKeyId(f.pem)!, distrustedFrom: new Date(issued + 3_000).toISOString(),
        reason: "key-compromise", note: "owned fixture signer", source: "amc-project" };
      shippedDistrust.text = JSON.stringify({ distrust: [entry] });
      expect(check().map(result => result.ok)).toEqual([true, true]); // Not yet distrusted at actual use time.
      shippedDistrust.text = JSON.stringify({ distrust: [{ ...entry, distrustedFrom: new Date(issued + 1_000).toISOString() }] });
      const refused = check();
      expect(refused).toMatchObject([{ ok: false, error: "session signature verification failed" }, { ok: false, error: "pairing token signature invalid" }]);
      // The claimed issuance time precedes distrust. Current credential use must still refuse it.
      expect(session.payload.issuedTs).toBeLessThan(issued + 1_000);
      shippedDistrust.text = JSON.stringify({ distrust: [] });
      expect(check().map(result => result.ok)).toEqual([true, true]);
      shippedDistrust.text = JSON.stringify({ distrust: [], disabled: true }); // Real strict shipped-file parser refuses unknown fields.
      expect(check()).toMatchObject([{ ok: false, error: "session signature verification failed" }, { ok: false, error: "pairing token signature invalid" }]);
      shippedDistrust.text = JSON.stringify({ distrust: [] });
      expect(check().map(result => result.ok)).toEqual([true, true]);
    } finally { clock.mockRestore(); }
  });

});

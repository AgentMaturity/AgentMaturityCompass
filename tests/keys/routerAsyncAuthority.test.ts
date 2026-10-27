/** Real public local HTTP fixture with an owned AWS transport. */
import { randomUUID, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { verifyTrackedSessionToken } from "../../src/auth/authApi.js";
import { derToP1363, lowS, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { createHostUser, createWorkspaceRecord, disableHostUser, grantMembership, initHostDb, revokeMembershipRole } from "../../src/workspaces/hostDb.js";
import { issueHostSessionToken } from "../../src/workspaces/hostAuth.js";
import { hostWorkspaceDir } from "../../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../../src/workspaces/workspaceRouter.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

// Only replace transport construction. The actual router, host DB authority, owner binding, AWS adapter and token APIs run.
const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? (async (...args) => {
    if (boundary.call === undefined) throw new Error("test provider transport is unset");
    return boundary.call(...args);
  })) };
});
const PASS = "router-async-authority-passphrase", PASSWORD = "router-member-fixture-password";
const roots: string[] = [], workspaces: string[] = [], closers: Array<() => Promise<void>> = [], gates: Array<() => void> = [];
afterEach(async () => {
  for (const release of gates.splice(0)) release();
  try { for (const close of closers.splice(0).reverse()) await close(); }
  finally {
    boundary.call = undefined;
    for (const workspace of workspaces.splice(0)) lockVault(workspace);
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Fixture did not reserve a local port");
  return address.port;
}
type Wire = { status: number; headers: IncomingHttpHeaders; body: string };
function wire(base: string, path: string, method: "GET" | "POST", body = "", cookie?: string): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = request(base + path, { method, headers: { connection: "close", "content-type": "application/json", "content-length": Buffer.byteLength(body),
      ...(cookie === undefined ? {} : { cookie }) } }, res => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk)); res.once("error", reject);
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.once("error", reject); req.setTimeout(20_000, () => req.destroy(new Error("local fixture request timed out"))); req.end(body);
  });
}
function sessionCookies(response: Wire) {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter(cookie => cookie.startsWith("amc_session="));
}
function records(workspace: string): Array<{ tokenSha256: string; revoked: boolean; authSource: string; userId: string; roles: string[] }> {
  const dir = join(workspace, ".amc", "studio", "sessions");
  return existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".json")).map(name => JSON.parse(readFileSync(join(dir, name), "utf8"))) : [];
}
async function fixture() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  const hostDir = realpathSync(mkdtempSync(join(tmpdir(), "amc-router-authority-"))); roots.push(hostDir);
  initHostDb(hostDir);
  const user = createHostUser({ hostDir, username: "member", password: PASSWORD, isHostAdmin: false });
  createWorkspaceRecord({ hostDir, workspaceId: "alpha", name: "Owned alpha" });
  const workspace = hostWorkspaceDir(hostDir, "alpha"); workspaces.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  grantMembership({ hostDir, username: user.username, workspaceId: "alpha", role: "VIEWER" });
  const key = fakeKey("p256"), arn = AWS_ARN(`router-session-${randomUUID()}`), fake = awsFake({ [arn]: key });
  const entered = deferred(), gate = deferred(); gates.push(gate.resolve);
  const control = { pause: false, replies: [] as Array<{ bytes: Buffer; der: Buffer }> };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.pause) { entered.resolve(); await gate.promise; }
    const response = await fake.call(operation, input, region);
    if (operation === "Sign" && control.pause) {
      const signature = (response as { Signature?: Uint8Array }).Signature;
      if (signature === undefined) throw new Error("real fake KMS signature missing");
      control.replies.push({ bytes: Buffer.from(input.Message as Uint8Array), der: Buffer.from(signature) });
    }
    return response;
  };
  const path = join(workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { refs: { session: { provider: "aws-kms", id: arn } } };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
  const binding = await bindPurposeProviderKey(workspace, "session", { passphrase: PASS });
  expect(binding).toMatchObject({ algorithm: "ecdsa-p256-sha256", keyId: signingKeyId(publicPem(key)) });
  const port = await freePort(), router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port, defaultWorkspaceId: "alpha" });
  closers.push(router.close);
  const hostToken = issueHostSessionToken({ hostDir, userId: user.userId, username: user.username, isHostAdmin: false }).token;
  const cookie = `amc_host_session=${encodeURIComponent(hostToken)}`;
  expect(records(workspace)).toEqual([]);
  const begin = (route: "explicit-login" | "automatic-console") => {
    control.pause = true;
    return route === "explicit-login"
      ? wire(`http://127.0.0.1:${port}`, "/w/alpha/api/login", "POST", JSON.stringify({ username: user.username, password: PASSWORD }))
      : wire(`http://127.0.0.1:${port}`, "/w/alpha/console", "GET", "", cookie);
  };
  const signedToken = () => {
    expect(control.replies).toHaveLength(1);
    const { bytes, der } = control.replies[0]!;
    expect(verify("sha256", bytes, key.publicKey, der)).toBe(true);
    const signature = lowS(derToP1363(der));
    expect(verify("sha256", bytes, { key: key.publicKey, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
    return `${bytes.toString("base64url")}.${signature.toString("base64url")}`;
  };
  return { hostDir, workspace, user, control, entered, gate, begin, signedToken };
}

describe("actual workspace router session publication rechecks host authority after provider awaits", () => {
  for (const route of ["explicit-login", "automatic-console"] as const) {
    test(`${route}: unchanged host authority publishes the real P-256 tracked cookie`, async () => {
      const f = await fixture(), pending = f.begin(route);
      await Promise.race([f.entered.promise, pending.then(response => { throw new Error(`route returned ${response.status} before provider Sign`); })]);
      expect(records(f.workspace)).toEqual([]);
      f.gate.resolve(); const response = await pending;
      expect(response.status).toBe(route === "explicit-login" ? 200 : 302);
      const cookies = sessionCookies(response); expect(cookies).toHaveLength(1);
      const token = decodeURIComponent(cookies[0]!.split(";")[0]!.slice("amc_session=".length));
      expect(token).toBe(f.signedToken());
      expect(verifyTrackedSessionToken({ workspace: f.workspace, token })).toMatchObject({ ok: true, authSource: "WORKSPACE_ROUTER",
        payload: { userId: f.user.userId, username: f.user.username, roles: ["VIEWER"] } });
      expect(records(f.workspace)).toEqual([expect.objectContaining({ tokenSha256: sha256Hex(token), revoked: false, authSource: "WORKSPACE_ROUTER" })]);
    }, 60_000);

    for (const change of ["membership-revoked", "user-disabled", "roles-changed"] as const) {
      test(`${route}: ${change} during Sign refuses the cookie and revokes the unexposed tracked token`, async () => {
        const f = await fixture(), pending = f.begin(route);
        await Promise.race([f.entered.promise, pending.then(response => { throw new Error(`route returned ${response.status} before provider Sign`); })]);
        expect(records(f.workspace)).toEqual([]);
        if (change === "membership-revoked") revokeMembershipRole({ hostDir: f.hostDir, username: f.user.username, workspaceId: "alpha", role: "VIEWER" });
        else if (change === "user-disabled") disableHostUser(f.hostDir, f.user.username);
        else grantMembership({ hostDir: f.hostDir, username: f.user.username, workspaceId: "alpha", role: "OPERATOR" });
        f.gate.resolve(); const response = await pending;
        expect(response.status).toBe(401);
        expect(response.body).toContain("workspace session authority changed");
        expect(sessionCookies(response)).toEqual([]);
        const token = f.signedToken(); // Valid actual provider bytes; authorization, rather than crypto, must refuse it.
        expect(records(f.workspace)).toEqual([expect.objectContaining({ tokenSha256: sha256Hex(token), revoked: true, authSource: "WORKSPACE_ROUTER" })]);
        expect(verifyTrackedSessionToken({ workspace: f.workspace, token })).toMatchObject({ ok: false, error: "session revoked" });
      }, 60_000);
    }
  }
});

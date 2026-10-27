import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { appendHumanActionEvent, verifyHumanActionLog } from "../../src/auth/humanLog.js";
import * as authApi from "../../src/auth/authApi.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { lockVault } from "../../src/vault/vault.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE, nativeCsrfTokenForSession } from "../../src/studio/nativeAdmission.js";
import { openLedger } from "../../src/ledger/ledger.js";

const PASS = "owned-human-studio-passphrase", roots: Array<{ root: string; workspace: string }> = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];
afterEach(async () => {
  vi.restoreAllMocks(); syncBuiltinESMExports();
  try { for (const server of servers.splice(0)) await server.close(); }
  finally {
    for (const f of roots.splice(0)) { closeSqlitePool("ledger:" + resolve(f.workspace) + ":" + join(f.workspace, ".amc/evidence.sqlite")); lockVault(f.workspace); fs.rmSync(f.root, { recursive: true, force: true }); }
    vi.unstubAllEnvs();
  }
});
function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), "amc-human-studio-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "controls")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const owner = authApi.initUsersConfig({ workspace, username: "owner", password: "owned-owner-password" }).owner;
  const session = authApi.createSession({ workspace, user: owner });
  appendHumanActionEvent({ workspace, type: "OWNED_BASE", payload: {} });
  const dir = join(workspace, ".amc", "studio", "audit"), paths = ["human.log", "human.seal.json", "human.seal.sig"].map(name => join(dir, name));
  const snapshot = () => paths.map(path => fs.readFileSync(path));
  const entries = () => fs.readFileSync(paths[0]!, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const target = join(workspace, ".amc", "cache", "owned-old-cache.json"); fs.mkdirSync(join(workspace, ".amc", "cache"), { recursive: true });
  const putCache = () => { fs.writeFileSync(target, "owned old cache"); fs.utimesSync(target, new Date("2000-01-01"), new Date("2000-01-01")); };
  putCache();
  return { root, workspace, owner, session, paths, target, putCache, snapshot, entries, provider: loadKeyProvider(workspace, "file") };
}
async function server(f: ReturnType<typeof fixture>) {
  const api = await startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: "owned-human-admin" }); servers.push(api); return api;
}
function postPrune(api: Awaited<ReturnType<typeof server>>, session: ReturnType<typeof authApi.createSession>) {
  return fetch(api.url + "/ops/maintenance/prune", { method: "POST", headers: { "content-type": "application/json", origin: api.url,
    cookie: "amc_session=" + session.token, [NATIVE_CSRF_HEADER]: nativeCsrfTokenForSession(session.payload), [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE }, body: "{}" });
}
function primaryCount(f: ReturnType<typeof fixture>, type: string) {
  const ledger = openLedger(f.workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(row => JSON.parse(row.meta_json).auditType === type).length; }
  finally { ledger.close(); }
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
function pauseHuman(f: ReturnType<typeof fixture>) {
  const entered = deferred(), gate = deferred(), real = f.provider.sign.bind(f.provider); let used = false;
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (...args) => {
    const signed = await real(...args);
    if (!used && args[0].id === "artifact-seal") { used = true; entered.resolve(); await gate.promise; }
    return signed;
  });
  return { entered, gate, spy };
}
async function reached(wait: ReturnType<typeof pauseHuman>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("owned human Sign admission did not reach its controlled pause within 2000ms")), 2_000); });
  try {
    expect(await Promise.race([wait.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected"), timeout])).toBe("signed");
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

test.each(["roles", "tracked-token"] as const)("actual maintenance primary effect and audit survive late %s loss without a secondary HTTP denial", async change => {
  const f = fixture(), api = await server(f), before = f.snapshot(), wait = pauseHuman(f), pending = postPrune(api, f.session);
  try {
    await reached(wait, pending); expect(fs.existsSync(f.target)).toBe(false);
    if (change === "roles") authApi.setUserRoles({ workspace: f.workspace, username: "owner", roles: ["VIEWER"] });
    else authApi.revokeSessionByToken({ workspace: f.workspace, token: f.session.token });
    expect(authApi.verifyTrackedSessionToken({ workspace: f.workspace, token: f.session.token }).ok).toBe(false);
    wait.gate.resolve(); const response = await pending, body = await response.json();
    expect(response.status).toBe(200); expect(body.removedGenericCacheFiles).toContain(f.target);
    expect(body.studioAuditEventId).toEqual(expect.any(String)); expect(body.studioAuditReceiptId).toEqual(expect.any(String));
    expect(primaryCount(f, "OPS_MAINTENANCE_PRUNE")).toBe(1); expect(f.snapshot()).toEqual(before);
    expect(wait.spy.mock.calls.filter(([ref]) => ref.id === "artifact-seal")).toHaveLength(1);
    expect(fs.existsSync(join(f.workspace, ".amc", ".human-action-log.lock"))).toBe(false);
    vi.restoreAllMocks();
    const owner = change === "roles" ? authApi.setUserRoles({ workspace: f.workspace, username: "owner", roles: ["OWNER"] }) : f.owner;
    const fresh = authApi.createSession({ workspace: f.workspace, user: owner }); f.putCache();
    const positive = await postPrune(api, fresh); expect(positive.status).toBe(200); await positive.json();
    expect(f.entries().at(-1)).toMatchObject({ type: "HUMAN_OPS_ACTION", username: "owner" });
    expect(verifyHumanActionLog(f.workspace).ok).toBe(true); expect(primaryCount(f, "OPS_MAINTENANCE_PRUNE")).toBe(2);
  } finally { wait.gate.resolve(); await Promise.allSettled([pending]); }
});

test("actual failed login retains its 401 and primary historical audit after real human Sign transport refusal", async () => {
  const f = fixture(), api = await server(f), before = f.snapshot(), real = f.provider.sign.bind(f.provider), fault = new Error("owned file transport refusal after real crypto");
  let crypto = 0;
  const calls = vi.spyOn(f.provider, "sign").mockImplementation(async (...args) => {
    const answer = await real(...args);
    if (args[0].id === "artifact-seal") { expect(answer).toHaveLength(64); crypto++; throw fault; }
    return answer;
  });
  const response = await fetch(api.url + "/auth/login", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "wrong-owned-password" }) });
  expect(response.status).toBe(401); await response.json(); expect(crypto).toBe(1);
  expect(calls.mock.calls.filter(([ref]) => ref.id === "artifact-seal")).toHaveLength(1); expect(f.snapshot()).toEqual(before);
  expect(primaryCount(f, "HUMAN_LOGIN_FAILED")).toBe(1);
  vi.restoreAllMocks();
  const again = await fetch(api.url + "/auth/login", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "wrong-owned-password" }) });
  expect(again.status).toBe(401); await again.json();
  expect(f.entries().at(-1)).toMatchObject({ type: "HUMAN_LOGIN_FAILED", username: "owner" });
  expect(verifyHumanActionLog(f.workspace).ok).toBe(true); expect(primaryCount(f, "HUMAN_LOGIN_FAILED")).toBe(2);
});

test("successful login rechecks the issued tracked token rather than a still-valid incoming old cookie", async () => {
  const f = fixture(), api = await server(f), before = f.snapshot(), realCreate = authApi.createSessionAsync;
  let issued: Awaited<ReturnType<typeof authApi.createSessionAsync>> | undefined;
  vi.spyOn(authApi, "createSessionAsync").mockImplementation(async (...args) => { const value = await realCreate(...args); issued = value; return value; });
  const wait = pauseHuman(f), pending = fetch(api.url + "/auth/login", { method: "POST", headers: { "content-type": "application/json", cookie: "amc_session=" + f.session.token },
    body: JSON.stringify({ username: "owner", password: "owned-owner-password" }) });
  try {
    await reached(wait, pending); expect(issued).toBeDefined(); expect(issued!.token).not.toBe(f.session.token);
    authApi.revokeSessionByToken({ workspace: f.workspace, token: issued!.token });
    expect(authApi.verifyTrackedSessionToken({ workspace: f.workspace, token: issued!.token }).ok).toBe(false);
    expect(authApi.verifyTrackedSessionToken({ workspace: f.workspace, token: f.session.token }).ok).toBe(true);
    wait.gate.resolve(); const response = await pending; expect(response.status).toBe(200); await response.json();
    expect(response.headers.get("set-cookie")).toContain("amc_session=" + issued!.token);
    expect(f.snapshot()).toEqual(before); expect(primaryCount(f, "HUMAN_LOGIN_SUCCESS")).toBe(1);
    vi.restoreAllMocks();
    const fresh = await fetch(api.url + "/auth/login", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "owned-owner-password" }) });
    expect(fresh.status).toBe(200); await fresh.json();
    const token = fresh.headers.get("set-cookie")!.split(";", 1)[0]!.slice("amc_session=".length);
    expect(authApi.verifyTrackedSessionToken({ workspace: f.workspace, token }).ok).toBe(true);
    expect(f.entries().at(-1)).toMatchObject({ type: "HUMAN_LOGIN_SUCCESS", username: "owner" });
    expect(verifyHumanActionLog(f.workspace).ok).toBe(true); expect(primaryCount(f, "HUMAN_LOGIN_SUCCESS")).toBe(2);
  } finally { wait.gate.resolve(); await Promise.allSettled([pending]); }
});

test("a genuine secondary signature-file publication failure leaves primary cache effect and Ledger audit successful", async () => {
  const f = fixture(), api = await server(f), before = f.snapshot(), original = fs.renameSync, fault = Object.assign(new Error("owned secondary signature EIO"), { code: "EIO" });
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => { if (String(to) === f.paths[2]) throw fault; return original(from, to); }); syncBuiltinESMExports();
  const response = await postPrune(api, f.session), body = await response.json();
  expect(response.status).toBe(200); expect(body.removedGenericCacheFiles).toContain(f.target); expect(fs.existsSync(f.target)).toBe(false);
  expect(primaryCount(f, "OPS_MAINTENANCE_PRUNE")).toBe(1); expect(f.snapshot()[0]).not.toEqual(before[0]); expect(f.snapshot()[2]).toEqual(before[2]);
  expect(verifyHumanActionLog(f.workspace).ok).toBe(false); expect(fs.existsSync(join(f.workspace, ".amc", ".human-action-log.lock"))).toBe(false);
});

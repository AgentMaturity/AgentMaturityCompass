import { randomUUID, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { postDirectApiRegistry } from "../helpers/postDirectApiRegistry.js";
import { initWorkspace } from "../../src/workspace.js";
import { setMode } from "../../src/mode/mode.js";
import { createWorkOrder, createWorkOrderAsync, expireWorkOrder, expireWorkOrderAsync, listWorkOrders, verifyWorkOrder, type WorkOrderInput } from "../../src/workorders/workorderEngine.js";
import { issueExecTicketAsync, verifyExecTicket } from "../../src/tickets/execTicketVerify.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { initUsersConfig, createSession, revokeSessionByToken } from "../../src/auth/authApi.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined, nonce: "" }));
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () => boundary.nonce ? boundary.nonce as ReturnType<typeof actual.randomUUID> : actual.randomUUID();
  return { ...actual, randomUUID, default: { ...actual, randomUUID } };
});
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
const PASS = "async-workorder-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];
afterEach(async () => {
  boundary.nonce = "";
  for (const server of servers.splice(0)) await server.close();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  boundary.call = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-workorder-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const input: WorkOrderInput = { workspace, agentId: "default", title: "Actual approved work order", description: "Owned execution request",
    riskTier: "low", requestedMode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"] };
  return { root, workspace, input };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function bind(f: ReturnType<typeof fixture>) {
  const a = AWS_ARN("workorder-a-" + randomUUID()), b = AWS_ARN("workorder-b-" + randomUUID()), key = fakeKey("p256"), next = fakeKey("p256");
  const fake = awsFake({ [a]: key, [b]: next }), control: { unavailable: boolean; afterSign?: () => Promise<void> } = { unavailable: false };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.unavailable) throw Object.assign(new Error("secret https://private.invalid PIN=never-output"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region); if (operation === "Sign") await control.afterSign?.(); return answer;
  };
  const candidate = (id = a) => { const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } }; return Buffer.from(YAML.stringify(config)); };
  await transitionConfigSignatureProvider(f.workspace, candidate(), { passphrase: PASS });
  const pause = () => { const entered = deferred(), gate = deferred(); control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await gate.promise; }; return { entered, gate }; };
  return { ...f, a, b, key, next, fake, control, candidate, pause, pem: publicPem(key) };
}
function pair(path: string) { return { body: readFileSync(path), signature: readFileSync(path + ".sig") }; }
function marker(path: string) { return path.replace(/\.json$/, ".revocation.json"); }
function expectP256(path: string, pem: string) {
  const sidecar = JSON.parse(readFileSync(path + ".sig", "utf8")); expect(sidecar.digestSha256).toBe(sha256Hex(readFileSync(path)));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sidecar.digestSha256, "hex"), pem, Buffer.from(sidecar.signature, "base64"))).toBe(true);
}
async function studio(f: ReturnType<typeof fixture>) {
  const owner = initUsersConfig({ workspace: f.workspace, username: "workorder-owner", password: "workorder-owner-password" }).owner;
  const session = createSession({ workspace: f.workspace, user: owner });
  const api = await startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: "workorder-admin" }); servers.push(api);
  const post = (path: string, body: unknown, headers: Record<string, string> = { "x-amc-admin-token": "workorder-admin" }) => fetch(api.url + path,
    { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { api, session, post };
}

describe("actual async config-purpose work-order authoring and expiry", () => {
  test("default create and expiry pin the independent legacy field order and exact Ed25519 wire bytes", async () => {
    const f = fixture(), now = Date.now(), key = getSigningKey(f.workspace, "config-signature"), uuid = "b7e21624-ed60-4d54-a9f6-3f05f38685dc";
    boundary.nonce = uuid; vi.spyOn(Date, "now").mockReturnValue(now);
    const legacy = createWorkOrder(f.input), original = pair(legacy.filePath);
    const body = { v: 1, workOrderId: `wo_${uuid.replace(/-/g, "")}`, agentId: "default", title: f.input.title, description: f.input.description,
      createdTs: now, riskTier: "low", requestedMode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"], requiredAssurancePacks: {}, expiresTs: null, artifacts: {} };
    expect(original.body.toString()).toBe(JSON.stringify(body, null, 2));
    const digest = sha256Hex(original.body), sidecar = { digestSha256: digest, signature: sign(null, Buffer.from(digest, "hex"), key).toString("base64"), signedTs: now, signer: "auditor" };
    expect(original.signature.toString()).toBe(JSON.stringify(sidecar, null, 2));
    // Reset only these two owned temporary fixture records, so the same default producer input can be compared exactly.
    unlinkSync(legacy.filePath); unlinkSync(legacy.sigPath);
    const created = await createWorkOrderAsync(f.input); expect(created).toEqual(legacy); expect(pair(created.filePath)).toEqual(original);
    const expired = expireWorkOrder({ workspace: f.workspace, agentId: "default", workOrderId: created.workOrder.workOrderId, reason: "owner reset" }), revoked = pair(expired.revokePath);
    expect(revoked.body.toString()).toBe(JSON.stringify({ v: 1, workOrderId: body.workOrderId, agentId: "default", revokedTs: now, reason: "owner reset" }, null, 2));
    const revokedDigest = sha256Hex(revoked.body);
    expect(revoked.signature.toString()).toBe(JSON.stringify({ digestSha256: revokedDigest, signature: sign(null, Buffer.from(revokedDigest, "hex"), key).toString("base64"), signedTs: now, signer: "auditor" }, null, 2));
    unlinkSync(expired.revokePath); unlinkSync(expired.sigPath);
    expect(await expireWorkOrderAsync({ workspace: f.workspace, agentId: "default", workOrderId: body.workOrderId, reason: "owner reset" })).toEqual(expired);
    expect(pair(expired.revokePath)).toEqual(revoked); expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: body.workOrderId })).toMatchObject({ valid: true, expired: true });
  });

  test.each(["create", "expire"] as const)("direct workorder %s refuses existing agent mode before provider calls or files", async operation => {
    const plain = fixture(), target = createWorkOrder(plain.input), f = await bind(plain), before = listWorkOrders({ workspace: f.workspace }), source = pair(target.filePath);
    const calls = f.fake.requests.length, command = "workorder " + operation, expiry = { workspace: f.workspace, workOrderId: target.workOrder.workOrderId };
    setMode(f.workspace, "agent");
    try {
      await expect(operation === "create" ? createWorkOrderAsync(f.input) : expireWorkOrderAsync(expiry)).rejects.toThrow("Command '" + command + "' is blocked in agent mode");
      expect(() => operation === "create" ? createWorkOrder(f.input) : expireWorkOrder(expiry)).toThrow("Command '" + command + "' is blocked in agent mode");
      expect(f.fake.requests).toHaveLength(calls); expect(listWorkOrders({ workspace: f.workspace })).toEqual(before);
      expect(pair(target.filePath)).toEqual(source); expect(existsSync(marker(target.filePath))).toBe(false); expect(existsSync(marker(target.filePath) + ".sig")).toBe(false);
    } finally { setMode(f.workspace, "owner"); }
    if (operation === "create") {
      const fresh = await createWorkOrderAsync(f.input); expectP256(fresh.filePath, f.pem);
      expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: fresh.workOrder.workOrderId })).toMatchObject({ valid: true, expired: false });
    } else {
      const fresh = await expireWorkOrderAsync(expiry); expectP256(fresh.revokePath, f.pem);
      expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: target.workOrder.workOrderId })).toMatchObject({ valid: true, expired: true });
    }
  });

  test.each(["create", "expire"] as const)("workorder %s rechecks mode after the actual provider wait before publication", async operation => {
    const plain = fixture(), target = createWorkOrder(plain.input), f = await bind(plain), before = listWorkOrders({ workspace: f.workspace }), source = pair(target.filePath);
    const expiry = { workspace: f.workspace, workOrderId: target.workOrder.workOrderId }, paused = f.pause();
    const pending = operation === "create" ? createWorkOrderAsync(f.input) : expireWorkOrderAsync(expiry), outcome = pending.then(() => null, error => error);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      setMode(f.workspace, "agent"); paused.gate.resolve();
      expect(await outcome).toMatchObject({ message: "Command 'workorder " + operation + "' is blocked in agent mode. Switch to owner mode with: amc mode owner" });
      expect(listWorkOrders({ workspace: f.workspace })).toEqual(before); expect(pair(target.filePath)).toEqual(source);
      expect(existsSync(marker(target.filePath))).toBe(false); expect(existsSync(marker(target.filePath) + ".sig")).toBe(false);
    } finally { paused.gate.resolve(); await Promise.allSettled([pending]); setMode(f.workspace, "owner"); }
    if (operation === "create") {
      const fresh = await createWorkOrderAsync(f.input); expectP256(fresh.filePath, f.pem);
      expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: fresh.workOrder.workOrderId })).toMatchObject({ valid: true, expired: false });
    } else {
      const fresh = await expireWorkOrderAsync(expiry); expectP256(fresh.revokePath, f.pem);
      expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: target.workOrder.workOrderId })).toMatchObject({ valid: true, expired: true });
    }
  });

  test("actual bound P256 creates an approved work order, issues its ticket and signs expiry with the vault locked and no synchronous fallback", async () => {
    const f = await bind(fixture()), before = f.fake.requests.filter(row => row.operation === "Sign").length;
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const created = await createWorkOrderAsync(f.input); expectP256(created.filePath, f.pem);
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId })).toMatchObject({ valid: true, expired: false });
    const ticket = await issueExecTicketAsync({ workspace: f.workspace, agentId: "default", workOrderId: created.workOrder.workOrderId, actionClass: "WRITE_HIGH", ttlMs: 60_000 });
    expect(verifyExecTicket({ workspace: f.workspace, ticket: ticket.ticket }).ok).toBe(true);
    expect(() => expireWorkOrder({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId })).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    expect(existsSync(marker(created.filePath))).toBe(false);
    const expired = await expireWorkOrderAsync({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId }); expectP256(expired.revokePath, f.pem);
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId })).toMatchObject({ valid: true, expired: true });
    expect(verifyExecTicket({ workspace: f.workspace, ticket: ticket.ticket }).ok).toBe(false);
    expect(f.fake.requests.filter(row => row.operation === "Sign").slice(before)).toHaveLength(3);
    const rows = listWorkOrders({ workspace: f.workspace });
    expect(() => createWorkOrder(f.input)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" })); expect(listWorkOrders({ workspace: f.workspace })).toEqual(rows);
  });

  test("actual provider failure cannot create a body or prematurely revoke an existing work order", async () => {
    const f = await bind(fixture()); f.control.unavailable = true;
    await expect(createWorkOrderAsync(f.input)).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 }); expect(listWorkOrders({ workspace: f.workspace })).toEqual([]);
    f.control.unavailable = false; const created = await createWorkOrderAsync(f.input), before = pair(created.filePath); f.control.unavailable = true;
    const error = await expireWorkOrderAsync({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId }).catch(error => error);
    expect(error).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 }); expect(String(error)).not.toMatch(/private\.invalid|PIN=|never-output/);
    expect(pair(created.filePath)).toEqual(before); expect(existsSync(marker(created.filePath))).toBe(false); expect(existsSync(marker(created.filePath) + ".sig")).toBe(false);
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId })).toMatchObject({ valid: true, expired: false });
  });

  test("create owns nested input before await and refuses an expired prepared request before any body is written", async () => {
    const f = await bind(fixture()), input: WorkOrderInput = { ...f.input, allowedActionClasses: [...f.input.allowedActionClasses], artifacts: { repoUrl: "https://owned.invalid/original" } }, paused = f.pause();
    const pending = createWorkOrderAsync(input);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      input.title = "mutated"; input.allowedActionClasses.push("DEPLOY"); input.artifacts!.repoUrl = "https://changed.invalid"; paused.gate.resolve();
      const created = await pending; expect(created.workOrder.title).toBe(f.input.title); expect(created.workOrder.allowedActionClasses).toEqual(["WRITE_HIGH"]);
      expect(created.workOrder.artifacts.repoUrl).toBe("https://owned.invalid/original"); expectP256(created.filePath, f.pem);
    } finally { paused.gate.resolve(); await pending.catch(() => {}); }
    const before = listWorkOrders({ workspace: f.workspace }), expiresTs = Date.now() + 60_000, late = f.pause(), expired = createWorkOrderAsync({ ...f.input, expiresTs });
    try {
      expect(await Promise.race([late.entered.promise.then(() => "signed"), expired.then(() => "returned", () => "rejected")])).toBe("signed");
      vi.spyOn(Date, "now").mockReturnValue(expiresTs + 1); late.gate.resolve(); await expect(expired).rejects.toThrow("work order expired while signing was prepared");
    } finally { late.gate.resolve(); await expired.catch(() => {}); vi.restoreAllMocks(); }
    expect(listWorkOrders({ workspace: f.workspace })).toEqual(before);
  });

  test("two actual expirers sign outside the lock and only the first publishes its marker", async () => {
    const f = await bind(fixture()), created = await createWorkOrderAsync(f.input), entered = [deferred(), deferred()], gates = [deferred(), deferred()]; let count = 0;
    f.control.afterSign = async () => { const index = count++; expect(existsSync(join(dirname(created.filePath), ".workorders.lock"))).toBe(false); entered[index]!.resolve(); await gates[index]!.promise; };
    const first = expireWorkOrderAsync({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId, reason: "first owner" });
    const second = expireWorkOrderAsync({ workspace: f.workspace, workOrderId: created.workOrder.workOrderId, reason: "second owner" });
    try {
      expect(await Promise.race([entered[0]!.promise.then(() => "signed"), first.then(() => "returned", () => "rejected")])).toBe("signed");
      expect(await Promise.race([entered[1]!.promise.then(() => "signed"), second.then(() => "returned", () => "rejected")])).toBe("signed");
      gates[0]!.resolve(); const result = await first, before = pair(result.revokePath); gates[1]!.resolve();
      await expect(second).rejects.toThrow(/expired|revoked/i); expect(pair(result.revokePath)).toEqual(before); expectP256(result.revokePath, f.pem);
      expect(JSON.parse(before.body.toString()).reason).toBe("first owner");
    } finally { gates.forEach(gate => gate.resolve()); f.control.afterSign = undefined; await Promise.allSettled([first, second]); }
  });

  test("a real owner rebind while creating refuses stale publication and the new provider independently succeeds", async () => {
    const f = await bind(fixture()), paused = f.pause(), pending = createWorkOrderAsync(f.input);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      await transitionConfigSignatureProvider(f.workspace, f.candidate(f.b), { passphrase: PASS }); paused.gate.resolve();
      await expect(pending).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    } finally { paused.gate.resolve(); await pending.catch(() => {}); }
    expect(listWorkOrders({ workspace: f.workspace })).toEqual([]); expectP256((await createWorkOrderAsync(f.input)).filePath, publicPem(f.next));
  });

  test("the actual registry preserves default-vault create, ticket and expiry with real signatures", async () => {
    const f = fixture(), runtime = await studio(f), key = getSigningKey(f.workspace, "config-signature");
    const created = await runtime.post("/api/v1/workorders", { title: "Default HTTP work order", description: "Actual vault compatibility", riskTier: "low", mode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"], agentId: "default" });
    const row = await created.json() as { data: { workOrderId: string; filePath: string; sigPath: string } };
    expect(created.status).toBe(201);
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: row.data.workOrderId })).toMatchObject({ valid: true, expired: false });
    const sidecar = JSON.parse(readFileSync(row.data.sigPath, "utf8"));
    expect(Buffer.from(sidecar.signature, "base64")).toEqual(sign(null, Buffer.from(sha256Hex(readFileSync(row.data.filePath)), "hex"), key));
    const issued = await runtime.post("/api/v1/tickets/issue", { workOrderId: row.data.workOrderId, action: "WRITE_HIGH", tool: "fs.write", agentId: "default" });
    const ticket = (await issued.json() as { data: { ticket: string } }).data.ticket;
    expect(issued.status).toBe(201); expect(verifyExecTicket({ workspace: f.workspace, ticket }).ok).toBe(true);
    const [payload, signature] = ticket.split("."); expect(Buffer.from(signature!, "base64url")).toEqual(sign(null, Buffer.from(payload!, "base64url"), key));
    const expired = await runtime.post(`/api/v1/workorders/${row.data.workOrderId}/expire`, { reason: "Default HTTP expiry", agentId: "default" });
    const expiry = await expired.json() as { data: { revokePath: string; sigPath: string } };
    expect(expired.status).toBe(200); expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: row.data.workOrderId })).toMatchObject({ valid: true, expired: true });
    const seal = JSON.parse(readFileSync(expiry.data.sigPath, "utf8"));
    expect(Buffer.from(seal.signature, "base64")).toEqual(sign(null, Buffer.from(sha256Hex(readFileSync(expiry.data.revokePath)), "hex"), key));
  });

  test.each(["create", "expire"] as const)("the actual registry %s caller refuses a provider-held key without Sign or publication when no trusted callback is forwarded", async operation => {
    const plain = fixture(), target = createWorkOrder(plain.input), f = await bind(plain);
    const path = operation === "create" ? "/api/v1/workorders" : `/api/v1/workorders/${target.workOrder.workOrderId}/expire`;
    const body = operation === "create" ? { title: "Held HTTP work order", description: "No unsigned publication", riskTier: "low", mode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"], agentId: "default" } : { reason: "Held HTTP expiry", agentId: "default" };
    const before = listWorkOrders({ workspace: f.workspace }), original = pair(target.filePath), calls = f.fake.requests.length;
    const refused = await postDirectApiRegistry(f.workspace, path, body), text = refused.body;
    expect(refused.status).toBe(409); expect(text).toContain("KEY_PROVIDER_HELD");
    expect(text).not.toMatch(/private\.invalid|PIN=|never-output|"workOrderId"/);
    expect(f.fake.requests.length).toBe(calls); expect(listWorkOrders({ workspace: f.workspace })).toEqual(before);
    expect(pair(target.filePath)).toEqual(original); expect(existsSync(marker(target.filePath))).toBe(false);
    if (operation === "create") expectP256((await createWorkOrderAsync(f.input)).filePath, f.pem);
    else expectP256((await expireWorkOrderAsync({ workspace: f.workspace, workOrderId: target.workOrder.workOrderId })).revokePath, f.pem);
  });

  test("the actual Studio create and expiry callers preserve locked-file 423 without writing an unsigned file or marker", async () => {
    const f = fixture(), target = createWorkOrder(f.input), runtime = await studio(f), before = listWorkOrders({ workspace: f.workspace });
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const created = await runtime.post("/api/v1/workorders", { title: "Locked refusal", description: "No unsigned body", riskTier: "low", mode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"] });
    expect(created.status).toBe(423); expect(await created.text()).toContain("A4_VAULT_LOCKED");
    const expired = await runtime.post(`/api/v1/workorders/${target.workOrder.workOrderId}/expire`, {});
    expect(expired.status).toBe(423); expect(await expired.text()).toContain("A4_VAULT_LOCKED");
    expect(listWorkOrders({ workspace: f.workspace })).toEqual(before); expect(existsSync(marker(target.filePath))).toBe(false);
  });

  test.each(["create", "expire"] as const)("actual Studio %s reauthenticates after provider signing before any durable publication", async operation => {
    const plain = fixture(), target = createWorkOrder(plain.input), runtime = await studio(plain), f = await bind(plain);
    const path = operation === "create" ? "/api/v1/workorders" : `/api/v1/workorders/${target.workOrder.workOrderId}/expire`;
    const body = operation === "create" ? { title: "HTTP provider work order", description: "Owned runtime request", riskTier: "low", mode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"], agentId: "default" } : { reason: "runtime owner expiry", agentId: "default" };
    const before = listWorkOrders({ workspace: f.workspace }); f.control.unavailable = true;
    const unavailable = await runtime.post(path, body), failure = await unavailable.text();
    expect(unavailable.status).toBe(503); expect(failure).toContain("KEY_PROVIDER_UNAVAILABLE"); expect(failure).not.toMatch(/private\.invalid|PIN=|never-output/);
    expect(listWorkOrders({ workspace: f.workspace })).toEqual(before); expect(existsSync(marker(target.filePath))).toBe(false); f.control.unavailable = false;
    const paused = f.pause(), pending = runtime.post(path, body, { cookie: `amc_session=${encodeURIComponent(runtime.session.token)}` });
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      revokeSessionByToken({ workspace: f.workspace, token: runtime.session.token }); paused.gate.resolve();
      const denied = await pending, text = await denied.text(); expect(denied.status).toBe(401); expect(text).not.toContain('"workOrderId"');
    } finally { paused.gate.resolve(); await pending.catch(() => {}); }
    expect(listWorkOrders({ workspace: f.workspace })).toEqual(before); expect(existsSync(marker(target.filePath))).toBe(false);
    const positive = await runtime.post(path, body), result = await positive.json() as { data: { workOrderId?: string; filePath?: string; revokePath?: string } };
    expect(positive.status).toBe(operation === "create" ? 201 : 200);
    if (operation === "create") { expectP256(result.data.filePath!, f.pem); expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: result.data.workOrderId! })).toMatchObject({ valid: true, expired: false }); }
    else { expectP256(result.data.revokePath!, f.pem); expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: target.workOrder.workOrderId })).toMatchObject({ valid: true, expired: true }); }
  });

});

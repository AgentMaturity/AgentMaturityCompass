import { randomUUID, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { setMode } from "../../src/mode/mode.js";
import { createWorkOrder, verifyWorkOrder } from "../../src/workorders/workorderEngine.js";
import { issueExecTicket, issueExecTicketAsync, verifyExecTicket } from "../../src/tickets/execTicketVerify.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../../src/crypto/keys.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { revokeKey, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { initUsersConfigAsync, createSession } from "../../src/auth/authApi.js";
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
// Only the supported SDK transport changes. Resolution, signed config/history, provider normalization and actual crypto run.
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
const PASS = "config-ticket-owner-passphrase";
const roots: Array<{ root: string; workspace: string }> = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];
afterEach(async () => {
  boundary.nonce = "";
  for (const server of servers.splice(0)) await server.close();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  boundary.call = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs();
});
function fixture(expiresTs?: number) {
  const root = mkdtempSync(join(tmpdir(), "amc-config-ticket-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Current work-order creation is a synchronous compatibility producer: create the real approved artifact before binding.
  const workOrder = createWorkOrder({ workspace, agentId: "default", title: "Owned ticket approval",
    description: "Previously approved signed work order", riskTier: "low", requestedMode: "EXECUTE",
    allowedActionClasses: ["WRITE_HIGH"], expiresTs });
  const input = { workspace, agentId: "default", workOrderId: workOrder.workOrder.workOrderId, actionClass: "WRITE_HIGH" as const, ttlMs: 15 * 60_000, toolName: "fs.write" };
  return { root, workspace, workOrder, input };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function bind(f: ReturnType<typeof fixture>) {
  const a = AWS_ARN("ticket-a-" + randomUUID()), b = AWS_ARN("ticket-b-" + randomUUID());
  const key = fakeKey("p256"), next = fakeKey("p256"), fake = awsFake({ [a]: key, [b]: next });
  const control: { unavailable: boolean; afterSign?: () => Promise<void> } = { unavailable: false };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.unavailable) throw Object.assign(new Error("private https://private.invalid PIN=never-output"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign") await control.afterSign?.();
    return answer;
  };
  const candidate = (id = a) => {
    const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
    return Buffer.from(YAML.stringify(config));
  };
  await transitionConfigSignatureProvider(f.workspace, candidate(), { passphrase: PASS });
  const pause = () => {
    const entered = deferred(), gate = deferred();
    control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await gate.promise; };
    return { entered, gate };
  };
  return { ...f, a, b, key, next, fake, control, candidate, pause, pem: publicPem(key) };
}
function tokenBytes(ticket: string) { return Buffer.from(ticket.split(".")[0]!, "base64url"); }
function tokenSignature(ticket: string) { return Buffer.from(ticket.split(".")[1]!, "base64url"); }
function expectP256(ticket: string, pem: string) {
  expect(tokenSignature(ticket).length).toBe(64);
  expect(verifyCanonical("ecdsa-p256-sha256", tokenBytes(ticket), pem, tokenSignature(ticket))).toBe(true);
}
async function studio(f: ReturnType<typeof fixture>) {
  const owner = (await initUsersConfigAsync({ workspace: f.workspace, username: "ticket-owner", password: "ticket-owner-password" })).owner;
  const session = createSession({ workspace: f.workspace, user: owner });
  // Actual cold API startup; its prompt/passport BUNDLE files retain their artifact-seal protocol.
  const api = await startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: "ticket-admin" }); servers.push(api);
  const issue = (headers: Record<string, string> = { "x-amc-admin-token": "ticket-admin" }) => fetch(`${api.url}/api/v1/tickets/issue`, {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ agentId: "default", workOrderId: f.input.workOrderId, action: "WRITE_HIGH", tool: "fs.write", ttl: "15m" })
  });
  return { api, session, issue };
}

describe("actual config-purpose execution-ticket producers and callers", () => {
  test("default async issue preserves the exact synchronous Ed25519 ticket bytes and raw public format", async () => {
    const f = fixture(), privateKey = getSigningKey(f.workspace, "config-signature"), now = Date.now();
    boundary.nonce = "f5006afb-04ad-4e2f-aa19-38b021d205c7"; vi.spyOn(Date, "now").mockReturnValue(now);
    const legacy = issueExecTicket(f.input), issued = await issueExecTicketAsync(f.input);
    expect(issued).toEqual(legacy); expect(issued.ticket.split(".")).toHaveLength(2);
    expect(tokenSignature(issued.ticket)).toEqual(sign(null, tokenBytes(issued.ticket), privateKey));
    expect(verifyExecTicket({ workspace: f.workspace, ticket: issued.ticket, expectedWorkOrderId: f.input.workOrderId }).ok).toBe(true);
  });

  test("direct ticket issue refuses existing agent mode before any provider call and fresh owner issue still verifies", async () => {
    const f = await bind(fixture()), calls = f.fake.requests.length, body = readFileSync(f.workOrder.filePath), signature = readFileSync(f.workOrder.sigPath);
    setMode(f.workspace, "agent");
    try {
      await expect(issueExecTicketAsync(f.input)).rejects.toThrow("Command 'ticket issue' is blocked in agent mode");
      expect(() => issueExecTicket(f.input)).toThrow("Command 'ticket issue' is blocked in agent mode");
      expect(f.fake.requests).toHaveLength(calls); expect(readFileSync(f.workOrder.filePath)).toEqual(body); expect(readFileSync(f.workOrder.sigPath)).toEqual(signature);
    } finally { setMode(f.workspace, "owner"); }
    const fresh = await issueExecTicketAsync(f.input); expectP256(fresh.ticket, f.pem);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: fresh.ticket }).ok).toBe(true);
  });

  test("ticket issue rechecks mode after an actual provider wait before returning any token", async () => {
    const f = await bind(fixture()), paused = f.pause(), pending = issueExecTicketAsync(f.input), outcome = pending.then(() => null, error => error);
    const body = readFileSync(f.workOrder.filePath), signature = readFileSync(f.workOrder.sigPath);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      setMode(f.workspace, "agent"); paused.gate.resolve();
      const refused = await outcome; expect(refused).toMatchObject({ message: "Command 'ticket issue' is blocked in agent mode. Switch to owner mode with: amc mode owner" });
      expect(refused).not.toHaveProperty("ticket"); expect(readFileSync(f.workOrder.filePath)).toEqual(body); expect(readFileSync(f.workOrder.sigPath)).toEqual(signature);
    } finally { paused.gate.resolve(); await Promise.allSettled([pending]); setMode(f.workspace, "owner"); }
    const fresh = await issueExecTicketAsync(f.input); expectP256(fresh.ticket, f.pem);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: fresh.ticket }).ok).toBe(true);
  });

  test("real owner-bound canonical P256 issues and verifies against the exact purpose while the vault stays locked", async () => {
    const f = await bind(fixture()), before = f.fake.requests.filter(row => row.operation === "Sign").length;
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    const issued = await issueExecTicketAsync(f.input);
    expectP256(issued.ticket, f.pem); expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: f.input.workOrderId }).valid).toBe(true);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: issued.ticket, expectedActionClass: "WRITE_HIGH", expectedToolName: "fs.write" }).ok).toBe(true);
    const calls = f.fake.requests.filter(row => row.operation === "Sign").slice(before);
    expect(calls).toHaveLength(1); expect(Buffer.from(calls[0]!.input.Message as Uint8Array)).toEqual(tokenBytes(issued.ticket));
    expect(() => issueExecTicket(f.input)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
  });

  test("the actual work-order verifier refuses a role-history artifact key outside config-signature purpose", () => {
    const f = fixture(), original = readFileSync(f.workOrder.sigPath), sidecar = JSON.parse(original.toString());
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: f.input.workOrderId }).valid).toBe(true);
    rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
    rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    const artifact = getSigningPublicKeyPem(f.workspace, "artifact-seal");
    expect(getPublicKeyHistory(f.workspace, "auditor")).toContain(artifact);
    expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(artifact);
    sidecar.signature = sign(null, Buffer.from(sha256Hex(readFileSync(f.workOrder.filePath)), "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64");
    expect(verifyHexDigestAny(sidecar.digestSha256, sidecar.signature, getPublicKeyHistory(f.workspace, "auditor"))).toBe(true);
    writeFileSync(f.workOrder.sigPath, JSON.stringify(sidecar, null, 2));
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: f.input.workOrderId })).toMatchObject({ valid: false, reason: "signature verification failed" });
    writeFileSync(f.workOrder.sigPath, original);
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: f.input.workOrderId }).valid).toBe(true);
  });

  test("a retired-key ticket fails after actual owner rebind and old-key revocation while its signature and the fresh-provider control stay valid", async () => {
    const f = await bind(fixture()), issued = await issueExecTicketAsync(f.input);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: issued.ticket }).ok).toBe(true);
    await transitionConfigSignatureProvider(f.workspace, f.candidate(f.b), { passphrase: PASS });
    const fresh = await issueExecTicketAsync(f.input); expectP256(fresh.ticket, publicPem(f.next));
    expect(verifyExecTicket({ workspace: f.workspace, ticket: issued.ticket }).ok).toBe(true);
    revokeKey(f.workspace, "config-signature", signingKeyId(f.pem)!, "key-compromise", PASS);
    expectP256(issued.ticket, f.pem);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: issued.ticket })).toMatchObject({ ok: false, error: "signature verification failed" });
    expect(verifyExecTicket({ workspace: f.workspace, ticket: fresh.ticket }).ok).toBe(true);
    const current = await issueExecTicketAsync(f.input); expectP256(current.ticket, publicPem(f.next));
    expect(verifyExecTicket({ workspace: f.workspace, ticket: current.ticket }).ok).toBe(true);
  });

  test("the actual work order must still be unexpired after the remote signature returns", async () => {
    const expiresTs = Date.now() + 60_000, f = await bind(fixture(expiresTs)), paused = f.pause();
    const pending = issueExecTicketAsync(f.input);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      vi.spyOn(Date, "now").mockReturnValue(expiresTs + 1); paused.gate.resolve();
      await expect(pending).rejects.toThrow(/expired|revoked/i);
    } finally { paused.gate.resolve(); vi.restoreAllMocks(); }
    expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: f.input.workOrderId })).toMatchObject({ valid: true, expired: false });
    expectP256((await issueExecTicketAsync(f.input)).ticket, f.pem);
  });

  test("a valid historical-key work-order revision during signing refuses the stale digest, then admits a freshly bound ticket", async () => {
    const plain = fixture(), oldPrivate = getSigningKey(plain.workspace, "config-signature"), f = await bind(plain), paused = f.pause();
    const pending = issueExecTicketAsync(f.input);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      const changed = JSON.parse(readFileSync(f.workOrder.filePath, "utf8")); changed.title = "A different approved work-order revision";
      writeFileSync(f.workOrder.filePath, JSON.stringify(changed, null, 2));
      const sidecar = JSON.parse(readFileSync(f.workOrder.sigPath, "utf8")); sidecar.digestSha256 = sha256Hex(readFileSync(f.workOrder.filePath));
      sidecar.signature = sign(null, Buffer.from(sidecar.digestSha256, "hex"), oldPrivate).toString("base64");
      writeFileSync(f.workOrder.sigPath, JSON.stringify(sidecar, null, 2));
      expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: f.input.workOrderId })).toMatchObject({ valid: true, expired: false });
      paused.gate.resolve(); await expect(pending).rejects.toThrow("the work order changed while the execution ticket was signed");
    } finally { paused.gate.resolve(); }
    const fresh = await issueExecTicketAsync(f.input); expectP256(fresh.ticket, f.pem);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: fresh.ticket }).ok).toBe(true);
  });

  test("a ticket that expires during a real provider wait never returns, with an independent fresh positive", async () => {
    const f = await bind(fixture()), started = Date.now(), paused = f.pause(), pending = issueExecTicketAsync(f.input);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      vi.spyOn(Date, "now").mockReturnValue(started + f.input.ttlMs + 10_000); paused.gate.resolve();
      await expect(pending).rejects.toThrow("the execution ticket expired while it was signed");
    } finally { paused.gate.resolve(); vi.restoreAllMocks(); }
    expectP256((await issueExecTicketAsync(f.input)).ticket, f.pem);
  });

  test("actual owner rebind during signing refuses the stale ticket and the newly committed provider issues a valid one", async () => {
    const f = await bind(fixture()), paused = f.pause(), pending = issueExecTicketAsync(f.input);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      await transitionConfigSignatureProvider(f.workspace, f.candidate(f.b), { passphrase: PASS }); paused.gate.resolve();
      await expect(pending).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    } finally { paused.gate.resolve(); }
    const current = await issueExecTicketAsync(f.input); expectP256(current.ticket, publicPem(f.next));
    expect(verifyExecTicket({ workspace: f.workspace, ticket: current.ticket }).ok).toBe(true);
  });

  test("the actual registry ticket caller refuses a provider-held key before any Sign when no trusted callback is forwarded", async () => {
    const plain = fixture(), runtime = await studio(plain), f = await bind(plain);
    const body = readFileSync(f.workOrder.filePath), sidecar = readFileSync(f.workOrder.sigPath), calls = f.fake.requests.length;
    const refused = await runtime.issue(), text = await refused.text();
    expect(refused.status).toBe(409); expect(text).toContain("KEY_PROVIDER_HELD");
    expect(text).not.toMatch(/private\.invalid|PIN=|never-output|"ticket"/);
    expect(f.fake.requests.length).toBe(calls);
    expect(readFileSync(f.workOrder.filePath)).toEqual(body); expect(readFileSync(f.workOrder.sigPath)).toEqual(sidecar);
    const direct = await issueExecTicketAsync(f.input); expectP256(direct.ticket, f.pem);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: direct.ticket }).ok).toBe(true);
  });

});

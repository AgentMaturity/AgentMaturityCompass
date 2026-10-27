import { generateKeyPairSync, sign, verify } from "node:crypto";
import * as fs from "../../src/utils/fs.js";
import * as locks from "../../src/lifecycle/controlFileLock.js";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../../src/workspace.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { createHandoffPacket, acceptHandoffPacket, loadHandoffPacket, loadHandoffReceiverReceipt,
  listHandoffPackets, verifyHandoffPacket, verifyHandoffContract } from "../../src/fleet/handoffPacket.js";
import { createHandoffPacketAsync, acceptHandoffPacketAsync } from "../../src/fleet/handoffPacketSigning.js";
import { spawnSubagent, type SubagentRunContext } from "../../src/agent/subagentSpawn.js";
import { rootIdentity } from "../../src/agent/delegationIdentity.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { addPublicKeyToHistory } from "../../src/crypto/keys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { lowS, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import type { KeyRef } from "../../src/keys/provider.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const boundary = vi.hoisted(() => ({ ids: [] as string[], calls: [] as Array<{ ref: KeyRef; bytes: Buffer; signature: Buffer; publicKey: string; lockHeld: boolean }>,
  descriptions: 0, beforeDescription: undefined as undefined | ((number: number) => Promise<void>),
  afterSign: undefined as undefined | (() => Promise<void>), corrupt: false }));
vi.mock("node:crypto", async original => {
  const actual = await original<typeof import("node:crypto")>();
  const randomUUID = () => (boundary.ids.shift() ?? actual.randomUUID()) as ReturnType<typeof actual.randomUUID>;
  return { ...actual, randomUUID, default: { ...actual, randomUUID } };
});
// Only scheduling at the actual file-provider boundary is controlled; vault and signatures are real.
vi.mock("../../src/keys/providers/file.js", async original => {
  const actual = await original<typeof import("../../src/keys/providers/file.js")>();
  return { ...actual, fileKeyProvider(workspace: string) {
    const provider = actual.fileKeyProvider(workspace);
    return { ...provider, async describe(ref: KeyRef) {
      await boundary.beforeDescription?.(++boundary.descriptions); return provider.describe(ref);
    }, async sign(ref: KeyRef, bytes: Uint8Array) {
      const signature = Buffer.from(await provider.sign(ref, bytes));
      const { getSigningPublicKeyPem } = await import("../../src/keys/signingKeys.js");
      const { existsSync } = await import("node:fs"); const { join } = await import("node:path");
      boundary.calls.push({ ref: { ...ref }, bytes: Buffer.from(bytes), signature: Buffer.from(signature), publicKey: getSigningPublicKeyPem(workspace, "artifact-seal"), lockHeld: existsSync(join(workspace, ".amc", ".handoff-publication.lock")) });
      const wait = boundary.afterSign; boundary.afterSign = undefined; await wait?.();
      return boundary.corrupt ? Buffer.alloc(signature.length) : signature;
    } };
  } };
});
const PASS = "owned-handoff-publication-passphrase", roots: string[] = [];
afterEach(() => {
  boundary.ids = []; boundary.calls = []; boundary.descriptions = 0; boundary.afterSign = undefined; boundary.beforeDescription = undefined; boundary.corrupt = false;
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const root of roots.splice(0)) { const workspace = join(root, "workspace"); closeSqlitePool(`ledger:${workspace}:${join(workspace, ".amc", "evidence.sqlite")}`); lockVault(workspace); rmSync(root, { recursive: true, force: true }); }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-handoff-async-")), workspace = join(root, "workspace"); roots.push(root);
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  boundary.calls = []; boundary.descriptions = 0;
  const params = { fromAgentId: "parent", toAgentId: "child", goal: "owned task", constraints: ["original"], evidenceSnapshot: ["evidence-original"],
    ownershipTransfer: { evidenceRefs: ["owned-ref"] }, dependencyStatuses: [{ dependencyId: "d", ownerAgentId: null, status: "pending" as const, required: true, evidenceRefs: [], refusalReason: null }] };
  return { root, workspace, params, publicKey: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
function files(workspace: string, id: string) {
  const root = join(workspace, ".amc", "handoffs");
  return { packet: join(root, id + ".json"), receipt: join(root, "receipts", id + ".receiver.json"), unresolved: join(root, "receipts", id + ".unresolved.json") };
}
function digest(body: unknown) { return Buffer.from(sha256Hex(canonicalize(body)), "hex"); }
function raw(body: unknown, pem: string) { return sign(null, digest(body), pem).toString("base64"); }
function signatureBody<T extends { signature: string }>(value: T) { const { signature: _signature, ...body } = value; return body; }
function math(body: unknown, signature: string, publicKey: string) { expect(verify(null, digest(body), publicKey, Buffer.from(signature, "base64"))).toBe(true); }
function actualCalls(count: number) {
  expect(boundary.calls).toHaveLength(count);
  for (const call of boundary.calls) {
    expect(call.ref).toMatchObject({ provider: "file", id: "artifact-seal" }); expect(call.bytes).toHaveLength(32); expect(call.lockHeld).toBe(false);
    expect(verify(null, call.bytes, call.publicKey, call.signature)).toBe(true);
  }
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(which = 1) {
  const entered = deferred(), release = deferred(); let remaining = which;
  const wait = async () => { if (--remaining === 0) { entered.resolve(); await release.promise; } else boundary.afterSign = wait; };
  boundary.afterSign = wait; return { entered, release };
}
async function entered(gate: ReturnType<typeof pause>, pending: Promise<unknown>) {
  expect(await Promise.race([gate.entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
}
function packetPositive(f: ReturnType<typeof fixture>, id: string) {
  const packet = loadHandoffPacket(f.workspace, id);
  math(signatureBody(packet), packet.signature, f.publicKey);
  math(signatureBody(packet.senderReceipt!), packet.senderReceipt!.signature, f.publicKey);
  expect(verifyHandoffPacket(f.workspace, id)).toMatchObject({ valid: true, signatureValid: true, senderReceiptValid: true });
  return packet;
}

test("handoff async default bytes preserve the independent original sender outer receiver recipes and exact two plus one real signatures", async () => {
  const f = fixture(), now = Date.now(), pem = getSigningKey(f.workspace, "artifact-seal");
  vi.spyOn(Date, "now").mockReturnValue(now);
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  boundary.ids = [...ids];
  const legacy = createHandoffPacket(f.workspace, { fromAgentId: "parent", toAgentId: "child", goal: "owned task" });
  const old = readFileSync(files(f.workspace, legacy.packetId).packet);
  boundary.ids = [...ids];
  const packet = await createHandoffPacketAsync(f.workspace, { fromAgentId: "parent", toAgentId: "child", goal: "owned task" });
  const base = { packetId: "handoff_11111111-111", fromAgentId: "parent", toAgentId: "child", goal: "owned task", currentState: "", nextAction: "",
    constraints: [], knownUnknowns: [], artifactPaths: [], stopConditions: [], contextHash: sha256Hex("owned task"), evidenceSnapshot: [], trustState: null,
    delegationScope: [], ownershipTransfer: { fromOwnerAgentId: "parent", toOwnerAgentId: "child", scope: [], status: "offered", transferReceiptId: null, refusalReason: null, evidenceRefs: [] },
    dependencyStatuses: [], refusalReasons: [], createdTs: now, expiryTs: now + 3600_000 };
  const senderBody = { role: "sender", receiptId: "handoff_sender_22222222-222", packetId: base.packetId, agentId: "parent", createdTs: now, payloadHash: sha256Hex(canonicalize(base)) };
  const body = { ...base, senderReceipt: { ...senderBody, signature: raw(senderBody, pem) } }, expected = { ...body, signature: raw(body, pem) };
  expect(packet).toEqual(expected); expect(readFileSync(files(f.workspace, packet.packetId).packet)).toEqual(Buffer.from(JSON.stringify(expected, null, 2)));
  expect(readFileSync(files(f.workspace, packet.packetId).packet)).toEqual(old);
  boundary.ids = ["33333333-3333-4333-8333-333333333333"];
  const receipt = await acceptHandoffPacketAsync(f.workspace, packet.packetId);
  const receiver = { role: "receiver", receiptId: "handoff_receiver_33333333-333", packetId: packet.packetId, receiverAgentId: "child",
    accepted: true, ownershipAccepted: true, receivedTs: now, dependencyStatuses: [], unresolvedDependencies: [], refusalReasons: [] };
  const receiverBody = { ...receiver, payloadHash: sha256Hex(canonicalize(receiver)) };
  expect(receipt).toEqual({ ...receiverBody, signature: raw(receiverBody, pem) });
  expect(readFileSync(files(f.workspace, packet.packetId).receipt).toString()).toBe(JSON.stringify(receipt, null, 2));
  actualCalls(3); expect(boundary.calls.map(call => call.bytes)).toEqual([digest(senderBody), digest(body), digest(receiverBody)]);
  packetPositive(f, packet.packetId); expect(verifyHandoffContract(f.workspace, packet.packetId).valid).toBe(true);
});

test.each([1, 2])("sender arguments stay captured across actual Sign %s", async which => {
  const f = fixture(), gate = pause(which), input = structuredClone(f.params), pending = createHandoffPacketAsync(f.workspace, input);
  try {
    await entered(gate, pending); actualCalls(which);
    input.fromAgentId = "changed"; input.goal = "changed"; input.constraints[0] = "changed"; input.evidenceSnapshot.push("changed"); input.ownershipTransfer.evidenceRefs[0] = "changed";
    gate.release.resolve(); const packet = await pending;
    expect(packet).toMatchObject({ fromAgentId: "parent", goal: "owned task", constraints: ["original"], evidenceSnapshot: ["evidence-original"], ownershipTransfer: { evidenceRefs: ["owned-ref"] } });
    packetPositive(f, packet.packetId);
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); }
});

test("the original sender authority refuses a newly current vault key before the second actual Sign", async () => {
  const f = fixture(), enteredDescription = deferred(), release = deferred();
  boundary.beforeDescription = async number => { if (number === 2) { enteredDescription.resolve(); await release.promise; } };
  const pending = createHandoffPacketAsync(f.workspace, f.params), result = pending.then(() => null, error => error);
  try {
    expect(await Promise.race([enteredDescription.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
    actualCalls(1); rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    const next = getSigningPublicKeyPem(f.workspace, "artifact-seal"); expect(next).not.toBe(f.publicKey);
    release.resolve(); expect(await result).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    // The caller gate re-runs after Describe (signWithPurposeKey), so the rotated key is refused before it signs anything.
    expect(boundary.descriptions).toBe(2); actualCalls(1); expect(boundary.calls[0]!.publicKey).toBe(f.publicKey); expect(listHandoffPackets(f.workspace)).toEqual([]);
  } finally { release.resolve(); await Promise.allSettled([pending]); boundary.beforeDescription = undefined; }
  const next = { ...f, publicKey: getSigningPublicKeyPem(f.workspace, "artifact-seal") }; packetPositive(next, (await createHandoffPacketAsync(f.workspace, f.params)).packetId);
});

test("invalid real provider response refuses before packet publication and leaves a fresh crypto positive", async () => {
  const f = fixture(); boundary.corrupt = true;
  await expect(createHandoffPacketAsync(f.workspace, f.params)).rejects.toMatchObject({ code: expect.stringMatching(/^KEY_PROVIDER_/) });
  expect(listHandoffPackets(f.workspace)).toEqual([]); actualCalls(1); boundary.corrupt = false;
  packetPositive(f, (await createHandoffPacketAsync(f.workspace, f.params)).packetId);
});

test.each(["create", "accept"] as const)("late no-sign refuses %s while the encrypted vault and real signature remain usable", async target => {
  const f = fixture(), packet = createHandoffPacket(f.workspace, f.params), before = readFileSync(files(f.workspace, packet.packetId).packet);
  boundary.calls = []; const gate = pause(target === "create" ? 2 : 1), pending = target === "create" ? createHandoffPacketAsync(f.workspace, f.params) : acceptHandoffPacketAsync(f.workspace, packet.packetId);
  try {
    await entered(gate, pending); actualCalls(target === "create" ? 2 : 1); vi.stubEnv("AMC_NO_SIGN", "1"); gate.release.resolve();
    await expect(pending).rejects.toThrow("no-sign mode"); expect(listHandoffPackets(f.workspace)).toEqual([packet.packetId]);
    expect(readFileSync(files(f.workspace, packet.packetId).packet)).toEqual(before); expect(existsSync(files(f.workspace, packet.packetId).receipt)).toBe(false);
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); }
  if (target === "create") packetPositive(f, (await createHandoffPacketAsync(f.workspace, f.params)).packetId);
  else expect((await acceptHandoffPacketAsync(f.workspace, packet.packetId)).signature).not.toBe("unsigned");
});

test.each(["create", "accept"] as const)("the actual final %s lock gate refuses a newly locked vault after the shared signer already checked real crypto", async target => {
  const f = fixture(), packet = createHandoffPacket(f.workspace, f.params), original = readFileSync(files(f.workspace, packet.packetId).packet), real = locks.withControlFileLock;
  let armed = true;
  const spy = vi.spyOn(locks, "withControlFileLock").mockImplementation(input => real({ ...input, operation: () => {
    if (armed && input.name === "handoff-publication") { armed = false; lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); }
    return input.operation();
  } }));
  try {
    const pending = target === "create" ? createHandoffPacketAsync(f.workspace, f.params) : acceptHandoffPacketAsync(f.workspace, packet.packetId);
    await expect(pending).rejects.toThrow(/Vault locked/i); actualCalls(target === "create" ? 2 : 1);
    expect(listHandoffPackets(f.workspace)).toEqual([packet.packetId]); expect(readFileSync(files(f.workspace, packet.packetId).packet)).toEqual(original);
    expect(existsSync(files(f.workspace, packet.packetId).receipt)).toBe(false); expect(existsSync(join(f.workspace, ".amc", ".handoff-publication.lock"))).toBe(false);
  } finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  if (target === "create") packetPositive(f, (await createHandoffPacketAsync(f.workspace, f.params)).packetId);
  else expect((await acceptHandoffPacketAsync(f.workspace, packet.packetId)).signature).not.toBe("unsigned");
});

test("locked and no-sign async entry refuses without touching handoff members or calling file Sign", async () => {
  const f = fixture(); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  try { await expect(createHandoffPacketAsync(f.workspace, f.params)).rejects.toThrow(/Vault locked/i); actualCalls(0); expect(listHandoffPackets(f.workspace)).toEqual([]); }
  finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  vi.stubEnv("AMC_NO_SIGN", "1"); await expect(createHandoffPacketAsync(f.workspace, f.params)).rejects.toThrow("no-sign mode"); actualCalls(0);
  vi.stubEnv("AMC_NO_SIGN", "0"); packetPositive(f, (await createHandoffPacketAsync(f.workspace, f.params)).packetId);
});

test("an actual configured but unbound provider refuses both maintained handoff producers with zero fallback Sign", async () => {
  const f = fixture(), packet = createHandoffPacket(f.workspace, f.params), path = join(f.workspace, ".amc", "amc.config.yaml"), original = readFileSync(path);
  const config = YAML.parse(original.toString()); config.keys = { provider: "file", refs: { "artifact-seal": { provider: "aws-kms", id: "arn:aws:kms:eu-west-1:111122223333:key/owned-unbound-handoff" } } };
  try {
    fs.writeFileAtomic(path, YAML.stringify(config), 0o644);
    await expect(createHandoffPacketAsync(f.workspace, f.params)).rejects.toMatchObject({ code: "KEY_PROVIDER_HELD" });
    await expect(acceptHandoffPacketAsync(f.workspace, packet.packetId)).rejects.toMatchObject({ code: "KEY_PROVIDER_HELD" });
    actualCalls(0); expect(listHandoffPackets(f.workspace)).toEqual([packet.packetId]); expect(existsSync(files(f.workspace, packet.packetId).receipt)).toBe(false);
  } finally { fs.writeFileAtomic(path, original, 0o644); }
  packetPositive(f, (await createHandoffPacketAsync(f.workspace, f.params)).packetId);
});

test.each(["packet-bytes", "packet-mode", "receipt", "unresolved"] as const)("receiver exact %s predecessor is preserved after real Sign", async target => {
  const f = fixture(), packet = createHandoffPacket(f.workspace, f.params), path = files(f.workspace, packet.packetId);
  acceptHandoffPacket(f.workspace, packet.packetId, { accepted: false, refusalReason: "original" });
  const beforePacket = readFileSync(path.packet), beforeMode = lstatSync(path.packet).mode & 0o777;
  const gate = pause(), pending = acceptHandoffPacketAsync(f.workspace, packet.packetId, { accepted: true });
  try {
    await entered(gate, pending); actualCalls(1);
    if (target === "packet-bytes") fs.writeFileAtomic(path.packet, Buffer.concat([beforePacket, Buffer.from("\n ")]), 0o644);
    if (target === "packet-mode") chmodSync(path.packet, 0o600);
    if (target === "receipt") { const unresolved = readFileSync(path.unresolved); acceptHandoffPacket(f.workspace, packet.packetId, { accepted: false, refusalReason: "competitor" }); fs.writeFileAtomic(path.unresolved, unresolved, 0o644); }
    if (target === "unresolved") fs.writeFileAtomic(path.unresolved, Buffer.concat([readFileSync(path.unresolved), Buffer.from("\n ")]), 0o644);
    const actual = [path.packet, path.receipt, path.unresolved].map(p => ({ bytes: readFileSync(p), mode: lstatSync(p).mode & 0o777 }));
    gate.release.resolve(); await expect(pending).rejects.toThrow("changed while preparing");
    expect([path.packet, path.receipt, path.unresolved].map(p => ({ bytes: readFileSync(p), mode: lstatSync(p).mode & 0o777 }))).toEqual(actual);
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); fs.writeFileAtomic(path.packet, beforePacket, beforeMode); }
  expect((await acceptHandoffPacketAsync(f.workspace, packet.packetId)).signature).not.toBe("unsigned"); packetPositive(f, packet.packetId);
});

test("a real competing same-ID synchronous creator survives async packet output CAS", async () => {
  const f = fixture(), ids = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
  boundary.ids = [...ids]; const gate = pause(2), pending = createHandoffPacketAsync(f.workspace, f.params);
  try {
    await entered(gate, pending); actualCalls(2); boundary.ids = [...ids];
    const competing = createHandoffPacket(f.workspace, { ...f.params, goal: "actual competing creator" }), path = files(f.workspace, competing.packetId).packet, bytes = readFileSync(path);
    gate.release.resolve(); await expect(pending).rejects.toThrow("changed while preparing"); expect(readFileSync(path)).toEqual(bytes);
    expect(packetPositive(f, competing.packetId).goal).toBe("actual competing creator");
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); }
  packetPositive(f, (await createHandoffPacketAsync(f.workspace, f.params)).packetId);
});

test("receiver caller values stay captured and pending dependencies never gain ownership from an explicit accept", async () => {
  const f = fixture(), packet = createHandoffPacket(f.workspace, f.params), input = { receiverAgentId: "child", accepted: true, refusalReasons: [{ agentId: "child", reason: "owned refusal", evidenceRefs: ["original"] }] };
  const gate = pause(), pending = acceptHandoffPacketAsync(f.workspace, packet.packetId, input);
  try {
    await entered(gate, pending); input.receiverAgentId = "other"; input.refusalReasons[0]!.reason = "changed"; input.refusalReasons[0]!.evidenceRefs.push("changed");
    gate.release.resolve(); const receipt = await pending;
    expect(receipt).toMatchObject({ receiverAgentId: "child", accepted: true, ownershipAccepted: false, refusalReasons: [expect.objectContaining({ reason: "owned refusal", evidenceRefs: ["original"] })] });
    math(signatureBody(receipt), receipt.signature, f.publicKey); expect(verifyHandoffContract(f.workspace, packet.packetId).valid).toBe(false);
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); }
});

test("expired direct records remain compatible while receiver expiry is checked after real Sign", async () => {
  const f = fixture(), old = await createHandoffPacketAsync(f.workspace, { ...f.params, ttlMs: -1 });
  expect(verifyHandoffPacket(f.workspace, old.packetId)).toMatchObject({ expired: true, signatureValid: true, valid: false });
  const packet = createHandoffPacket(f.workspace, { ...f.params, ttlMs: 60_000 }), gate = pause(), pending = acceptHandoffPacketAsync(f.workspace, packet.packetId);
  const clock = vi.spyOn(Date, "now");
  try {
    await entered(gate, pending); clock.mockReturnValue(packet.expiryTs + 1); gate.release.resolve();
    await expect(pending).rejects.toThrow("expired"); expect(existsSync(files(f.workspace, packet.packetId).receipt)).toBe(false);
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); clock.mockRestore(); }
  expect((await acceptHandoffPacketAsync(f.workspace, packet.packetId)).signature).not.toBe("unsigned");
});

test("receiver unresolved-write failure reports the already-published actual receipt and native cause without rollback", async () => {
  const f = fixture(), packet = createHandoffPacket(f.workspace, f.params), path = files(f.workspace, packet.packetId), real = fs.writeFileAtomic;
  const cause = Object.assign(new Error("owned I/O refusal"), { code: "EIO" });
  const spy = vi.spyOn(fs, "writeFileAtomic").mockImplementation((p, bytes, mode) => { if (p === path.unresolved) throw cause; return real(p, bytes, mode); });
  try {
    await expect(acceptHandoffPacketAsync(f.workspace, packet.packetId)).rejects.toMatchObject({ code: "HANDOFF_PUBLICATION_PARTIAL", phase: "unresolved-log", published: [".amc/handoffs/receipts/" + packet.packetId + ".receiver.json"], cause });
    const receipt = loadHandoffReceiverReceipt(f.workspace, packet.packetId)!; math(signatureBody(receipt), receipt.signature, f.publicKey);
    expect(existsSync(path.unresolved)).toBe(false); expect(existsSync(join(f.workspace, ".amc", ".handoff-publication.lock"))).toBe(false);
  } finally { spy.mockRestore(); }
  expect((await acceptHandoffPacketAsync(f.workspace, packet.packetId)).signature).not.toBe("unsigned");
});

test.each(["outer", "sender", "receiver"] as const)("a distinct config-only key cannot authenticate the handoff %s despite valid raw crypto", async target => {
  const f = fixture(); rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
  rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
  const wrong = getSigningKey(f.workspace, "config-signature"), wrongPub = getSigningPublicKeyPem(f.workspace, "config-signature"), artifact = getSigningKey(f.workspace, "artifact-seal");
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(wrongPub);
  const next = { ...f, publicKey: getSigningPublicKeyPem(f.workspace, "artifact-seal") }, packet = await createHandoffPacketAsync(f.workspace, f.params), path = files(f.workspace, packet.packetId);
  const original = readFileSync(path.packet);
  if (target === "receiver") {
    const receipt = await acceptHandoffPacketAsync(f.workspace, packet.packetId), body = signatureBody(receipt);
    const forged = { ...body, signature: raw(body, wrong) }; math(body, forged.signature, wrongPub); fs.writeFileAtomic(path.receipt, JSON.stringify(forged, null, 2), 0o644);
    expect(verifyHandoffContract(f.workspace, packet.packetId).receiverReceiptValid).toBe(false);
    await acceptHandoffPacketAsync(f.workspace, packet.packetId); expect(verifyHandoffContract(f.workspace, packet.packetId).receiverReceiptValid).toBe(true);
  } else {
    const forged = structuredClone(packet);
    if (target === "sender") { const body = signatureBody(forged.senderReceipt!); forged.senderReceipt!.signature = raw(body, wrong); math(body, forged.senderReceipt!.signature, wrongPub); }
    forged.signature = raw(signatureBody(forged), target === "outer" ? wrong : artifact);
    math(signatureBody(forged), forged.signature, target === "outer" ? wrongPub : next.publicKey);
    fs.writeFileAtomic(path.packet, JSON.stringify(forged, null, 2), 0o644);
    const result = verifyHandoffPacket(f.workspace, packet.packetId); expect(target === "outer" ? result.signatureValid : result.senderReceiptValid).toBe(false);
    expect(result.valid).toBe(false); fs.writeFileAtomic(path.packet, original, 0o644);
  }
  packetPositive(next, packet.packetId);
});

test("owner-imported canonical P256 historical packet signatures remain local unbound integrity and forged history source is refused", async () => {
  const f = fixture(), key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pub = key.publicKey.export({ format: "pem", type: "spki" }).toString();
  addPublicKeyToHistory(f.workspace, "auditor", pub, "imported");
  const packet = createHandoffPacket(f.workspace, f.params), path = files(f.workspace, packet.packetId), forged = structuredClone(packet);
  const p256 = (body: unknown) => lowS(sign("sha256", digest(body), { key: key.privateKey, dsaEncoding: "ieee-p1363" })).toString("base64");
  forged.senderReceipt!.signature = p256(signatureBody(forged.senderReceipt!)); forged.signature = p256(signatureBody(forged));
  expect(verifyWithKey(digest(signatureBody(forged)), pub, Buffer.from(forged.signature, "base64"))).toBe(true);
  fs.writeFileAtomic(path.packet, JSON.stringify(forged, null, 2), 0o644); expect(verifyHandoffPacket(f.workspace, packet.packetId).valid).toBe(true);
  const historyPath = join(f.workspace, ".amc", "keys", "auditor_history.json"), history = readFileSync(historyPath), parsed = JSON.parse(history.toString());
  const entry = parsed.entries.find((item: { publicKeyPem: string }) => item.publicKeyPem === pub); expect(entry.source).toBe("imported"); entry.source = "local";
  try { fs.writeFileAtomic(historyPath, JSON.stringify(parsed, null, 2), 0o600); expect(verifyHandoffPacket(f.workspace, packet.packetId).valid).toBe(false); }
  finally { fs.writeFileAtomic(historyPath, history, 0o600); }
  expect(verifyHandoffPacket(f.workspace, packet.packetId).valid).toBe(true);
});

test("strict native mint refuses expiry reached during Sign before session effects", async () => {
  const f = fixture(), gate = pause(2), events: unknown[] = [], mint = vi.fn(() => "owned-child");
  const runner = vi.fn(async (_context: SubagentRunContext) => ({ ok: true, text: "owned child result" }));
  const input = { workspace: f.workspace, parent: rootIdentity("parent"), request: { runAs: "child", goal: "owned task" },
    session: { recordLoopEvent: (row: unknown) => { events.push(row); }, recordProjectedEvidence: (row: unknown) => { events.push(row); } }, runner, mintSessionId: mint };
  const writes: string[] = [], realWrite = fs.writeFileAtomic;
  const writer = vi.spyOn(fs, "writeFileAtomic").mockImplementation((p, data, mode) => { if (p.startsWith(join(f.workspace, ".amc", "handoffs"))) writes.push(p); return realWrite(p, data, mode); });
  const pending = spawnSubagent(input), clock = vi.spyOn(Date, "now");
  try {
    await entered(gate, pending); actualCalls(2); clock.mockReturnValue(Date.now() + 7_200_000); gate.release.resolve();
    expect(await pending).toMatchObject({ ok: false, packetId: null }); expect(listHandoffPackets(f.workspace)).toEqual([]); expect(events).toEqual([]); expect(mint).not.toHaveBeenCalled(); expect(runner).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); clock.mockRestore(); writer.mockRestore(); }
  expect((await spawnSubagent(input)).ok).toBe(true);
});

// This uses the existing injected recorder/runner boundary. It does not execute held native runner/session/lease code.
test("native delegation abort during actual second Sign publishes no packet and announces no session or runner", async () => {
  const f = fixture(), gate = pause(2), controller = new AbortController(), events: unknown[] = [];
  const mint = vi.fn(() => "owned-child"), runner = vi.fn(async (_context: SubagentRunContext) => ({ ok: true, text: "owned child result" }));
  const input = { workspace: f.workspace, parent: rootIdentity("parent"), request: { runAs: "child", goal: "owned task", delegationScope: ["READ_ONLY"] },
    session: { recordLoopEvent: (row: unknown) => { events.push(row); }, recordProjectedEvidence: (row: unknown) => { events.push(row); } },
    runner, mintSessionId: mint, signal: controller.signal };
  const writes: string[] = [], realWrite = fs.writeFileAtomic;
  const writer = vi.spyOn(fs, "writeFileAtomic").mockImplementation((p, data, mode) => { if (p.startsWith(join(f.workspace, ".amc", "handoffs"))) writes.push(p); return realWrite(p, data, mode); });
  const pending = spawnSubagent(input);
  try {
    await entered(gate, pending); actualCalls(2); controller.abort(); gate.release.resolve();
    expect(await pending).toMatchObject({ ok: false, packetId: null }); expect(listHandoffPackets(f.workspace)).toEqual([]);
    expect(mint).not.toHaveBeenCalled(); expect(events).toEqual([]); expect(runner).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); writer.mockRestore(); }
  const result = await spawnSubagent({ ...input, signal: new AbortController().signal });
  expect(result.ok).toBe(true); expect(runner).toHaveBeenCalledOnce(); expect(runner.mock.calls[0]![0]).toMatchObject({ toolsetAgentId: "parent", identity: { runAs: "child", governedAs: "parent", depth: 1 } });
});

test("native parent and request scope are captured before actual Sign while the original governance boundary is retained", async () => {
  const f = fixture(), gate = pause(2), parent = { ...rootIdentity("parent") }, request = { runAs: "child", goal: "owned task", delegationScope: ["READ_ONLY"] };
  const runner = vi.fn(async (_context: SubagentRunContext) => ({ ok: true, text: "owned child result" }));
  const pending = spawnSubagent({ workspace: f.workspace, parent, request,
    session: { recordLoopEvent: () => null, recordProjectedEvidence: () => null }, runner, mintSessionId: () => "owned-child" });
  try {
    await entered(gate, pending); actualCalls(2); parent.governedAs = "different"; parent.runAs = "different"; request.runAs = "different"; request.goal = "different"; request.delegationScope.push("WRITE_HIGH");
    gate.release.resolve(); const result = await pending; expect(result.ok).toBe(true);
    expect(runner.mock.calls[0]![0]).toMatchObject({ toolsetAgentId: "parent", goal: "owned task", delegationScope: ["READ_ONLY"], identity: { governedAs: "parent", runAs: "child" } });
    if (result.packetId === null) throw new Error("expected the actual published packet");
    expect(packetPositive(f, result.packetId)).toMatchObject({ fromAgentId: "parent", toAgentId: "child", goal: "owned task", delegationScope: ["READ_ONLY"] });
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); }
});

test("native announcement failure preserves a different actual valid same-ID replacement packet", async () => {
  const f = fixture(), ids = ["66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777"], packetId = "handoff_66666666-666";
  boundary.ids = [...ids]; const cause = new Error("owned announcement refusal after replacement"); let replacementBytes: Buffer | undefined, replacementMode: number | undefined;
  const recorder = vi.fn((record: unknown) => {
    expect(record).toMatchObject({ kind: "delegation-started", packetId }); boundary.ids = [...ids];
    const replacement = createHandoffPacket(f.workspace, { fromAgentId: "parent", toAgentId: "child", goal: "actual replacement survives" });
    expect(replacement.packetId).toBe(packetId); expect(packetPositive(f, packetId).goal).toBe("actual replacement survives");
    replacementBytes = readFileSync(files(f.workspace, packetId).packet); replacementMode = lstatSync(files(f.workspace, packetId).packet).mode & 0o777; throw cause;
  });
  const projected = vi.fn(() => null), mint = vi.fn(() => "owned-child"), runner = vi.fn(async (_context: SubagentRunContext) => ({ ok: true, text: "owned child result" }));
  await expect(spawnSubagent({ workspace: f.workspace, parent: rootIdentity("parent"), request: { runAs: "child", goal: "original minted goal" },
    session: { recordLoopEvent: recorder, recordProjectedEvidence: projected }, runner, mintSessionId: mint })).rejects.toBe(cause);
  actualCalls(2); expect(recorder).toHaveBeenCalledOnce(); expect(mint).toHaveBeenCalledOnce(); expect(projected).not.toHaveBeenCalled(); expect(runner).not.toHaveBeenCalled();
  expect(replacementBytes).toBeDefined(); expect(existsSync(files(f.workspace, packetId).packet)).toBe(true); expect(readFileSync(files(f.workspace, packetId).packet)).toEqual(replacementBytes);
  expect(listHandoffPackets(f.workspace)).toEqual([packetId]); expect(packetPositive(f, packetId).goal).toBe("actual replacement survives");
  expect(lstatSync(files(f.workspace, packetId).packet).mode & 0o777).toBe(replacementMode);
});

test("native announcement failure removes its own exact minted output and retains a fresh successful control", async () => {
  const f = fixture(), ids = ["88888888-8888-4888-8888-888888888888", "99999999-9999-4999-8999-999999999999"], packetId = "handoff_88888888-888";
  boundary.ids = [...ids]; const cause = new Error("owned announcement refusal without replacement");
  const recorder = vi.fn((record: unknown): unknown => { expect(record).toMatchObject({ kind: "delegation-started", packetId });
    expect(packetPositive(f, packetId).goal).toBe("original minted goal"); throw cause; });
  const projected = vi.fn(() => null), mint = vi.fn(() => "owned-child"), runner = vi.fn(async (_context: SubagentRunContext) => ({ ok: true, text: "owned child result" }));
  const input = { workspace: f.workspace, parent: rootIdentity("parent"), request: { runAs: "child", goal: "original minted goal" },
    session: { recordLoopEvent: recorder, recordProjectedEvidence: projected }, runner, mintSessionId: mint };
  await expect(spawnSubagent(input)).rejects.toBe(cause); actualCalls(2);
  expect(recorder).toHaveBeenCalledOnce(); expect(projected).not.toHaveBeenCalled(); expect(runner).not.toHaveBeenCalled();
  expect(existsSync(files(f.workspace, packetId).packet)).toBe(false); expect(listHandoffPackets(f.workspace)).toEqual([]);
  recorder.mockImplementation(() => null); const restored = await spawnSubagent(input);
  expect(restored.ok).toBe(true); expect(runner).toHaveBeenCalledOnce(); if (restored.packetId === null) throw new Error("expected restored real native packet");
  expect(packetPositive(f, restored.packetId).goal).toBe("original minted goal"); actualCalls(4);
});

test.skipIf(process.platform === "win32")("actual compiled fleet handoff create and accept await exactly two plus one real raw32 signatures", async () => {
  const f = fixture(), actual = pathToFileURL(resolve("dist/keys/providers/file.js")).href, purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href;
  const replacement = join(f.root, "file-boundary.mjs"), loader = join(f.root, "loader.mjs"), requests = join(f.root, "calls.jsonl");
  writeFileSync(requests, "");
  writeFileSync(replacement, 'import {appendFileSync} from "node:fs"; import {fileKeyProvider as actual} from '+JSON.stringify(actual)+';\nexport function fileKeyProvider(workspace){const provider=actual(workspace);return {...provider,async sign(ref,bytes){const signature=await provider.sign(ref,bytes);appendFileSync(process.env.P208_HANDOFF_CALLS,JSON.stringify({purpose:ref.id,hex:Buffer.from(bytes).toString("hex")})+"\\n");return signature;}};}\n');
  writeFileSync(loader, 'import {pathToFileURL} from "node:url";\nexport async function resolve(specifier,context,nextResolve){if(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js"].some(prefix=>specifier.startsWith(prefix)))throw new Error("owned handoff test forbids cloud SDK imports");const found=await nextResolve(specifier,context);if(context.parentURL==='+JSON.stringify(purpose)+'&&found.url==='+JSON.stringify(actual)+')return {url:pathToFileURL(process.env.P208_HANDOFF_BOUNDARY).href,shortCircuit:true};return found;}\n');
  const invoke = async (args: string[]) => {
    const owned = spawnOwnedNode(["--experimental-loader", pathToFileURL(loader).href, resolve("dist/cli.js"), "fleet", "handoff", ...args],
      { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1", P208_HANDOFF_CALLS: requests, P208_HANDOFF_BOUNDARY: replacement } });
    try { const result = await owned.wait(30_000); expect(result.code, result.stderr).toBe(0); expect(result.signal).toBeNull(); return result; }
    finally { await owned.stop(); }
  };
  const created = await invoke(["create", "--from", "parent", "--to", "child", "--goal", "owned CLI", "--mode", "simulate"]);
  expect(created.stdout).toContain("Handoff packet created:");
  const ids = listHandoffPackets(f.workspace); expect(ids).toHaveLength(1); const packet = packetPositive(f, ids[0]!);
  expect(packet.delegationScope).toEqual(["READ_ONLY"]);
  expect((await invoke(["accept", "--packet", packet.packetId])).stdout).toContain("Handoff receiver receipt created:");
  const receipt = loadHandoffReceiverReceipt(f.workspace, packet.packetId)!; math(signatureBody(receipt), receipt.signature, f.publicKey);
  expect(verifyHandoffContract(f.workspace, packet.packetId).valid).toBe(true);
  expect(readFileSync(requests, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([
    { purpose: "artifact-seal", hex: digest(signatureBody(packet.senderReceipt!)).toString("hex") },
    { purpose: "artifact-seal", hex: digest(signatureBody(packet)).toString("hex") },
    { purpose: "artifact-seal", hex: digest(signatureBody(receipt)).toString("hex") }
  ]);
}, 90_000);

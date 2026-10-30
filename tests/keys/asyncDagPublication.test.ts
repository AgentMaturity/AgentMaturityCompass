import { sign, verify } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { createDag, createDagAsync, appendDagNode, appendDagNodeAsync, loadDag, queryDagsByAgent, visualizeDag } from "../../src/index.js";
import * as purposeProviders from "../../src/keys/purposeProviders.js";
import { initWorkspace } from "../../src/workspace.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { keysetIdentity } from "../../src/keys/keyset.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";

const PASS = "owned-dag-publication", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); for (const f of roots.splice(0)) { lockVault(f.workspace); closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc", "evidence.sqlite")}`); fs.rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), "amc-dag-async-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "controls")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return { root, workspace, provider: purposeProviders.loadKeyProvider(workspace, "file"),
    key: getSigningKey(workspace, "artifact-seal"), pem: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
const file = (workspace: string, id: string) => join(workspace, ".amc", "dags", id + ".json");
const input = (taskDescription = "original owned task") => ({ callerAgentId: "caller", calleeAgentId: "callee", eventType: "agent_delegation_started" as const,
  taskDescription, contextHash: "c".repeat(64), startTs: Date.now() });
function raw(f: ReturnType<typeof fixture>, digest: string, signature: string) {
  expect(signature).toBe(sign(null, Buffer.from(digest, "hex"), f.key).toString("base64"));
  expect(verify(null, Buffer.from(digest, "hex"), f.pem, Buffer.from(signature, "base64"))).toBe(true);
  expect(verify(null, Buffer.from(digest), f.pem, Buffer.from(signature, "base64"))).toBe(false);
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), real = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (...args) => { const signed = await real(...args); entered.resolve(); await release.promise; return signed; });
  return { entered, release, spy };
}
async function atPause(wait: ReturnType<typeof pause>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { expect(await Promise.race([wait.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "refused"),
    new Promise<string>(done => { timer = setTimeout(() => done("actual Sign not reached"), 5000); })])).toBe("signed"); }
  finally { clearTimeout(timer); }
}

test("root SDK async DAG create preserves literal default fields and independent Ed25519 raw32 math", async () => {
  const f = fixture(), real = f.provider.sign.bind(f.provider), spy = vi.spyOn(f.provider, "sign").mockImplementation(async (...args) => {
    expect(fs.existsSync(join(f.workspace, ".amc", "dags", ".dag-publication.lock"))).toBe(false); return real(...args);
  });
  const dag = await createDagAsync(f.workspace), body = { dagId: dag.dagId, fleetId: "default", createdTs: dag.createdTs };
  expect(Object.keys(dag)).toEqual(["dagId", "fleetId", "createdTs", "nodes", "dagHash", "dagSignature"]);
  expect(dag.nodes).toEqual([]); expect(dag.dagHash).toBe(sha256Hex(canonicalize(body))); raw(f, dag.dagHash, dag.dagSignature);
  expect(fs.readFileSync(file(f.workspace, dag.dagId), "utf8")).toBe(JSON.stringify(dag, null, 2));
  expect(spy.mock.calls.map(([ref, bytes]) => ({ ref, hex: Buffer.from(bytes).toString("hex") }))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: dag.dagHash }]);
  if (process.platform !== "win32") expect(fs.statSync(file(f.workspace, dag.dagId)).mode & 0o777).toBe(0o644);
});
test("async DAG append copies primitive input before Sign and uses one checked identical digest for both signatures", async () => {
  const f = fixture(), dag = createDag(f.workspace), params = input(), wait = pause(f), pending = appendDagNodeAsync(f.workspace, dag.dagId, params); void pending.catch(() => {});
  try { await atPause(wait, pending); params.taskDescription = "mutated after Sign"; wait.release.resolve(); const node = await pending;
    const body = { nodeId: node.nodeId, dagId: dag.dagId, callerAgentId: "caller", calleeAgentId: "callee", eventType: "agent_delegation_started",
      taskDescription: "original owned task", contextHash: "c".repeat(64), startTs: params.startTs, endTs: null, outcome: null, parentNodeId: null, prevHash: dag.dagHash };
    expect(node.nodeHash).toBe(sha256Hex(canonicalize(body))); raw(f, node.nodeHash, node.signature);
    const stored = loadDag(f.workspace, dag.dagId); expect(stored.nodes).toEqual([node]); expect(stored.dagHash).toBe(node.nodeHash); expect(stored.dagSignature).toBe(node.signature);
    expect(wait.spy).toHaveBeenCalledTimes(1); expect(queryDagsByAgent(f.workspace, "callee").map(row => row.dagId)).toContain(dag.dagId); expect(visualizeDag(stored).nodeCount).toBe(1);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test.each(["body", "mode", "sync-winner"] as const)("DAG selected-file CAS preserves real %s drift and fresh retry chains to the winner", async kind => {
  const f = fixture(), dag = createDag(f.workspace), path = file(f.workspace, dag.dagId), wait = pause(f), pending = appendDagNodeAsync(f.workspace, dag.dagId, input()); void pending.catch(() => {});
  try { await atPause(wait, pending);
    if (kind === "sync-winner") appendDagNode(f.workspace, dag.dagId, input("sync winner"));
    else if (kind === "mode" && process.platform !== "win32") fs.chmodSync(path, 0o600); else fs.appendFileSync(path, "\n ");
    const winner = fs.readFileSync(path), head = loadDag(f.workspace, dag.dagId).dagHash; wait.release.resolve();
    await expect(pending).rejects.toThrow("DAG changed while signing"); expect(fs.readFileSync(path)).toEqual(winner);
    const fresh = await appendDagNodeAsync(f.workspace, dag.dagId, input("fresh")); expect(fresh.prevHash).toBe(head); raw(f, fresh.nodeHash, fresh.signature);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test("an independent DAG winner does not invalidate another selected DAG", async () => {
  const f = fixture(), first = createDag(f.workspace), second = createDag(f.workspace), wait = pause(f), pending = appendDagNodeAsync(f.workspace, first.dagId, input()); void pending.catch(() => {});
  try { await atPause(wait, pending); appendDagNode(f.workspace, second.dagId, input("other DAG")); wait.release.resolve(); await pending;
    expect(loadDag(f.workspace, first.dagId).nodes).toHaveLength(1); expect(loadDag(f.workspace, second.dagId).nodes).toHaveLength(1);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test("DAG final original generation is checked after the genuine provider result", async () => {
  const f = fixture(), dag = createDag(f.workspace), before = fs.readFileSync(file(f.workspace, dag.dagId)), generation = keysetIdentity(f.workspace)!.generation;
  const real = purposeProviders.signWithPurposeKey; let reached = false, rotated = 0;
  vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementationOnce(async (...args) => { const signed = await real(...args);
    rotated = rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS }).generation; reached = true; return signed;
  });
  await expect(appendDagNodeAsync(f.workspace, dag.dagId, input())).rejects.toThrow("committed purpose authority changed");
  expect(reached).toBe(true); expect(rotated).toBe(generation + 1); expect(fs.readFileSync(file(f.workspace, dag.dagId))).toEqual(before);
  await appendDagNodeAsync(f.workspace, dag.dagId, input("fresh"));
});
test("DAG signed SDK compatibility permits unlocked no-sign but propagates locked ephemeral refusal without unsigned publication", async () => {
  const f = fixture(); vi.stubEnv("AMC_NO_SIGN", "1"); const dag = await createDagAsync(f.workspace); raw(f, dag.dagHash, dag.dagSignature);
  const before = fs.readFileSync(file(f.workspace, dag.dagId)); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
  await expect(appendDagNodeAsync(f.workspace, dag.dagId, input())).rejects.toThrow(); expect(fs.readFileSync(file(f.workspace, dag.dagId))).toEqual(before);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); await appendDagNodeAsync(f.workspace, dag.dagId, input("fresh"));
});
test("real DAG rename refusal preserves old bytes/native cause and does not downgrade a bad provider response", async () => {
  const f = fixture(), dag = createDag(f.workspace), path = file(f.workspace, dag.dagId), before = fs.readFileSync(path), native = Object.assign(new Error("owned DAG rename fault"), { code: "EIO" }), rename = fs.renameSync.bind(fs);
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => { if (String(to) === path) throw native; rename(from, to); }); syncBuiltinESMExports();
  await expect(appendDagNodeAsync(f.workspace, dag.dagId, input())).rejects.toBe(native); expect(fs.readFileSync(path)).toEqual(before);
  vi.restoreAllMocks(); syncBuiltinESMExports(); const real = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementationOnce(async (...args) => { const signature = Buffer.from(await real(...args)); signature[0] = (signature[0] ?? 0) ^ 1; return signature; });
  await expect(appendDagNodeAsync(f.workspace, dag.dagId, input())).rejects.toThrow(); expect(fs.readFileSync(path)).toEqual(before);
  await appendDagNodeAsync(f.workspace, dag.dagId, input("fresh"));
});

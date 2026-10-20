// Proposed destination: tests/keys/asyncBenchmarkExport.test.ts. Root alone builds/runs/applies this packet.
import { sign, verify } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { runDiagnostic } from "../../src/diagnostic/runner.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { exportBenchmarkArtifact, exportBenchmarkArtifactAsync } from "../../src/benchmarks/benchExport.js";
import { verifyBenchmarkArtifact } from "../../src/benchmarks/benchVerify.js";
import { handleBenchmarkRoute } from "../../src/api/benchmarkRouter.js";
import { resolveApiRolePolicy } from "../../src/api/accessPolicy.js";
import { initUsersConfigAsync, createSession, verifyTrackedSessionToken, setUserRolesAsync, activeUserRecord } from "../../src/auth/authApi.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import type { KeyRef } from "../../src/keys/provider.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { transparencyLogPath } from "../../src/transparency/logChain.js";
import { extractValidatedTarGzipArchive } from "../../src/security/safeTarArchive.js";
import { writeFileAtomic } from "../../src/utils/fs.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const boundary = vi.hoisted(() => ({ nonce: "", calls: [] as Array<{ workspace: string; ref: KeyRef; bytes: Buffer; signature: Buffer }>,
  afterSign: undefined as undefined | (() => Promise<void>) }));
vi.mock("node:crypto", async original => {
  const real = await original<typeof import("node:crypto")>();
  const randomUUID = () => boundary.nonce ? boundary.nonce as ReturnType<typeof real.randomUUID> : real.randomUUID();
  return { ...real, randomUUID, default: { ...real, randomUUID } };
});
// Actual file-provider encrypted vault and actual crypto; only scheduling after its real response is controlled.
vi.mock("../../src/keys/providers/file.js", async original => {
  const real = await original<typeof import("../../src/keys/providers/file.js")>();
  return { ...real, fileKeyProvider(workspace: string) {
    const provider = real.fileKeyProvider(workspace);
    return { ...provider, async sign(ref: KeyRef, bytes: Uint8Array) {
      const snapshot = Buffer.from(bytes), signature = Buffer.from(await provider.sign(ref, snapshot));
      boundary.calls.push({ workspace, ref: { ...ref }, bytes: snapshot, signature: Buffer.from(signature) });
      const pause = boundary.afterSign; boundary.afterSign = undefined; await pause?.(); return signature;
    } };
  } };
});
const PASS = "owned-benchmark-async-passphrase", roots: string[] = [];
afterEach(() => {
  boundary.afterSign = undefined; boundary.calls.length = 0; boundary.nonce = ""; vi.restoreAllMocks();
  for (const root of roots.splice(0)) { lockVault(join(root, "workspace")); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-bench-async-")), workspace = join(root, "workspace"); roots.push(root);
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Same actual diagnostic producer used by benchIdContainment: no invented high scores or fake run seal.
  const run = await runDiagnostic({ workspace, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
  const params = { workspace, agentId: "default", runId: run.runId, outFile: "owned.amcbench", publisherOrgName: "Owned Publisher", notes: "owned exact bytes" };
  return { root, workspace, run, params, paths: getAgentPaths(workspace, "default"),
    publicKeyPem: getSigningPublicKeyPem(workspace, "artifact-seal"), trust: workspaceKeyTrust(workspace) };
}
function inspect(f: Awaited<ReturnType<typeof fixture>>, file: string) {
  const root = mkdtempSync(join(f.root, "unpack-"));
  extractValidatedTarGzipArchive({ file, destination: root, label: "owned actual benchmark artifact",
    limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024,
      maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 } });
  const body = readFileSync(join(root, "bench.json")), sigBytes = readFileSync(join(root, "bench.sig")), pub = readFileSync(join(root, "public-keys", "auditor.pub"));
  const signature = JSON.parse(sigBytes.toString()) as { digestSha256: string; signature: string; signedTs: number; signer: string };
  expect(Object.keys(signature)).toEqual(["digestSha256", "signature", "signedTs", "signer"]);
  expect(signature.digestSha256).toBe(sha256Hex(body)); expect(pub.toString()).toBe(f.publicKeyPem);
  expect(verify(null, Buffer.from(signature.digestSha256, "hex"), f.publicKeyPem, Buffer.from(signature.signature, "base64"))).toBe(true);
  expect(verifyBenchmarkArtifact(file, f.trust).ok).toBe(true);
  return { body, sigBytes, pub, signature, bench: JSON.parse(body.toString()) };
}
function pause() { const entered = deferred(), release = deferred(); boundary.afterSign = async () => { entered.resolve(); await release.promise; }; return { entered, release }; }
async function expectEntered(p: ReturnType<typeof pause>, pending: Promise<unknown>) {
  expect(await Promise.race([p.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
}
function assertActualSignature(f: Awaited<ReturnType<typeof fixture>>) {
  const call = boundary.calls.at(-1)!; expect(call.ref).toMatchObject({ provider: "file", id: "artifact-seal" });
  expect(verify(null, call.bytes, f.publicKeyPem, call.signature)).toBe(true);
}

test("the async benchmark exporter preserves every default signed member and real verifier result while using the actual file provider", async () => {
  const f = await fixture(), now = Date.now(), before = boundary.calls.length;
  boundary.nonce = "ae84b7e1-bf68-4ab6-a8c7-40a99c6b554a"; vi.spyOn(Date, "now").mockReturnValue(now);
  const legacy = exportBenchmarkArtifact({ ...f.params, outFile: "legacy.amcbench" });
  const result = await exportBenchmarkArtifactAsync(f.params), actual = inspect(f, result.outFile), old = inspect(f, legacy.outFile);
  expect(actual.body).toEqual(old.body); expect(actual.sigBytes).toEqual(old.sigBytes); expect(actual.pub).toEqual(old.pub);
  expect(boundary.calls).toHaveLength(before + 1); expect(boundary.calls.at(-1)!.bytes).toEqual(Buffer.from(actual.signature.digestSha256, "hex"));
  const signature = sign(null, Buffer.from(actual.signature.digestSha256, "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64");
  expect(actual.sigBytes.toString()).toBe(JSON.stringify({ digestSha256: sha256Hex(actual.body), signature, signedTs: now, signer: "auditor" }, null, 2));
  expect(actual.bench.hashes.reportSha256).toBe(sha256Hex(readFileSync(join(f.paths.runsDir, `${f.run.runId}.json`))));
  expect(JSON.parse(readFileSync(transparencyLogPath(f.workspace), "utf8").trim().split(/\r?\n/).at(-1)!)).toMatchObject({
    type: "BENCHMARK_EXPORTED", artifact: { kind: "amcbench", sha256: sha256Hex(readFileSync(result.outFile)), id: result.bench.benchId } });
});

test("caller arguments and the original output path remain captured during actual benchmark file Sign", async () => {
  const f = await fixture(), p = pause(), input = { ...f.params }, pending = exportBenchmarkArtifactAsync(input);
  try {
    await expectEntered(p, pending); assertActualSignature(f);
    input.outFile = "redirected.amcbench"; input.runId = "different-unread-run"; input.notes = "caller changed this";
    p.release.resolve(); const result = await pending;
    expect(result.outFile).toBe(join(f.workspace, "owned.amcbench")); expect(existsSync(join(f.workspace, "redirected.amcbench"))).toBe(false);
    expect(inspect(f, result.outFile).bench).toMatchObject({ run: { runId: f.run.runId }, notes: f.params.notes });
  } finally { p.release.resolve(); await Promise.allSettled([pending]); }
});

test.each(["run", "agent", "bom-created", "assurance-added"] as const)("actual benchmark Sign followed by %s input drift refuses output and restored input permits a verified export", async target => {
  const f = await fixture(), p = pause(), beforeLog = readFileSync(transparencyLogPath(f.workspace));
  const path = target === "run" ? join(f.paths.runsDir, `${f.run.runId}.json`) : target === "agent" ? f.paths.agentConfig : target === "bom-created" ? join(f.workspace, "amc-bom.json") : join(f.paths.reportsDir, "assurance", "owned-new-report.json");
  const original = existsSync(path) ? { bytes: readFileSync(path), mode: lstatSync(path).mode & 0o777 } : null;
  const pending = exportBenchmarkArtifactAsync(f.params);
  try {
    await expectEntered(p, pending); assertActualSignature(f);
    if (target === "assurance-added") {
      mkdirSync(join(f.paths.reportsDir, "assurance"), { recursive: true });
      writeFileAtomic(path, JSON.stringify({ agentId: "default", ts: f.run.windowEndTs, packResults: [] }), 0o644);
    } else writeFileAtomic(path, original ? Buffer.concat([original.bytes, Buffer.from("\n ")]) : Buffer.from("{}\n"), original?.mode ?? 0o644);
    p.release.resolve(); await expect(pending).rejects.toThrow("benchmark inputs changed while preparing");
    expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
  } finally {
    p.release.resolve(); await Promise.allSettled([pending]);
    if (original) writeFileAtomic(path, original.bytes, original.mode); else rmSync(path, { force: true });
  }
  inspect(f, (await exportBenchmarkArtifactAsync({ ...f.params, outFile: "fresh.amcbench" })).outFile);
});

test("a competing real synchronous benchmark export during the await is preserved by output CAS", async () => {
  const f = await fixture(); exportBenchmarkArtifact(f.params);
  const p = pause(), pending = exportBenchmarkArtifactAsync(f.params);
  try {
    await expectEntered(p, pending); assertActualSignature(f);
    const competing = exportBenchmarkArtifact({ ...f.params, notes: "actual competing publisher" }), bytes = readFileSync(competing.outFile), log = readFileSync(transparencyLogPath(f.workspace));
    p.release.resolve(); await expect(pending).rejects.toThrow("benchmark output changed while preparing");
    expect(readFileSync(competing.outFile)).toEqual(bytes); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
    expect(inspect(f, competing.outFile).bench.notes).toBe("actual competing publisher");
  } finally { p.release.resolve(); await Promise.allSettled([pending]); }
  inspect(f, (await exportBenchmarkArtifactAsync({ ...f.params, outFile: "fresh.amcbench" })).outFile);
});

test.each(["input", "output"] as const)("the actual final beforePublish hook cannot bypass the final benchmark %s comparison", async target => {
  const f = await fixture(), path = join(f.paths.runsDir, `${f.run.runId}.json`), original = readFileSync(path), mode = lstatSync(path).mode & 0o777;
  let calls = 0, changedLog: Buffer | undefined, competing: Buffer | undefined;
  try {
    await expect(exportBenchmarkArtifactAsync(f.params, { beforePublish: () => {
      if (++calls !== 2) return;
      if (target === "input") writeFileAtomic(path, Buffer.concat([original, Buffer.from("\n ")]), mode);
      else competing = readFileSync(exportBenchmarkArtifact({ ...f.params, notes: "final real competing publisher" }).outFile);
      changedLog = readFileSync(transparencyLogPath(f.workspace));
    } })).rejects.toThrow(target === "input" ? "benchmark inputs changed while preparing" : "benchmark output changed while preparing");
    expect(calls).toBe(2); expect(changedLog).toBeDefined(); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(changedLog);
    if (target === "input") expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false);
    else { expect(readFileSync(join(f.workspace, f.params.outFile))).toEqual(competing); expect(inspect(f, join(f.workspace, f.params.outFile)).bench.notes).toBe("final real competing publisher"); }
  } finally { writeFileAtomic(path, original, mode); }
  inspect(f, (await exportBenchmarkArtifactAsync({ ...f.params, outFile: "fresh.amcbench" })).outFile);
});

test.each(["no-sign", "vault-lock"] as const)("actual benchmark crypto followed by %s refuses before atomic publication", async refusal => {
  const f = await fixture(), p = pause(), log = readFileSync(transparencyLogPath(f.workspace)), pending = exportBenchmarkArtifactAsync(f.params);
  try {
    await expectEntered(p, pending); assertActualSignature(f);
    if (refusal === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1"); else { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); }
    p.release.resolve(); await expect(pending).rejects.toThrow();
    expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  } finally {
    p.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS);
  }
  inspect(f, (await exportBenchmarkArtifactAsync({ ...f.params, outFile: "fresh.amcbench" })).outFile);
});

test("locking the actual vault in the final publication callback refuses the already signed benchmark before any output write", async () => {
  const f = await fixture(), log = readFileSync(transparencyLogPath(f.workspace)); let calls = 0;
  try {
    await expect(exportBenchmarkArtifactAsync(f.params, { beforePublish: () => {
      if (++calls !== 2) return;
      assertActualSignature(f); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    } })).rejects.toThrow();
    expect(calls).toBe(2); expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false);
    expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  } finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  inspect(f, (await exportBenchmarkArtifactAsync({ ...f.params, outFile: "fresh.amcbench" })).outFile);
});

async function api(f: Awaited<ReturnType<typeof fixture>>, outFile: string, revalidateAuthority?: () => boolean) {
  const req = Readable.from([Buffer.from(JSON.stringify({ agentId: "default", runId: f.run.runId, outFile }))]) as IncomingMessage;
  req.headers = { "content-type": "application/json" }; req.method = "POST";
  let status = 0, body = "";
  const res = { headersSent: false, writeHead(code: number) { status = code; this.headersSent = true; return this; }, end(value: string) { body = value; } };
  expect(await handleBenchmarkRoute("/api/v1/benchmarks/export", "POST", req, res as unknown as ServerResponse, f.workspace, revalidateAuthority)).toBe(true);
  return { status, body: JSON.parse(body) };
}
test("the no-callback HTTP route preserves its actual synchronous default export without silently selecting the async producer", async () => {
  const f = await fixture(), before = boundary.calls.length, result = await api(f, "legacy-api.amcbench");
  expect(result.status).toBe(200); expect(boundary.calls).toHaveLength(before); inspect(f, join(f.workspace, "legacy-api.amcbench"));
});

test("the trusted direct router refuses an actual current-role loss during file Sign and a fresh restored session exports", async () => {
  const f = await fixture(), owner = (await initUsersConfigAsync({ workspace: f.workspace, username: "benchmark-owner", password: "benchmark-owner-password" })).owner;
  let session = createSession({ workspace: f.workspace, user: owner });
  const currentAuthority = () => { const checked = verifyTrackedSessionToken({ workspace: f.workspace, token: session.token });
    return checked.ok && checked.payload !== null && checked.payload.roles.some(role => resolveApiRolePolicy("/api/v1/benchmarks/export", "POST").roles.includes(role)); };
  expect(currentAuthority()).toBe(true);
  const p = pause(), pending = api(f, "refused-api.amcbench", currentAuthority);
  try {
    await expectEntered(p, pending); assertActualSignature(f);
    await setUserRolesAsync({ workspace: f.workspace, username: owner.username, roles: ["VIEWER"] }); expect(currentAuthority()).toBe(false);
    const log = readFileSync(transparencyLogPath(f.workspace)); p.release.resolve(); const refused = await pending;
    expect(refused.status).toBe(403); expect(existsSync(join(f.workspace, "refused-api.amcbench"))).toBe(false); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  } finally { p.release.resolve(); await Promise.allSettled([pending]); await setUserRolesAsync({ workspace: f.workspace, username: owner.username, roles: ["OWNER"] }); }
  session = createSession({ workspace: f.workspace, user: activeUserRecord(f.workspace, owner.userId)! });
  const fresh = await api(f, "fresh-api.amcbench", currentAuthority); expect(fresh.status).toBe(200); inspect(f, join(f.workspace, "fresh-api.amcbench"));
});

test.skipIf(process.platform === "win32")("the actual compiled benchmark export CLI awaits the real file-provider route and writes a verified raw artifact", async () => {
  const f = await fixture(), actual = pathToFileURL(resolve("dist/keys/providers/file.js")).href, purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href;
  const replacement = join(f.root, "file-boundary.mjs"), loader = join(f.root, "file-loader.mjs"), requests = join(f.root, "calls.jsonl");
  writeFileSync(requests, "");
  writeFileSync(replacement, `import {appendFileSync} from "node:fs"; import {fileKeyProvider as actual} from ${JSON.stringify(actual)};
export function fileKeyProvider(workspace) { const provider=actual(workspace); return {...provider, async sign(ref,bytes) { const signature=await provider.sign(ref,bytes); appendFileSync(process.env.P208_BENCH_CALLS,JSON.stringify({purpose:ref.id,size:bytes.length})+"\\n"); return signature; }}; }\n`);
  writeFileSync(loader, `import {pathToFileURL} from "node:url";
export async function resolve(specifier,context,nextResolve) { if (["@aws-sdk/","@google-cloud/","@azure/","pkcs11js"].some(prefix=>specifier.startsWith(prefix))) throw new Error("owned benchmark test forbids remote SDK imports"); const found=await nextResolve(specifier,context); if(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actual)}) return {url:pathToFileURL(process.env.P208_BENCH_BOUNDARY).href,shortCircuit:true}; return found; }\n`);
  const owned = spawnOwnedNode(["--experimental-loader", pathToFileURL(loader).href, resolve("dist/cli.js"), "benchmark", "export", "--agent", "default", "--run", f.run.runId, "--out", "cli.amcbench"],
    { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1", P208_BENCH_CALLS: requests, P208_BENCH_BOUNDARY: replacement } });
  try {
    const result = await owned.wait(30_000); expect(result.code, result.stderr).toBe(0); expect(result.signal).toBeNull(); expect(result.stdout).toContain("Benchmark exported:");
    expect(readFileSync(requests, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([{ purpose: "artifact-seal", size: 32 }]);
    inspect(f, join(f.workspace, "cli.amcbench"));
  } finally { await owned.stop(); }
}, 60_000);

// Requires the root-owned normal build only for the compiled CLI case. No cloud/native SDK is used.
import { sign, verify } from "node:crypto";
import { existsSync, linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as bom from "../../src/bom/bomVerifier.js";
import * as files from "../../src/utils/fs.js";
import { handleBomRoute } from "../../src/api/bomRouter.js";
import { createTrackedSession, revokeSessionByToken, verifyTrackedSessionToken } from "../../src/auth/authApi.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { setMode } from "../../src/mode/mode.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { describePolicySigner } from "../../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { initWorkspace } from "../../src/workspace.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { transparencyLogPath, transparencySealPath } from "../../src/transparency/logChain.js";
import { pinnedTrust, workspaceKeyTrust } from "../helpers/trustContext.js";
import { postDirectApiRegistry } from "../helpers/postDirectApiRegistry.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const PASS = "p208-owned-bom-passphrase", SENTINEL = Buffer.from("owned previous sidecar");
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-bom-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const trust = workspaceKeyTrust(workspace), pem = getSigningPublicKeyPem(workspace, "artifact-seal"), key = getSigningKey(workspace, "artifact-seal");
  const input = join(workspace, "bom.json"), sigFile = join(workspace, "bom.sig"), value = {
    v: 1, generatedTs: Date.now(), agentId: "default", agentName: "Owned agent", role: "test", domain: "owned", riskTier: "low",
    runId: "owned-bom-run", reportSha256: "a".repeat(64), integrityIndex: 1, trustLabel: "SELF_REPORTED", overall: 1,
    layerScores: [], assurancePackScores: {}, indices: {}, activeFreezeActionClasses: [], git: { commit: null, branch: null }, references: { bundleId: null, certId: null }
  };
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n"); writeFileSync(input, bytes);
  return { root, workspace, input, sigFile, value, bytes, trust, pem, key, provider: loadKeyProvider(workspace, "file"),
    params: { workspace, inputFile: "bom.json", outputSigFile: "bom.sig" } };
}
function verified(f: ReturnType<typeof fixture>, sigFile = f.sigFile) {
  const bytes = readFileSync(f.input), signature = JSON.parse(readFileSync(sigFile, "utf8")) as bom.BomSignature;
  expect(signature.bomSha256).toBe(sha256Hex(bytes));
  expect(verify(null, Buffer.from(signature.bomSha256, "hex"), f.pem, Buffer.from(signature.signature, "base64"))).toBe(true);
  const result = bom.verifyBomSignature({ workspace: f.workspace, inputFile: f.input, sigFile, trust: { ...f.trust, asOf: new Date() } });
  expect(result.ok, result.reason).toBe(true); expect(result.bom?.runId).toBe(f.value.runId);
  expect(bom.verifyBomSignature({ workspace: f.workspace, inputFile: f.input, sigFile, trust: pinnedTrust([]) }).ok).toBe(false);
  return signature;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pauseSign(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), actual = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
    const signature = await actual(ref, bytes); entered.resolve(); await release.promise; return signature;
  });
  return { entered, release, spy };
}
async function atPause(paused: ReturnType<typeof pauseSign>, pending: Promise<unknown>) {
  expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "refused")])).toBe("signed");
}
async function positive(f: ReturnType<typeof fixture>) { const out = await bom.signBomFileAsync(f.params); expect(out.sigFile).toBe(f.sigFile); return verified(f); }
async function postOwnedRoute(f: ReturnType<typeof fixture>, revalidateAuthority: () => boolean) {
  let dispatch: Promise<void> | undefined;
  const server = createServer((req, res) => {
    dispatch = handleBomRoute("/api/v1/bom/sign", req.method ?? "GET", req, res, f.workspace, revalidateAuthority).then(handled => {
      if (!handled) { res.writeHead(404); res.end(); }
    });
    void dispatch.catch(error => res.destroy(error instanceof Error ? error : undefined));
  });
  try {
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); done(); }); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("owned BOM server did not bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/bom/sign`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputFile: "bom.json", outputSigFile: "bom.sig" }), signal: AbortSignal.timeout(10_000) });
    return { status: response.status, body: await response.text() };
  } finally { server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())); await dispatch; }
}

describe("BOM awaitable policy publication", () => {
  test("preserves independent default Ed25519 sidecar bytes, real verifier admission and the retained sync API", async () => {
    const f = fixture(), now = Date.now(), digest = sha256Hex(f.bytes), signature = sign(null, Buffer.from(digest, "hex"), f.key).toString("base64");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const expected = { v: 1, bomSha256: digest, signature, signedTs: now, signer: "auditor", envelope: {
      v: 1, alg: "ed25519", pubkeyB64: Buffer.from(f.pem).toString("base64"), fingerprint: sha256Hex(f.pem), sigB64: signature,
      signedTs: now, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } };
    const sync = bom.signBomFile({ ...f.params, outputSigFile: "sync.sig" }); expect(readFileSync(sync.sigFile, "utf8")).toBe(JSON.stringify(expected, null, 2));
    const spy = vi.spyOn(f.provider, "sign"); await positive(f);
    expect(readFileSync(f.sigFile, "utf8")).toBe(JSON.stringify(expected, null, 2)); expect(spy).toHaveBeenCalledTimes(1);
    expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(digest, "hex")); expect(readFileSync(f.input)).toEqual(f.bytes);
  });

  test.each(["same path", "hardlink"] as const)("refuses a BOM input/output %s before Sign and preserves the actual input", async alias => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"), beforeLog = readFileSync(transparencyLogPath(f.workspace));
    const outputSigFile = alias === "same path" ? f.input : f.sigFile;
    if (alias === "hardlink") linkSync(f.input, f.sigFile);
    try {
      await expect(bom.signBomFileAsync({ ...f.params, outputSigFile })).rejects.toThrow(/^BOM signature destination must differ from its input$/);
      expect(spy).not.toHaveBeenCalled(); expect(readFileSync(f.input)).toEqual(f.bytes);
      expect(readFileSync(outputSigFile)).toEqual(f.bytes); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
    } finally { if (alias === "hardlink") unlinkSync(f.sigFile); }
    await positive(f);
  });

  test.skipIf(process.platform === "win32")("refuses a real input symlink alias of its signature output before Sign", async () => {
    const f = fixture(), alias = join(f.workspace, "bom-input-alias.json"), spy = vi.spyOn(f.provider, "sign");
    symlinkSync(f.input, alias);
    await expect(bom.signBomFileAsync({ ...f.params, inputFile: alias, outputSigFile: f.input })).rejects.toThrow(/^BOM signature destination must differ from its input$/);
    expect(spy).not.toHaveBeenCalled(); expect(readFileSync(alias)).toEqual(f.bytes); expect(readFileSync(f.input)).toEqual(f.bytes);
    await positive(f);
  });

  test("rechecks actual same-file identity after the final trusted callback even when both preimage bytes still match", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"), beforeLog = readFileSync(transparencyLogPath(f.workspace));
    writeFileSync(f.sigFile, f.bytes); let callbacks = 0;
    try {
      await expect(bom.signBomFileAsync(f.params, { beforePublish: () => {
        if (++callbacks === 2) { unlinkSync(f.sigFile); linkSync(f.input, f.sigFile); }
      } })).rejects.toThrow(/^BOM signature destination must differ from its input$/);
      expect(callbacks).toBe(2); expect(spy).toHaveBeenCalledTimes(1); expect(readFileSync(f.input)).toEqual(f.bytes);
      expect(readFileSync(f.sigFile)).toEqual(f.bytes); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
    } finally { if (existsSync(f.sigFile)) unlinkSync(f.sigFile); }
    await positive(f);
  });

  test("awaits actual signing outside the sidecar lock and snapshots caller-owned paths", async () => {
    const f = fixture(), paused = pauseSign(f), beforeLog = readFileSync(transparencyLogPath(f.workspace)); writeFileSync(f.sigFile, SENTINEL);
    const input = { ...f.params }, pending = bom.signBomFileAsync(input), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); expect(readFileSync(f.sigFile)).toEqual(SENTINEL); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
      expect(existsSync(join(dirname(f.sigFile), ".bom-signature.lock"))).toBe(false);
      input.inputFile = "changed-input.json"; input.outputSigFile = "changed-output.sig"; paused.release.resolve(); expect(await outcome).toBeNull();
      expect(existsSync(join(f.workspace, input.outputSigFile))).toBe(false); verified(f);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test.each(["input", "sidecar"] as const)("compares actual %s bytes again after the trusted final callback", async changed => {
    const f = fixture(), beforeLog = readFileSync(transparencyLogPath(f.workspace)), spy = vi.spyOn(f.provider, "sign");
    const replacement = Buffer.from("owned callback sidecar"); writeFileSync(f.sigFile, SENTINEL); let callbacks = 0;
    try {
      const outcome = await bom.signBomFileAsync(f.params, { beforePublish: () => {
        if (++callbacks === 2) {
          if (changed === "input") writeFileSync(f.input, JSON.stringify({ ...f.value, agentName: "Changed in final callback" }));
          else writeFileSync(f.sigFile, replacement);
        }
      } }).then(() => null, error => error);
      expect(callbacks).toBe(2); expect(spy).toHaveBeenCalledTimes(1);
      expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(sha256Hex(f.bytes), "hex"));
      expect(outcome).toMatchObject({ message: changed === "input" ? "BOM input changed while signing was prepared" : "BOM signature destination changed while signing was prepared" });
      expect(readFileSync(f.sigFile)).toEqual(changed === "input" ? SENTINEL : replacement);
      expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
    } finally { writeFileSync(f.input, f.bytes); }
    await positive(f);
  });

  test.each(["input", "sidecar"] as const)("refuses actual %s byte drift during Sign without overwriting the new bytes", async changed => {
    const f = fixture(), paused = pauseSign(f), beforeLog = readFileSync(transparencyLogPath(f.workspace)); writeFileSync(f.sigFile, SENTINEL);
    const pending = bom.signBomFileAsync(f.params), outcome = pending.then(() => null, error => error), replacement = Buffer.from("owned concurrent sidecar");
    try {
      await atPause(paused, pending);
      if (changed === "input") writeFileSync(f.input, JSON.stringify({ ...f.value, agentName: "Changed during signing" })); else writeFileSync(f.sigFile, replacement);
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: changed === "input" ? "BOM input changed while signing was prepared" : "BOM signature destination changed while signing was prepared" });
      expect(readFileSync(f.sigFile)).toEqual(changed === "input" ? SENTINEL : replacement); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(f.input, f.bytes); }
    await positive(f);
  });

  test.each(["lock", "policy", "mode", "no-sign"] as const)("refuses a real current %s change after Sign before publication", async changed => {
    const f = fixture(), paused = pauseSign(f), configPath = join(f.workspace, ".amc", "amc.config.yaml"), configBefore = readFileSync(configPath); writeFileSync(f.sigFile, SENTINEL);
    const pending = bom.signBomFileAsync(f.params), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending);
      if (changed === "lock") { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); }
      if (changed === "policy") { const config = YAML.parse(configBefore.toString("utf8")); config.keys = { requireNonExportable: true }; writeFileSync(configPath, YAML.stringify(config)); }
      if (changed === "mode") setMode(f.workspace, "agent"); if (changed === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
      paused.release.resolve(); const error = await outcome; expect(error).toBeInstanceOf(Error); expect(readFileSync(f.sigFile)).toEqual(SENTINEL);
      if (changed === "policy") expect(error).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
      if (changed === "no-sign") expect(error).toMatchObject({ message: expect.stringContaining("no-sign mode") });
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(configPath, configBefore); vi.stubEnv("AMC_NO_SIGN", "0");
      setMode(f.workspace, "owner"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("refuses a real signed whole-policy edit in the final callback while the BOM signer stays identical", async () => {
    const f = fixture(), selected = describePolicySigner(f.workspace, "BOM"), path = trustConfigPath(f.workspace), sigPath = trustConfigSigPath(f.workspace);
    const body = readFileSync(path), sidecar = readFileSync(sigPath), beforeLog = readFileSync(transparencyLogPath(f.workspace));
    writeFileSync(f.sigFile, SENTINEL); let callbacks = 0;
    try {
      const outcome = await bom.signBomFileAsync(f.params, { beforePublish: () => {
        if (++callbacks !== 2) return;
        const next = trustConfigSchema.parse(loadTrustConfig(f.workspace)); next.trust.enforcement.requireNotaryFor.push("CERT");
        const bytes = Buffer.from(YAML.stringify(next)); files.writeFileAtomic(path, bytes, 0o644);
        const signed = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
        files.writeFileAtomic(sigPath, JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
          signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2), 0o644);
        expect(verifyTrustConfigSignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true });
        expect(describePolicySigner(f.workspace, "BOM")).toEqual(selected);
      } }).then(() => null, error => error);
      expect(callbacks).toBe(2); expect(outcome).toMatchObject({ message: "BOM signing policy changed while signing was prepared" });
      expect(readFileSync(f.sigFile)).toEqual(SENTINEL); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
    } finally { files.writeFileAtomic(path, body, 0o644); files.writeFileAtomic(sigPath, sidecar, 0o644); }
    await positive(f);
  });

  test("refuses a real unrelated purpose-generation change in the final callback with the BOM signer unchanged", async () => {
    const f = fixture(), selected = describePolicySigner(f.workspace, "BOM");
    writeFileSync(f.sigFile, SENTINEL); let callbacks = 0, afterRotationLog: Buffer | undefined;
    const outcome = await bom.signBomFileAsync(f.params, { beforePublish: () => {
      if (++callbacks !== 2) return;
      rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
      afterRotationLog = readFileSync(transparencyLogPath(f.workspace));
      expect(describePolicySigner(f.workspace, "BOM")).toEqual(selected);
    } }).then(() => null, error => error);
    expect(callbacks).toBe(2); expect(outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(afterRotationLog).toBeDefined(); expect(readFileSync(f.sigFile)).toEqual(SENTINEL);
    expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(afterRotationLog);
    await positive(f);
  });

  test("uses the existing bom-sign owner gate before the first provider request", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"); writeFileSync(f.sigFile, SENTINEL); setMode(f.workspace, "agent");
    try { await expect(bom.signBomFileAsync(f.params)).rejects.toThrow(); expect(spy).not.toHaveBeenCalled(); expect(readFileSync(f.sigFile)).toEqual(SENTINEL); }
    finally { setMode(f.workspace, "owner"); }
    await positive(f);
  });

  test("refuses corrupt actual file-provider signatures without a signature or log publication", async () => {
    const f = fixture(), actual = f.provider.sign.bind(f.provider), beforeLog = readFileSync(transparencyLogPath(f.workspace)); writeFileSync(f.sigFile, SENTINEL);
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => { const signature = Buffer.from(await actual(ref, bytes)); signature[0] = signature[0]! ^ 1; return signature; });
    await expect(bom.signBomFileAsync(f.params)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(readFileSync(f.sigFile)).toEqual(SENTINEL); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog); await positive(f);
  });

  test("validates the actual captured BOM before Sign and uses a fixed missing-input diagnostic", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"); writeFileSync(f.sigFile, SENTINEL); writeFileSync(f.input, "{invalid JSON");
    await expect(bom.signBomFileAsync(f.params)).rejects.toThrow(); expect(spy).not.toHaveBeenCalled(); expect(readFileSync(f.sigFile)).toEqual(SENTINEL);
    await expect(bom.signBomFileAsync({ ...f.params, inputFile: "missing-owned.json" })).rejects.toThrow(/^BOM file not found$/);
    writeFileSync(f.input, f.bytes); await positive(f);
  });

  test("reports a published sidecar truthfully when the actual synchronous transparency signer then fails", async () => {
    const f = fixture(), actualWrite = files.writeFileAtomic; let transparencyLockPresent: boolean | undefined;
    const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((file, bytes, mode) => {
      if (file === transparencySealPath(f.workspace)) transparencyLockPresent = existsSync(join(dirname(f.sigFile), ".bom-signature.lock"));
      actualWrite(file, bytes, mode);
      if (file === f.sigFile) { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); }
    });
    try {
      await expect(bom.signBomFileAsync(f.params)).rejects.toMatchObject({ code: "BOM_TRANSPARENCY_PUBLICATION_INCOMPLETE", sigFile: f.sigFile, cause: expect.any(Error) });
      expect(existsSync(f.sigFile)).toBe(true); expect(transparencyLockPresent).toBe(false);
      expect(existsSync(join(dirname(f.sigFile), ".bom-signature.lock"))).toBe(false);
      const signature = JSON.parse(readFileSync(f.sigFile, "utf8")) as bom.BomSignature;
      expect(verify(null, Buffer.from(sha256Hex(f.bytes), "hex"), f.pem, Buffer.from(signature.signature, "base64"))).toBe(true);
      // The log may have partially changed. No unchanged-log or automatic recovery claim is made here.
    } finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  });

  test("a trusted direct native route rechecks an actual revoked tracked credential before publishing", async () => {
    const f = fixture(), session = createTrackedSession({ workspace: f.workspace, userId: "owned-bom-owner", username: "owned", roles: ["OWNER"], authSource: "WORKSPACE_ROUTER" });
    const current = () => verifyTrackedSessionToken({ workspace: f.workspace, token: session.token }).ok;
    expect(current()).toBe(true); const paused = pauseSign(f), beforeLog = readFileSync(transparencyLogPath(f.workspace)), pending = postOwnedRoute(f, current);
    try {
      await atPause(paused, pending); revokeSessionByToken({ workspace: f.workspace, token: session.token }); expect(current()).toBe(false); paused.release.resolve();
      const result = await pending; expect(result.status).toBe(401); expect(result.body).toContain("authenticated authority changed");
      expect(existsSync(f.sigFile)).toBe(false); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    const result = await postOwnedRoute(f, () => true); expect(result.status).toBe(200); verified(f);
  });

  test("the actual registry without a trusted callback retains sync compatibility and request fields cannot opt into async", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign");
    const result = await postDirectApiRegistry(f.workspace, "/api/v1/bom/sign", { inputFile: "bom.json", outputSigFile: "bom.sig", revalidateAuthority: true });
    expect(result.status).toBe(200); expect(spy).not.toHaveBeenCalled(); verified(f);
  });
});

test.skipIf(process.platform === "win32")("compiled BOM CLI uses the maintained async path and the actual file-provider digest", async () => {
  const f = fixture(), repo = fileURLToPath(new URL("../../", import.meta.url)), requests = join(f.root, "cli-signatures.jsonl"); writeFileSync(requests, "");
  const bomUrl = pathToFileURL(join(repo, "dist/bom/bomVerifier.js")).href, fileUrl = pathToFileURL(join(repo, "dist/keys/providers/file.js")).href;
  const loader = join(f.root, "owned-bom-loader.mjs");
  writeFileSync(loader, `export async function resolve(specifier, context, next) {
    if (["@aws-sdk/", "@google-cloud/", "@azure/", "pkcs11js", "agent-maturity-compass-key-provider-pkcs11"].some(prefix => specifier.startsWith(prefix))) throw new Error("owned BOM CLI refuses real SDK/native imports");
    return next(specifier, context);
  }
  export async function load(url, context, next) {
    const result = await next(url, context); if (url !== ${JSON.stringify(bomUrl)} && url !== ${JSON.stringify(fileUrl)}) return result;
    const source = typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");
    const suffix = url === ${JSON.stringify(bomUrl)} ? '\\nsignBomFile = () => { throw new Error("owned BOM CLI denies the sync compatibility signer"); };\\n'
      : '\\nconst p208File = fileKeyProvider; fileKeyProvider = (...args) => { const provider = p208File(...args), actual = provider.sign.bind(provider); provider.sign = async (ref, bytes) => { const signature = await actual(ref, bytes); const fs = await import("node:fs"); fs.appendFileSync(process.env.P208_BOM_SIGN_CALLS, JSON.stringify({ref,hex:Buffer.from(bytes).toString("hex")}) + "\\\\n"); return signature; }; return provider; };\\n';
    return { ...result, source: source + suffix };
  }`);
  const env = { ...process.env, NO_COLOR: "1", NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loader).href}`, P208_BOM_SIGN_CALLS: requests };
  const denied = await spawnOwnedNode(["--input-type=module", "--eval", `import { signBomFile } from ${JSON.stringify(bomUrl)}; signBomFile({});`], { cwd: f.workspace, env }).wait(15_000);
  expect(denied.code).toBe(1); expect(denied.stderr).toContain("owned BOM CLI denies the sync compatibility signer"); expect(readFileSync(requests, "utf8")).toBe("");
  const result = await spawnOwnedNode([resolve(repo, "dist/cli.js"), "bom", "sign", "--in", "bom.json", "--out", "bom.sig"], { cwd: f.workspace, env }).wait(30_000);
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0); verified(f);
  const calls = readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  expect(calls).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: sha256Hex(f.bytes) }]);
}, 60_000);

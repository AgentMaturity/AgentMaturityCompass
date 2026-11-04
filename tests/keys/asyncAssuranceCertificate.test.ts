// Proposed destination: tests/keys/asyncAssuranceCertificate.test.ts. Source-only proposal; never executed by the author.
import { sign, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../../src/workspace.js";
import { issueAssuranceCertificate } from "../../src/assurance/assuranceCertificates.js";
import { verifyAssuranceCertificateFile } from "../../src/assurance/assuranceVerifier.js";
import { runAssurance } from "../../src/assurance/assuranceRunner.js";
import { assuranceCertificatesDir, assuranceLatestCertificatePath, assuranceLatestCertificateShaPath,
  assuranceRunJsonPath, assurancePolicyPath, assurancePolicySigPath, verifyAssurancePolicySignature,
  initAssurancePolicy, loadAssurancePolicy, saveAssurancePolicy } from "../../src/assurance/assurancePolicyStore.js";
import { assuranceTimestampedCertificatePath, assuranceTimestampedCertificateShaPath } from "../../src/assurance/assurancePolicyStore.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { verifySignatureEnvelope } from "../../src/crypto/signing/signatureEnvelope.js";
import { describePolicySigner } from "../../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import type { SignatureEnvelope } from "../../src/crypto/signing/signerTypes.js";
import type { KeyRef } from "../../src/keys/provider.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { transparencyLogPath, transparencySealPath, transparencySealSigPath, verifyTransparencyLog } from "../../src/transparency/logChain.js";
import { merkleCurrentRootPath } from "../../src/transparency/merklePaths.js";
import { rebuildTransparencyMerkle } from "../../src/transparency/merkleIndexStore.js";
import { TransparencyMerkleLagError } from "../../src/transparency/merkleIndexState.js";
import { ownedAsyncWorkspaceLogNotary } from "../helpers/ownedAsyncWorkspaceLogNotary.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import * as files from "../../src/utils/fs.js";
import { extractValidatedTarGzipArchive } from "../../src/security/safeTarArchive.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { writeFileAtomic } from "../../src/utils/fs.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { startFakeAgentServer, useFakeAgentEnv } from "../helpers/fakeAgentServer.js";

// Wrap only the provider factory's scheduling boundary. Every answer below comes from the real file provider's
// actual encrypted vault and real crypto; no signer result, admission verdict or product issuer is mocked.
const file = vi.hoisted(() => ({ calls: [] as Array<{ workspace: string; ref: KeyRef; bytes: Buffer; signature: Buffer }>,
  afterSign: undefined as undefined | (() => Promise<void>) }));
vi.mock("../../src/keys/providers/file.js", async original => {
  const real = await original<typeof import("../../src/keys/providers/file.js")>();
  return { ...real, fileKeyProvider(workspace: string) {
    const provider = real.fileKeyProvider(workspace);
    return { ...provider, async sign(ref: KeyRef, bytes: Uint8Array) {
      const snapshot = Buffer.from(bytes), signature = Buffer.from(await provider.sign(ref, snapshot));
      file.calls.push({ workspace, ref: { ...ref }, bytes: snapshot, signature: Buffer.from(signature) });
      const wait = file.afterSign; file.afterSign = undefined; await wait?.(); return signature;
    } };
  } };
});
const PASS = "owned-assurance-async-file-passphrase", roots: string[] = [];
afterEach(() => {
  file.afterSign = undefined; file.calls.length = 0; vi.restoreAllMocks();
  for (const root of roots.splice(0)) { lockVault(join(root, "workspace")); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-assurance-async-")), workspace = join(root, "workspace"); roots.push(root);
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Existing embeddedKeyForgery / remainingPortableEnvelopeCallers fixture: an actual controlled endpoint and
  // actual assurance runner. Zero signed evidence gates establish certificate crypto, not an assurance-pass claim.
  const agent = await startFakeAgentServer(), restore = useFakeAgentEnv(agent.baseUrl);
  let runId: string;
  try {
    const run = await runAssurance({ workspace, agentId: "default", mode: "supervise", window: "14d", packId: "injection", noSign: true });
    runId = run.assuranceRunId;
  } finally { restore(); await agent.close(); }
  initAssurancePolicy(workspace); const policy = loadAssurancePolicy(workspace);
  policy.assurancePolicy.gates = { ...policy.assurancePolicy.gates, minIntegrityIndex: 0, minCorrelationRatio: 0, minObservedShare: 0 };
  saveAssurancePolicy(workspace, policy);
  return { root, workspace, runId, publicKeyPem: getSigningPublicKeyPem(workspace, "artifact-seal"),
    privateKeyPem: getSigningKey(workspace, "artifact-seal"), trust: workspaceKeyTrust(workspace) };
}
function publication(f: Awaited<ReturnType<typeof fixture>>, out = "owned.amccert") {
  // Regular files only: the publication lock keeps its contender directory beside the certificates.
  const dir = assuranceCertificatesDir(f.workspace), files = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(row => row.isFile())
    .map(row => row.name).sort().map(name => [name, readFileSync(join(dir, name)).toString("base64")]) : [];
  const read = (path: string) => existsSync(path) ? readFileSync(path).toString("base64") : null;
  return { files, output: read(join(f.workspace, out)), outputHash: read(join(f.workspace, `${out}.sha256`)),
    log: read(transparencyLogPath(f.workspace)) };
}
function inspect(f: Awaited<ReturnType<typeof fixture>>, outFile: string) {
  const target = mkdtempSync(join(f.root, "unpack-"));
  extractValidatedTarGzipArchive({ file: outFile, destination: target, label: "owned actual assurance certificate",
    limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024,
      maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 } });
  const root = join(target, "amc-cert"), cert = JSON.parse(readFileSync(join(root, "cert.json"), "utf8")) as { issuedTs: number };
  const signature = JSON.parse(readFileSync(join(root, "cert.sig"), "utf8")) as {
    digestSha256: string; signature: string; signedTs: number; signer: string; envelope: SignatureEnvelope };
  expect(readFileSync(join(root, "cert.json"), "utf8")).toBe(`${canonicalize(cert)}\n`);
  expect(signature.digestSha256).toBe(sha256Hex(canonicalize(cert)));
  expect(readFileSync(join(root, "signer.pub"), "utf8")).toBe(f.publicKeyPem);
  expect(verify(null, Buffer.from(signature.digestSha256, "hex"), f.publicKeyPem, Buffer.from(signature.signature, "base64"))).toBe(true);
  expect(verifySignatureEnvelope(signature.digestSha256, signature.envelope, { trustedPublicKeys: [f.publicKeyPem], requireTrustedKey: true })).toBe(true);
  expect(verifyAssuranceCertificateFile({ file: outFile, trust: f.trust }).ok).toBe(true);
  return { root, cert, signature };
}

test("the maintained assurance issuer uses the real file provider and preserves default cert signature bytes and publication files", async () => {
  const f = await fixture(), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
  const result = await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" });
  const observed = inspect(f, result.outFile), calls = file.calls.filter(row => row.workspace === f.workspace && row.ref.id === "artifact-seal");
  expect(calls).toHaveLength(3); expect(calls.map(row => row.bytes)).toEqual([
    Buffer.from(observed.signature.digestSha256, "hex"), Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex"),
    Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") ]);
  const signature = sign(null, Buffer.from(observed.signature.digestSha256, "hex"), f.privateKeyPem).toString("base64");
  // Independently reconstructed existing default wire, rather than comparing two newly changed implementations.
  const expected = { digestSha256: observed.signature.digestSha256, signature, signedTs: now, signer: "auditor", envelope: {
    v: 1, alg: "ed25519", pubkeyB64: Buffer.from(f.publicKeyPem).toString("base64"), fingerprint: sha256Hex(f.publicKeyPem),
    sigB64: signature, signedTs: now, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } };
  expect(readFileSync(join(observed.root, "cert.sig"), "utf8")).toBe(`${canonicalize(expected)}\n`);
  expect(readFileSync(assuranceLatestCertificatePath(f.workspace))).toEqual(readFileSync(result.outFile));
  expect(readFileSync(result.timestampedPath)).toEqual(readFileSync(result.outFile));
  expect(readFileSync(assuranceLatestCertificateShaPath(f.workspace), "utf8")).toBe(`${result.sha256}\n`);
  expect(readFileSync(`${result.outFile}.sha256`, "utf8")).toBe(`${result.sha256}\n`);
  expect(JSON.parse(readFileSync(transparencyLogPath(f.workspace), "utf8").trim().split(/\r?\n/).at(-1)!)).toMatchObject({
    hash: result.transparencyHash, type: "ASSURANCE_CERT_ISSUED", artifact: { kind: "amccert", sha256: result.sha256, id: result.cert.certId } });
});

test("a real owner artifact-key rotation across the existing first await refuses stale certificate authority before publication", async () => {
  const f = await fixture(), pending = issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" });
  // checkNotaryTrust is a real async API even in LOCAL_VAULT. Owner rotation occurs before its continuation.
  const outcome = pending.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
  try {
    rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    expect(getSigningPublicKeyPem(f.workspace, "artifact-seal")).not.toBe(f.publicKeyPem);
    const afterOwner = publication(f), settled = await outcome;
    expect(settled.ok).toBe(false);
    if (!settled.ok) expect(String(settled.error)).toMatch(/policy signing state changed|policy signing response does not match/);
    expect(publication(f)).toEqual(afterOwner);
  } finally { await Promise.allSettled([pending]); }
  // Independent positive: the new actual authority can issue and verify a fresh certificate.
  const next = { ...f, publicKeyPem: getSigningPublicKeyPem(f.workspace, "artifact-seal"), trust: workspaceKeyTrust(f.workspace) };
  inspect(next, (await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "fresh.amccert" })).outFile);
});

test.each(["vault-lock", "no-sign"] as const)("actual file crypto followed by %s refusal publishes no certificate and restoration allows a fresh one", async refusal => {
  const f = await fixture(), entered = deferred(), release = deferred(), before = publication(f);
  file.afterSign = async () => { entered.resolve(); await release.promise; };
  const pending = issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" });
  const settled = pending.then(() => "returned" as const, () => "rejected" as const);
  try {
    expect(await Promise.race([entered.promise.then(() => "signed" as const), settled])).toBe("signed");
    const call = file.calls.at(-1)!;
    expect(call.ref).toMatchObject({ provider: "file", id: "artifact-seal" });
    expect(verify(null, call.bytes, f.publicKeyPem, call.signature)).toBe(true);
    if (refusal === "vault-lock") { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); }
    else vi.stubEnv("AMC_NO_SIGN", "1");
    release.resolve(); await expect(pending).rejects.toThrow(); expect(publication(f)).toEqual(before);
  } finally {
    release.resolve(); await Promise.allSettled([pending]); file.afterSign = undefined;
    vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS);
  }
  inspect(f, (await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "fresh.amccert" })).outFile);
});

test("actual file signing retains the original caller arguments across its pause and publishes only the original certificate path", async () => {
  const f = await fixture(), entered = deferred(), release = deferred();
  const input = { workspace: f.workspace, runId: f.runId, outFile: "original.amccert" };
  file.afterSign = async () => { entered.resolve(); await release.promise; };
  const pending = issueAssuranceCertificate(input);
  const settled = pending.then(() => "returned" as const, () => "rejected" as const);
  try {
    expect(await Promise.race([entered.promise.then(() => "signed" as const), settled])).toBe("signed");
    const call = file.calls.at(-1)!;
    expect(call.ref).toMatchObject({ provider: "file", id: "artifact-seal" });
    expect(verify(null, call.bytes, f.publicKeyPem, call.signature)).toBe(true);
    input.outFile = "redirected.amccert";
    input.runId = "caller-mutated-run-that-was-never-loaded";
    release.resolve();
    const result = await pending;
    expect(result.outFile).toBe(join(f.workspace, "original.amccert"));
    expect(existsSync(join(f.workspace, "redirected.amccert"))).toBe(false);
    expect(existsSync(join(f.workspace, "redirected.amccert.sha256"))).toBe(false);
    expect(inspect(f, result.outFile).cert).toMatchObject({ runId: f.runId });
  } finally {
    release.resolve(); await Promise.allSettled([pending]); file.afterSign = undefined;
  }
});

test("a real signed whole-policy change across the first await refuses before Sign even when the CERT descriptor remains identical", async () => {
  const f = await fixture(), selected = describePolicySigner(f.workspace, "CERT"), policyPath = trustConfigPath(f.workspace), sigPath = trustConfigSigPath(f.workspace);
  const originalBody = readFileSync(policyPath), originalSidecar = readFileSync(sigPath), current = loadTrustConfig(f.workspace);
  expect(current.trust.mode).toBe("LOCAL_VAULT");
  expect(current.trust.enforcement.requireNotaryFor).not.toContain("BOM");
  const next = trustConfigSchema.parse(current);
  next.trust.enforcement.requireNotaryFor.push("BOM");
  const before = publication(f), callsBefore = file.calls.length;
  const pending = issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" });
  const outcome = pending.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
  try {
    // saveTrustConfig is private. Publish the same real signed store wire with its public schema, file writer and
    // actual vault signer, as existing asyncArtifactPolicy tests do; no policy loader/verifier is mocked.
    const bytes = Buffer.from(YAML.stringify(next), "utf8");
    writeFileAtomic(policyPath, bytes, 0o644);
    const signed = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
    writeFileAtomic(sigPath, JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
      signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2), 0o644);
    expect(verifyTrustConfigSignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true });
    expect(loadTrustConfig(f.workspace).trust.enforcement.requireNotaryFor).toContain("BOM");
    expect(describePolicySigner(f.workspace, "CERT")).toEqual(selected);
    const settled = await outcome;
    expect(settled.ok).toBe(false);
    // The retained log authority compares the same whole policy before the certificate-specific comparison does.
    if (!settled.ok) expect(String(settled.error)).toMatch(/(assurance certificate signing policy changed while preparing|transparency signing policy changed while signing was prepared)/);
    expect(file.calls).toHaveLength(callsBefore);
    expect(publication(f)).toEqual(before);
  } finally {
    await Promise.allSettled([pending]);
    writeFileAtomic(policyPath, originalBody, 0o644); writeFileAtomic(sigPath, originalSidecar, 0o644);
  }
  expect(verifyTrustConfigSignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true });
  inspect(f, (await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "fresh.amccert" })).outFile);
});

test.each(["run", "findings", "policy", "policy-sidecar"] as const)("a %s source-byte change during actual file Sign refuses publication and exact restoration permits a verified certificate", async target => {
  const f = await fixture(), entered = deferred(), release = deferred(), runPath = assuranceRunJsonPath(f.workspace, f.runId);
  const paths = { run: runPath, findings: join(f.workspace, ".amc", "assurance", "runs", f.runId, "findings.json"),
    policy: assurancePolicyPath(f.workspace), "policy-sidecar": assurancePolicySigPath(f.workspace) };
  const originals = Object.entries(paths).map(([kind, path]) => ({ kind, path, bytes: readFileSync(path) }));
  const original = originals.find(row => row.kind === target)!, selected = describePolicySigner(f.workspace, "CERT"), before = publication(f);
  file.afterSign = async () => { entered.resolve(); await release.promise; };
  const pending = issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" });
  const settled = pending.then(() => "returned" as const, () => "rejected" as const);
  try {
    expect(await Promise.race([entered.promise.then(() => "signed" as const), settled])).toBe("signed");
    const call = file.calls.at(-1)!;
    expect(call.ref).toMatchObject({ provider: "file", id: "artifact-seal" });
    expect(verify(null, call.bytes, f.publicKeyPem, call.signature)).toBe(true);
    if (target === "policy") {
      const next = loadAssurancePolicy(f.workspace); next.assurancePolicy.gates.minIntegrityIndex = 0.125;
      saveAssurancePolicy(f.workspace, next);
    } else {
      // These exact raw-byte edits preserve valid JSON and all record/schema values. Policy-sidecar formatting
      // also preserves its actual signature validity, so a shared authority gate cannot substitute for input CAS.
      writeFileAtomic(original.path, Buffer.concat([original.bytes, Buffer.from("\n ", "utf8")]), 0o644);
      expect(() => JSON.parse(readFileSync(original.path, "utf8"))).not.toThrow();
    }
    expect(sha256Hex(readFileSync(original.path))).not.toBe(sha256Hex(original.bytes));
    expect(verifyAssurancePolicySignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true });
    expect(describePolicySigner(f.workspace, "CERT")).toEqual(selected);
    release.resolve();
    await expect(pending).rejects.toThrow("signed pair inputs or destinations changed while signing; retry");
    expect(publication(f)).toEqual(before);
  } finally {
    release.resolve(); await Promise.allSettled([pending]); file.afterSign = undefined;
    for (const row of originals) writeFileAtomic(row.path, row.bytes, 0o644);
  }
  expect(verifyAssurancePolicySignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true });
  const fresh = await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "fresh.amccert" }), output = inspect(f, fresh.outFile);
  expect(readFileSync(join(output.root, "meta", "run.sha256"), "utf8")).toBe(`${sha256Hex(originals.find(row => row.kind === "run")!.bytes)}\n`);
  expect(readFileSync(join(output.root, "meta", "findings.sha256"), "utf8")).toBe(`${sha256Hex(originals.find(row => row.kind === "findings")!.bytes)}\n`);
});

function pauseCertificateLog() {
  const entered = deferred(), release = deferred(); let remaining = 3;
  const wait = async () => { if (--remaining === 0) { entered.resolve(); await release.promise; } else file.afterSign = wait; };
  file.afterSign = wait; return { entered, release };
}
test.each(["run", "findings", "policy", "policy-sidecar", "archive", "checksum", "latest", "latest-checksum", "timestamped", "timestamped-checksum"] as const)(
  "late certificate %s drift refuses only transparency and preserves the actual already-published files", async target => {
    const f = await fixture(), gate = pauseCertificateLog(), beforeCalls = file.calls.length;
    const pending = issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" }), outcome = pending.then(() => null, error => error);
    let changedPath: string | undefined, original: Buffer | undefined;
    try {
      expect(await Promise.race([gate.entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
      const out = join(f.workspace, "owned.amccert"), observed = inspect(f, out), runPath = assuranceRunJsonPath(f.workspace, f.runId);
      const targets = { run: runPath, findings: join(f.workspace, ".amc", "assurance", "runs", f.runId, "findings.json"), policy: assurancePolicyPath(f.workspace),
        "policy-sidecar": assurancePolicySigPath(f.workspace), archive: out, checksum: `${out}.sha256`, latest: assuranceLatestCertificatePath(f.workspace),
        "latest-checksum": assuranceLatestCertificateShaPath(f.workspace), timestamped: assuranceTimestampedCertificatePath(f.workspace, observed.cert.issuedTs),
        "timestamped-checksum": assuranceTimestampedCertificateShaPath(f.workspace, observed.cert.issuedTs) };
      const calls = file.calls.slice(beforeCalls); expect(calls).toHaveLength(3);
      for (const call of calls) expect(verify(null, call.bytes, f.publicKeyPem, call.signature)).toBe(true);
      expect(existsSync(join(f.workspace, ".amc/transparency/.workspace-transparency.lock"))).toBe(false);
      changedPath = targets[target]; original = readFileSync(changedPath); writeFileAtomic(changedPath, Buffer.concat([original, Buffer.from("\n ")]), 0o644);
      const afterEdit = publication(f); gate.release.resolve(); const error = await outcome;
      expect(error).toMatchObject({ code: "ASSURANCE_CERT_TRANSPARENCY_PUBLICATION_INCOMPLETE", publication: { outFile: out }, cause: expect.any(Error) });
      expect(String(error.cause)).toContain("signed pair inputs or destinations changed while signing; retry");
      expect(publication(f)).toEqual(afterEdit);
    } finally { gate.release.resolve(); await Promise.allSettled([pending]); file.afterSign = undefined; if (changedPath && original) writeFileAtomic(changedPath, original, 0o644); }
    inspect(f, (await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "fresh.amccert" })).outFile);
  });

test("certificate final purpose authority is rechecked after two real independently usable native notary log signatures", async () => {
  const f = await fixture(), remote = await ownedAsyncWorkspaceLogNotary(f.workspace, f.root), entered = deferred(), release = deferred();
  remote.setBeforeReply(async kind => { if (kind === "MERKLE_ROOT") { entered.resolve(); await release.promise; } });
  const pending = issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" }), outcome = pending.then(() => null, error => error);
  try {
    try {
      expect(await Promise.race([entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
      inspect({ ...f, trust: remote.trust }, join(f.workspace, "owned.amccert")); const published = publication(f);
      expect(remote.requests.map(row => row.kind)).toEqual(["TRANSPARENCY_ROOT", "MERKLE_ROOT"]);
      lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); release.resolve();
      expect(await outcome).toMatchObject({ code: "ASSURANCE_CERT_TRANSPARENCY_PUBLICATION_INCOMPLETE", cause: expect.any(Error) });
      expect(publication(f)).toEqual(published);
    } finally { release.resolve(); await Promise.allSettled([pending]); remote.setBeforeReply(undefined); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    inspect({ ...f, trust: remote.trust }, (await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "fresh.amccert" })).outFile);
    expect(remote.requests.slice(-2)).toEqual([
      { kind: "TRANSPARENCY_ROOT", payload: Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex") },
      { kind: "MERKLE_ROOT", payload: Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") } ]);
    expect(JSON.parse(readFileSync(transparencySealSigPath(f.workspace), "utf8")).envelope).toMatchObject({ alg: "ecdsa-p256-sha256", fingerprint: remote.keyId });
  } finally { await remote.close(); }
});

test("certificate preserves every archive copy and the committed-log native cause after a post-line Merkle I/O failure", async () => {
  const f = await fixture(), actualWrite = files.writeFileAtomic, native = Object.assign(new Error("owned post-line I/O failure"), { code: "EIO" });
  let reached = false, failed = false;
  // Fail the first Merkle member write after the line and seal are acknowledged, without changing any captured log-family state.
  const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((path, bytes, mode) => {
    if (reached && !failed) { failed = true; throw native; }
    actualWrite(path, bytes, mode); if (path === transparencySealSigPath(f.workspace)) reached = true; });
  try {
    const error = await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "owned.amccert" }).then(() => null, value => value);
    expect(failed).toBe(true); expect(error).toMatchObject({ code: "ASSURANCE_CERT_TRANSPARENCY_PUBLICATION_INCOMPLETE" });
    expect(error.cause).toBeInstanceOf(TransparencyMerkleLagError); expect(error.cause.cause).toBe(native); expect(error.cause.pendingRecorded).toBe(true);
    const out = join(f.workspace, "owned.amccert"), observed = inspect(f, out), archive = readFileSync(out), sha = sha256Hex(archive);
    for (const path of [assuranceLatestCertificatePath(f.workspace), assuranceTimestampedCertificatePath(f.workspace, observed.cert.issuedTs)]) expect(readFileSync(path)).toEqual(archive);
    for (const path of [`${out}.sha256`, assuranceLatestCertificateShaPath(f.workspace), assuranceTimestampedCertificateShaPath(f.workspace, observed.cert.issuedTs)]) {
      expect(readFileSync(path, "utf8")).toBe(`${sha}\n`);
    }
    expect(error.publication.sha256).toBe(sha);
    expect(JSON.parse(readFileSync(transparencyLogPath(f.workspace), "utf8").trim().split(/\r?\n/).at(-1)!).hash).toBe(error.cause.entryHash);
    expect(verifyTransparencyLog(f.workspace).ok).toBe(true);
  } finally { spy.mockRestore(); rmSync(merkleCurrentRootPath(f.workspace), { recursive: true, force: true }); rebuildTransparencyMerkle(f.workspace); }
  inspect(f, (await issueAssuranceCertificate({ workspace: f.workspace, runId: f.runId, outFile: "fresh.amccert" })).outFile);
});

test.skipIf(process.platform === "win32")("compiled assurance cert-issue awaits all three real raw32 phases and leaves a verified published certificate", async () => {
  const f = await fixture(), actual = pathToFileURL(resolve("dist/keys/providers/file.js")).href, purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href;
  const replacement = join(f.root, "file-boundary.mjs"), loader = join(f.root, "file-loader.mjs"), requests = join(f.root, "calls.jsonl"); writeFileSync(requests, "");
  writeFileSync(replacement, `import {appendFileSync} from "node:fs"; import {fileKeyProvider as actual} from ${JSON.stringify(actual)};
export function fileKeyProvider(workspace) { const provider=actual(workspace); return {...provider, async sign(ref,bytes) { const signature=await provider.sign(ref,bytes); appendFileSync(process.env.P208_CERT_CALLS,JSON.stringify({purpose:ref.id,hex:Buffer.from(bytes).toString("hex")})+"\\n"); return signature; }}; }\n`);
  writeFileSync(loader, `import {pathToFileURL} from "node:url";
export async function resolve(specifier,context,nextResolve) { if (["@aws-sdk/","@google-cloud/","@azure/","pkcs11js"].some(prefix=>specifier.startsWith(prefix))) throw new Error("owned cert test forbids remote SDK imports"); const found=await nextResolve(specifier,context); if(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actual)}) return {url:pathToFileURL(process.env.P208_CERT_BOUNDARY).href,shortCircuit:true}; return found; }\n`);
  const child = spawnOwnedNode(["--experimental-loader", pathToFileURL(loader).href, resolve("dist/cli.js"), "assurance", "cert-issue", "--run", f.runId, "--out", "cli.amccert"],
    { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1", P208_CERT_CALLS: requests, P208_CERT_BOUNDARY: replacement } });
  try { const result = await child.wait(30_000); expect(result.code, result.stderr).toBe(0); expect(result.signal).toBeNull();
    const observed = inspect(f, join(f.workspace, "cli.amccert")); expect(readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([
      { purpose: "artifact-seal", hex: observed.signature.digestSha256 }, { purpose: "artifact-seal", hex: sha256Hex(readFileSync(transparencySealPath(f.workspace))) },
      { purpose: "artifact-seal", hex: sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))) } ]);
  } finally { await child.stop(); }
}, 60_000);

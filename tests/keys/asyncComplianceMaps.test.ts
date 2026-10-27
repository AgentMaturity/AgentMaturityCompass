import { randomUUID, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initComplianceMaps, initComplianceMapsAsync, verifyComplianceMapsSignature, generateComplianceReport, ComplianceMapsPublicationError } from "../../src/compliance/complianceEngine.js";
import { initComplianceMapsCliAsync } from "../../src/compliance/complianceCli.js";
import { defaultComplianceMapsFile } from "../../src/compliance/builtInMappings.js";
import { complianceMapsSchema } from "../../src/compliance/mappingSchema.js";
import { normalizeFrameworkName } from "../../src/compliance/frameworks.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor } from "../../src/org/orgSigner.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { addPublicKeyToHistory } from "../../src/crypto/keys.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath, trustConfigSchema } from "../../src/trust/trustConfig.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const transport = vi.hoisted(() => ({ call: undefined as KmsCall | undefined }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => transport.call!(...args))) };
});
const io = vi.hoisted(() => ({ afterBody: "", swapOnRead: "", swapBytes: Buffer.alloc(0), bodyReads: 0 }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const renameSync: typeof actual.renameSync = (from, to) => {
    actual.renameSync(from, to);
    if (io.afterBody && String(to) === io.afterBody) { io.afterBody = ""; actual.mkdirSync(String(to) + ".sig"); }
  };
  const nativeRead = actual.readFileSync as (path: Parameters<typeof actual.readFileSync>[0], options?: unknown) => Buffer | string;
  const read = ((path: Parameters<typeof actual.readFileSync>[0], options?: unknown) => {
    const bytes = nativeRead(path, options);
    if (io.swapOnRead && String(path) === io.swapOnRead) {
      io.bodyReads++; const path = io.swapOnRead; io.swapOnRead = ""; actual.writeFileSync(path, io.swapBytes);
    }
    return bytes;
  }) as typeof actual.readFileSync;
  return { ...actual, renameSync, readFileSync: read, default: { ...actual, renameSync, readFileSync: read } };
});
const PASS = "maps-owner-signature-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  io.afterBody = ""; io.swapOnRead = ""; io.bodyReads = 0; transport.call = undefined; vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-compliance maps ")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const path = join(workspace, ".amc", "compliance-maps.yaml"), provider = loadKeyProvider(workspace, "file");
  return { root, workspace, path, provider, pair: () => ({ body: existsSync(path) ? readFileSync(path) : null, signature: existsSync(path + ".sig") ? readFileSync(path + ".sig") : null }) };
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
function pause(f: ReturnType<typeof fixture>) {
  const entered = deferred(), gate = deferred(), original = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementationOnce(async (...args) => { const signature = await original(...args); entered.resolve(); await gate.promise; return signature; });
  return { entered, gate };
}
function healthy(f: ReturnType<typeof fixture>) {
  const record = JSON.parse(readFileSync(f.path + ".sig", "utf8"));
  expect(record.digestSha256).toBe(sha256Hex(readFileSync(f.path)));
  expect(verifyComplianceMapsSignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true, reason: null });
  return record;
}

test("actual async maps CLI wrapper preserves independent legacy YAML and five-field Ed25519 signature bytes", async () => {
  const f = fixture(), input = defaultComplianceMapsFile(), bytes = Buffer.from(YAML.stringify(complianceMapsSchema.parse(input)));
  const now = Date.now() + 1000; vi.spyOn(Date, "now").mockReturnValue(now);
  const expected = sign(null, Buffer.from(sha256Hex(bytes), "hex"), getSigningKey(f.workspace, "config-signature")).toString("base64");
  initComplianceMaps(f.workspace, input); const legacy = readFileSync(f.path + ".sig");
  const out = await initComplianceMapsCliAsync(f.workspace); expect(out).toEqual({ path: f.path, sigPath: f.path + ".sig" });
  expect(readFileSync(f.path)).toEqual(bytes); expect(readFileSync(f.path + ".sig")).toEqual(legacy);
  const record = healthy(f); expect(Object.keys(record)).toEqual(["digestSha256", "signature", "signedTs", "signer", "envelope"]);
  expect(record).toMatchObject({ digestSha256: sha256Hex(bytes), signature: expected, signedTs: now, signer: "auditor" });
  expect(legacy.toString()).toBe(JSON.stringify(record, null, 2));
  if (process.platform !== "win32") expect(statSync(f.path).mode & 0o777).toBe(0o644);
});

test.each([
  ["relative.yaml", "artifact-seal"], ["C:\\native path\\.amc\\compliance-maps.yaml", "config-signature"],
  ["/native/.amc/audit/maps/active.yaml", "config-signature"], ["/native/.amc/plugins/installed.lock.json", "config-signature"],
  ["/native/org/scorecards/a.json", "artifact-seal"], ["/native/transform/plans/a.json", "config-signature"],
  ["/native/transform/plans/latest.json", "config-signature"], ["/native/transform/latest.json", "artifact-seal"], ["/native/arbitrary adapters.yaml", "artifact-seal"]
] as const)("byte preparation preserves existing path kind for %s without touching that native path", async (path, purpose) => {
  const f = fixture(), spy = vi.spyOn(f.provider, "sign"), bytes = Buffer.from("exact content\r\n");
  const prepared = await prepareFileSignatureWithAuditor(f.workspace, path, bytes); prepared.assertCurrent();
  expect(spy.mock.calls.map(([ref]) => ref.id)).toEqual([purpose]);
  const signed = JSON.parse(prepared.signatureBytes);
  expect(signed.digestSha256).toBe(sha256Hex(bytes));
  expect(verify(null, Buffer.from(signed.digestSha256, "hex"), getSigningPublicKeyPem(f.workspace, purpose), Buffer.from(signed.signature, "base64"))).toBe(true);
});

test("byte preparation preserves the standard generator's UTF8 hex-string hashing and copies mutable input", async () => {
  const f = fixture(), input = Buffer.from("ab".repeat(32), "utf8"), original = Buffer.from(input), wait = pause(f);
  const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
  const pending = prepareFileSignatureWithAuditor(f.workspace, "schemas.sig", input);
  try { await wait.entered.promise; input.fill(0); } finally { wait.gate.resolve(); await pending.catch(() => {}); }
  const prepared = await pending; prepared.assertCurrent();
  expect(prepared.digestSha256).toBe(sha256Hex(original)); expect(prepared.digestSha256).not.toBe(original.toString("utf8"));
  expect(JSON.parse(prepared.signatureBytes)).toEqual(signSerializedPayloadWithAuditor(f.workspace, original.toString("utf8")));
});

test("actual maps input is frozen before Sign and no remote wait runs under the publication lock", async () => {
  const f = fixture(), input = defaultComplianceMapsFile(), bytes = Buffer.from(YAML.stringify(complianceMapsSchema.parse(input))), wait = pause(f);
  const pending = initComplianceMapsAsync(f.workspace, input);
  try {
    await wait.entered.promise; expect(existsSync(join(f.workspace, ".amc", ".compliance-maps-pair.lock"))).toBe(false);
    expect(f.pair()).toEqual({ body: null, signature: null }); writeFileSync(join(f.workspace, ".amc", "unrelated-owned-report.txt"), "independent report output"); input.complianceMaps.mappings[0]!.description = "caller changed after Sign";
  } finally { wait.gate.resolve(); await pending.catch(() => {}); }
  await pending; expect(readFileSync(f.path)).toEqual(bytes); healthy(f);
});

test.each(["absent", "present"] as const)("no-sign refuses the actual %s pair before Sign and restores a fresh positive", async state => {
  const f = fixture(); if (state === "present") await initComplianceMapsAsync(f.workspace);
  const before = f.pair(), spy = vi.spyOn(f.provider, "sign"); vi.stubEnv("AMC_NO_SIGN", "1");
  try { await expect(initComplianceMapsAsync(f.workspace)).rejects.toThrow("no-sign mode"); expect(spy).not.toHaveBeenCalled(); expect(f.pair()).toEqual(before); }
  finally { vi.stubEnv("AMC_NO_SIGN", "0"); }
  await initComplianceMapsAsync(f.workspace); healthy(f);
});

test.each(["generation", "policy", "no-sign", "locked", "actor"] as const)("final producer gate refuses %s after the checked signer returned", async change => {
  const f = fixture(); await initComplianceMapsAsync(f.workspace); const before = f.pair(); let signed = false, fired = false;
  // P2-08 forwards caller gates into the Sign path too, so change state at the first gate after the actual signer returned.
  const original = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementation(async (...args) => { const signature = await original(...args); signed = true; return signature; });
  const pending = initComplianceMapsAsync(f.workspace, undefined, { beforePublish() {
    if (!signed || fired) return; fired = true;
    if (change === "generation") rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
    if (change === "policy") {
      const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.notaryMaxClockSkewSeconds++;
      const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(policy))), signed = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
      writeFileSync(trustConfigPath(f.workspace), bytes); writeFileSync(trustConfigSigPath(f.workspace), JSON.stringify(signed));
    }
    if (change === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
    if (change === "locked") { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
    if (change === "actor") throw new Error("owned trusted actor is no longer current");
  } });
  try { await expect(pending).rejects.toThrow(); expect(fired).toBe(true); expect(f.pair()).toEqual(before); }
  finally { vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  await initComplianceMapsAsync(f.workspace); healthy(f);
});

test("two prepared writers cannot overwrite the actual valid winner or a sidecar-only edit", async () => {
  const f = fixture(), entered = [deferred(), deferred()], gates = [deferred(), deferred()], original = f.provider.sign.bind(f.provider); let call = 0;
  vi.spyOn(f.provider, "sign").mockImplementation(async (...args) => { const signature = await original(...args), index = call++; if (index < 2) { entered[index]!.resolve(); await gates[index]!.promise; } return signature; });
  const first = initComplianceMapsAsync(f.workspace), second = initComplianceMapsAsync(f.workspace);
  try {
    await Promise.all(entered.map(value => value.promise)); gates[0]!.resolve(); await first; const winner = f.pair();
    gates[1]!.resolve(); await expect(second).rejects.toThrow("compliance maps pair changed"); expect(f.pair()).toEqual(winner); healthy(f);
  } finally { gates.forEach(value => value.resolve()); await Promise.allSettled([first, second]); }
  const wait = pause(f), pending = initComplianceMapsAsync(f.workspace); let changed: ReturnType<typeof f.pair>;
  try { await wait.entered.promise; writeFileSync(f.path + ".sig", readFileSync(f.path + ".sig", "utf8") + "\n"); changed = f.pair(); }
  finally { wait.gate.resolve(); await pending.catch(() => {}); }
  await expect(pending).rejects.toThrow("compliance maps pair changed"); expect(f.pair()).toEqual(changed!);
  await initComplianceMapsAsync(f.workspace); healthy(f);
});

test("a real second-rename failure records only the committed body and preserves its native cause", async () => {
  const f = fixture(); io.afterBody = f.path;
  const failure = await initComplianceMapsAsync(f.workspace).catch(error => error);
  expect(failure).toBeInstanceOf(ComplianceMapsPublicationError);
  expect(failure).toMatchObject({ code: "COMPLIANCE_MAPS_PARTIAL", publishedPaths: [".amc/compliance-maps.yaml"] });
  expect(String(failure)).not.toContain(f.workspace); expect(failure.cause).toBeInstanceOf(Error);
  expect(["EISDIR", "EPERM", "EACCES", "ENOTEMPTY"]).toContain((failure.cause as NodeJS.ErrnoException).code);
  expect(readFileSync(f.path)).toEqual(Buffer.from(YAML.stringify(complianceMapsSchema.parse(defaultComplianceMapsFile()))));
  expect(statSync(f.path + ".sig").isDirectory()).toBe(true);
  rmSync(f.path + ".sig", { recursive: true }); await initComplianceMapsAsync(f.workspace); healthy(f);
});

test.each(["missing", "corrupt"] as const)("literal maps verification preserves the default original-auditor-alias %s refusal", async damage => {
  const f = fixture(); await initComplianceMapsAsync(f.workspace); const alias = join(f.workspace, ".amc", "keys", "auditor_ed25519.pub"), original = readFileSync(alias);
  const record = healthy(f), body = readFileSync(f.path), key = getSigningPublicKeyPem(f.workspace, "config-signature");
  expect(verify(null, Buffer.from(sha256Hex(body), "hex"), key, Buffer.from(record.signature, "base64"))).toBe(true);
  try { if (damage === "missing") rmSync(alias); else writeFileSync(alias, "corrupt owned alias\n"); expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(false); }
  finally { writeFileSync(alias, original); }
  expect(readFileSync(f.path)).toEqual(body); healthy(f);
});

test.each(["VAULT", "NOTARY"] as const)("a genuine wrong-purpose artifact signature cannot authorize custom maps as %s", async label => {
  const f = fixture(); await initComplianceMapsAsync(f.workspace); rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
  const wrongKey = getSigningPublicKeyPem(f.workspace, "artifact-seal"); expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(wrongKey);
  const custom = join(f.root, "custom arbitrary maps.yaml"), bytes = readFileSync(f.path), digest = sha256Hex(bytes);
  writeFileSync(custom, bytes); const signed = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: digest });
  if (label === "NOTARY") signed.envelope!.signer = { ...signed.envelope!.signer, type: "NOTARY", notaryFingerprint: signed.envelope!.fingerprint };
  expect(verify(null, Buffer.from(digest, "hex"), wrongKey, Buffer.from(signed.signature, "base64"))).toBe(true);
  writeFileSync(custom + ".sig", JSON.stringify(signed)); expect(verifyComplianceMapsSignature(f.workspace, custom).valid).toBe(false);
  writeFileSync(custom + ".sig", readFileSync(f.path + ".sig")); expect(verifyComplianceMapsSignature(f.workspace, custom).valid).toBe(true);
});

test("authenticated imported-only unbound history remains admitted without promoting later bound config authority", async () => {
  const f = fixture(), key = fakeKey("ed25519"), pem = publicPem(key); await initComplianceMapsAsync(f.workspace);
  addPublicKeyToHistory(f.workspace, "auditor", pem, "imported", { logRevision: false });
  const bytes = readFileSync(f.path), digest = sha256Hex(bytes), signature = sign(null, Buffer.from(digest, "hex"), key.privateKey).toString("base64");
  writeFileSync(f.path + ".sig", JSON.stringify({ digestSha256: digest, signature, signedTs: Date.now(), signer: "auditor" }));
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true);
  const id = AWS_ARN("maps-import-bound-" + randomUUID()), next = fakeKey("p256"), fake = awsFake({ [id]: next }); transport.call = fake.call;
  const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8")); config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
  await transitionConfigSignatureProvider(f.workspace, Buffer.from(YAML.stringify(config)), { passphrase: PASS });
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(false); await initComplianceMapsAsync(f.workspace); healthy(f);
});

test("real owner-bound P256 config signer admits custom map filenames and refuses DER, high-S, relabel and present-envelope raw fallback", async () => {
  const f = fixture(), id = AWS_ARN("maps-p256-" + randomUUID()), key = fakeKey("p256"), fake = awsFake({ [id]: key }); transport.call = fake.call;
  const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8")); config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
  await transitionConfigSignatureProvider(f.workspace, Buffer.from(YAML.stringify(config)), { passphrase: PASS });
  fake.requests.splice(0); const before = f.pair(); expect(() => initComplianceMaps(f.workspace)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" })); expect(f.pair()).toEqual(before);
  await initComplianceMapsAsync(f.workspace); const valid = healthy(f), bytes = readFileSync(f.path), digest = sha256Hex(bytes), pem = publicPem(key);
  expect(fake.requests.filter(row => row.operation === "Sign")).toHaveLength(1);
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(digest, "hex"), pem, Buffer.from(valid.signature, "base64"))).toBe(true);
  const custom = join(f.root, "CUSTOM.yaml"); writeFileSync(custom, bytes); writeFileSync(custom + ".sig", JSON.stringify(valid)); expect(verifyComplianceMapsSignature(f.workspace, custom).valid).toBe(true);
  const raw = Buffer.from(valid.signature, "base64"), high = Buffer.concat([raw.subarray(0, 32), Buffer.from((0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n - BigInt("0x" + raw.subarray(32).toString("hex"))).toString(16).padStart(64, "0"), "hex")]);
  expect(verify("sha256", Buffer.from(digest, "hex"), { key: pem, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
  for (const mutation of ["DER", "high-S", "algorithm", "envelope-signature", "NOTARY"] as const) {
    const altered = structuredClone(valid);
    if (mutation === "DER") altered.signature = altered.envelope.sigB64 = sign("sha256", Buffer.from(digest, "hex"), key.privateKey).toString("base64");
    if (mutation === "high-S") altered.signature = altered.envelope.sigB64 = high.toString("base64");
    if (mutation === "algorithm") altered.envelope.alg = "ed25519";
    if (mutation === "envelope-signature") altered.envelope.sigB64 = Buffer.alloc(64).toString("base64");
    if (mutation === "NOTARY") altered.envelope.signer = { ...altered.envelope.signer, type: "NOTARY", notaryFingerprint: altered.envelope.fingerprint };
    writeFileSync(custom + ".sig", JSON.stringify(altered)); expect(verifyComplianceMapsSignature(f.workspace, custom).valid, mutation).toBe(false);
  }
  const legacy = { ...valid }; delete legacy.envelope; writeFileSync(custom + ".sig", JSON.stringify(legacy)); expect(verifyComplianceMapsSignature(f.workspace, custom).valid).toBe(true);
  writeFileSync(custom + ".sig", JSON.stringify(valid)); expect(verifyComplianceMapsSignature(f.workspace, custom).valid).toBe(true);
});

test("actual compliance report verifies the captured custom map bytes that it parses instead of a later replacement", async () => {
  const f = fixture(), input = defaultComplianceMapsFile(); await initComplianceMapsAsync(f.workspace, input);
  const custom = join(f.root, "report maps.yaml"), bytes = readFileSync(f.path); writeFileSync(custom, bytes); writeFileSync(custom + ".sig", readFileSync(f.path + ".sig"));
  const changed = structuredClone(input); changed.complianceMaps.mappings[0]!.category = "replacement category";
  io.swapOnRead = custom; io.swapBytes = Buffer.from(YAML.stringify(changed)); io.bodyReads = 0;
  const framework = normalizeFrameworkName(input.complianceMaps.mappings[0]!.framework);
  if (framework === null) throw new Error("invalid owned map fixture framework");
  const report = generateComplianceReport({ workspace: f.workspace, mapsPath: custom, framework, window: "1h" });
  expect(io.bodyReads).toBe(1); expect(report.configTrusted).toBe(true); expect(report.categories.map(row => row.category)).not.toContain("replacement category");
  expect(readFileSync(custom)).toEqual(io.swapBytes); expect(verifyComplianceMapsSignature(f.workspace, custom).valid).toBe(false);
});

test("retained sync maps API refuses a locked key before replacing the actual prior pair", () => {
  const f = fixture(), before = f.pair(); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
  try { expect(() => initComplianceMaps(f.workspace)).toThrow(); expect(f.pair()).toEqual(before); }
  finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  initComplianceMaps(f.workspace); healthy(f);
});

test("an unreadable sidecar leaves the actual parsed report explicitly untrusted instead of failing its body load", async () => {
  const f = fixture(), input = defaultComplianceMapsFile(); await initComplianceMapsAsync(f.workspace, input); const signature = readFileSync(f.path + ".sig");
  rmSync(f.path + ".sig"); mkdirSync(f.path + ".sig");
  try {
    const framework = normalizeFrameworkName(input.complianceMaps.mappings[0]!.framework);
    if (framework === null) throw new Error("invalid owned map fixture framework");
    const report = generateComplianceReport({ workspace: f.workspace, framework, window: "1h" });
    expect(report.configTrusted).toBe(false); expect(report.configReason).toBe("invalid compliance maps signature");
  } finally { rmSync(f.path + ".sig", { recursive: true }); writeFileSync(f.path + ".sig", signature); }
  healthy(f);
});

test("malformed bytes from the actual file-provider Sign boundary refuse without publishing or unsigned fallback", async () => {
  const f = fixture(); await initComplianceMapsAsync(f.workspace); const before = f.pair();
  vi.spyOn(f.provider, "sign").mockResolvedValueOnce(Buffer.alloc(64));
  await expect(initComplianceMapsAsync(f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED", provider: "file" });
  expect(f.pair()).toEqual(before); await initComplianceMapsAsync(f.workspace); healthy(f);
});

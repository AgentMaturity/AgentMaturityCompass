import { randomUUID, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync } from "../../src/crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../../src/crypto/signing/signatureEnvelope.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { KeyProviderError } from "../../src/keys/provider.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
const PASS = "policy-purpose-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [], DIGEST = sha256Hex("actual prepared installed lock bytes");
afterEach(() => {
  boundary.call = undefined; vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-policy-purpose-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); return { root, workspace };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function bind(f: ReturnType<typeof fixture>) {
  const a = AWS_ARN("policy-a-" + randomUUID()), b = AWS_ARN("policy-b-" + randomUUID()), key = fakeKey("p256"), next = fakeKey("p256");
  const anchor = getSigningPublicKeyPem(f.workspace, "config-signature"), fake = awsFake({ [a]: key, [b]: next });
  const control: { unavailable: boolean; corrupt: boolean; afterSign?: () => Promise<void> } = { unavailable: false, corrupt: false };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.unavailable) throw Object.assign(new Error("secret service failure"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign") {
      if (control.corrupt) { const bytes = Buffer.from(answer.Signature as Uint8Array); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; answer.Signature = bytes; }
      await control.afterSign?.();
    }
    return answer;
  };
  const candidate = (id = a) => { const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } }; return Buffer.from(YAML.stringify(config)); };
  await transitionConfigSignatureProvider(f.workspace, candidate(), { passphrase: PASS });
  const pause = () => { const entered = deferred(), gate = deferred(); control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await gate.promise; }; return { entered, gate }; };
  return { ...f, a, b, key, next, anchor, fake, control, candidate, pause, pem: publicPem(key) };
}
function expectReal(signed: Awaited<ReturnType<typeof signDigestWithPolicyAsync>>, digest: string, pem: string) {
  expect(signed.digestSha256).toBe(digest); expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  expect(signed.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint: sha256Hex(pem), signer: { type: "VAULT", attestationLevel: "SOFTWARE" } });
  expect(verifySignatureEnvelope(digest, signed.envelope!, { trustedPublicKeys: [pem], requireTrustedKey: true })).toBe(true);
}
async function entered(pause: { entered: ReturnType<typeof deferred> }, pending: Promise<unknown>) {
  expect(await Promise.race([pause.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
}

test("the awaitable local policy path independently preserves the exact default Ed25519 envelope and JSON bytes", async () => {
  const f = fixture(), now = Date.now(), pem = getSigningPublicKeyPem(f.workspace, "config-signature"), key = getSigningKey(f.workspace, "config-signature");
  vi.spyOn(Date, "now").mockReturnValue(now); const signature = sign(null, Buffer.from(DIGEST, "hex"), key).toString("base64");
  const expected = { digestSha256: DIGEST, signature, signedTs: now, signer: "auditor", envelope: { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(pem).toString("base64"),
    fingerprint: sha256Hex(pem), sigB64: signature, signedTs: now, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } };
  expect(JSON.stringify(signDigestWithPolicy({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST }), null, 2)).toBe(JSON.stringify(expected, null, 2));
  expect(JSON.stringify(await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST }), null, 2)).toBe(JSON.stringify(expected, null, 2));
});

test("the selected policy descriptor and actual signature name the committed provider rather than its vault history anchor", async () => {
  const f = await bind(fixture()), selected = describePolicySigner(f.workspace, "INSTALLED_LOCK"), before = f.fake.requests.filter(row => row.operation === "Sign").length;
  expect(getSigningPublicKeyPem(f.workspace, "config-signature")).toBe(f.anchor); expect(f.pem).not.toBe(f.anchor);
  expect(selected).toMatchObject({ kind: "INSTALLED_LOCK", mode: "VAULT", algorithm: "ecdsa-p256-sha256", publicKeyPem: f.pem, fingerprint: sha256Hex(f.pem) });
  lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
  const signed = await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST, expectedSigner: selected }); expectReal(signed, DIGEST, f.pem);
  expect(verifySignatureEnvelope(DIGEST, signed.envelope!, { trustedPublicKeys: [f.anchor], requireTrustedKey: true })).toBe(false);
  const calls = f.fake.requests.filter(row => row.operation === "Sign").slice(before); expect(calls).toHaveLength(1); expect(Buffer.from(calls[0]!.input.Message as Uint8Array)).toEqual(Buffer.from(DIGEST, "hex"));
  expect(() => signDigestWithPolicy({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST })).toThrow();
});

test("an expected old anchor descriptor refuses before remote Sign and the independent actual descriptor remains usable", async () => {
  const f = await bind(fixture()), before = f.fake.requests.filter(row => row.operation === "Sign").length;
  await expect(signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST, expectedSigner: {
    kind: "INSTALLED_LOCK", mode: "VAULT", algorithm: "ed25519", publicKeyPem: f.anchor, fingerprint: sha256Hex(f.anchor) } })).rejects.toThrow("policy signing response does not match");
  expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before);
  expectReal(await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST }), DIGEST, f.pem);
});

test.each(["unavailable", "corrupt"] as const)("actual %s provider refusal never falls back to the vault anchor", async failure => {
  const f = await bind(fixture()); f.control[failure] = true;
  await expect(signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST })).rejects.toBeInstanceOf(KeyProviderError);
  f.control[failure] = false; expectReal(await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST }), DIGEST, f.pem);
});

test("owned digest and expected descriptor cannot mutate during the actual provider await", async () => {
  const f = await bind(fixture()), selected = describePolicySigner(f.workspace, "INSTALLED_LOCK"), params = { workspace: f.workspace, kind: "INSTALLED_LOCK" as const, digestHex: DIGEST, expectedSigner: selected };
  const pause = f.pause(), pending = signDigestWithPolicyAsync(params);
  try {
    await entered(pause, pending); params.digestHex = sha256Hex("changed caller preimage"); selected.publicKeyPem = f.anchor; selected.fingerprint = sha256Hex(f.anchor); pause.gate.resolve();
    expectReal(await pending, DIGEST, f.pem);
  } finally { pause.gate.resolve(); await Promise.allSettled([pending]); }
});

test("current editable algorithm refusal arriving during Sign refuses the prepared result and exact restoration permits a fresh one", async () => {
  const f = await bind(fixture()), path = join(f.workspace, ".amc", "amc.config.yaml"), original = readFileSync(path), pause = f.pause();
  const pending = signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST });
  try {
    await entered(pause, pending); const config = YAML.parse(original.toString()); config.keys.algorithmPolicy = { allowed: ["ed25519"] }; writeFileSync(path, YAML.stringify(config)); pause.gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  } finally { pause.gate.resolve(); await Promise.allSettled([pending]); writeFileSync(path, original); }
  expectReal(await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST }), DIGEST, f.pem);
});

test("real owner rebind during Sign refuses stale policy authority while the next descriptor and actual provider succeed", async () => {
  const f = await bind(fixture()), pause = f.pause(), pending = signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST });
  try {
    await entered(pause, pending); await transitionConfigSignatureProvider(f.workspace, f.candidate(f.b), { passphrase: PASS }); pause.gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  } finally { pause.gate.resolve(); await Promise.allSettled([pending]); }
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS);
  const selected = describePolicySigner(f.workspace, "INSTALLED_LOCK"); expect(selected.publicKeyPem).toBe(publicPem(f.next));
  expectReal(await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST, expectedSigner: selected }), DIGEST, publicPem(f.next));
});

test("async no-sign arriving during the actual provider await refuses the signed answer before return and restoration permits a real positive", async () => {
  const f = await bind(fixture()), pause = f.pause(), pending = signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST });
  try {
    await entered(pause, pending); vi.stubEnv("AMC_NO_SIGN", "1"); pause.gate.resolve();
    await expect(pending).rejects.toThrow("no-sign mode does not authorize policy signing");
  } finally { pause.gate.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); }
  expectReal(await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: DIGEST }), DIGEST, f.pem);
});

import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { lowS, signingKeyId } from "../src/keys/algorithmPolicy.js";
import { callProviderSync, type BridgeRequest } from "../src/keys/providerBridge.js";
import { KeyProviderError, type KeyDescription } from "../src/keys/provider.js";
import { exportNotaryAttestationBundle, signNotaryAttestation, verifyNotaryAttestationBundle } from "../src/notary/notaryAttestation.js";
import { appendNotaryLogEntry, initNotaryLog, verifyNotaryLog } from "../src/notary/notaryLog.js";
import { loadNotarySigner, notarySignResponse } from "../src/notary/notarySigner.js";
import { verifyNotaryAttestResponse, verifyNotarySignResponse } from "../src/notary/notaryVerify.js";
import { sha256Hex } from "../src/utils/hash.js";
import { loadTrustContext } from "../src/trust/trustContext.js";
import { initWorkspace } from "../src/workspace.js";
import { enableNotaryTrust } from "../src/trust/trustConfig.js";
import { signDigestWithPolicy, verifySignedDigest } from "../src/crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../src/crypto/signing/signatureEnvelope.js";
import { notaryLogPath, notarySealPath, notarySealSigPath } from "../src/notary/notaryConfigStore.js";
import { canonicalize } from "../src/utils/json.js";

// Replace only the outer policy signer's synchronous HTTP transport. All keys, signatures,
// config/history admission and verifiers in the test remain real; other child calls delegate.
const transport = vi.hoisted(() => ({ response: null as unknown, request: null as unknown }));
vi.mock("node:child_process", async importOriginal => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, spawnSync: ((...args: unknown[]) => {
    const argv = args[1];
    if (transport.response !== null && Array.isArray(argv) && argv[0] === "-e"
      && typeof argv[1] === "string" && argv[1].includes("const params = JSON.parse(process.argv[1])")) {
      transport.request = JSON.parse(String(argv[2]));
      return { status: 0, stdout: JSON.stringify({ status: 200, body: JSON.stringify(transport.response) }), stderr: "" };
    }
    return Reflect.apply(original.spawnSync, original, args);
  }) as typeof original.spawnSync };
});

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const notaryDir = () => { const dir = mkdtempSync(join(tmpdir(), "amc-notary-kp-")); dirs.push(dir); return dir; };
const REF = { provider: "aws-kms" as const, id: "arn:aws:kms:eu-west-1:111122223333:key/notary" };

/** A synchronous stand-in for the provider bridge child: one local key, described as `protection`. */
function bridgeFor(kind: "ed25519" | "p256", protection: KeyDescription["protection"], opts: { badSignature?: boolean; claims?: unknown; encoding?: "der" | "high-s"; wrongKey?: boolean } = {}) {
  const pair = kind === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
  const wrong = opts.wrongKey ? (kind === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" })) : null;
  const publicKeyPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  const description: KeyDescription = { ref: REF, algorithm: kind === "ed25519" ? "ed25519" : "ecdsa-p256-sha256", publicKeyPem, keyId: signingKeyId(publicKeyPem)!,
    protection, protectionBasis: "provider-metadata", exportable: false };
  const calls: BridgeRequest[] = [];
  const bridge = (request: BridgeRequest) => {
    calls.push(request);
    if (request.op === "describe") return { description, ...(opts.claims ? { claims: opts.claims } : {}) };
    const key = wrong?.privateKey ?? pair.privateKey;
    let signature = opts.badSignature ? Buffer.alloc(64, 7) : kind === "ed25519" ? sign(null, Buffer.from(request.messageB64, "base64"), key)
      : opts.encoding === "der" ? sign("sha256", Buffer.from(request.messageB64, "base64"), { key, dsaEncoding: "der" })
      : lowS(sign("sha256", Buffer.from(request.messageB64, "base64"), { key, dsaEncoding: "ieee-p1363" }));
    if (kind === "p256" && opts.encoding === "high-s") {
      const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
      const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
      signature = Buffer.concat([signature.subarray(0, 32), Buffer.from((order - s).toString(16).padStart(64, "0"), "hex")]);
    }
    return { description, signatureB64: signature.toString("base64") };
  };
  return { bridge, calls, publicKeyPem };
}

describe("notary KEY_PROVIDER backend (P2-08)", () => {
  it("takes its attestation level and basis from the provider's description, never from a hardware claim", () => {
    const hsm = bridgeFor("ed25519", "hsm", { claims: { hardware: false } });
    const signer = loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: hsm.bridge });
    expect(signer.backendType()).toBe("KEY_PROVIDER");
    expect(signer.attestationLevel()).toBe("HARDWARE");
    expect(signer.attestationBasis()).toBe("provider-metadata");
    expect(signer.pubkeyPem()).toBe(hsm.publicKeyPem);
    expect(signer.pubkeyFingerprint()).toBe(sha256Hex(Buffer.from(hsm.publicKeyPem, "utf8")));
    const software = loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: bridgeFor("ed25519", "software", { claims: { hardware: true } }).bridge });
    expect(software.attestationLevel()).toBe("SOFTWARE");
    const unknown = loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: bridgeFor("ed25519", "unknown").bridge });
    expect(unknown.attestationLevel()).toBe("SOFTWARE");
  });

  it.each(["ed25519", "p256"] as const)("signs through a %s provider; a response that does not verify is refused", kind => {
    const hsm = bridgeFor(kind, "hsm");
    const signer = loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: hsm.bridge });
    const payload = Buffer.from("notary payload");
    const signed = signer.sign("MERKLE_ROOT", payload);
    expect(signed).toMatchObject({ backend: "KEY_PROVIDER", attestationLevel: "HARDWARE", attestationBasis: "provider-metadata", pubkeyPem: hsm.publicKeyPem });
    expect(hsm.calls.at(-1)).toEqual({ op: "sign", ref: REF, messageB64: payload.toString("base64") });
    const response = { v: 1, kind: "MERKLE_ROOT", payloadSha256: sha256Hex(payload), signatureB64: signed.signatureB64, pubkeyPem: signed.pubkeyPem,
      pubkeyFingerprint: signed.pubkeyFingerprint, signedTs: signed.signedTs, backend: signed.backend, attestationLevel: signed.attestationLevel,
      attestationBasis: signed.attestationBasis, claims: signed.claims };
    expect(verifyNotarySignResponse(response, payload)).toMatchObject({ ok: true });
    const liar = loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: bridgeFor("ed25519", "hsm", { badSignature: true }).bridge });
    expect(() => liar.sign("MERKLE_ROOT", payload)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
  });

  it.each([{ encoding: "der" as const }, { encoding: "high-s" as const }, { wrongKey: true }])("refuses an unchecked P-256 answer %j at both signer and response verifier", opts => {
    const fake = bridgeFor("p256", "hsm", opts);
    const signer = loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: fake.bridge });
    const payload = Buffer.from("notary payload");
    expect(() => signer.sign("MERKLE_ROOT", payload)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    const answer = fake.bridge({ op: "sign", ref: REF, messageB64: payload.toString("base64") });
    const response = { v: 1, kind: "MERKLE_ROOT", payloadSha256: sha256Hex(payload), signatureB64: answer.signatureB64!, pubkeyPem: fake.publicKeyPem,
      pubkeyFingerprint: signingKeyId(fake.publicKeyPem)!, signedTs: Date.now(), backend: "KEY_PROVIDER", attestationLevel: "HARDWARE", attestationBasis: "provider-metadata", claims: {} };
    expect(verifyNotarySignResponse(response, payload).ok).toBe(false);
  });

  it.each(["ed25519", "p256"] as const)("keeps the log and attestation bundle verifiable with a provider-held %s key", kind => {
    const dir = notaryDir();
    const signer = loadNotarySigner({ notaryDir: dir, backend: { type: "KEY_PROVIDER", ref: REF }, bridge: bridgeFor(kind, "hsm").bridge });
    initNotaryLog(dir, signer);
    appendNotaryLogEntry({ notaryDir: dir, signer, requestId: "r1", kind: "MERKLE_ROOT", payloadSha256: "a".repeat(64) });
    expect(verifyNotaryLog(dir)).toMatchObject({ ok: true, count: 1 });
    const attestation = signNotaryAttestation({ signer });
    expect(attestation.attestation.notary).toMatchObject({ backend: "KEY_PROVIDER", attestationLevel: "HARDWARE", attestationBasis: "provider-metadata" });
    expect(verifyNotaryAttestResponse(attestation).ok).toBe(true);
    const publicPath = join(dir, "pinned.pub");
    writeFileSync(publicPath, signer.pubkeyPem());
    const outFile = join(dir, "attestation.tgz");
    exportNotaryAttestationBundle({ signer, outFile });
    const trust = loadTrustContext({ amcHome: dir, pubkey: { path: publicPath, purposes: ["notary"] } });
    expect(verifyNotaryAttestationBundle(outFile, trust).ok).toBe(true);
    const signed = signer.sign("MERKLE_ROOT", Buffer.from("response"));
    expect(notarySignResponse("MERKLE_ROOT", sha256Hex("response"), signed)).toMatchObject({ attestationBasis: "provider-metadata" });
  });

  it("verifies a legacy log without basis, then appends a basis-bearing entry without changing its predecessor", () => {
    const dir = notaryDir();
    const signer = loadNotarySigner({ notaryDir: dir, backend: { type: "KEY_PROVIDER", ref: REF }, bridge: bridgeFor("ed25519", "hsm").bridge });
    initNotaryLog(dir, signer);
    const old = { v: 1, ts: Date.now(), requestId: "old", kind: "MERKLE_ROOT", payloadSha256: "a".repeat(64), signerFingerprint: signer.pubkeyFingerprint(), attestationLevel: "HARDWARE", prevHash: "" };
    const oldHash = sha256Hex(canonicalize(old));
    writeFileSync(notaryLogPath(dir), `${JSON.stringify({ ...old, entryHash: oldHash })}\n`);
    const seal = JSON.stringify({ v: 1, ts: Date.now(), lastHash: oldHash, signerFingerprint: signer.pubkeyFingerprint() }, null, 2);
    writeFileSync(notarySealPath(dir), seal);
    const digest = sha256Hex(seal);
    const signed = signer.sign("NOTARY_LOG_SEAL", Buffer.from(digest, "hex"));
    writeFileSync(notarySealSigPath(dir), JSON.stringify({ digestSha256: digest, signature: signed.signatureB64, signedTs: signed.signedTs, signerFingerprint: signed.pubkeyFingerprint, pubkeyPem: signed.pubkeyPem }));
    expect(verifyNotaryLog(dir)).toMatchObject({ ok: true, count: 1, lastHash: oldHash });
    const next = appendNotaryLogEntry({ notaryDir: dir, signer, requestId: "new", kind: "MERKLE_ROOT", payloadSha256: "b".repeat(64) });
    expect(next).toMatchObject({ prevHash: oldHash, attestationBasis: "provider-metadata" });
    expect(verifyNotaryLog(dir)).toMatchObject({ ok: true, count: 2 });
  });

  it("carries a real P-256 notary signature and basis through the production policy envelope and verifier", async () => {
    const root = notaryDir();
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-p256-notary-policy-passphrase");
    try {
      initWorkspace({ workspacePath: root });
      const fake = bridgeFor("p256", "hsm");
      const signer = loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: fake.bridge });
      const publicPath = join(root, "notary-pin.pub");
      writeFileSync(publicPath, signer.pubkeyPem());
      await enableNotaryTrust({ workspace: root, baseUrl: "http://127.0.0.1:1", pinPubkeyPath: publicPath, requiredAttestationLevel: "HARDWARE" });
      const digestHex = sha256Hex("provider-backed policy envelope");
      const bytes = Buffer.from(digestHex, "hex");
      const signed = signer.sign("MERKLE_ROOT", bytes);
      transport.response = notarySignResponse("MERKLE_ROOT", sha256Hex(bytes), signed);
      const result = signDigestWithPolicy({ workspace: root, kind: "MERKLE_ROOT", digestHex });
      expect(result.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", signer: { type: "NOTARY", attestationLevel: "HARDWARE", attestationBasis: "provider-metadata" } });
      expect(verifySignedDigest({ workspace: root, digestHex, signed: result })).toBe(true);
      expect(verifySignatureEnvelope(digestHex, { ...result.envelope!, alg: "ed25519" })).toBe(false);
      expect(JSON.parse((transport.request as { body: string }).body)).toMatchObject({ payloadB64: bytes.toString("base64"), payloadSha256: sha256Hex(bytes) });
      // The external signer's descriptive basis must survive the same production envelope path.
      transport.response = { ...(transport.response as object), backend: "EXTERNAL_SIGNER", attestationBasis: "provider-reported" };
      expect(signDigestWithPolicy({ workspace: root, kind: "MERKLE_ROOT", digestHex }).envelope?.signer.attestationBasis).toBe("provider-reported");
    } finally {
      transport.response = null;
      transport.request = null;
      vi.unstubAllEnvs();
    }
  });

  it("labels an external signer's hardware claim provider-reported", () => {
    const dir = notaryDir();
    const script = resolve(process.cwd(), "scripts", "fake-external-signer.mjs");
    const keyFile = join(dir, "fake.key");
    expect(spawnSync(process.execPath, [script, "keygen", "--private", keyFile, "--public", join(dir, "fake.pub")]).status).toBe(0);
    const prior = process.env.AMC_FAKE_SIGNER_PRIVATE_KEY_FILE;
    process.env.AMC_FAKE_SIGNER_PRIVATE_KEY_FILE = keyFile;
    try {
      const signer = loadNotarySigner({ notaryDir: dir, backend: { type: "EXTERNAL_SIGNER", command: process.execPath, args: [script] } });
      expect(signer.attestationLevel()).toBe("HARDWARE");
      expect(signer.attestationBasis()).toBe("provider-reported");
      expect(signer.sign("MERKLE_ROOT", Buffer.from("x"))).toMatchObject({ attestationLevel: "HARDWARE", attestationBasis: "provider-reported" });
    } finally {
      if (prior === undefined) delete process.env.AMC_FAKE_SIGNER_PRIVATE_KEY_FILE; else process.env.AMC_FAKE_SIGNER_PRIVATE_KEY_FILE = prior;
    }
  });

  it.each(["KEY_PROVIDER_NOT_INSTALLED", "KEY_PROVIDER_AUTH_FAILED", "KEY_PROVIDER_KEY_REFUSED", "KEY_PROVIDER_UNAVAILABLE"] as const)("the provider bridge maps %s from an owned child without copying stderr", code => {
    const script = join(notaryDir(), "fixed-failure.mjs");
    const secret = "PIN=642807 /private/token/module.so https://private-kms.example account-998877";
    const reply = JSON.stringify({ ok: false, code, detail: "describe: synthetic fixed failure" }) + "\n";
    writeFileSync(script, `import { writeSync } from "node:fs"; writeSync(2, ${JSON.stringify(secret)}); writeSync(1, ${JSON.stringify(reply)});`);
    const error = (() => { try { callProviderSync({ op: "describe", ref: REF }, { script }); } catch (e) { return e; } return null; })();
    expect(error).toBeInstanceOf(KeyProviderError);
    expect(error).toMatchObject({ code, message: `${code}: aws-kms: describe: synthetic fixed failure` });
    expect(String(error)).not.toMatch(/642807|private-kms|account-998877|module\.so/);
  });

  it("the built provider bridge refuses file refs without opening any cloud provider", () => {
    const script = resolve(process.cwd(), "dist", "keys", "providerBridge.js");
    expect(() => callProviderSync({ op: "describe", ref: { provider: "file", id: "artifact-seal" } }, { script })).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    expect(() => callProviderSync({ op: "describe", ref: REF }, { script: join(notaryDir(), "not-created.mjs") })).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_UNAVAILABLE" }));
  });
});

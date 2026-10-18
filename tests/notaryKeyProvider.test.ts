import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { signingKeyId } from "../src/keys/algorithmPolicy.js";
import { callProviderSync, type BridgeRequest } from "../src/keys/providerBridge.js";
import { KeyProviderError, type KeyDescription } from "../src/keys/provider.js";
import { signNotaryAttestation } from "../src/notary/notaryAttestation.js";
import { appendNotaryLogEntry, initNotaryLog, verifyNotaryLog } from "../src/notary/notaryLog.js";
import { loadNotarySigner } from "../src/notary/notarySigner.js";
import { verifyNotarySignResponse } from "../src/notary/notaryVerify.js";
import { sha256Hex } from "../src/utils/hash.js";

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const notaryDir = () => { const dir = mkdtempSync(join(tmpdir(), "amc-notary-kp-")); dirs.push(dir); return dir; };
const REF = { provider: "aws-kms" as const, id: "arn:aws:kms:eu-west-1:111122223333:key/notary" };

/** A synchronous stand-in for the provider bridge child: one local key, described as `protection`. */
function bridgeFor(kind: "ed25519" | "p256", protection: KeyDescription["protection"], opts: { badSignature?: boolean; claims?: unknown } = {}) {
  const pair = kind === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  const description: KeyDescription = { ref: REF, algorithm: kind === "ed25519" ? "ed25519" : "ecdsa-p256-sha256", publicKeyPem, keyId: signingKeyId(publicKeyPem)!,
    protection, protectionBasis: "provider-metadata", exportable: false };
  const calls: BridgeRequest[] = [];
  const bridge = (request: BridgeRequest) => {
    calls.push(request);
    if (request.op === "describe") return { description, ...(opts.claims ? { claims: opts.claims } : {}) };
    const signature = opts.badSignature ? Buffer.alloc(64, 7) : kind === "ed25519" ? sign(null, Buffer.from(request.messageB64, "base64"), pair.privateKey)
      : sign("sha256", Buffer.from(request.messageB64, "base64"), { key: pair.privateKey, dsaEncoding: "ieee-p1363" });
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

  it("signs through the provider; a response that does not verify is refused", () => {
    const hsm = bridgeFor("ed25519", "hsm");
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

  it("refuses an ECDSA notary key: artifact envelopes signed through the notary stay Ed25519 in this release", () => {
    expect(() => loadNotarySigner({ notaryDir: notaryDir(), backend: { type: "KEY_PROVIDER", ref: REF }, bridge: bridgeFor("p256", "hsm").bridge }))
      .toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
  });

  it("keeps the notary log and attestations verifiable with a provider-held key", () => {
    const dir = notaryDir();
    const signer = loadNotarySigner({ notaryDir: dir, backend: { type: "KEY_PROVIDER", ref: REF }, bridge: bridgeFor("ed25519", "hsm").bridge });
    initNotaryLog(dir, signer);
    appendNotaryLogEntry({ notaryDir: dir, signer, requestId: "r1", kind: "MERKLE_ROOT", payloadSha256: "a".repeat(64) });
    expect(verifyNotaryLog(dir)).toMatchObject({ ok: true, count: 1 });
    const attestation = signNotaryAttestation({ signer });
    expect(attestation.attestation.notary).toMatchObject({ backend: "KEY_PROVIDER", attestationLevel: "HARDWARE", attestationBasis: "provider-metadata" });
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

  it("the provider bridge child reports failures as codes only (built bridge, no SDK installed, no network)", () => {
    const script = resolve(process.cwd(), "dist", "keys", "providerBridge.js");
    const error = (() => { try { callProviderSync({ op: "describe", ref: REF }, { script }); } catch (e) { return e; } return null; })();
    expect(error).toBeInstanceOf(KeyProviderError);
    expect(error).toMatchObject({ code: "KEY_PROVIDER_NOT_INSTALLED", message: expect.stringContaining("@aws-sdk/client-kms") });
    expect(() => callProviderSync({ op: "describe", ref: { provider: "file", id: "artifact-seal" } }, { script })).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    expect(() => callProviderSync({ op: "describe", ref: REF }, { script: join(tmpdir(), "amc-no-such-bridge.js") })).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_UNAVAILABLE" }));
  });
});

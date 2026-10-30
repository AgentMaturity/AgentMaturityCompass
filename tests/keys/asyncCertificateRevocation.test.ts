import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { revokeCertificate, revokeCertificateAsync, verifyRevocation } from "../../src/assurance/certificate.js";
import { handleCryptoRoute } from "../../src/api/cryptoRouter.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/purposeKeys.js";
import { readHistory } from "../../src/keys/signingKeys.js";
import { assertKeysetComplete, commitKeyset } from "../../src/keys/keyset.js";
import { buildKeyHistoryEntry } from "../../src/crypto/keyHistoryChain.js";
import { sealKeyHistory } from "../../src/crypto/keyHistoryEnvelope.js";
import { markWrittenHistories, lockVault, purposeKeyPaths, vaultPaths } from "../../src/vault/vault.js";
import { logHistoryRevisions } from "../../src/keys/anchors.js";
import { loadTrustContext, withPins } from "../../src/trust/trustContext.js";
import { transparencyLogPath } from "../../src/transparency/logChain.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";
import { awsKmsProvider, type KmsCall } from "../../src/keys/providers/awsKms.js";

const sdk = vi.hoisted(() => ({ call: null as KmsCall | null, afterSign: null as (() => void | Promise<void>) | null }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const real = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...real, awsKmsProvider: (call?: KmsCall) => real.awsKmsProvider(call ?? (async (...args) => {
    if (!sdk.call) throw new Error("owned revocation fake SDK missing");
    const answer = await sdk.call(...args);
    if (args[0] === "Sign" && sdk.afterSign) { const change = sdk.afterSign; sdk.afterSign = null; await change(); }
    return answer;
  })) };
});
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); sdk.call = null; sdk.afterSign = null;
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-cert-revoke-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const content = join(root, "owned-certificate-input"); mkdirSync(content);
  // inspectCertificate consumes this real archive. This fixture does not qualify certificate issuance.
  writeFileSync(join(content, "cert.json"), JSON.stringify({ certId: "owned-certificate", agentId: "default" }));
  const certFile = join(root, "owned.amccert");
  expect(spawnSync("tar", ["-czf", certFile, "-C", content, "cert.json"], { encoding: "utf8" }).status).toBe(0);
  return { root, certFile };
}
/** Real owner keyset/history state: current CLI binder deliberately still refuses this purpose until lease integration. */
async function ownerProvider(root: string) {
  const local = getSigningPublicKeyPem(root, "revocation-list"), privateKey = getSigningKey(root, "revocation-list");
  const prior = readHistory(root, "revocation-list", local)!;
  const id = AWS_ARN(randomUUID()), failure = { fail: undefined as string | undefined };
  const fake = awsFake({ [id]: fakeKey("p256") }, failure); sdk.call = fake.call;
  const provider = awsKmsProvider(fake.call), description = await provider.describe({ provider: "aws-kms", id });
  const envelope = sealKeyHistory("revocation-list", [...prior.entries, buildKeyHistoryEntry(description.publicKeyPem, prior.entries, "imported")], privateKey, prior.revision + 1);
  const path = join(root, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { refs: { "revocation-list": { provider: "aws-kms", id } } };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(root);
  const current = assertKeysetComplete(root)!;
  const writes = [
    { path: join(vaultPaths(root).keysDir, "revocation-list-provider.pub"), bytes: description.publicKeyPem, mode: 0o644 },
    { path: purposeKeyPaths(root, "revocation-list").historyFile, bytes: JSON.stringify(envelope, null, 2), mode: 0o600 }
  ];
  commitKeyset(root, { expectedGeneration: current.generation, keys: current.keys, writes, providers: { ...current.providers,
    "revocation-list": { provider: "aws-kms", id, keyId: description.keyId, algorithm: description.algorithm, protection: description.protection, protectionBasis: description.protectionBasis } } });
  logHistoryRevisions(root, markWrittenHistories(root, writes));
  const trust = withPins(loadTrustContext({ amcHome: join(root, "owned-empty-home"), env: {} }),
    [{ keyId: description.keyId, purposes: ["revocation-list"], origin: "owned fixture operator" }]);
  return { description, fake, failure, trust, configPath: path, config };
}
async function api(root: string, certFile: string, outFile: string) {
  const req = Readable.from([Buffer.from(JSON.stringify({ certFile, reason: "owned fixture", outFile }))]) as IncomingMessage;
  req.headers = { "content-type": "application/json" }; req.method = "POST";
  let status = 0, body = "";
  const res = { writeHead(code: number) { status = code; return this; }, end(value: string) { body = value; } } as unknown as ServerResponse;
  expect(await handleCryptoRoute("/api/v1/crypto/cert/revoke", "POST", req, res, root)).toBe(true);
  return { status, body: JSON.parse(body) };
}

describe("actual async certificate revocation runtime", () => {
  it("keeps default Ed25519 revocation bytes identical to the synchronous SDK path", async () => {
    const { root, certFile } = fixture(), now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const params = { workspace: root, certFile, reason: "owned fixture" };
    const first = revokeCertificate({ ...params, outFile: "sync.amcrevoke" });
    const second = await revokeCertificateAsync({ ...params, outFile: "async.amcrevoke" });
    expect(readFileSync(second.outFile)).toEqual(readFileSync(first.outFile));
  });

  it("routes the actual HTTP producer through a real P256 provider and independently verifies its output", async () => {
    const { root, certFile } = fixture(), provider = await ownerProvider(root);
    const before = provider.fake.requests.filter(row => row.operation === "Sign").length;
    const result = await api(root, certFile, "api.amcrevoke");
    expect(result.status).toBe(201);
    const payload = JSON.parse(readFileSync(result.body.data.outFile, "utf8"));
    expect(payload.auditorPub).toBe(provider.description.publicKeyPem);
    expect(payload.issuerFingerprint).toBe(provider.description.keyId);
    expect(provider.fake.requests.filter(row => row.operation === "Sign").length).toBe(before + 1);
    expect(verifyRevocation(result.body.data.outFile, provider.trust).ok).toBe(true);
    expect(verifyRevocation(result.body.data.outFile, loadTrustContext({ amcHome: join(root, "other-empty-home"), env: {} })).ok).toBe(false);
  });

  it("returns a typed sanitized provider refusal with no output or transparency append", async () => {
    const { root, certFile } = fixture(), provider = await ownerProvider(root);
    const before = readFileSync(transparencyLogPath(root));
    provider.failure.fail = "TimeoutError";
    const result = await api(root, certFile, "failed.amcrevoke");
    expect(result.status).toBe(503);
    expect(result.body.error).toContain("KEY_PROVIDER_UNAVAILABLE");
    expect(JSON.stringify(result.body)).not.toMatch(/kms\.internal|111122223333|PIN=1234/);
    expect(existsSync(join(root, "failed.amcrevoke"))).toBe(false);
    expect(readFileSync(transparencyLogPath(root))).toEqual(before);
  });

  it("refuses a current algorithm-policy change after real remote signing before writing the file", async () => {
    const { root, certFile } = fixture(), provider = await ownerProvider(root);
    const before = readFileSync(transparencyLogPath(root));
    sdk.afterSign = () => {
      provider.config.keys.algorithmPolicy = { allowed: ["ed25519"] };
      writeFileSync(provider.configPath, YAML.stringify(provider.config)); signAmcConfig(root);
    };
    await expect(revokeCertificateAsync({ workspace: root, certFile, reason: "owned fixture", outFile: "stale.amcrevoke" }))
      .rejects.toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    expect(existsSync(join(root, "stale.amcrevoke"))).toBe(false);
    expect(readFileSync(transparencyLogPath(root))).toEqual(before);
  });

  it("preserves another publisher's changed output while remote signing was in flight", async () => {
    const { root, certFile } = fixture(); await ownerProvider(root);
    const path = join(root, "race.amcrevoke"), other = "owned competing publisher bytes";
    sdk.afterSign = () => { writeFileSync(path, other); };
    await expect(revokeCertificateAsync({ workspace: root, certFile, reason: "owned fixture", outFile: "race.amcrevoke" })).rejects.toThrow(/inputs changed/);
    expect(readFileSync(path, "utf8")).toBe(other);
  });
});


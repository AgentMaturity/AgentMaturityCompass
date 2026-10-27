import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { getSigningKey } from "../../src/crypto/keys.js";
import * as policy from "../../src/crypto/signing/signer.js";
import { generateTrustCertificate, verifyTrustCertificateEnvelope, type TrustCertificateEnvelope } from "../../src/cert/trustCertificate.js";
import { createBackup, verifyBackup } from "../../src/ops/backup/backupEngine.js";
import { buildIndustryPackAudit, signIndustryPackAudit, verifyIndustryPackAuditSignature } from "../../src/domains/industryPackAudit.js";
import { getPackById } from "../../src/domains/industryPacks.js";
import { enableNotaryTrust } from "../../src/trust/trustConfig.js";
import { loadNotarySigner, notarySignResponse } from "../../src/notary/notarySigner.js";
import type { BridgeRequest } from "../../src/keys/providerBridge.js";
import type { KeyDescription } from "../../src/keys/provider.js";
import { lowS, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { withPins } from "../../src/trust/index.js";
import { extractValidatedTarGzipArchive } from "../../src/security/safeTarArchive.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { workspaceKeyPem, workspaceKeyTrust } from "../helpers/trustContext.js";

// Replace only the production policy signer's synchronous HTTP bridge. All key generation, provider-description
// checks, NotarySigner, signatures, signed trust config/history, descriptor resolution, producers and verifiers are real.
const transport = vi.hoisted(() => ({ handler: null as null | ((body: string) => unknown), requests: [] as Array<{ kind: string; payloadB64: string }> }));
vi.mock("node:child_process", async importOriginal => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, spawnSync: ((...args: unknown[]) => {
    const argv = args[1];
    if (transport.handler !== null && Array.isArray(argv) && argv[0] === "-e" && typeof argv[1] === "string"
      && argv[1].includes("const params = JSON.parse(process.argv[1])")) {
      const request = JSON.parse(String(argv[2])) as { body: string };
      transport.requests.push(JSON.parse(request.body));
      return { status: 0, stdout: JSON.stringify({ status: 200, body: JSON.stringify(transport.handler(request.body)) }), stderr: "" };
    }
    return Reflect.apply(original.spawnSync, original, args);
  }) as typeof original.spawnSync };
});
const roots: string[] = [];
const fresh = () => { const root = mkdtempSync(join(tmpdir(), "amc-producer-signer-")); roots.push(root); return root; };
const workspace = () => { const root = fresh(); initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); return root; };
afterEach(() => { transport.handler = null; transport.requests = []; vi.unstubAllEnvs();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

async function installNotary(root: string) {
  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = keys.publicKey.export({ format: "pem", type: "spki" }).toString(); const id = signingKeyId(pem)!;
  const ref = { provider: "aws-kms" as const, id: "synthetic-owned-notary" };
  const description: KeyDescription = { ref, publicKeyPem: pem, keyId: id, algorithm: "ecdsa-p256-sha256", protection: "software",
    protectionBasis: "provider-metadata", exportable: false };
  const bridge = (request: BridgeRequest) => request.op === "describe" ? { description }
    : { description, signatureB64: lowS(sign("sha256", Buffer.from(request.messageB64, "base64"), { key: keys.privateKey, dsaEncoding: "ieee-p1363" })).toString("base64") };
  const signer = loadNotarySigner({ notaryDir: fresh(), backend: { type: "KEY_PROVIDER", ref }, bridge });
  const pubFile = join(fresh(), "pinned-notary.pub"); writeFileSync(pubFile, pem);
  await enableNotaryTrust({ workspace: root, baseUrl: "http://127.0.0.1:1", pinPubkeyPath: pubFile, requiredAttestationLevel: "SOFTWARE" });
  transport.handler = body => { const request = JSON.parse(body); const bytes = Buffer.from(request.payloadB64, "base64");
    return notarySignResponse(request.kind, sha256Hex(bytes), signer.sign(request.kind, bytes)); };
  const trust = withPins(workspaceKeyTrust(root), [{ keyId: id, purposes: ["artifact-seal"], origin: "owned operator notary key before artifact creation" }]);
  return { pem, id, keys, trust };
}
function unpack(file: string): string {
  const root = fresh(); extractValidatedTarGzipArchive({ file, destination: root, label: "owned producer metadata fixture",
    limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 } }); return root;
}

test("real P-256 notary trust certificates and industry audits publish the actual signer identity and algorithm", async () => {
  const root = workspace(); const notary = await installNotary(root); transport.requests = [];
  const cert = generateTrustCertificate({ workspace: root, agentId: "default", outputPath: "notary.json" });
  expect(cert.envelope).toMatchObject({ signatureAlgorithm: "ecdsa-p256-sha256", payload: { signingKey: { publicKeyPem: notary.pem, fingerprint: notary.id } } });
  expect(verifyTrustCertificateEnvelope(cert.envelope, notary.trust).ok).toBe(true);
  expect(transport.requests.filter(request => request.kind === "CERT")).toHaveLength(1); // No descriptor probe-sign.
  const pack = getPackById("clinical-trials"); if (!pack) throw new Error("owned pack fixture missing");
  const audit = signIndustryPackAudit(root, buildIndustryPackAudit({ pack, now: Date.now(), responses: Object.fromEntries(pack.questions.map(question => [question.id, 3])) }));
  expect(audit.signature).toMatchObject({ keyFingerprint: `sha256:${notary.id}`, envelope: { alg: "ecdsa-p256-sha256", signer: { type: "NOTARY", attestationLevel: "SOFTWARE" } } });
  expect(verifyIndustryPackAuditSignature(audit, { trust: notary.trust }).ok).toBe(true);
});

test("a real P-256 signature mislabeled Ed25519 cannot pass the trust certificate verifier", () => {
  const root = workspace(); const original = generateTrustCertificate({ workspace: root, agentId: "default", outputPath: "original.json" });
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" }); const pem = pair.publicKey.export({ format: "pem", type: "spki" }).toString(); const id = signingKeyId(pem)!;
  const trust = withPins(workspaceKeyTrust(root), [{ keyId: id, purposes: ["artifact-seal"], origin: "owned fixture key" }]);
  const payload = { ...original.envelope.payload, signingKey: { kind: "auditor" as const, publicKeyPem: pem, fingerprint: id } };
  const digest = sha256Hex(canonicalize(payload)); const signature = lowS(sign("sha256", Buffer.from(digest, "hex"), { key: pair.privateKey, dsaEncoding: "ieee-p1363" })).toString("base64");
  const mislabeled: TrustCertificateEnvelope = { ...original.envelope, signatureAlgorithm: "ed25519", payload, payloadSha256: digest, signature };
  const rejected = verifyTrustCertificateEnvelope(mislabeled, trust);
  expect(rejected.ok).toBe(false); expect(rejected.errors).toContain("signature algorithm does not match signing key");
  expect(verifyTrustCertificateEnvelope({ ...mislabeled, signatureAlgorithm: "ecdsa-p256-sha256" }, trust).ok).toBe(true);
});

test("a real P-256 notary backup signs truthful metadata and bundles its actual public key; self-signed false metadata refuses", async () => {
  const root = workspace(); const notary = await installNotary(root); vi.stubEnv("AMC_BACKUP_PASSPHRASE", "synthetic-backup-only"); transport.requests = [];
  const made = createBackup({ workspace: root, outFile: "notary.amcbackup" }); const content = unpack(made.outFile);
  const manifestPath = join(content, "manifest.json"), signaturePath = join(content, "manifest.sig");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  expect(manifest.signing).toEqual({ algorithm: "ecdsa-p256-sha256", auditorFingerprint: notary.id });
  expect(readFileSync(join(content, "keys", "auditor.pub"), "utf8")).toBe(notary.pem);
  expect(verifyBackup({ backupFile: made.outFile, passphrase: "synthetic-backup-only", trust: notary.trust }).ok).toBe(true);
  expect(transport.requests.filter(request => request.kind === "BACKUP_MANIFEST")).toHaveLength(1);
  for (const patch of [{ algorithm: "ed25519" }, { auditorFingerprint: sha256Hex(workspaceKeyPem(root, "auditor")) }]) {
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, signing: { ...manifest.signing, ...patch } }, null, 2));
    const signed = policy.signDigestWithPolicy({ workspace: root, kind: "BACKUP_MANIFEST", digestHex: sha256Hex(readFileSync(manifestPath)) });
    writeFileSync(signaturePath, JSON.stringify(signed, null, 2));
    const output = join(fresh(), "false-metadata.amcbackup"); const packed = spawnSync("tar", ["-czf", output, "-C", content, "."], { encoding: "utf8" }); expect(packed.status, packed.stderr).toBe(0);
    const denied = verifyBackup({ backupFile: output, passphrase: "synthetic-backup-only", trust: notary.trust });
    expect(denied.ok).toBe(false); expect(denied.errors).toEqual(["manifest signing metadata does not match verified signer"]);
  }
});

test("descriptor metadata is authenticated and read-only; an authorized signer change after hashing is refused", async () => {
  const root = workspace(); const first = await installNotary(root); transport.requests = [];
  const selected = policy.describePolicySigner(root, "CERT");
  expect(selected).toMatchObject({ kind: "CERT", mode: "NOTARY", algorithm: "ecdsa-p256-sha256", publicKeyPem: first.pem, fingerprint: first.id });
  expect(transport.requests).toHaveLength(0);
  const replacement = await installNotary(root); transport.requests = [];
  const digestHex = sha256Hex("payload already contains the first signer's metadata");
  expect(() => policy.signDigestWithPolicy({ workspace: root, kind: "CERT", digestHex, expectedSigner: selected })).toThrow("policy signing response does not match the signer described in signed metadata");
  expect(policy.signDigestWithPolicy({ workspace: root, kind: "CERT", digestHex }).envelope?.fingerprint).toBe(replacement.id); // Prove the new route is otherwise valid.
  const historyPath = join(root, ".amc", "keys", "auditor_history.json"), history = JSON.parse(readFileSync(historyPath, "utf8"));
  history.signature = Buffer.alloc(64, 1).toString("base64"); writeFileSync(historyPath, JSON.stringify(history)); transport.requests = [];
  expect(() => generateTrustCertificate({ workspace: root, agentId: "default", outputPath: "must-not-publish.json" })).toThrow("notary signing key history is not authenticated");
  expect(existsSync(join(root, "must-not-publish.json"))).toBe(false); expect(transport.requests).toHaveLength(0);
});

test("default unsplit vault trust-certificate and backup signing bytes retain the legacy layout and Ed25519 signature", () => {
  const root = workspace(), pem = workspaceKeyPem(root, "auditor"), fingerprint = sha256Hex(pem); const trust = workspaceKeyTrust(root);
  const certificate = generateTrustCertificate({ workspace: root, agentId: "default", outputPath: "default.json" });
  const payload = { ...certificate.envelope.payload, signingKey: { kind: "auditor" as const, fingerprint, publicKeyPem: pem } };
  const digest = sha256Hex(canonicalize(payload)); const signature = sign(null, Buffer.from(digest, "hex"), getSigningKey(root, "artifact-seal")).toString("base64");
  const legacy = { type: "amc-trust-certificate", signatureAlgorithm: "ed25519", signatureStatus: "SIGNED", payloadSha256: digest, signature, claimBoundary: undefined, payload };
  expect(readFileSync(certificate.outputPath)).toEqual(Buffer.from(`${JSON.stringify(legacy, null, 2)}\n`));
  expect(verifyTrustCertificateEnvelope(certificate.envelope, trust).ok).toBe(true);
  vi.stubEnv("AMC_BACKUP_PASSPHRASE", "synthetic-backup-only"); const backup = createBackup({ workspace: root, outFile: "default.amcbackup" }), content = unpack(backup.outFile);
  const manifestPath = join(content, "manifest.json"), signaturePath = join(content, "manifest.sig");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")), actual = JSON.parse(readFileSync(signaturePath, "utf8"));
  const legacyManifest = { ...manifest, signing: { algorithm: "ed25519", auditorFingerprint: fingerprint } };
  const manifestBytes = Buffer.from(JSON.stringify(legacyManifest, null, 2)); expect(readFileSync(manifestPath)).toEqual(manifestBytes);
  const oldSignature = sign(null, Buffer.from(sha256Hex(manifestBytes), "hex"), getSigningKey(root, "artifact-seal")).toString("base64");
  const old = { ...actual, signature: oldSignature, envelope: { ...actual.envelope, alg: "ed25519", pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint, sigB64: oldSignature,
    signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } };
  expect(readFileSync(signaturePath)).toEqual(Buffer.from(JSON.stringify(old, null, 2)));
  expect(verifyBackup({ backupFile: backup.outFile, passphrase: "synthetic-backup-only", trust }).ok).toBe(true);
  expect(transport.requests).toHaveLength(0);
});

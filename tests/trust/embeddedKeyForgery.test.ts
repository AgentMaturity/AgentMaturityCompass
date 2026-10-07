import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import Database from "better-sqlite3";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { runDiagnostic } from "../../src/diagnostic/runner.js";
import { exportEvidenceBundle } from "../../src/bundles/bundle.js";
import { issueCertificate, revokeCertificate } from "../../src/assurance/certificate.js";
import { writeSignedGatePolicy } from "../../src/ci/gate.js";
import { createPassportArtifact } from "../../src/passport/passportArtifact.js";
import { defaultPassportPolicy } from "../../src/passport/passportPolicySchema.js";
import { savePassportPolicy } from "../../src/passport/passportStore.js";
import { appendTransparencyEntry } from "../../src/transparency/logChain.js";
import { buildBenchProofs, writeBenchProofFiles } from "../../src/bench/benchProofs.js";
import { generateTrustCertificate } from "../../src/cert/trustCertificate.js";
import { createReleaseBundle } from "../../src/release/releaseBundle.js";
import { signReleaseManifest } from "../../src/release/releaseSigner.js";
import { signTrustList, type DistrustEntry, type TrustListEntry } from "../../src/trust/index.js";
import { runAssurance } from "../../src/assurance/assuranceRunner.js";
import { initAssurancePolicy, loadAssurancePolicy, saveAssurancePolicy } from "../../src/assurance/assurancePolicyStore.js";
import { issueAssuranceCertificate } from "../../src/assurance/assuranceCertificates.js";
import { handleBomRoute } from "../../src/api/bomRouter.js";
import { handleCryptoRoute } from "../../src/api/cryptoRouter.js";
import { handleAssuranceRoute } from "../../src/api/assuranceRouter.js";
import { handleToolsRoute } from "../../src/api/toolsRouter.js";
import { handleBenchmarkRoute } from "../../src/api/benchmarkRouter.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { startFakeAgentServer, useFakeAgentEnv } from "../helpers/fakeAgentServer.js";
import { merkleLeafHash } from "../../src/transparency/merkle.js";
import { canonicalize } from "../../src/utils/json.js";
import { listEntry, testKey, trustList, type TestKey } from "./trustFixtures.js";
import { createAuditBinderArtifact } from "../../src/audit/binderArtifact.js";
import { generateAuditPacket } from "../../src/evidence/auditPacket.js";
import { createBenchArtifact } from "../../src/bench/benchArtifact.js";
import { exportBenchmarkArtifact } from "../../src/benchmarks/benchExport.js";
import { createBackup } from "../../src/ops/backup/backupEngine.js";
import { buildPromptPackForApi } from "../../src/prompt/promptPackApi.js";
import { promptLatestPackPath } from "../../src/prompt/promptPolicyStore.js";
import { federateInitCli } from "../../src/federation/federationCli.js";
import { exportFederationPackage } from "../../src/federation/federationSync.js";
import { ensureFederationPublisherKey } from "../../src/federation/federationIdentity.js";
import { installedPluginTrust, pluginKeygen, pluginPack, verifyPluginPackage } from "../../src/plugins/pluginPackage.js";
import { initPluginRegistry, publishPluginToRegistry } from "../../src/plugins/pluginRegistry.js";
import { browseRegistry, resolveRegistryPackage } from "../../src/plugins/pluginRegistryClient.js";
import { operatorTrustHome, pinnedTrust } from "../helpers/trustContext.js";

/**
 * P0-09 forgery suite: one describe per verifier in the PR 2 and PR 3 rows of the issue table. Each builds a real
 * artifact, then forges a copy the way gap G1 allows: tamper with the content, re-sign it with a fresh key and swap
 * the public key the artifact carries. Every case runs the shipped CLI, because exit codes are the contract.
 */
const CLI = resolve("dist/cli.js");
const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
const attacker = testKey();

function dir(prefix = "amc-forgery-"): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

const amcHome = dir("amc-forgery-home-");

function amc(cwd: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_HOME: amcHome };
  delete env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  Object.assign(env, extraEnv);
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8", timeout: 120_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}` };
}

function tar(command: "extract" | "create", archive: string, directory: string): void {
  const args = command === "extract" ? ["-xzf", archive, "-C", directory] : ["-czf", archive, "-C", directory, "."];
  const result = spawnSync("tar", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`tar ${command} failed: ${result.stderr}`);
}

function extract(archive: string): string {
  const root = dir("amc-forgery-x-");
  tar("extract", archive, root);
  return root;
}

function pack(root: string, name: string): string {
  const out = join(dir("amc-forgery-out-"), name);
  tar("create", out, root);
  return out;
}

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const signDigest = (digestHex: string, key: TestKey) => sign(null, Buffer.from(digestHex, "hex"), key.privateKeyPem).toString("base64");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2));

/** A trust list signed by a fresh root, as --trust-list and --trust-root flags. */
function listFlags(entries: TrustListEntry[], distrust: DistrustEntry[] = []): string[] {
  const root = testKey();
  const now = Date.now();
  const path = join(dir("amc-forgery-list-"), "list.json");
  writeJson(path, signTrustList(trustList(entries, { issuedAt: new Date(now - 3_600_000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(), distrust }), root.privateKeyPem));
  return ["--trust-list", path, "--trust-root", root.keyId];
}

const distrusted = (keyId: string): DistrustEntry => ({ keyId, distrustedFrom: null, reason: "key-compromise", note: "forgery suite", source: "operator" });

function filesUnder(root: string): string[] {
  const out: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else out.push(relative(root, path).replace(/\\/g, "/"));
    }
  };
  visit(root);
  return out.sort();
}

/** The four outcomes every row must show. */
function expectRow(row: {
  verify: (file: string, flags: string[]) => ReturnType<typeof amc>; genuine: () => string; forged: () => string; pin: () => string[];
  /** Pins that are not the issuer key, kept with --allow-unpinned (the monitor pin for ledger anchoring). */
  anchor?: () => string[];
}) {
  test("a forged copy re-signed with an embedded key fails as not-pinned by default", () => {
    const result = row.verify(row.forged(), []);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("not-pinned");
  });
  test("a forged copy still fails when the legitimate key is pinned", () => {
    const result = row.verify(row.forged(), row.pin());
    expect(result.status, result.output).toBe(1);
  });
  test("the untouched artifact with its key pinned is trusted", () => {
    const result = row.verify(row.genuine(), row.pin());
    expect(result.status, result.output).toBe(0);
  });
  test("the untouched artifact with --allow-unpinned is integrity-only and exits 2", () => {
    const result = row.verify(row.genuine(), [...(row.anchor?.() ?? []), "--allow-unpinned"]);
    expect(result.status, result.output).toBe(2);
    expect(result.stderr.trimStart().startsWith("UNTRUSTED:"), result.stderr).toBe(true);
  });
}

// ── Shared workspace: evidence bundle, certificate and revocation ─────────
let evidence: { workspace: string; runId: string; bundle: string; certificate: string; revocation: string; certId: string; auditorPub: string; monitorFingerprint: string };

async function evidenceFixture() {
  const workspace = dir("amc-forgery-ws-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // The operator records the keys at vault creation, outside every artifact this test later verifies.
  const records = dir("amc-forgery-records-");
  const auditorPub = join(records, "auditor.pub");
  writeFileSync(auditorPub, readFileSync(join(workspace, ".amc", "keys", "auditor_ed25519.pub")));
  const monitorFingerprint = sha(readFileSync(join(workspace, ".amc", "keys", "monitor_ed25519.pub"), "utf8"));
  const ledger = openLedger(workspace);
  ledger.startSession({ sessionId: "s1", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
  ledger.appendEvidence({ sessionId: "s1", runtime: "unknown", eventType: "stdout", payload: "observed", inline: true,
    meta: { questionId: "AMC-1.1", trustTier: "OBSERVED", agentId: "default" } });
  ledger.sealSession("s1");
  ledger.close();
  const run = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
  const policyPath = join(workspace, "policy.json");
  writeSignedGatePolicy({ workspace, policyPath, policy: {
    minIntegrityIndex: 0, minOverall: 0,
    minLayer: { "Strategic Agent Operations": 0, "Leadership & Autonomy": 0, "Culture & Alignment": 0, Resilience: 0, Skills: 0 },
    requireObservedForLevel5: false, denyIfLowTrust: false
  } });
  const bundle = join(workspace, "run.amcbundle");
  exportEvidenceBundle({ workspace, runId: run.runId, outFile: bundle });
  const certificate = join(workspace, "run.amccert");
  const issued = await issueCertificate({ workspace, runId: run.runId, policyPath, outFile: certificate });
  const revocation = revokeCertificate({ workspace, certFile: certificate, reason: "test revocation", outFile: "run.amcrevoke" }).outFile;
  return { workspace, runId: run.runId, bundle, certificate, revocation, certId: issued.certId, auditorPub, monitorFingerprint };
}

/** Re-seals a run report the way the exporter does, with any key. */
function resealRun(path: string, key: TestKey, change: (run: Record<string, unknown>) => void = () => undefined): void {
  const run = readJson(path);
  change(run);
  const digest = sha(canonicalize({ ...run, runSealSig: "", reportJsonSha256: "" }));
  writeJson(path, { ...run, reportJsonSha256: digest, runSealSig: signDigest(digest, key) });
}

/** The run rows in the carried ledger are auditor-signed too; a forger with a fresh auditor key re-signs them. */
function resealLedgerRuns(root: string, key: TestKey): void {
  const db = new Database(join(root, "evidence", "evidence.sqlite"));
  try {
    db.exec("DROP TRIGGER IF EXISTS no_update_runs");
    for (const run of db.prepare("SELECT run_id, report_json_sha256 FROM runs").all() as Array<{ run_id: string; report_json_sha256: string }>) {
      db.prepare("UPDATE runs SET run_seal_sig=? WHERE run_id=?").run(signDigest(run.report_json_sha256, key), run.run_id);
    }
  } finally {
    db.close();
  }
}

function resignTarget(root: string, key: TestKey): void {
  if (!existsSync(join(root, "target.json"))) return;
  const { signature: _sig, ...target } = readJson(join(root, "target.json"));
  writeJson(join(root, "target.json"), { ...target, signature: signDigest(sha(canonicalize(target)), key) });
}

function forgeBundle(source: string, key: TestKey): string {
  const root = extract(source);
  resealRun(join(root, "run.json"), key, run => { run.integrityIndex = 1; run.trustLabel = "HIGH TRUST"; });
  resealLedgerRuns(root, key);
  resignTarget(root, key);
  for (const report of ["outcomes/report.json", "experiments/report.json"]) {
    const path = join(root, report);
    if (!existsSync(path)) continue;
    const { reportJsonSha256: _digest, reportSealSig: _sig, ...payload } = readJson(path);
    const digest = sha(canonicalize(payload));
    writeJson(path, { ...payload, reportJsonSha256: digest, reportSealSig: signDigest(digest, key) });
  }
  writeFileSync(join(root, "public-keys", "auditor.pub"), key.publicKeyPem);
  const manifestPath = join(root, "manifest.json");
  const manifest = readJson(manifestPath);
  manifest.files = filesUnder(root).filter(file => file !== "manifest.json" && file !== "manifest.sig").map(file => {
    const bytes = readFileSync(join(root, file));
    return { path: file, sha256: sha(bytes), size: bytes.length };
  });
  writeJson(manifestPath, manifest);
  const manifestSha256 = sha(readFileSync(manifestPath));
  writeJson(join(root, "manifest.sig"), { manifestSha256, signature: signDigest(manifestSha256, key), signedTs: Date.now(), signer: "auditor" });
  return pack(root, "forged.amcbundle");
}

function forgeCertificate(source: string, key: TestKey): string {
  const root = extract(source);
  const certPath = join(root, "cert.json");
  writeJson(certPath, { ...readJson(certPath), trustLabel: "HIGH TRUST", integrityIndex: 1 });
  const certSha256 = sha(readFileSync(certPath));
  writeJson(join(root, "cert.sig"), { certSha256, signature: signDigest(certSha256, key), signedTs: Date.now(), signer: "auditor" });
  resealRun(join(root, "run.json"), key);
  resealLedgerRuns(root, key);
  resignTarget(root, key);
  const policySha = sha(readFileSync(join(root, "gatePolicy.json")));
  writeJson(join(root, "gatePolicy.json.sig"), { ...readJson(join(root, "gatePolicy.json.sig")), digestSha256: policySha, signature: signDigest(policySha, key) });
  writeFileSync(join(root, "public-keys", "auditor.pub"), key.publicKeyPem);
  return pack(root, "forged.amccert");
}

function forgeRevocation(certId: string, key: TestKey): string {
  const base = { certId, reason: "forged revocation", ts: Date.now(), issuerFingerprint: key.keyId, auditorPub: key.publicKeyPem };
  const path = join(dir("amc-forgery-rev-"), "forged.amcrevoke");
  writeJson(path, { ...base, signature: signDigest(sha(canonicalize(base)), key) });
  return path;
}

const monitorPin = () => ["--expect-monitor", evidence.monitorFingerprint];
const ledgerPins = () => ["--pubkey", evidence.auditorPub, ...monitorPin()];

beforeAll(async () => {
  process.env.AMC_VAULT_PASSPHRASE = "p0-09-forgery-suite-passphrase";
  evidence = await evidenceFixture();
}, 120_000);

afterAll(() => {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  for (const root of roots.reverse()) rmSync(root, { recursive: true, force: true });
});

describe("verifyEvidenceBundle (amc bundle verify)", () => {
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["bundle", "verify", file, ...flags]),
    genuine: () => evidence.bundle,
    forged: () => forgeBundle(evidence.bundle, attacker),
    pin: ledgerPins,
    anchor: monitorPin
  });

  test("AMC_EXPECTED_MONITOR_FINGERPRINT does not anchor a distrusted monitor key", () => {
    const result = amc(evidence.workspace, ["bundle", "verify", evidence.bundle, "--pubkey", evidence.auditorPub,
      ...listFlags([], [distrusted(evidence.monitorFingerprint)])], { AMC_EXPECTED_MONITOR_FINGERPRINT: evidence.monitorFingerprint });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("distrusted");
  });

  test("a distrusted monitor key fails even with --expect-monitor and --allow-unanchored", () => {
    const result = amc(evidence.workspace, ["bundle", "verify", evidence.bundle, ...ledgerPins(), "--allow-unanchored",
      ...listFlags([], [distrusted(evidence.monitorFingerprint)])]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("distrusted");
  });

  test("an issuer key superseded after it sealed the bundle is admitted on the claimed signing time", () => {
    const pem = readFileSync(evidence.auditorPub, "utf8");
    const now = Date.now();
    const superseded = listEntry({ publicKeyPem: pem, privateKeyPem: "", keyId: sha(pem) }, { validFrom: new Date(now - 86_400_000).toISOString(),
      validTo: null, revokedAt: new Date(now - 1_000).toISOString(), revocationReason: "superseded" });
    const result = amc(evidence.workspace, ["bundle", "verify", evidence.bundle, ...monitorPin(), ...listFlags([superseded]), "--json"]);
    expect(result.status, result.output).toBe(0);
    const report = (JSON.parse(result.stdout) as { report: { issuerAdmission: { signatures: Array<{ signature: string; status: string; timeBasis: string | null }> } } }).report;
    expect(report.issuerAdmission.signatures.find(row => row.signature === "manifest.sig")).toMatchObject({ status: "admitted", timeBasis: "claimed" });
  });
});

describe("verifyCertificate (amc cert verify, .amccert)", () => {
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["cert", "verify", file, ...flags]),
    genuine: () => evidence.certificate,
    forged: () => forgeCertificate(evidence.certificate, attacker),
    pin: ledgerPins,
    anchor: monitorPin
  });

  test("AMC_EXPECTED_MONITOR_FINGERPRINT does not anchor a distrusted monitor key", () => {
    const result = amc(evidence.workspace, ["cert", "verify", evidence.certificate, "--pubkey", evidence.auditorPub, "--allow-unanchored",
      ...listFlags([], [distrusted(evidence.monitorFingerprint)])], { AMC_EXPECTED_MONITOR_FINGERPRINT: evidence.monitorFingerprint });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("distrusted");
  });
});

describe("verifyRevocationFile (amc cert verify-revocation and cert verify --revocation)", () => {
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["cert", "verify-revocation", file, ...flags]),
    genuine: () => evidence.revocation,
    forged: () => forgeRevocation(evidence.certId, attacker),
    pin: () => ["--pubkey", evidence.auditorPub]
  });

  test("a revocation signed by a different pinned key does not revoke the certificate", () => {
    const other = testKey();
    const root = testKey();
    const now = Date.now();
    const list = trustList([listEntry(other, {
      purposes: ["revocation-list"], validFrom: new Date(now - 86_400_000).toISOString(), validTo: new Date(now + 86_400_000).toISOString()
    })], { issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() });
    const listPath = join(dir("amc-forgery-list-"), "list.json");
    writeJson(listPath, signTrustList(list, root.privateKeyPem));
    const result = amc(evidence.workspace, ["cert", "verify", evidence.certificate, ...ledgerPins(),
      "--trust-list", listPath, "--trust-root", root.keyId, "--revocation", forgeRevocation(evidence.certId, other)]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("revocation issuer does not match certificate issuer");
  });
});

// ── Passport and assurance certificate (signed Merkle root binding) ───────
let signed: { workspace: string; passport: string; assurance: string; auditorPub: string };

async function signedArtifactFixture() {
  const workspace = dir("amc-forgery-pass-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const auditorPub = join(dir("amc-forgery-records-"), "auditor.pub");
  writeFileSync(auditorPub, readFileSync(join(workspace, ".amc", "keys", "auditor_ed25519.pub")));
  savePassportPolicy(workspace, defaultPassportPolicy());
  for (const type of ["DIAGNOSTIC_COMPLETED", "ASSURANCE_RUN_COMPLETED"]) {
    appendTransparencyEntry({ workspace, type, agentId: "default", artifact: { kind: "policy", sha256: sha(type), id: type } });
  }
  const passport = createPassportArtifact({ workspace, scopeType: "AGENT", scopeId: "default", outFile: "agent.amcpass" }).outFile;
  return { workspace, passport, assurance: await assuranceCertificate(workspace), auditorPub };
}

/**
 * A real assurance certificate from the shipped issuer: an assurance run against the fake agent, then
 * issueAssuranceCertificate. The run's evidence gates are lowered to zero in the signed policy, because a scan of a
 * direct endpoint has no gateway-captured evidence; nothing else about the certificate is set by the test.
 */
async function assuranceCertificate(workspace: string): Promise<string> {
  const agent = await startFakeAgentServer();
  const restoreEnv = useFakeAgentEnv(agent.baseUrl);
  try {
    const run = await runAssurance({ workspace, agentId: "default", mode: "supervise", window: "14d", packId: "injection", noSign: true });
    initAssurancePolicy(workspace);
    const policy = loadAssurancePolicy(workspace);
    policy.assurancePolicy.gates = { ...policy.assurancePolicy.gates, minIntegrityIndex: 0, minCorrelationRatio: 0, minObservedShare: 0 };
    saveAssurancePolicy(workspace, policy);
    return (await issueAssuranceCertificate({ workspace, runId: run.assuranceRunId, outFile: "assurance.amccert" })).outFile;
  } finally {
    restoreEnv();
    await agent.close();
  }
}

/** Replaces a certificate's proofs and signed roots with ones the same issuer produced later, for the same events. */
function spliceLaterRoot(source: string, workspace: string): string {
  appendTransparencyEntry({ workspace, type: "DIAGNOSTIC_COMPLETED", agentId: "default", artifact: { kind: "policy", sha256: sha("later"), id: "later" } });
  const top = extract(source);
  const root = join(top, "amc-cert");
  const cert = readJson(join(root, "cert.json")) as { proofBindings: { includedEventProofIds: string[] } };
  const later = buildBenchProofs({ workspace, includeEventKinds: ["ASSURANCE_RUN_STARTED", "ASSURANCE_RUN_COMPLETED",
    "ASSURANCE_FINDING_RECORDED", "ASSURANCE_CERT_ISSUED", "NOTARY_ATTESTATION_OBSERVED"], maxProofs: 40 });
  const proofs = later.proofs.filter(proof => cert.proofBindings.includedEventProofIds.includes(proof.proofId));
  expect(proofs.length).toBe(cert.proofBindings.includedEventProofIds.length);
  rmSync(join(root, "proofs"), { recursive: true, force: true });
  writeBenchProofFiles({ outDir: root, bundle: { ...later, proofs } });
  return pack(top, "spliced.amccert");
}

/** Tampers with the signed document, re-signs it without an envelope and swaps signer.pub. */
function forgeSignedDocument(source: string, directory: string, documentName: string, key: TestKey, change: (doc: Record<string, unknown>) => void): string {
  const top = extract(source);
  const root = join(top, directory);
  const docPath = join(root, documentName);
  const doc = readJson(docPath);
  change(doc);
  // bench.json is signed over its bytes, so it is written canonically; the others are signed over canonical JSON.
  writeFileSync(docPath, documentName === "cert.json" ? `${canonicalize(doc)}\n` : documentName === "bench.json" ? canonicalize(doc) : JSON.stringify(doc, null, 2));
  const digest = sha(canonicalize(doc));
  const sigName = documentName.replace(".json", ".sig");
  writeJson(join(root, sigName), { digestSha256: digest, signature: signDigest(digest, key), signedTs: Date.now(), signer: "auditor" });
  writeFileSync(join(root, "signer.pub"), key.publicKeyPem);
  return pack(top, `forged-${documentName}.tar.gz`);
}

/** Replaces the first inclusion proof with one that carries its own fabricated root: self-consistent, never signed. */
function fabricateProofRoot(source: string, directory: string): string {
  const top = extract(source);
  const inclusion = join(top, directory, "proofs", "inclusion");
  const [first] = readdirSync(inclusion).filter(name => name.endsWith(".json"));
  if (!first) throw new Error("fixture has no inclusion proof");
  const proof = readJson(join(inclusion, first));
  const fabricated = sha("an event that was never logged");
  writeJson(join(inclusion, first), { ...proof, eventHash: fabricated, rootHash: merkleLeafHash(fabricated), merklePath: [] });
  return pack(top, "fabricated-root.tar.gz");
}

describe("verifyPassportArtifactFile (amc passport verify)", () => {
  beforeAll(async () => { signed = await signedArtifactFixture(); }, 180_000);
  expectRow({
    verify: (file, flags) => amc(signed.workspace, ["passport", "verify", file, ...flags]),
    genuine: () => signed.passport,
    forged: () => forgeSignedDocument(signed.passport, "amc-passport", "passport.json", attacker, doc => {
      (doc.status as Record<string, unknown>).label = "VERIFIED";
    }),
    pin: () => ["--pubkey", signed.auditorPub]
  });

  test("a distrusted key is refused even when it is pinned with --pubkey", () => {
    const root = testKey();
    const auditorKeyId = sha(readFileSync(signed.auditorPub, "utf8"));
    const now = Date.now();
    const list = trustList([], { issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(),
      distrust: [{ keyId: auditorKeyId, distrustedFrom: null, reason: "key-compromise", note: "forgery suite", source: "operator" }] });
    const listPath = join(dir("amc-forgery-list-"), "list.json");
    writeJson(listPath, signTrustList(list, root.privateKeyPem));
    const result = amc(signed.workspace, ["passport", "verify", signed.passport, "--pubkey", signed.auditorPub,
      "--trust-list", listPath, "--trust-root", root.keyId, "--allow-unpinned"]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("distrusted");
  });

  test("a passport whose inclusion proof carries its own fabricated root is refused", () => {
    const result = amc(signed.workspace, ["passport", "verify", fabricateProofRoot(signed.passport, "amc-passport"), "--pubkey", signed.auditorPub]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("signed merkle root");
  });
});

describe("verifyAssuranceCertificateFile (amc assurance cert-verify)", () => {
  beforeAll(async () => { signed ??= await signedArtifactFixture(); }, 180_000);
  expectRow({
    verify: (file, flags) => amc(signed.workspace, ["assurance", "cert-verify", file, ...flags]),
    genuine: () => signed.assurance,
    forged: () => forgeSignedDocument(signed.assurance, "amc-cert", "cert.json", attacker, doc => { doc.riskAssuranceScore = 100; }),
    pin: () => ["--pubkey", signed.auditorPub]
  });

  test("an assurance certificate whose inclusion proof carries its own fabricated root is refused", () => {
    const result = amc(signed.workspace, ["assurance", "cert-verify", fabricateProofRoot(signed.assurance, "amc-cert"), "--pubkey", signed.auditorPub]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("signed merkle root");
  });

  test("proofs and a signed root the same issuer produced later cannot be spliced into an untouched certificate", () => {
    const result = amc(signed.workspace, ["assurance", "cert-verify", spliceLaterRoot(signed.assurance, signed.workspace), "--pubkey", signed.auditorPub]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("proofBindings.merkleRootSha256 mismatch");
  });
});

// ── Trust certificate JSON ─────────────────────────────────────────────────
describe("verifyTrustCertificateEnvelope (amc cert verify, trust-certificate JSON)", () => {
  let fixture: { workspace: string; file: string; auditorPub: string };
  beforeAll(() => {
    const workspace = dir("amc-forgery-tc-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const auditorPub = join(dir("amc-forgery-records-"), "auditor.pub");
    writeFileSync(auditorPub, readFileSync(join(workspace, ".amc", "keys", "auditor_ed25519.pub")));
    mkdirSync(join(workspace, ".amc", "agents", "default", "runs"), { recursive: true });
    writeJson(join(workspace, ".amc", "agents", "default", "runs", "run-1.json"), { runId: "run-1", ts: Date.now(), integrityIndex: 0.4 });
    const file = generateTrustCertificate({ workspace, agentId: "default", outputPath: "trust.json" }).outputPath;
    fixture = { workspace, file, auditorPub };
  }, 60_000);

  function forge(): string {
    const envelope = readJson(fixture.file);
    const payload: Record<string, unknown> = { ...(envelope.payload as Record<string, unknown>), score: 99 };
    payload.signingKey = { ...(payload.signingKey as Record<string, unknown>), publicKeyPem: attacker.publicKeyPem, fingerprint: sha(attacker.publicKeyPem) };
    const payloadSha256 = sha(canonicalize(payload));
    const path = join(dir("amc-forgery-tcf-"), "forged-trust.json");
    writeJson(path, { ...envelope, payload, payloadSha256, signature: signDigest(payloadSha256, attacker) });
    return path;
  }

  expectRow({
    verify: (file, flags) => amc(fixture.workspace, ["cert", "verify", file, ...flags]),
    genuine: () => fixture.file,
    forged: forge,
    pin: () => ["--pubkey", fixture.auditorPub]
  });
});

// ── Release bundle ───────────────────────────────────────────────────────────
describe("verifyReleaseBundle (amc release verify)", () => {
  let release: { file: string; publicKeyPath: string; cwd: string };
  beforeAll(() => {
    const root = dir("amc-forgery-rel-");
    const workspace = join(root, "source");
    mkdirSync(join(workspace, "dist"), { recursive: true });
    writeJson(join(workspace, "package.json"), { name: "agent-maturity-compass", version: "1.0.0", license: "MIT", files: ["dist"],
      scripts: { build: "node -e \"require('fs').writeFileSync('dist/built.txt', 'built')\"" } });
    writeJson(join(workspace, "package-lock.json"), { lockfileVersion: 3, packages: {} });
    writeFileSync(join(workspace, "dist", "index.js"), "export const clean = true;\n");
    const pair = generateKeyPairSync("ed25519");
    const privateKeyPath = join(root, "signing.pem");
    const publicKeyPath = join(root, "signing.pub");
    writeFileSync(privateKeyPath, pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), { mode: 0o600 });
    writeFileSync(publicKeyPath, pair.publicKey.export({ format: "pem", type: "spki" }));
    const file = join(root, "release.amcrelease");
    createReleaseBundle({ workspace, outFile: file, privateKeyPath, skipInstallBuild: true });
    release = { file, publicKeyPath, cwd: root };
  }, 120_000);

  function forge(): string {
    const top = extract(release.file);
    const root = join(top, "amc-release");
    const manifest = readJson(join(root, "manifest.json"));
    const forgedManifest = { ...manifest, package: { ...(manifest.package as Record<string, unknown>),
      git: { ...((manifest.package as Record<string, unknown>).git as Record<string, unknown>), commit: "f".repeat(40) } } };
    writeFileSync(join(root, "manifest.json"), canonicalize(forgedManifest));
    writeFileSync(join(root, "manifest.sig"), signReleaseManifest(forgedManifest as never, attacker.privateKeyPem));
    writeFileSync(join(root, "keys", "release-signing.pub"), attacker.publicKeyPem);
    return pack(top, "forged.amcrelease");
  }

  expectRow({
    verify: (file, flags) => amc(release.cwd, ["release", "verify", file, ...flags]),
    genuine: () => release.file,
    forged: forge,
    pin: () => ["--pubkey", release.publicKeyPath]
  });

  test("verify all names the key to pin when it refuses an unpinned release bundle", () => {
    const workspace = dir("amc-forgery-relws-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    mkdirSync(join(workspace, "dist"), { recursive: true });
    writeFileSync(join(workspace, "dist", "release.amcrelease"), readFileSync(release.file));
    const result = amc(workspace, ["verify", "all", "--json"]);
    // The JSON report comes first; the command may print its verdict after it.
    const report = JSON.parse(`${result.stdout.split(/\n}\n/)[0]}\n}`) as { checks: Array<{ id: string; status: string; details: string[] }> };
    const check = report.checks.find(row => row.id === "release-bundles");
    expect(check?.status, result.output).toBe("FAIL");
    expect(check?.details.join("\n")).toContain(`key ${sha(readFileSync(release.publicKeyPath, "utf8"))} is not pinned`);
  }, 120_000);
});

// ── API routes: the server operator's trust only (P0-09 step 11) ───────────
describe("API verify routes use the server's trust context and refuse request-supplied trust", () => {
  const previousHome = process.env.AMC_HOME;
  const previousMonitor = process.env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  beforeAll(async () => {
    signed ??= await signedArtifactFixture();
    plugin ??= pluginFixture();
    benchmark ??= benchmarkFixture();
    process.env.AMC_HOME = amcHome; // the server's AMC home pins nothing
    delete process.env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  }, 180_000);
  afterAll(() => {
    if (previousHome === undefined) delete process.env.AMC_HOME;
    else process.env.AMC_HOME = previousHome;
    if (previousMonitor !== undefined) process.env.AMC_EXPECTED_MONITOR_FINGERPRINT = previousMonitor;
  });

  type Handler = (pathname: string, method: string, req: IncomingMessage, res: ServerResponse, workspace?: string) => Promise<boolean>;
  async function route(handler: Handler, pathname: string, body: Record<string, unknown>, workspace: string) {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", headers: { "content-type": "application/json" } });
    let status = 0;
    let text = "";
    const res = { writeHead: (code: number) => { status = code; return res; }, setHeader: () => res, end: (chunk?: unknown) => { text = String(chunk ?? ""); } };
    expect(await handler(pathname, "POST", req as unknown as IncomingMessage, res as unknown as ServerResponse, workspace)).toBe(true);
    return { status, json: JSON.parse(text) as { ok: boolean; error?: string; data?: { ok: boolean; report?: { trusted: boolean; issuerAdmission: { status: string } } } } };
  }

  const cases: Array<[string, Handler, string, () => Record<string, unknown>, string]> = [
    ["POST /api/v1/bundle/verify", handleBomRoute as Handler, "/api/v1/bundle/verify", () => ({ file: evidence.bundle }), "publicKeyPath"],
    ["POST /api/v1/crypto/cert/verify", handleCryptoRoute as Handler, "/api/v1/crypto/cert/verify", () => ({ certFile: evidence.certificate }), "allowUnpinned"],
    ["POST /api/v1/crypto/cert/verify-revocation", handleCryptoRoute as Handler, "/api/v1/crypto/cert/verify-revocation", () => ({ file: evidence.revocation }), "trustList"],
    ["POST /api/v1/assurance/cert/verify", handleAssuranceRoute as Handler, "/api/v1/assurance/cert/verify", () => ({ file: signed.assurance }), "pubkey"],
    ["POST /api/v1/plugins/verify", handleToolsRoute as Handler, "/api/v1/plugins/verify", () => ({ file: plugin.file }), "pubkeyPath"],
    ["POST /api/v1/plugins/registry/verify", handleToolsRoute as Handler, "/api/v1/plugins/registry/verify", () => ({ dir: plugin.registry }), "trustList"],
    ["POST /api/v1/benchmarks/verify", handleBenchmarkRoute as Handler, "/api/v1/benchmarks/verify", () => ({ file: benchmark }), "trustRoot"]
  ];
  for (const [name, handler, pathname, body, field] of cases) {
    test(`${name} refuses a body that carries ${field}`, async () => {
      const out = await route(handler, pathname, { ...body(), [field]: field === "allowUnpinned" ? true : evidence.auditorPub }, evidence.workspace);
      expect(out.status).toBe(400);
      expect(out.json.error).toContain(`request field "${field}" is refused`);
    });
    test(`${name} answers an unpinned issuer with ok:false and the verifier report`, async () => {
      const out = await route(handler, pathname, body(), evidence.workspace);
      expect(out.json.data?.ok).toBe(false);
      expect(out.json.data?.report?.trusted).toBe(false);
      expect(out.json.data?.report?.issuerAdmission.status).toBe("fail");
    });
  }

  test("POST /api/v1/plugins/print refuses a body that carries pubkeyPath and returns the verifier report", async () => {
    const refused = await route(handleToolsRoute as Handler, "/api/v1/plugins/print", { file: plugin.file, pubkeyPath: plugin.publisherPub }, evidence.workspace);
    expect(refused.status).toBe(400);
    expect(refused.json.error).toContain('request field "pubkeyPath" is refused');
    const out = await route(handleToolsRoute as Handler, "/api/v1/plugins/print", { file: plugin.file }, evidence.workspace);
    const verification = (out.json.data as unknown as { verification: { ok: boolean; report: { issuerAdmission: { status: string; signatures: Array<{ status: string }> } } } }).verification;
    expect(verification.ok).toBe(false);
    expect(verification.report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");
  });

  test("POST /api/v1/benchmarks/import returns the verifier report of each benchmark it admitted", async () => {
    const previous = process.env.AMC_HOME;
    process.env.AMC_HOME = operatorTrustHome([{ publicKeyPem: readFileSync(evidence.auditorPub, "utf8"), purposes: ["artifact-seal"] }]);
    roots.push(process.env.AMC_HOME);
    try {
      const out = await route(handleBenchmarkRoute as Handler, "/api/v1/benchmarks/import", { path: benchmark }, dir("amc-forgery-import-ws-"));
      expect(out.status).toBe(200);
      const imported = (out.json.data as unknown as { imported: Array<{ report: { trusted: boolean } }> }).imported;
      expect(imported.map(row => row.report.trusted)).toEqual([true]);
    } finally {
      process.env.AMC_HOME = previous;
    }
  });

  test("Studio POST /passport/verify refuses publicKeyPath and reports an unpinned issuer", async () => {
    const probe = createServer();
    await new Promise<void>(done => probe.listen(0, "127.0.0.1", () => done()));
    const address = probe.address();
    await new Promise<void>(done => probe.close(() => done()));
    if (!address || typeof address === "string") throw new Error("no port");
    const server = await startStudioApiServer({ workspace: signed.workspace, host: "127.0.0.1", port: address.port, token: "forgery-admin-token" });
    try {
      const post = async (body: Record<string, unknown>) => {
        const response = await fetch(`${server.url}/passport/verify`, { method: "POST", body: JSON.stringify(body),
          headers: { "content-type": "application/json", "x-amc-admin-token": "forgery-admin-token" } });
        return { status: response.status, json: await response.json() as { error?: string; ok?: boolean; report?: { trusted: boolean } } };
      };
      const refused = await post({ file: signed.passport, publicKeyPath: signed.auditorPub });
      expect(refused.status).toBe(400);
      expect(refused.json.error).toContain('request field "publicKeyPath" is refused');
      const unpinned = await post({ file: signed.passport });
      expect(unpinned.status).toBe(422);
      expect(unpinned.json.ok).toBe(false);
      expect(unpinned.json.report?.trusted).toBe(false);
    } finally {
      await server.close();
    }
  });
});

// ── PR 3 rows ───────────────────────────────────────────────────────────────
/** Re-signs a JSON file signed over the sha256 of its bytes ({digestSha256, signature}) with any key. */
function resignFileDigest(jsonPath: string, sigPath: string, key: TestKey, signer = "auditor"): void {
  const digest = sha(readFileSync(jsonPath));
  writeJson(sigPath, { digestSha256: digest, signature: signDigest(digest, key), signedTs: Date.now(), signer });
}

function recordPub(pem: string, name: string): string {
  const path = join(dir("amc-forgery-records-"), name);
  writeFileSync(path, pem);
  return path;
}

describe("verifyAuditBinderFile (amc audit binder verify)", () => {
  let binder: string;
  beforeAll(async () => {
    signed ??= await signedArtifactFixture();
    binder = (await createAuditBinderArtifact({ workspace: signed.workspace, scopeType: "WORKSPACE", outFile: "binder.amcaudit" })).outFile;
  }, 180_000);
  expectRow({
    verify: (file, flags) => amc(signed.workspace, ["audit", "binder", "verify", file, ...flags]),
    genuine: () => binder,
    forged: () => forgeSignedDocument(binder, "amc-audit", "binder.json", attacker, doc => { doc.generatedTs = Number(doc.generatedTs) + 1; }),
    pin: () => ["--pubkey", signed.auditorPub]
  });
});

describe("audit packet README guide (amc audit-packet has no verify command)", () => {
  test("step 1 verifies the manifest with an auditor key pinned outside the packet, not the key the packet carries", async () => {
    const out = await generateAuditPacket({ workspace: evidence.workspace, outputFile: "packet.zip" });
    const zip = readFileSync(out.outFile).toString("latin1");
    expect(zip).not.toContain("Verify `meta/manifest.sig.json` against `keys/auditor_ed25519.pub`");
    expect(zip).toContain("pinned outside this packet");
  }, 60_000);
});

describe("verifyBenchArtifactFile (amc bench verify) and verifyBenchProofBundle", () => {
  let bench: string;
  beforeAll(async () => {
    signed ??= await signedArtifactFixture();
    // A bench carries inclusion proofs for the event kinds it reports on.
    appendTransparencyEntry({ workspace: signed.workspace, type: "ORG_SCORECARD_UPDATED", agentId: "default", artifact: { kind: "policy", sha256: sha("scorecard"), id: "scorecard" } });
    bench = createBenchArtifact({ workspace: signed.workspace, scope: "workspace", outFile: "workspace.amcbench", windowDays: 30 }).outFile;
  }, 180_000);
  expectRow({
    verify: (file, flags) => amc(signed.workspace, ["bench", "verify", file, ...flags]),
    genuine: () => bench,
    forged: () => forgeSignedDocument(bench, "amc-bench", "bench.json", attacker, doc => { doc.generatedTs = Number(doc.generatedTs) + 1; }),
    pin: () => ["--pubkey", signed.auditorPub]
  });

  test("a bench whose inclusion proof carries its own fabricated root is refused", () => {
    const result = amc(signed.workspace, ["bench", "verify", fabricateProofRoot(bench, "amc-bench"), "--pubkey", signed.auditorPub]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("signed merkle root");
  });
});

let benchmark: string;
function benchmarkFixture(): string {
  return exportBenchmarkArtifact({ workspace: evidence.workspace, runId: evidence.runId, outFile: "run.amcbench" }).outFile;
}

describe("verifyBenchmarkArtifact (amc benchmark verify)", () => {
  beforeAll(() => { benchmark ??= benchmarkFixture(); }, 60_000);
  function forge(): string {
    const root = extract(benchmark);
    const benchPath = join(root, "bench.json");
    writeJson(benchPath, { ...readJson(benchPath), createdTs: Date.now() });
    resignFileDigest(benchPath, join(root, "bench.sig"), attacker);
    writeFileSync(join(root, "public-keys", "auditor.pub"), attacker.publicKeyPem);
    return pack(root, "forged.amcbench");
  }
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["benchmark", "verify", file, ...flags]),
    genuine: () => benchmark,
    forged: forge,
    pin: () => ["--pubkey", evidence.auditorPub]
  });
});

describe("verifyBackup (amc backup verify)", () => {
  const previous = process.env.AMC_BACKUP_PASSPHRASE;
  let backup: string;
  beforeAll(() => {
    process.env.AMC_BACKUP_PASSPHRASE = "p0-09-forgery-backup-passphrase";
    backup = createBackup({ workspace: evidence.workspace, outFile: join(dir("amc-forgery-backup-"), "ws.amcbackup") }).outFile;
  }, 60_000);
  afterAll(() => {
    if (previous === undefined) delete process.env.AMC_BACKUP_PASSPHRASE;
    else process.env.AMC_BACKUP_PASSPHRASE = previous;
  });
  function forge(): string {
    const top = extract(backup);
    const root = existsSync(join(top, "manifest.json")) ? top : join(top, readdirSync(top)[0]!);
    const manifestPath = join(root, "manifest.json");
    writeJson(manifestPath, { ...readJson(manifestPath), createdTs: Date.now() });
    resignFileDigest(manifestPath, join(root, "manifest.sig"), attacker);
    writeFileSync(join(root, "keys", "auditor.pub"), attacker.publicKeyPem);
    return pack(top, "forged.amcbackup");
  }
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["backup", "verify", file, ...flags]),
    genuine: () => backup,
    forged: forge,
    pin: () => ["--pubkey", evidence.auditorPub]
  });

  test("backup restore with --allow-unpinned restores integrity-only, exits 2 and says UNTRUSTED on stderr", () => {
    const to = join(dir("amc-forgery-restore-"), "restored");
    const result = amc(evidence.workspace, ["backup", "restore", backup, "--to", to, "--allow-unpinned"]);
    expect(result.status, result.output).toBe(2);
    expect(result.stdout).toContain("Backup restored to");
    expect(result.stderr.trimStart().startsWith("UNTRUSTED:"), result.stderr).toBe(true);
    const pinned = amc(evidence.workspace, ["backup", "restore", backup, "--to", join(dir("amc-forgery-restore-"), "restored"), "--pubkey", evidence.auditorPub]);
    expect(pinned.status, pinned.output).toBe(0);
    // A backup has no ledger to anchor, so restore offers no --allow-unanchored.
    expect(amc(evidence.workspace, ["backup", "restore", "--help"]).stdout).not.toContain("--allow-unanchored");
  });
});

/** A minimal plugin source tree for pluginPack. */
function pluginSource(content: string): string {
  const root = dir("amc-forgery-plugin-src-");
  mkdirSync(join(root, "content", "learn", "questions"), { recursive: true });
  writeFileSync(join(root, "content", "learn", "questions", "AMC-X.1.md"), content);
  writeJson(join(root, "manifest.json"), {
    v: 1,
    plugin: {
      id: "amc.plugin.forgery.learn", name: "forgery fixture", version: "1.0.0", description: "fixture plugin",
      publisher: { org: "Fixture Org", contact: "ops@example.com", website: "https://example.com", pubkeyFingerprint: "0".repeat(64) },
      compatibility: { amcMinVersion: ">=1.0.0", nodeMinVersion: ">=20",
        schemaVersions: { policyPacks: 1, assurancePacks: 1, complianceMaps: 1, adapters: 1, outcomes: 1, casebooks: 1, transform: 1 } },
      risk: { category: "LOW", notes: "fixture", touches: ["learn"] }
    },
    artifacts: [], generatedTs: Date.now(), signing: { algorithm: "ed25519", pubkeyFingerprint: "0".repeat(64) }
  });
  return root;
}

let plugin: { file: string; publisherPub: string; registry: string; registryPub: string; registryFingerprint: string };

function pluginFixture() {
  const keys = pluginKeygen({ outDir: dir("amc-forgery-publisher-") });
  const file = join(dir("amc-forgery-plugin-"), "plugin.amcplug");
  pluginPack({ inputDir: pluginSource("# fixture\n"), keyPath: keys.privateKeyPath, outFile: file });
  const registryDir = join(dir("amc-forgery-registry-"), "registry");
  const registry = initPluginRegistry({ dir: registryDir });
  publishPluginToRegistry({ dir: registryDir, pluginFile: file, registryKeyPath: registry.keyPath });
  // The operator records both public keys outside the package and the registry they verify.
  return { file, publisherPub: recordPub(readFileSync(keys.publicKeyPath, "utf8"), "publisher.pub"), registry: registryDir,
    registryPub: recordPub(readFileSync(registry.pubPath, "utf8"), "registry.pub"), registryFingerprint: registry.fingerprint };
}

describe("verifyPluginPackage (amc plugin verify)", () => {
  beforeAll(() => { plugin ??= pluginFixture(); });
  function forge(): string {
    const keys = pluginKeygen({ outDir: dir("amc-forgery-attacker-") });
    const file = join(dir("amc-forgery-plugin-"), "forged.amcplug");
    pluginPack({ inputDir: pluginSource("# tampered by the forger\n"), keyPath: keys.privateKeyPath, outFile: file });
    return file;
  }
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["plugin", "verify", file, ...flags]),
    genuine: () => plugin.file,
    forged: forge,
    pin: () => ["--pubkey", plugin.publisherPub]
  });

  test("an installed plugin's publisher is refused once the operator's AMC home trust list distrusts it", () => {
    const publisher = readFileSync(plugin.publisherPub, "utf8");
    const keyId = sha(publisher);
    expect(verifyPluginPackage({ file: plugin.file, trust: installedPluginTrust(evidence.workspace, keyId) }).ok).toBe(true);
    const previous = process.env.AMC_HOME;
    process.env.AMC_HOME = operatorTrustHome([], [distrusted(keyId)]);
    roots.push(process.env.AMC_HOME);
    try {
      const verified = verifyPluginPackage({ file: plugin.file, trust: installedPluginTrust(evidence.workspace, keyId) });
      expect(verified.ok).toBe(false);
      expect(verified.report.issuerAdmission.signatures[0]?.status).toBe("distrusted");
    } finally {
      if (previous === undefined) delete process.env.AMC_HOME;
      else process.env.AMC_HOME = previous;
    }
  });
});

describe("plugin registry (amc plugin registry verify, and the registry client)", () => {
  beforeAll(() => { plugin ??= pluginFixture(); });
  function forge(): string {
    const copy = join(dir("amc-forgery-registry-"), "registry");
    spawnSync("cp", ["-R", plugin.registry, copy]);
    const index = readJson(join(copy, "index.json")) as { registry: Record<string, unknown> };
    index.registry = { ...index.registry, name: "Forged Registry", issuerFingerprint: attacker.keyId };
    writeFileSync(join(copy, "index.json"), `${canonicalize(index)}\n`);
    const payload = Buffer.from(canonicalize(index), "utf8");
    writeFileSync(join(copy, "index.sig"), `${canonicalize({ digestSha256: sha(payload), signature: sign(null, payload, attacker.privateKeyPem).toString("base64"),
      signedTs: Date.now(), signer: "registry" })}\n`);
    writeFileSync(join(copy, "registry.pub"), attacker.publicKeyPem);
    return copy;
  }
  expectRow({
    verify: (registry, flags) => amc(evidence.workspace, ["plugin", "registry", "verify", "--dir", registry, ...flags]),
    genuine: () => plugin.registry,
    forged: forge,
    pin: () => ["--pubkey", plugin.registryPub]
  });

  test("the client refuses a registry.pub that is not pinned", async () => {
    // A caller that passes no pin (the type now requires one) is refused at run time too.
    await expect(resolveRegistryPackage({ registryBase: plugin.registry, pluginRef: "amc.plugin.forgery.learn" } as never)).rejects.toThrow(/not pinned|not admitted/);
    await expect(browseRegistry({ registryBase: plugin.registry, trust: pinnedTrust([]) })).rejects.toThrow(/not pinned|not admitted/);
  });

  test("the client admits a pinned registry and the publisher its signed index names", async () => {
    const resolved = await resolveRegistryPackage({ registryBase: plugin.registry, pluginRef: "amc.plugin.forgery.learn",
      pinnedRegistryPubkeyFingerprint: plugin.registryFingerprint });
    expect(resolved.version).toBe("1.0.0");
    const forgedIndex = forge();
    await expect(resolveRegistryPackage({ registryBase: forgedIndex, pluginRef: "amc.plugin.forgery.learn",
      pinnedRegistryPubkeyFingerprint: plugin.registryFingerprint })).rejects.toThrow();
  });
});

describe("verifyPromptPackFile (amc prompt pack verify)", () => {
  let packFile: string;
  beforeAll(() => {
    buildPromptPackForApi({ workspace: evidence.workspace, agentId: "default" });
    packFile = join(dir("amc-forgery-prompt-"), "pack.amcprompt");
    writeFileSync(packFile, readFileSync(promptLatestPackPath(evidence.workspace, "default")));
  }, 60_000);
  function forge(): string {
    const top = extract(packFile);
    const root = join(top, "amc-prompt");
    const packJson = { ...readJson(join(root, "pack.json")), generatedTs: Date.now() };
    writeFileSync(join(root, "pack.json"), `${canonicalize(packJson)}\n`);
    const digest = sha(canonicalize(packJson));
    writeFileSync(join(root, "pack.sig"), `${canonicalize({ digestSha256: digest, signature: signDigest(digest, attacker), signedTs: Date.now(), signer: "auditor" })}\n`);
    resignFileDigest(join(root, "lint", "lint.json"), join(root, "lint", "lint.sig"), attacker);
    writeFileSync(join(root, "signer.pub"), attacker.publicKeyPem);
    return pack(top, "forged.amcprompt");
  }
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["prompt", "pack", "verify", file, ...flags]),
    genuine: () => packFile,
    forged: forge,
    pin: () => ["--pubkey", evidence.auditorPub]
  });
});

describe("verifyFederationPackage (amc federate verify-bundle)", () => {
  let federation: { file: string; publisherPub: string };
  beforeAll(() => {
    federateInitCli({ workspace: evidence.workspace, orgName: "Forgery Org" });
    const file = exportFederationPackage({ workspace: evidence.workspace, outFile: join(dir("amc-forgery-fed-"), "sync.amcfed") }).outFile;
    federation = { file, publisherPub: recordPub(ensureFederationPublisherKey(evidence.workspace).publicKeyPem, "publisher.pub") };
  }, 60_000);
  function forge(): string {
    const top = extract(federation.file);
    const root = existsSync(join(top, "manifest.json")) ? top : join(top, readdirSync(top)[0]!);
    writeFileSync(join(root, "public-keys", "publisher.pub"), attacker.publicKeyPem);
    const manifestPath = join(root, "manifest.json");
    const manifest = readJson(manifestPath) as { sourceOrgName: string; publisherKeyFingerprint: string; files: Array<{ path: string; sha256: string; size: number }> };
    manifest.sourceOrgName = "Forged Org";
    manifest.publisherKeyFingerprint = attacker.keyId;
    manifest.files = manifest.files.map(row => {
      const bytes = readFileSync(join(root, row.path));
      return { ...row, sha256: sha(bytes), size: bytes.length };
    });
    writeJson(manifestPath, manifest);
    resignFileDigest(manifestPath, join(root, "manifest.sig"), attacker, "publisher");
    return pack(top, "forged.amcfed");
  }
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["federate", "verify-bundle", file, ...flags]),
    genuine: () => federation.file,
    forged: forge,
    pin: () => ["--pubkey", federation.publisherPub]
  });
});

describe("console seal check (src/console/assets/app.js)", () => {
  test("shows the server's verdict and labels the client-side check consistency only", () => {
    const app = readFileSync(resolve("src/console/assets/app.js"), "utf8");
    expect(app).not.toContain("Client seal signature: <strong>");
    expect(app).toContain("Server verdict");
    expect(app).toMatch(/consistency only/);
  });
});

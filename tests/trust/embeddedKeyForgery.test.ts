import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
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
import { signDigestWithPolicy } from "../../src/crypto/signing/signer.js";
import { generateTrustCertificate } from "../../src/cert/trustCertificate.js";
import { createReleaseBundle } from "../../src/release/releaseBundle.js";
import { signReleaseManifest } from "../../src/release/releaseSigner.js";
import { signTrustList } from "../../src/trust/index.js";
import { merkleLeafHash } from "../../src/transparency/merkle.js";
import { canonicalize } from "../../src/utils/json.js";
import { listEntry, testKey, trustList, type TestKey } from "./trustFixtures.js";

/**
 * P0-09 PR 2 forgery suite: one describe per verifier in the PR 2 rows of the issue table. Each builds a real
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

function amc(cwd: string, args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_HOME: amcHome };
  delete env.AMC_EXPECTED_MONITOR_FINGERPRINT;
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
let evidence: { workspace: string; bundle: string; certificate: string; revocation: string; certId: string; auditorPub: string; monitorFingerprint: string };

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
  return { workspace, bundle, certificate, revocation, certId: issued.certId, auditorPub, monitorFingerprint };
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
});

describe("verifyCertificate (amc cert verify, .amccert)", () => {
  expectRow({
    verify: (file, flags) => amc(evidence.workspace, ["cert", "verify", file, ...flags]),
    genuine: () => evidence.certificate,
    forged: () => forgeCertificate(evidence.certificate, attacker),
    pin: ledgerPins,
    anchor: monitorPin
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

function signedArtifactFixture() {
  const workspace = dir("amc-forgery-pass-");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const auditorPub = join(dir("amc-forgery-records-"), "auditor.pub");
  writeFileSync(auditorPub, readFileSync(join(workspace, ".amc", "keys", "auditor_ed25519.pub")));
  savePassportPolicy(workspace, defaultPassportPolicy());
  for (const type of ["DIAGNOSTIC_COMPLETED", "ASSURANCE_RUN_COMPLETED"]) {
    appendTransparencyEntry({ workspace, type, agentId: "default", artifact: { kind: "policy", sha256: sha(type), id: type } });
  }
  const passport = createPassportArtifact({ workspace, scopeType: "AGENT", scopeId: "default", outFile: "agent.amcpass" }).outFile;
  return { workspace, passport, assurance: assuranceCertificate(workspace), auditorPub };
}

/** Packages an assurance certificate exactly as issueAssuranceCertificate does, signed by the workspace vault. */
function assuranceCertificate(workspace: string): string {
  const proofs = buildBenchProofs({ workspace, includeEventKinds: ["ASSURANCE_RUN_COMPLETED"], maxProofs: 40 });
  const cert = {
    v: 1, certId: `cert_${randomUUID().replace(/-/g, "")}`, issuedTs: Date.now(),
    scope: { type: "WORKSPACE", idHash: sha("workspace").slice(0, 16) }, runId: "arun_fixture", status: "PASS",
    riskAssuranceScore: 90, categoryScores: null, findingCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    gates: { integrityIndex: 0.9, correlationRatio: 0.9, observedShare: 0.9 },
    bindings: { assurancePolicySha256: sha("policy"), cgxPackSha256: sha("cgx"), promptPolicySha256: sha("prompt"), trustMode: "LOCAL_VAULT", notaryFingerprint: null },
    proofBindings: {
      transparencyRootSha256: proofs.transparencyRoot?.sha256 ?? "0".repeat(64), merkleRootSha256: proofs.merkleRoot?.sha256 ?? "0".repeat(64),
      includedEventProofIds: proofs.proofs.map(row => row.proofId).sort((a, b) => a.localeCompare(b))
    }
  };
  const digest = sha(canonicalize(cert));
  const signedDigest = signDigestWithPolicy({ workspace, kind: "CERT", digestHex: digest });
  const root = join(dir("amc-forgery-acert-"), "amc-cert");
  mkdirSync(join(root, "meta"), { recursive: true });
  writeFileSync(join(root, "cert.json"), `${canonicalize(cert)}\n`);
  writeFileSync(join(root, "cert.sig"), `${canonicalize({ digestSha256: digest, signature: signedDigest.signature, signedTs: signedDigest.signedTs, signer: "auditor", envelope: signedDigest.envelope })}\n`);
  writeFileSync(join(root, "signer.pub"), readFileSync(join(workspace, ".amc", "keys", "auditor_ed25519.pub")));
  writeBenchProofFiles({ outDir: root, bundle: proofs });
  return pack(join(root, ".."), "assurance.amccert");
}

/** Tampers with the signed document, re-signs it without an envelope and swaps signer.pub. */
function forgeSignedDocument(source: string, directory: string, documentName: string, key: TestKey, change: (doc: Record<string, unknown>) => void): string {
  const top = extract(source);
  const root = join(top, directory);
  const docPath = join(root, documentName);
  const doc = readJson(docPath);
  change(doc);
  writeFileSync(docPath, documentName === "cert.json" ? `${canonicalize(doc)}\n` : JSON.stringify(doc, null, 2));
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
  beforeAll(() => { signed = signedArtifactFixture(); }, 120_000);
  expectRow({
    verify: (file, flags) => amc(signed.workspace, ["passport", "verify", file, ...flags]),
    genuine: () => signed.passport,
    forged: () => forgeSignedDocument(signed.passport, "amc-passport", "passport.json", attacker, doc => {
      (doc.status as Record<string, unknown>).label = "VERIFIED";
    }),
    pin: () => ["--pubkey", signed.auditorPub]
  });

  test("a passport whose inclusion proof carries its own fabricated root is refused", () => {
    const result = amc(signed.workspace, ["passport", "verify", fabricateProofRoot(signed.passport, "amc-passport"), "--pubkey", signed.auditorPub]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("signed merkle root");
  });
});

describe("verifyAssuranceCertificateFile (amc assurance cert-verify)", () => {
  beforeAll(() => { signed ??= signedArtifactFixture(); }, 120_000);
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
    const payload = { ...(envelope.payload as Record<string, unknown>), score: 99 };
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
});

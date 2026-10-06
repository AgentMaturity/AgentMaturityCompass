import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../src/bundles/bundle.js";
import { issueCertificate, verifyCertificate } from "../src/assurance/certificate.js";
import { writeSignedGatePolicy } from "../src/ci/gate.js";
import { addPublicKeyToHistory, getAuthenticatedKeyHistory, getPrivateKeyPem, getPublicKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { buildKeyHistoryEntry } from "../src/crypto/keyHistoryChain.js";
import { verifyKeyHistoryEnvelope, type KeyHistoryEnvelope } from "../src/crypto/keyHistoryEnvelope.js";
import { rotateMonitorKeyInVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { BundleManifest } from "../src/types.js";
import { keyHistoryTrust, workspaceKeyPem, workspaceKeyTrust } from "./helpers/trustContext.js";

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
const passphrase = "amc-1525-portable-key-history-test";

function temporaryDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-portable-key-history-"));
  roots.push(root);
  return root;
}

function newWorkspace(): string {
  const workspace = temporaryDirectory();
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function archive(command: "extract" | "create", path: string, directory: string): void {
  const args = command === "extract" ? ["-xzf", path, "-C", directory] : ["-czf", path, "-C", directory, "."];
  const result = spawnSync("tar", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`test archive ${command} failed: ${result.stderr}`);
}

function extract(path: string): string {
  const root = temporaryDirectory();
  archive("extract", path, root);
  return root;
}

function readHistory(root: string): { monitor: KeyHistoryEnvelope | null; auditor: KeyHistoryEnvelope | null } {
  return JSON.parse(readFileSync(join(root, "public-keys", "key-history.json"), "utf8"));
}

function writeHistory(root: string, value: unknown): void {
  writeFileSync(join(root, "public-keys", "key-history.json"), JSON.stringify(value, null, 2));
}

function files(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result.push(relative(root, path).replace(/\\/g, "/"));
    }
  };
  visit(root);
  return result.sort();
}

// Recompute every file hash and sign the manifest with the selected key. A
// rejection must be about signer authorization, not a stale file checksum.
function signBundleManifest(root: string, signerWorkspace: string): void {
  const path = join(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as BundleManifest;
  manifest.files = files(root).filter((file) => file !== "manifest.json" && file !== "manifest.sig").map((file) => {
    const bytes = readFileSync(join(root, file));
    return { path: file, sha256: sha256Hex(bytes), size: bytes.length };
  });
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  const manifestSha256 = sha256Hex(readFileSync(path));
  writeFileSync(join(root, "manifest.sig"), JSON.stringify({
    manifestSha256,
    signature: signHexDigest(manifestSha256, getPrivateKeyPem(signerWorkspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  }));
}

function signCertificate(root: string, signerWorkspace: string): void {
  const certSha256 = sha256Hex(readFileSync(join(root, "cert.json")));
  writeFileSync(join(root, "cert.sig"), JSON.stringify({
    certSha256,
    signature: signHexDigest(certSha256, getPrivateKeyPem(signerWorkspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  }));
}

async function fixture(rotateMonitor = false) {
  const workspace = newWorkspace();
  const ledger = openLedger(workspace);
  ledger.startSession({ sessionId: "before-rotation", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
  ledger.appendEvidence({
    sessionId: "before-rotation", runtime: "unknown", eventType: "stdout", payload: "observed before rotation", inline: true,
    meta: { questionId: "AMC-1.1", trustTier: "OBSERVED", agentId: "default" }
  });
  ledger.sealSession("before-rotation");
  ledger.close();
  const run = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
  const previousMonitor = getPublicKeyPem(workspace, "monitor");
  if (rotateMonitor) rotateMonitorKeyInVault(workspace, passphrase);
  const policyPath = join(workspace, "policy.json");
  writeSignedGatePolicy({ workspace, policyPath, policy: {
    minIntegrityIndex: 0, minOverall: 0,
    minLayer: { "Strategic Agent Operations": 0, "Leadership & Autonomy": 0, "Culture & Alignment": 0, Resilience: 0, Skills: 0 },
    requireObservedForLevel5: false, denyIfLowTrust: false
  } });
  const bundle = join(workspace, "run.amcbundle");
  exportEvidenceBundle({ workspace, runId: run.runId, outFile: bundle });
  const certificate = join(workspace, "run.amccert");
  await issueCertificate({ workspace, runId: run.runId, policyPath, outFile: certificate });
  return { workspace, run, bundle, certificate, previousMonitor };
}

let current: Awaited<ReturnType<typeof fixture>>;
let rotated: Awaited<ReturnType<typeof fixture>>;
let attacker: string;

beforeAll(async () => {
  process.env.AMC_VAULT_PASSPHRASE = passphrase;
  current = await fixture();
  rotated = await fixture(true);
  attacker = newWorkspace();
}, 60_000);

afterAll(() => {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  for (const root of roots.reverse()) rmSync(root, { recursive: true, force: true });
});

describe("AMC-1525 portable authenticated key history", () => {
  test("export never launders a correctly hashed planted history into a signed bundle", async () => {
    const source = await fixture();
    const plantedPem = getPublicKeyPem(attacker, "auditor");
    for (const role of ["monitor", "auditor"] as const) {
      const history = getAuthenticatedKeyHistory(source.workspace, role)!;
      const forged = [...history.entries, buildKeyHistoryEntry(plantedPem, history.entries, "imported")];
      writeFileSync(join(source.workspace, ".amc", "keys", `${role}_history.json`), JSON.stringify(forged));
    }
    const bundle = join(source.workspace, "planted-source.amcbundle");
    const exported = exportEvidenceBundle({ workspace: source.workspace, runId: source.run.runId, outFile: bundle });
    const root = extract(bundle);
    expect(readHistory(root)).toEqual({ monitor: null, auditor: null });
    expect(JSON.stringify(exported.manifest.publicKeyFingerprints)).not.toContain(sha256Hex(plantedPem));
    const verification = await verifyEvidenceBundle(bundle, workspaceKeyTrust(source.workspace));
    expect(verification.ok, verification.errors.join("; ")).toBe(true);
  });

  for (const kind of ["bundle", "certificate"] as const) {
    test.each(["unsigned hash chain", "rehashed signed envelope", "transplanted signed envelope"])(`${kind} rejects an attacker signer admitted by %s`, async (attack) => {
      const root = extract(current[kind]);
      const history = readHistory(root);
      const direct = readFileSync(join(root, "public-keys", "auditor.pub"), "utf8");
      const attackerPem = getPublicKeyPem(attacker, "auditor");
      const attackerHistory = attack === "unsigned hash chain"
        ? [buildKeyHistoryEntry(attackerPem, [], "imported")]
        : attack === "rehashed signed envelope"
          ? { ...history.auditor, entries: [...history.auditor!.entries, buildKeyHistoryEntry(attackerPem, history.auditor!.entries, "imported")] }
          : getAuthenticatedKeyHistory(attacker, "auditor");
      writeHistory(root, { ...history, auditor: attackerHistory });
      if (kind === "bundle") signBundleManifest(root, attacker);
      else signCertificate(root, attacker);
      expect(readFileSync(join(root, "public-keys", "auditor.pub"), "utf8")).toBe(direct);
      const path = join(temporaryDirectory(), `attacker.amc${kind === "bundle" ? "bundle" : "cert"}`);
      archive("create", path, root);
      const trust = workspaceKeyTrust(current.workspace);
      const result = kind === "bundle" ? await verifyEvidenceBundle(path, trust) : await verifyCertificate({ certFile: path, trust });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(kind === "bundle" ? "Manifest signature verification failed." : "cert signature invalid");
    });

    test(`${kind} accepts an auditor key only after explicit authenticated admission`, async () => {
      const source = await fixture();
      addPublicKeyToHistory(source.workspace, "auditor", getPublicKeyPem(attacker, "auditor"), "imported");
      const root = extract(source[kind]);
      writeHistory(root, { ...readHistory(root), auditor: getAuthenticatedKeyHistory(source.workspace, "auditor") });
      if (kind === "bundle") signBundleManifest(root, attacker);
      else signCertificate(root, attacker);
      const path = join(temporaryDirectory(), "admitted-auditor.tar.gz");
      archive("create", path, root);
      // P0-09: the history admits the new key only because the operator's trust list pins the source auditor with
      // allowKeyHistory; an explicit pin of the source auditor alone would not admit it.
      const trust = keyHistoryTrust(workspaceKeyPem(source.workspace, "auditor"), workspaceKeyPem(source.workspace, "monitor"));
      const result = kind === "bundle" ? await verifyEvidenceBundle(path, trust) : await verifyCertificate({ certFile: path, trust });
      expect(result.ok, result.errors.join("; ")).toBe(true);
      expect(result.report.issuerAdmission.signatures.map((signature) => signature.source)).toContain("trust-list-history");
      const pinnedOnly = kind === "bundle" ? await verifyEvidenceBundle(path, workspaceKeyTrust(source.workspace))
        : await verifyCertificate({ certFile: path, trust: workspaceKeyTrust(source.workspace) });
      expect(pinnedOnly.ok).toBe(false);
    });

    test(`${kind} preserves authenticated monitor rotation for offline ledger verification`, async () => {
      const root = extract(rotated[kind]);
      const history = readHistory(root);
      const direct = readFileSync(join(root, "public-keys", "monitor.pub"), "utf8");
      expect(direct).not.toBe(rotated.previousMonitor);
      expect(history.monitor?.entries.map((entry) => entry.publicKeyPem)).toContain(rotated.previousMonitor);
      expect(verifyKeyHistoryEnvelope(history.monitor, "monitor", direct).valid).toBe(true);
      const trust = workspaceKeyTrust(rotated.workspace);
      const result = kind === "bundle"
        ? await verifyEvidenceBundle(rotated.bundle, trust)
        : await verifyCertificate({ certFile: rotated.certificate, trust });
      expect(result.ok, result.errors.join("; ")).toBe(true);

      // Same artifact, same live public key, but unsigned history cannot carry
      // authority for the old writer signatures after rotation.
      writeHistory(root, { ...history, monitor: history.monitor?.entries });
      if (kind === "bundle") signBundleManifest(root, rotated.workspace);
      const legacy = join(temporaryDirectory(), "rotated-legacy.tar.gz");
      archive("create", legacy, root);
      const refused = kind === "bundle" ? await verifyEvidenceBundle(legacy, trust) : await verifyCertificate({ certFile: legacy, trust });
      expect(refused.ok).toBe(false);
      expect(refused.errors.some((error) => /ledger verify/i.test(error))).toBe(true);
    });

    test.each(["legacy arrays", "absent history"])(`${kind} still verifies current-key signatures with %s`, async (format) => {
      const root = extract(current[kind]);
      const history = readHistory(root);
      if (format === "legacy arrays") {
        writeHistory(root, { monitor: history.monitor?.entries, auditor: history.auditor?.entries });
      } else {
        rmSync(join(root, "public-keys", "key-history.json"));
      }
      if (kind === "bundle") signBundleManifest(root, current.workspace);
      const path = join(temporaryDirectory(), "current-key.tar.gz");
      archive("create", path, root);
      const trust = workspaceKeyTrust(current.workspace);
      const result = kind === "bundle" ? await verifyEvidenceBundle(path, trust) : await verifyCertificate({ certFile: path, trust });
      expect(result.ok, result.errors.join("; ")).toBe(true);
    });
  }
});
